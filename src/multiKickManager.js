const WebSocket = require('ws');
const axios = require('axios');
const db = require('./db');
const geminiEngine = require('./geminiEngine');
const config = require('../config');

class MultiKickManager {
  constructor() {
    this.activeWorkers = new Map(); // userId -> Worker instance
    this.io = null; // Socket.IO sunucu referansı
  }

  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Belirli bir kullanıcının botunu başlatır ve Kick kanalına bağlar.
   */
  async startUserBot(userId) {
    const user = db.getUserById(userId);
    if (!user) return { success: false, error: 'Kullanıcı bulunamadı.' };

    const channelSlug = (user.settings.channelSlug || '').trim().toLowerCase();
    if (!channelSlug) {
      return { success: false, error: 'Lütfen önce Kick kanal adınızı girin.' };
    }

    // Zaten çalışıyorsa önce durdur
    if (this.activeWorkers.has(userId)) {
      this.stopUserBot(userId);
    }

    try {
      console.log(`[MultiKick] '${channelSlug}' kanalı için worker başlatılıyor (Kullanıcı: ${user.name})...`);
      
      // Kick kanal bilgilerini çek
      const channelData = await this.fetchKickChannel(channelSlug);
      if (!channelData || !channelData.id || !channelData.chatroom?.id) {
        return { success: false, error: `'${channelSlug}' adlı Kick kanalı bulunamadı.` };
      }

      const worker = {
        userId,
        channelSlug,
        channelId: channelData.id,
        chatroomId: channelData.chatroom.id,
        channelData,
        ws: null,
        pingInterval: null,
        connected: false
      };

      // WebSocket Bağlantısı
      this.connectCentrifugo(worker);
      this.activeWorkers.set(userId, worker);

      // Veritabanında aktif olarak işaretle
      db.updateUser(userId, { settings: { isBotActive: true } });

      return {
        success: true,
        channelSlug,
        channelId: channelData.id,
        chatroomId: channelData.chatroom.id
      };
    } catch (err) {
      console.error(`[MultiKick Hata] ${user.name} bot başlatılamadı:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Kullanıcının botunu durdurur.
   */
  stopUserBot(userId) {
    const worker = this.activeWorkers.get(userId);
    if (worker) {
      if (worker.pingInterval) clearInterval(worker.pingInterval);
      if (worker.ws) {
        try { worker.ws.close(); } catch (e) {}
      }
      this.activeWorkers.delete(userId);
      db.updateUser(userId, { settings: { isBotActive: false } });
      console.log(`[MultiKick] '${worker.channelSlug}' worker'ı durduruldu.`);
      return true;
    }
    return false;
  }

  isUserBotRunning(userId) {
    const worker = this.activeWorkers.get(userId);
    return Boolean(worker && worker.connected);
  }

  async fetchKickChannel(slug) {
    const cleanSlug = String(slug || '').trim().toLowerCase();
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://kick.com/'
    };

    // 1. Önce v1 API dene (Cloudflare datacenter IP koruması çok daha hafiftir)
    try {
      const res = await axios.get(`https://kick.com/api/v1/channels/${cleanSlug}`, {
        headers,
        timeout: 10000
      });
      if (res.data && res.data.id) {
        return res.data;
      }
    } catch (e) {
      console.warn(`[MultiKick] v1 fetch uyarısı (${e.message}), v2 deneniyor...`);
    }

    // 2. v2 API dene
    try {
      const res = await axios.get(`https://kick.com/api/v2/channels/${cleanSlug}`, {
        headers,
        timeout: 10000
      });
      if (res.data && res.data.id) {
        return res.data;
      }
    } catch (e) {
      console.warn(`[MultiKick] v2 fetch uyarısı (${e.message})`);
    }

    // 3. Fallback: Bilinen / Önbelleğe alınmış kanallar (Cloudflare 429 durumunda acil kurtarma)
    if (cleanSlug === 'syrex-nines' || cleanSlug === 'syrex_nines') {
      return {
        id: 32312171,
        slug: 'syrex-nines',
        chatroom: { id: 32023850 }
      };
    }

    throw new Error(`'${cleanSlug}' kanalı Kick üzerinde doğrulanamadı.`);
  }

  async connectCentrifugo(worker) {
    try {
      const crypto = require('crypto');
      const clientId = crypto.randomUUID();
      const headers = {
        'content-type': 'application/json',
        'accept': 'application/json',
        'origin': 'https://kick.com',
        'referer': `https://kick.com/${worker.channelSlug}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      // 1. Centrifugo için gerçek Auth Token al
      let token = '';
      try {
        const authRes = await axios.post(
          'https://web.kick.com/api/v1/realtime/auth/connection',
          { client_id: clientId },
          { headers, timeout: 8000 }
        );
        token = authRes.data?.data?.token || '';
      } catch (tokErr) {
        console.warn(`[MultiKick Auth Token Hatası] ${worker.channelSlug}:`, tokErr.message);
      }

      // 2. WebSocket Bağlantısını Başlat
      const wsUrl = 'wss://realtime.us-east-1.platform.kick.com/connection/websocket';
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Origin': 'https://kick.com',
          'User-Agent': headers['user-agent']
        }
      });
      worker.ws = ws;

      ws.on('open', () => {
        console.log(`[MultiKick WS] '${worker.channelSlug}' WebSocket bağlandı.`);
        ws.send(JSON.stringify({
          connect: { token, name: 'js' },
          id: 1
        }));

        worker.pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: {} }));
          }
        }, 20000);
      });

      ws.on('message', (data) => {
        try {
          const rawStr = data.toString();
          for (const line of rawStr.split('\n')) {
            if (!line) continue;
            if (line === '{}') {
              if (ws.readyState === WebSocket.OPEN) ws.send('{}');
              continue;
            }
            const msg = JSON.parse(line);
            this.handleCentrifugoMessage(worker, msg);
          }
        } catch (e) {}
      });

      ws.on('close', () => {
        worker.connected = false;
        if (worker.pingInterval) clearInterval(worker.pingInterval);
        if (this.activeWorkers.has(worker.userId)) {
          setTimeout(() => this.connectCentrifugo(worker), 5000);
        }
      });

      ws.on('error', (err) => {
        console.warn(`[MultiKick WS Hata] ${worker.channelSlug}:`, err.message);
      });
    } catch (err) {
      console.error(`[MultiKick Bağlantı Hatası] ${worker.channelSlug}:`, err.message);
    }
  }

  handleCentrifugoMessage(worker, data) {
    const user = db.getUserById(worker.userId);
    if (!user) return;

    // 1. Bağlantı onaylandığında kanallara abone ol
    if (data.id === 1 && data.connect) {
      worker.connected = true;

      // Chat odasına abone ol
      worker.ws.send(JSON.stringify({
        subscribe: {
          channel: `chatrooms.${worker.chatroomId}.v2`
        },
        id: 2
      }));

      // Kanal olaylarına abone ol (Takipçi, vb.)
      worker.ws.send(JSON.stringify({
        subscribe: {
          channel: `channel.${worker.channelId}`
        },
        id: 3
      }));

      console.log(`🟢 [MultiKick Canlı] '${worker.channelSlug}' sohbet odasına abone olundu!`);
      return;
    }

    // 2. Canlı Yayın Olayları
    const pushData = data.push?.pub?.data;
    if (!pushData) return;

    const eventType = data.push?.pub?.event || pushData.type;

    // A) Canlı Sohbet Mesajı
    if (eventType === 'App\\Events\\ChatMessageEvent' || pushData.message) {
      const chatMsg = pushData.message || pushData;
      const username = chatMsg.sender?.username || 'İzleyici';
      const content = chatMsg.content || '';

      // Yayıncının kendi OBS Chat Overlay'ine ilet
      if (this.io) {
        this.io.to('obs_' + user.apiKey).emit('chat_message', {
          id: chatMsg.id || Date.now(),
          username,
          content,
          badges: chatMsg.sender?.identity?.badges || [],
          color: chatMsg.sender?.identity?.color || '#00e59b',
          timestamp: Date.now()
        });
      }

      // Bot mantığını işlet
      this.handleChatMessage(worker, user, username, content);
    }

    // B) Takipçi Olayı
    if (eventType === 'App\\Events\\FollowersUpdated') {
      const follower = pushData.follower?.username || pushData.username || 'Yeni Takipçi';
      console.log(`⭐ [MultiKick Takip] '${worker.channelSlug}' kanalı takip edildi: ${follower}`);
      if (this.io) {
        this.io.to('obs_' + user.apiKey).emit('alert', {
          type: 'follow',
          username: follower,
          text: (user.widgets.alertbox.follow.text || '{username} takip etti!').replace('{username}', follower)
        });
      }
    }

    // C) Abone Olayı
    if (eventType === 'App\\Events\\SubscriptionEvent') {
      const subscriber = pushData.username || 'Yeni Abone';
      if (this.io) {
        this.io.to('obs_' + user.apiKey).emit('alert', {
          type: 'sub',
          username: subscriber,
          text: (user.widgets.alertbox.sub.text || '{username} kanala abone oldu!').replace('{username}', subscriber)
        });
      }
    }
  }

  async handleChatMessage(worker, user, username, content) {
    if (!content || !content.trim()) return;
    const text = content.trim();
    const lower = text.toLowerCase();

    // Botun kendi mesajlarına cevap vermesini engelle
    const currentBotName = this.getActiveBotUsername(user).toLowerCase();
    if (username.toLowerCase() === currentBotName) return;

    // 1. Özel Komut Kontrolü
    const matchedCmd = (user.commands || []).find(c => c.enabled && lower === `!${c.name.toLowerCase()}`);
    if (matchedCmd) {
      await this.sendKickMessage(worker, user, matchedCmd.response);
      return;
    }

    // 2. Gemini AI Cevabı (Bot'a seslenildiğinde: "bot ...", "!ai", vb.)
    const isAiTrigger = lower.startsWith('!ai') ||
                        lower.startsWith('!gemini') ||
                        /\b(bot|roxen|roxenbot)\b/i.test(text);

    if (isAiTrigger && user.geminiAI?.enabled && user.geminiAI?.apiKey) {
      const cleanPrompt = text.replace(/^(!ai|!gemini)\s*/i, '').trim();
      const aiRes = await geminiEngine.generateReply({
        apiKey: user.geminiAI.apiKey,
        model: user.geminiAI.model || 'gemini-2.5-flash',
        personality: user.geminiAI.personality,
        prompt: cleanPrompt || 'Burada mısın?',
        streamContext: {
          channelSlug: worker.channelSlug,
          category: worker.channelData?.livestream?.categories?.[0]?.name || 'Oyun & Sohbet',
          title: worker.channelData?.livestream?.session_title || 'Canlı Yayın'
        }
      });

      if (aiRes.ok && aiRes.reply) {
        await this.sendKickMessage(worker, user, aiRes.reply);
      }
    }
  }

  /**
   * Kullanıcının VIP PRO olup olmamasına göre mesajı:
   * - VIP PRO ise: Kullanıcının Kendi Özel Bot Hesabından (Özel Bot İsmi)
   * - Free ise: Standart RoxenBot Hesabından gönderir.
   */
  getActiveBotToken(user) {
    if (user.subscription?.plan === 'pro' && user.customBot?.enabled && user.customBot?.botToken) {
      return user.customBot.botToken.trim();
    }
    return config.DEFAULT_BOT.TOKEN;
  }

  getActiveBotUsername(user) {
    if (user.subscription?.plan === 'pro' && user.customBot?.enabled && user.customBot?.botUsername) {
      return user.customBot.botUsername.trim();
    }
    return config.DEFAULT_BOT.USERNAME;
  }

  async sendKickMessage(worker, user, messageText) {
    const token = this.getActiveBotToken(user);
    if (!token) return false;

    try {
      await axios.post(
        `https://kick.com/api/v2/messages/send/${worker.chatroomId}`,
        {
          content: messageText,
          type: 'message'
        },
        {
          headers: {
            'Authorization': `Bearer ${token.replace(/^Bearer /i, '')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': `https://kick.com/${worker.channelSlug}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 8000
        }
      );
      console.log(`[MultiKick Mesaj Gönderildi] (${worker.channelSlug}) -> "${messageText}" [Bot: ${this.getActiveBotUsername(user)}]`);
      return true;
    } catch (err) {
      console.error(`[MultiKick Mesaj Hatası] (${worker.channelSlug}):`, err.response?.data?.message || err.message);
      return false;
    }
  }
}

module.exports = new MultiKickManager();
