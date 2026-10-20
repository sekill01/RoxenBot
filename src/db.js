const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const adanaQuotes = require('./adanaQuotes');

class Database {
  constructor() {
    this.filePath = config.USERS_FILE;
    this.users = new Map();
    this.init();
  }

  init() {
    if (!fs.existsSync(config.DATA_DIR)) {
      fs.mkdirSync(config.DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(u => {
            if (u.email && (u.email.toLowerCase() === 'mobiloyunlog@gmail.com' || u.email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase())) {
              u.role = 'admin';
            }
            this.users.set(u.id, u);
          });
        }
      } catch (err) {
        console.error('[DB] Veritabanı okuma hatası:', err.message);
      }
    } else {
      this.save();
    }
  }

  save() {
    try {
      const arr = Array.from(this.users.values());
      fs.writeFileSync(this.filePath, JSON.stringify(arr, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Kaydetme hatası:', err.message);
    }
  }

  generateToken(prefix = 'obx') {
    return `${prefix}_` + crypto.randomBytes(16).toString('hex');
  }

  createUser({ email, name, avatar = '', googleId = '' }) {
    const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    const obsToken = this.generateToken('obx');

    const cleanEmail = email.toLowerCase().trim();
    const isAdmin = cleanEmail === 'mobiloyunlog@gmail.com' || cleanEmail === (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

    const newUser = {
      id: userId,
      email: cleanEmail,
      name: name || 'Yayıncı',
      role: isAdmin ? 'admin' : 'streamer',
      avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      googleId: googleId || '',
      apiKey: obsToken, // OBS Widget erişim anahtarı
      createdAt: new Date().toISOString(),

      // Abonelik Planı: Free veya Pro
      subscription: {
        plan: 'free', // 'free' veya 'pro'
        status: 'active',
        startedAt: new Date().toISOString(),
        expiresAt: null, // null = süresiz free, pro için bitiş tarihi
        customBotAllowed: false,
        aiRepliesLimit: 50
      },

      // Kick Kanal Ayarları
      settings: {
        channelSlug: '',
        isBotActive: false,
        language: 'tr'
      },

      // Özel Bot İsmi (VIP PRO ile açılır)
      customBot: {
        enabled: false,
        botUsername: '',
        botToken: ''
      },

      // Gemini AI Canlı Yayın Asistanı
      geminiAI: {
        enabled: true,
        apiKey: '',
        model: 'gemini-2.5-flash',
        personality: "Sen Kick canlı yayınında yer alan samimi, esprili ve bilgili bir AI chat asistanısın. Yayıncının oynadığı oyunu ve söylediklerini takip eder, 1-2 cümleyle lafını asla yarım bırakmadan akıcı cevap verirsin.",
        triggerMode: 'hybrid',
        wakeWordOnly: true,
        cooldownSeconds: 5,
        maxTokens: 800,
        temperature: 0.8,
        replyChance: 85,
        sendToKickChat: true
      },

      // Komutlar
      commands: [
        { id: 'c1', name: 'dc', response: 'Discord sunucumuza katıl: https://discord.gg/roxen', enabled: true },
        { id: 'c2', name: 'instagram', response: 'Beni Instagram\'dan takip et: https://instagram.com/hesabiniz', enabled: true },
        { id: 'c3', name: 'oyun', response: 'Şu an harika bir oyun oynuyoruz! Katılmak için sohbete yazabilirsin.', enabled: true }
      ],

      // Zamanlayıcılar (Timers)
      timers: [
        { id: 't1', name: 'Discord Duyurusu', message: '📢 Discord topluluğumuza gelmeyi unutmayın: !dc', intervalMinutes: 15, enabled: true }
      ],

      // Oto-Cevaplar
      autoReplies: [
        { id: 'r1', keywords: ['sa', 'selam', 'slm'], response: 'Aleyküm selam, hoş geldin! İyi seyirler dilerim 👋', enabled: true }
      ],

      // OBS Widget Ayarları
      widgets: {
        alertbox: {
          follow: { enabled: true, text: '{username} takip etti!', sound: '/sounds/follow.mp3' },
          sub: { enabled: true, text: '{username} kanala abone oldu! 👑', sound: '/sounds/sub.mp3' },
          gift: { enabled: true, text: '{username}, {count} kişiye abonelik hediye etti! 🎁', sound: '/sounds/gift.mp3' }
        },
        chat: {
          theme: 'modern_dark',
          fontSize: 14,
          fadeSeconds: 15
        },
        goal: {
          title: 'Takipçi Hedefi',
          current: 0,
          target: 100
        }
      },

      // 🌶️ ADANALI MODU (Kavga, Sataşma & Darlama)
      adanaMode: {
        enabled: true,
        idleMinutes: 2,
        banterChance: 40,
        cooldownSec: 25,
        funnyReplies: [...adanaQuotes.FUNNY_REPLIES],
        idleReplies: [...adanaQuotes.IDLE_REPLIES]
      }
    };

    this.users.set(userId, newUser);
    this.save();
    return newUser;
  }

  getUserById(id) {
    const user = this.users.get(id);
    if (user && !user.adanaMode) {
      user.adanaMode = {
        enabled: true,
        idleMinutes: 2,
        banterChance: 40,
        cooldownSec: 25,
        funnyReplies: [...adanaQuotes.FUNNY_REPLIES],
        idleReplies: [...adanaQuotes.IDLE_REPLIES]
      };
    }
    return user || null;
  }

  getUserByEmail(email) {
    if (!email) return null;
    const clean = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email === clean) return u;
    }
    return null;
  }

  getUserByApiKey(apiKey) {
    if (!apiKey) return null;
    for (const u of this.users.values()) {
      if (u.apiKey === apiKey) return u;
    }
    return null;
  }

  updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) return null;

    // Derin birleştirme
    if (updates.settings) user.settings = { ...user.settings, ...updates.settings };
    if (updates.customBot) user.customBot = { ...user.customBot, ...updates.customBot };
    if (updates.geminiAI) user.geminiAI = { ...user.geminiAI, ...updates.geminiAI };
    if (updates.widgets) user.widgets = { ...user.widgets, ...updates.widgets };
    if (updates.adanaMode) user.adanaMode = { ...user.adanaMode, ...updates.adanaMode };
    if (updates.commands) user.commands = updates.commands;
    if (updates.timers) user.timers = updates.timers;
    if (updates.autoReplies) user.autoReplies = updates.autoReplies;
    if (updates.name) user.name = updates.name;
    if (updates.subscription) user.subscription = { ...user.subscription, ...updates.subscription };

    this.users.set(id, user);
    this.save();
    return user;
  }

  setSubscription(userId, { plan = 'pro', days = 30 }) {
    const user = this.getUserById(userId);
    if (!user) return null;

    const expiresAt = days === -1 ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    user.subscription = {
      plan,
      status: 'active',
      startedAt: new Date().toISOString(),
      expiresAt,
      customBotAllowed: plan === 'pro',
      aiRepliesLimit: plan === 'pro' ? 999999 : 50
    };

    this.users.set(userId, user);
    this.save();
    return user.subscription;
  }

  canUseCustomBot(userId) {
    const user = this.getUserById(userId);
    if (!user) return false;
    return user.subscription.plan === 'pro';
  }

  deleteUser(id) {
    if (this.users.has(id)) {
      this.users.delete(id);
      this.save();
      return true;
    }
    return false;
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }
}

module.exports = new Database();
