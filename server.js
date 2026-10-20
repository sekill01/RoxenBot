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
    botRunning: isRunning
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

// Özel Bot İsmi & Token (VIP PRO Kontrollü)
app.post('/api/user/custom-bot', auth.requireAuth, (req, res) => {
  const user = req.user;
  const isPro = user.subscription?.plan === 'pro';

  if (!isPro) {
    return res.status(403).json({
      success: false,
      vipRequired: true,
      error: 'Özel Bot İsmi tanımlama özelliği VIP PRO paket gerektirir. Lütfen üyeliğinizi yükseltin.'
    });
  }

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
app.post('/api/user/gemini', auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { geminiAI: req.body });
  res.json({ success: true, geminiAI: updated.geminiAI });
});

// Komutlar
app.post('/api/user/commands', auth.requireAuth, (req, res) => {
  const updated = db.updateUser(req.user.id, { commands: req.body.commands || [] });
  res.json({ success: true, commands: updated.commands });
});

// Botu Başlat
app.post('/api/bot/start', auth.requireAuth, async (req, res) => {
  const result = await multiKickManager.startUserBot(req.user.id);
  res.json(result);
});

// Botu Durdur
app.post('/api/bot/stop', auth.requireAuth, (req, res) => {
  const stopped = multiKickManager.stopUserBot(req.user.id);
  res.json({ success: stopped });
});

// Bot Durumu
app.get('/api/bot/status', auth.requireAuth, (req, res) => {
  const running = multiKickManager.isUserBotRunning(req.user.id);
  res.json({ success: true, running });
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
app.get('/widget/alertbox', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'alertbox.html'));
});

app.get('/widget/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'chat.html'));
});

app.get('/widget/goal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widgets', 'goal.html'));
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
