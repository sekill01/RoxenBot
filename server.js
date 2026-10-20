const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const db = require('./src/db');
const auth = require('./src/auth');
const multiKickManager = require('./src/multiKickManager');
const payment = require('./src/payment');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

multiKickManager.setSocketIO(io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Süper Yönetici Sayfa Koruması (Sadece mobiloyunlog@gmail.com erişebilir)
function requireSuperAdminPage(req, res, next) {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/roxen_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return res.redirect('/login.html');
  }

  const payload = auth.verifySessionToken(token);
  if (!payload) {
    return res.redirect('/login.html');
  }

  const user = db.getUserById(payload.id);
  if (!user || !auth.isSuperAdmin(user)) {
    return res.redirect('/dashboard.html');
  }

  req.user = user;
  next();
}

// Admin paneline doğrudan erişim kontrolü
app.get(['/admin', '/admin.html'], requireSuperAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// =================== 1. AUTHENTICATION (GİRİŞ) ===================

// Firebase / Google Client Konfigürasyonu
app.get('/api/config/firebase', (req, res) => {
  res.json({
    success: true,
    config: config.FIREBASE,
    hasConfig: Boolean(config.FIREBASE.apiKey && config.FIREBASE.projectId),
    googleClientId: config.GOOGLE.CLIENT_ID || ''
  });
});

// Firebase ile Giriş (Google Popup / Email)
app.post('/api/auth/firebase-login', (req, res) => {
  const { uid, email, name, avatar } = req.body;
  if (!uid || !email) {
    return res.status(400).json({ success: false, error: 'Eksik Firebase kimlik bilgisi.' });
  }

  const result = auth.handleFirebaseLogin({ uid, email, name, avatar });
  if (!result.success) {
    return res.status(400).json(result);
  }

  // Çereze kaydet
  res.setHeader('Set-Cookie', `roxen_token=${result.token}; Path=/; HttpOnly; Max-Age=2592000`);
  res.json({ success: true, user: result.user, token: result.token });
});

// A) Demo / Test Girişi (Google API kurulumu beklemeden hemen giriş yapmak için)
app.get('/auth/demo', (req, res) => {
  const { user, token } = auth.handleDemoLogin('tolgayasin@kick.com', 'Tolga Yasin');
  
  // Çereze kaydet ve dashboard'a yönlendir
  res.setHeader('Set-Cookie', `roxen_token=${token}; Path=/; HttpOnly; Max-Age=2592000`);
  res.redirect('/dashboard.html');
});

// B) Google OAuth Başlatma
app.get('/auth/google', (req, res) => {
  if (!config.GOOGLE.CLIENT_ID) {
    // Google Cloud bilgileri henüz girilmemişse doğrudan Demo Girişine yönlendir
    return res.redirect('/auth/demo');
  }

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: config.GOOGLE.CALLBACK_URL,
    client_id: config.GOOGLE.CLIENT_ID,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ')
  };

  const qs = new URLSearchParams(options);
  res.redirect(`${rootUrl}?${qs.toString()}`);
});

// C) Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login.html?error=no_code');

  try {
    const axios = require('axios');
    // Token al
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: config.GOOGLE.CLIENT_ID,
      client_secret: config.GOOGLE.CLIENT_SECRET,
      redirect_uri: config.GOOGLE.CALLBACK_URL,
      grant_type: 'authorization_code'
    });

    const { id_token, access_token } = tokenRes.data;

    // Google kullanıcı bilgilerini al
    const userRes = await axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`, {
      headers: { Authorization: `Bearer ${id_token}` }
    });

    const googleUser = userRes.data;
    let user = db.getUserByEmail(googleUser.email);
    if (!user) {
      user = db.createUser({
        email: googleUser.email,
        name: googleUser.name || googleUser.given_name,
        avatar: googleUser.picture,
        googleId: googleUser.id
      });
    }

    const token = auth.generateSessionToken(user);
    res.setHeader('Set-Cookie', `roxen_token=${token}; Path=/; HttpOnly; Max-Age=2592000`);
    res.redirect('/dashboard.html');
  } catch (err) {
    console.error('[Google Auth Error]:', err.message);
    res.redirect('/login.html?error=auth_failed');
  }
});

// D) Çıkış Yap
app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'roxen_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ success: true });
});

// E) Mevcut Kullanıcı Bilgisi
app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  const isRunning = multiKickManager.isUserBotRunning(req.user.id);
  res.json({
    success: true,
    user: req.user,
    botRunning: isRunning,
    isAdmin: auth.isAdmin(req.user)
  });
});

// =================== 2. YAYINCI AYARLARI VE BOT YÖNETİMİ ===================

// Kick Kanal Ayarlarını Güncelle
app.post('/api/user/settings', auth.requireAuth, (req, res) => {
  const { channelSlug } = req.body;
  const updated = db.updateUser(req.user.id, {
    settings: {
      channelSlug: (channelSlug || '').trim().toLowerCase()
    }
  });
  res.json({ success: true, user: updated });
});

// Ayarlar GET & POST (Musteri-Paketi Uyumluluğu)
app.get('/api/settings', auth.requireAuth, (req, res) => {
  res.json({
    success: true,
    settings: {
      channelSlug: req.user.settings?.channelSlug || '',
      botUsername: req.user.customBot?.botUsername || '',
      botToken: req.user.customBot?.botToken || '',
      apiKey: req.user.apiKey || ''
    }
  });
});

app.post('/api/settings', auth.requireAuth, (req, res) => {
  const { channelSlug, botUsername, botToken } = req.body;
  const updates = {};
  if (channelSlug !== undefined) {
    updates.settings = { channelSlug: channelSlug.trim().toLowerCase() };
  }
  if (botUsername !== undefined || botToken !== undefined) {
    updates.customBot = {
      enabled: Boolean(botToken && botToken.trim()),
      botUsername: (botUsername || '').trim(),
      botToken: (botToken || '').trim()
    };
  }
  const updated = db.updateUser(req.user.id, updates);
  res.json({ success: true, settings: updated.settings, customBot: updated.customBot });
});

// Kanal Bağlantısı & Bot Başlat (Connect / Start)
app.post(['/api/connect', '/api/bot/start'], auth.requireAuth, async (req, res) => {
  const { channelSlug } = req.body;
  if (channelSlug) {
    db.updateUser(req.user.id, { settings: { channelSlug: channelSlug.trim().toLowerCase() } });
  }
  const result = await multiKickManager.startUserBot(req.user.id);
  res.json(result);
});

// Kanal Bağlantısını Kes & Bot Durdur (Disconnect / Stop)
app.post(['/api/disconnect', '/api/bot/stop'], auth.requireAuth, (req, res) => {
  const stopped = multiKickManager.stopUserBot(req.user.id);
  res.json({ success: stopped });
});

// Bot Bağlantı Durumu (Status)
app.get(['/api/status', '/api/bot/status'], auth.requireAuth, (req, res) => {
  const isConnected = multiKickManager.isUserBotRunning(req.user.id);
  const worker = multiKickManager.activeWorkers.get(req.user.id);
  res.json({
    success: true,
    isConnected,
    running: isConnected,
    channel: req.user.settings?.channelSlug || '',
    viewerCount: worker?.channelData?.livestream?.viewer_count || 0,
    followersCount: worker?.channelData?.followers_count || 0,
    isLive: Boolean(worker?.channelData?.livestream)
  });
});

// Özel Bot İsmi & Token
app.post('/api/user/custom-bot', auth.requireAuth, (req, res) => {
  const user = req.user;
  const { enabled, botUsername, botToken } = req.body;
  const updated = db.updateUser(user.id, {
    customBot: {
      enabled: Boolean(enabled),
      botUsername: (botUsername || '').trim(),
      botToken: (botToken || '').trim()
    }
  });
  res.json({ success: true, user: updated });
});

// Gemini AI Ayarları
app.get('/api/gemini/config', auth.requireAuth, (req, res) => {
  res.json({ success: true, config: req.user.geminiAI || {} });
});

app.post(['/api/gemini/config', '/api/user/gemini'], auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { geminiAI: req.body });
  res.json({ success: true, config: updated.geminiAI, geminiAI: updated.geminiAI });
});

// Komutlar (Commands CRUD)
app.get('/api/commands', auth.requireAuth, (req, res) => {
  res.json({ success: true, commands: req.user.commands || [] });
});

app.post(['/api/commands', '/api/user/commands'], auth.requireAuth, (req, res) => {
  if (Array.isArray(req.body.commands)) {
    const updated = db.updateUser(req.user.id, { commands: req.body.commands });
    return res.json({ success: true, commands: updated.commands });
  }
  const list = req.user.commands || [];
  const newCmd = {
    id: 'cmd_' + Date.now(),
    name: req.body.name,
    response: req.body.response,
    cooldown: Number(req.body.cooldown) || 5,
    permission: req.body.permission || 'everyone',
    aliases: req.body.aliases || [],
    enabled: req.body.enabled !== false
  };
  list.push(newCmd);
  db.updateUser(req.user.id, { commands: list });
  res.json({ success: true, command: newCmd, commands: list });
});

app.put('/api/commands/:id', auth.requireAuth, (req, res) => {
  const list = req.user.commands || [];
  const idx = list.findIndex(c => c.id === req.params.id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...req.body };
    db.updateUser(req.user.id, { commands: list });
    return res.json({ success: true, command: list[idx] });
  }
  res.status(404).json({ success: false, error: 'Komut bulunamadı' });
});

app.delete('/api/commands/:id', auth.requireAuth, (req, res) => {
  let list = req.user.commands || [];
  list = list.filter(c => c.id !== req.params.id);
  db.updateUser(req.user.id, { commands: list });
  res.json({ success: true, commands: list });
});

// Zamanlayıcılar (Timers CRUD)
app.get('/api/timers', auth.requireAuth, (req, res) => {
  res.json({ success: true, timers: req.user.timers || [] });
});

app.post(['/api/timers', '/api/user/timers'], auth.requireAuth, (req, res) => {
  if (Array.isArray(req.body.timers)) {
    const updated = db.updateUser(req.user.id, { timers: req.body.timers });
    return res.json({ success: true, timers: updated.timers });
  }
  const list = req.user.timers || [];
  const newTimer = {
    id: 'tmr_' + Date.now(),
    name: req.body.name || 'Zamanlayıcı',
    message: req.body.message,
    intervalMinutes: Number(req.body.intervalMinutes) || 15,
    chatLines: Number(req.body.chatLines) || 0,
    enabled: req.body.enabled !== false
  };
  list.push(newTimer);
  db.updateUser(req.user.id, { timers: list });
  res.json({ success: true, timer: newTimer, timers: list });
});

app.put('/api/timers/:id', auth.requireAuth, (req, res) => {
  const list = req.user.timers || [];
  const idx = list.findIndex(t => t.id === req.params.id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...req.body };
    db.updateUser(req.user.id, { timers: list });
    return res.json({ success: true, timer: list[idx] });
  }
  res.status(404).json({ success: false, error: 'Zamanlayıcı bulunamadı' });
});

app.delete('/api/timers/:id', auth.requireAuth, (req, res) => {
  let list = req.user.timers || [];
  list = list.filter(t => t.id !== req.params.id);
  db.updateUser(req.user.id, { timers: list });
  res.json({ success: true, timers: list });
});

// Otomatik Yanıtlar (Auto Replies CRUD)
app.get('/api/auto-replies', auth.requireAuth, (req, res) => {
  res.json({ success: true, autoReplies: req.user.autoReplies || [] });
});

app.post(['/api/auto-replies', '/api/user/auto-replies'], auth.requireAuth, (req, res) => {
  if (Array.isArray(req.body.autoReplies)) {
    const updated = db.updateUser(req.user.id, { autoReplies: req.body.autoReplies });
    return res.json({ success: true, autoReplies: updated.autoReplies });
  }
  const list = req.user.autoReplies || [];
  const newReply = {
    id: 'rep_' + Date.now(),
    keywords: Array.isArray(req.body.keywords) ? req.body.keywords : (req.body.keywords || '').split(',').map(s => s.trim()),
    response: req.body.response,
    matchType: req.body.matchType || 'exact',
    cooldown: Number(req.body.cooldown) || 5,
    enabled: req.body.enabled !== false
  };
  list.push(newReply);
  db.updateUser(req.user.id, { autoReplies: list });
  res.json({ success: true, autoReply: newReply, autoReplies: list });
});

app.put('/api/auto-replies/:id', auth.requireAuth, (req, res) => {
  const list = req.user.autoReplies || [];
  const idx = list.findIndex(r => r.id === req.params.id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...req.body };
    db.updateUser(req.user.id, { autoReplies: list });
    return res.json({ success: true, autoReply: list[idx] });
  }
  res.status(404).json({ success: false });
});

app.delete('/api/auto-replies/:id', auth.requireAuth, (req, res) => {
  let list = req.user.autoReplies || [];
  list = list.filter(r => r.id !== req.params.id);
  db.updateUser(req.user.id, { autoReplies: list });
  res.json({ success: true });
});

// Spam & Moderasyon
app.get('/api/moderation', auth.requireAuth, (req, res) => {
  res.json({
    success: true,
    moderation: req.user.moderation || {
      capsLimit: { enabled: true, maxPercentage: 70, minLength: 8 },
      linkProtection: { enabled: true, permitMods: true, permitSubs: true },
      bannedWords: { enabled: true, words: ['salak', 'küfür', 'aptal'] }
    }
  });
});

app.post('/api/moderation', auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { moderation: req.body });
  res.json({ success: true, moderation: updated.moderation });
});

// 🌶️ Adanalı Modu Ayarları
app.get('/api/adana', auth.requireAuth, (req, res) => {
  res.json({ success: true, adanaMode: req.user.adanaMode || {} });
});

app.post(['/api/adana', '/api/user/adana'], auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { adanaMode: req.body });
  res.json({ success: true, adanaMode: updated.adanaMode });
});

// Widget Ayarları
app.get('/api/widgets', auth.requireAuth, (req, res) => {
  res.json({ success: true, widgets: req.user.widgets || {} });
});

app.post(['/api/widgets', '/api/user/widgets'], auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { widgets: req.body });
  res.json({ success: true, widgets: updated.widgets });
});

// Lisans & Abonelik Durumu
app.get('/api/license/status', auth.requireAuth, (req, res) => {
  res.json({
    success: true,
    isLicensed: true,
    license: {
      type: req.user.subscription?.plan === 'pro' ? 'VIP PRO' : 'Ücretsiz',
      owner: req.user.name,
      expiresAt: req.user.subscription?.expiresAt || 'Süresiz'
    }
  });
});

// Canlı Sohbete Manuel Mesaj Yazma
app.post('/api/chat/send', auth.requireAuth, async (req, res) => {
  const { message } = req.body;
  const user = req.user;
  const channelSlug = user.settings?.channelSlug;
  if (!channelSlug) return res.status(400).json({ success: false, error: 'Kanal adı tanımlı değil.' });

  const token = multiKickManager.getActiveBotToken(user);
  let chatroomId = null;
  let channelId = null;
  let broadcasterUserId = null;

  const worker = multiKickManager.activeWorkers.get(user.id);
  if (worker && worker.chatroomId) {
    chatroomId = worker.chatroomId;
    channelId = worker.channelId;
    broadcasterUserId = worker.broadcasterUserId;
  } else {
    try {
      const ch = await multiKickManager.fetchKickChannel(channelSlug);
      chatroomId = ch.chatroom?.id || ch.id;
      channelId = ch.id;
      broadcasterUserId = ch.user_id || ch.id;
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }
  }

  const sendRes = await multiKickManager.sendKickMessageDirect({
    channelSlug,
    chatroomId,
    channelId,
    broadcasterUserId,
    token,
    messageText: message,
    botUsername: multiKickManager.getActiveBotUsername(user)
  });
  res.json(sendRes);
});

// Sadakat, Çekiliş, Klipler, Discord Fallbacks
app.get('/api/loyalty', auth.requireAuth, (req, res) => res.json({ success: true, config: { enabled: false } }));
app.get('/api/giveaway', auth.requireAuth, (req, res) => res.json({ success: true, giveaway: { active: false, participants: [] } }));
app.get('/api/highlights', auth.requireAuth, (req, res) => res.json({ success: true, highlights: [] }));
app.get('/api/discord', auth.requireAuth, (req, res) => res.json({ success: true, config: { enabled: false } }));

// Sohbete Test Mesajı Gönder (Token ve Bağlantı Doğrulama)
app.post('/api/bot/send-test', auth.requireAuth, async (req, res) => {
  const user = req.user;
  const channelSlug = user.settings?.channelSlug;
  if (!channelSlug) {
    return res.status(400).json({ success: false, error: 'Lütfen önce Kick kanal adınızı girin ve kaydedin.' });
  }

  const token = multiKickManager.getActiveBotToken(user);
  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Bot Token girilmemiş! Lütfen "Özel Bot İsmi & Token" bölümünden geçerli bir Kick Bot Token yapıştırın.'
    });
  }

  let chatroomId = null;
  let channelId = null;
  let broadcasterUserId = null;

  const worker = multiKickManager.activeWorkers.get(user.id);
  if (worker && worker.chatroomId) {
    chatroomId = worker.chatroomId;
    channelId = worker.channelId;
    broadcasterUserId = worker.broadcasterUserId;
  } else {
    try {
      const ch = await multiKickManager.fetchKickChannel(channelSlug);
      chatroomId = ch.chatroom?.id || ch.id;
      channelId = ch.id;
      broadcasterUserId = ch.user_id || ch.id;
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Kanal bilgileri alınamadı: ' + e.message });
    }
  }

  const botUsername = multiKickManager.getActiveBotUsername(user);
  console.log(`[send-test] Test mesajı gönderiliyor: kanal=${channelSlug}, bot=${botUsername}, chatroomId=${chatroomId}, channelId=${channelId}, broadcasterUserId=${broadcasterUserId}`);

  const result = await multiKickManager.sendKickMessageDirect({
    channelSlug,
    chatroomId,
    channelId,
    broadcasterUserId,
    token,
    messageText: req.body.message || `🤖 [Test] RoxenBot sohbet bağlantısı başarılı! 👋`,
    botUsername
  });

  res.json(result);
});

// Bot Token Teşhis Endpoint'i (Sadece Süper Yönetici mobiloyunlog@gmail.com)
app.get('/api/admin/bot-token-check', auth.requireAdmin, (req, res) => {
  const user = req.user;
  const token = multiKickManager.getActiveBotToken(user);
  const clean = token ? token.replace(/^Bearer\s+/i, '').trim().replace(/^["']|["']$/g, '') : '';
  res.json({
    email: user.email,
    hasToken: Boolean(token),
    tokenPrefix: clean ? clean.substring(0, 8) + '...' : 'yok',
    tokenLength: clean ? clean.length : 0,
    isKatToken: clean.startsWith('kat_'),
    isJwtToken: clean.startsWith('ey'),
    isCookie: clean.includes('='),
    botUsername: user.customBot?.botUsername || '',
    channelSlug: user.settings?.channelSlug || ''
  });
});

// =================== 3. ÖDEME & ABONELİK (SHOPIER / PAYTR) ===================

// Ödeme Emri Başlat
app.post('/api/payment/create-order', auth.requireAuth, (req, res) => {
  const plan = req.body.plan || 'monthly';
  const order = payment.createPaymentOrder(req.user, plan);
  res.json({ success: true, ...order });
});

// Ödeme Webhook'u (Shopier / PayTR Bildirimi)
app.post('/api/payment/webhook', (req, res) => {
  const result = payment.handleWebhook(req.body);
  if (result.success && result.user) {
    io.to('dashboard_' + result.user.id).emit('subscription_updated', result.subscription);
  }
  res.json(result);
});

// Test / Simülasyon: Tek Tıkla VIP PRO Yap
app.post('/api/payment/simulate-pro', auth.requireAuth, (req, res) => {
  const plan = req.body.plan || 'monthly';
  const result = payment.simulateUpgradeToPro(req.user.id, plan);
  if (result.success) {
    io.to('dashboard_' + req.user.id).emit('subscription_updated', result.subscription);
  }
  res.json(result);
});

// =================== 4. YÖNETİCİ (ADMIN) PANELİ API ===================

// Admin İstatistikleri
app.get('/api/admin/stats', auth.requireAdmin, (req, res) => {
  const users = db.getAllUsers();
  const totalUsers = users.length;
  const proUsers = users.filter(u => u.subscription?.plan === 'pro').length;
  const freeUsers = totalUsers - proUsers;
  let activeBots = 0;
  users.forEach(u => {
    if (multiKickManager.isUserBotRunning(u.id)) activeBots++;
  });

  res.json({
    success: true,
    stats: {
      totalUsers,
      proUsers,
      freeUsers,
      activeBots
    }
  });
});

// Tüm Yayıncıları Listele
app.get('/api/admin/users', auth.requireAdmin, (req, res) => {
  const users = db.getAllUsers().map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    role: u.role || 'streamer',
    createdAt: u.createdAt,
    subscription: u.subscription,
    channelSlug: u.settings?.channelSlug || '',
    isBotRunning: multiKickManager.isUserBotRunning(u.id),
    customBot: {
      botUsername: u.customBot?.botUsername || '',
      enabled: Boolean(u.customBot?.enabled)
    }
  }));
  res.json({ success: true, users });
});

// Kullanıcıya VIP PRO Ver / Planı Değiştir
app.post('/api/admin/users/:id/subscription', auth.requireAdmin, (req, res) => {
  const { id } = req.params;
  const { plan = 'pro', days = 30 } = req.body;

  const targetUser = db.getUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  }

  const sub = db.setSubscription(id, { plan, days: Number(days) });

  // Canlı Socket.IO ile kullanıcının ekranını anında güncelle
  io.to('dashboard_' + id).emit('subscription_updated', sub);

  console.log(`👑 [ADMIN] ${req.user.name} kullanıcısı ${targetUser.email} hesabını '${plan.toUpperCase()}' yaptı (${days} gün).`);
  res.json({ success: true, user: targetUser, subscription: sub });
});

// Kullanıcıyı Sil
app.delete('/api/admin/users/:id', auth.requireAdmin, (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) {
    return res.status(400).json({ success: false, error: 'Kendi yönetici hesabınızı silemezsiniz.' });
  }

  multiKickManager.stopUserBot(id);
  const deleted = db.deleteUser(id);
  res.json({ success: deleted });
});

// =================== 4. OBS CLOUD WIDGET'LARI ===================

// Widget Veri Alma Endpoint'i (OBS tarayıcı kaynağı apiKey ile sorgular)
app.get('/api/widget/data', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Token eksik.' });

  const user = db.getUserByApiKey(token);
  if (!user) return res.status(404).json({ error: 'Geçersiz OBS Widget anahtarı.' });

  res.json({
    success: true,
    channelSlug: user.settings.channelSlug,
    widgets: user.widgets,
    subscription: user.subscription.plan
  });
});

// Widget Sayfaları
app.get(['/widget/alertbox', '/widgets/alertbox'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'alertbox.html'));
});

app.get(['/widget/chat', '/widgets/chat'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'chat.html'));
});

app.get(['/widget/goal', '/widgets/goal'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'goal.html'));
});

app.get(['/widget/giveaway', '/widgets/giveaway'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'giveaway.html'));
});

// =================== 5. SOCKET.IO MULTI-TENANT ODALARI ===================

io.on('connection', (socket) => {
  // OBS Widget bağlantısı (Örn: token = 'obx_...')
  socket.on('join_obs', (token) => {
    if (token) {
      socket.join('obs_' + token);
      console.log(`[Socket.IO] OBS Browser bağlandı: obs_${token.substring(0, 8)}...`);
    }
  });

  // Yayıncı Dashboard paneli bağlantısı
  socket.on('join_dashboard', (userId) => {
    if (userId) {
      socket.join('dashboard_' + userId);
    }
  });
});

// Sunucuyu Başlat
server.listen(config.PORT, () => {
  console.log('======================================================');
  console.log(`🚀 [ROXENBOT CLOUD SAAS] Platform Başlatıldı!`);
  console.log(`🌐 Ana Sayfa & Landing : http://localhost:${config.PORT}`);
  console.log(`👑 Yayıncı Paneli     : http://localhost:${config.PORT}/dashboard.html`);
  console.log(`⚡ Hızlı Test Girişi   : http://localhost:${config.PORT}/auth/demo`);
  console.log('======================================================');
});
