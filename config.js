const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3005,
  APP_URL: process.env.APP_URL || 'http://localhost:3005',
  JWT_SECRET: process.env.JWT_SECRET || 'roxen_cloud_super_secret_jwt_key_2026',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'mobiloyunlog@gmail.com',

  // Google OAuth Ayarları (Geleneksel ve GSI)
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '119348431264-s9u2tdbm9vd363eofbufcrmi1mfu1b1d.apps.googleusercontent.com',
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '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',
    CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'https://roxenbot.onrender.com/auth/google/callback'
  },

  // Firebase Authentication Yapılandırması
  FIREBASE: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  },

  // Ödeme Entegrasyonu (Shopier / PayTR)
  PAYMENT: {
    SHOPIER_API_KEY: process.env.SHOPIER_API_KEY || '',
    SHOPIER_API_SECRET: process.env.SHOPIER_API_SECRET || '',
    PRO_MONTHLY_PRICE: 99, // TL / Ay
    PRO_LIFETIME_PRICE: 499 // TL / Ömür Boyu
  },

  // Ücretsiz kullanıcılar için varsayılan bot kimliği
  DEFAULT_BOT: {
    USERNAME: 'RoxenBot',
    TOKEN: process.env.DEFAULT_BOT_TOKEN || 'kat_WdVlCC2WsYyDS5NSt0KZ2Ml_AggdRCcybqa8ELp7tms'
  },

  DATA_DIR: path.join(__dirname, 'data'),
  USERS_FILE: path.join(__dirname, 'data', 'users.json')
};
