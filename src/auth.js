const crypto = require('crypto');
const db = require('./db');
const config = require('../config');

// Basit ve güvenli JWT / Session token üretici
function generateSessionToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    plan: user.subscription?.plan || 'free',
    exp: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 gün geçerli
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', config.JWT_SECRET).update(str).digest('base64url');
  return `${str}.${hmac}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', config.JWT_SECRET).update(payloadB64).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Auth Middleware: Cookie veya Authorization header'ından kullanıcıyı bulur
function requireAuth(req, res, next) {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/roxen_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Oturum açmanız gerekiyor.' });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Geçersiz veya süresi dolmuş oturum.' });
  }

  const user = db.getUserById(payload.id);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  }

  req.user = user;
  next();
}

// Demo / Test Girişi (Google API kurulumu beklemeden hemen test etmek için)
function handleDemoLogin(email = 'test@roxenbot.com', name = 'Tolga Yasin') {
  let user = db.getUserByEmail(email);
  if (!user) {
    user = db.createUser({
      email,
      name,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80'
    });
  }
  const token = generateSessionToken(user);
  return { user, token };
}

// Firebase Authentication Girişi (Google ile Giriş, E-posta vb.)
function handleFirebaseLogin({ uid, email, name, avatar = '' }) {
  if (!email || !uid) {
    return { success: false, error: 'Firebase kimlik bilgileri eksik.' };
  }

  const cleanEmail = email.toLowerCase().trim();
  let user = db.getUserByEmail(cleanEmail);

  if (!user) {
    user = db.createUser({
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      googleId: uid
    });
  } else {
    const updates = {};
    if (name && (!user.name || user.name === 'Yayıncı')) updates.name = name;
    if (avatar && !user.avatar) updates.avatar = avatar;
    if (uid && !user.googleId) updates.googleId = uid;
    if (Object.keys(updates).length > 0) {
      user = db.updateUser(user.id, updates);
    }
  }

  const token = generateSessionToken(user);
  return { success: true, user, token };
}

module.exports = {
  generateSessionToken,
  verifySessionToken,
  requireAuth,
  handleDemoLogin,
  handleFirebaseLogin
};
