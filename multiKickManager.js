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
        broadcasterUserId: channelData.user_id || channelData.id,
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
      if (worker.idleCheckInterval) clearInterval(worker.idleCheckInterval);
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
        user_id: 33368381,
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

        // 🌶️ Adanalı Darlama (Idle) Kontrolü
        worker.idleCheckInterval = setInterval(async () => {
          const u = db.getUserById(worker.userId);
          if (!u || !u.adanaMode?.enabled || !worker.lastChatUsers) return;
          const idleMs = (Number(u.adanaMode.idleMinutes) || 2) * 60 * 1000;
          const now = Date.now();

          for (const [chatter, lastSeen] of Object.entries(worker.lastChatUsers)) {
            if ((now - lastSeen) >= idleMs && (now - lastSeen) < (idleMs + 45000)) {
              worker.lastChatUsers[chatter] = now;
              const idleReplies = (u.adanaMode.idleReplies && u.adanaMode.idleReplies.length > 0)
                ? u.adanaMode.idleReplies
                : require('./adanaQuotes').IDLE_REPLIES;
              const pick = idleReplies[Math.floor(Math.random() * idleReplies.length)];
              const replyText = pick.replace(/{username}/g, chatter);
              console.log(`🌶️ [Adanalı Darlama] '${chatter}' sessiz kaldı, darlanıyor...`);
              await this.sendKickMessage(worker, u, replyText);
              break;
            }
          }
        }, 30000);
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
        if (worker.idleCheckInterval) clearInterval(worker.idleCheckInterval);
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

      // 1. Chat v2 feed
      worker.ws.send(JSON.stringify({
        subscribe: { channel: `chatrooms.${worker.chatroomId}.v2` },
        id: 2
      }));

      // 2. Chat standart feed
      worker.ws.send(JSON.stringify({
        subscribe: { channel: `chatrooms.${worker.chatroomId}` },
        id: 3
      }));

      // 3. Kanal olayları feed
      worker.ws.send(JSON.stringify({
        subscribe: { channel: `channel.${worker.channelId}` },
        id: 4
      }));

      console.log(`🟢 [MultiKick Canlı] '${worker.channelSlug}' sohbet odasına abone olundu!`);

      // Bağlandıktan 1.5 saniye sonra sohbete selam mesajı at
      setTimeout(() => {
        const u = db.getUserById(worker.userId);
        if (u) {
          this.sendKickMessage(worker, u, `🟢 RoxenBot başarıyla bağlandı! İyi yayınlar dilerim! 👋`);
        }
      }, 1500);

      return;
    }

    // 2. Canlı Yayın Olayları
    const pub = data.push?.pub;
    if (!pub || !pub.data) return;

    let eventData = pub.data;
    if (typeof eventData === 'string') {
      try { eventData = JSON.parse(eventData); } catch (e) {}
    }

    const eventType = eventData.event || data.push?.pub?.event || '';
    let payload = eventData.data !== undefined ? eventData.data : eventData;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) {}
    }

    // A) Canlı Sohbet Mesajı
    if (
      eventType === 'App\\Events\\ChatMessageEvent' ||
      eventType.includes('ChatMessage') ||
      payload.content !== undefined ||
      payload.message !== undefined
    ) {
      const chatMsg = payload.message || payload;
      const username = chatMsg.sender?.username || 'İzleyici';
      const content = chatMsg.content || '';
      console.log(`💬 [MultiKick Chat] ${worker.channelSlug} | ${username}: ${content}`);

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
    if (eventType === 'App\\Events\\FollowersUpdated' || eventType.includes('Follow')) {
      const follower = payload.follower?.username || payload.username || 'Yeni Takipçi';
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
    if (eventType === 'App\\Events\\SubscriptionEvent' || eventType.includes('Subscription')) {
      const subscriber = payload.username || 'Yeni Abone';
      console.log(`👑 [MultiKick Abone] '${worker.channelSlug}' kanalı abone: ${subscriber}`);
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

    // İzleyicinin son konuşma zamanını kaydet (Adanalı darlama takibi için)
    if (!worker.lastChatUsers) worker.lastChatUsers = {};
    worker.lastChatUsers[username] = Date.now();

    // 1. Özel Komut Kontrolü (!dc, !oyun, !instagram vb.)
    const matchedCmd = (user.commands || []).find(c => c.enabled && lower === `!${c.name.toLowerCase()}`);
    if (matchedCmd) {
      await this.sendKickMessage(worker, user, matchedCmd.response);
      return;
    }

    // 2. Otomatik Yanıtlar (sa, selam, slm, merhaba)
    const matchedAuto = (user.autoReplies || []).find(r => r.enabled && r.keywords.some(k => lower === k.toLowerCase() || lower.startsWith(k.toLowerCase() + ' ')));
    if (matchedAuto) {
      await this.sendKickMessage(worker, user, matchedAuto.response);
      return;
    }

    // 3. 🌶️ ADANALI MODU (Espirili Sataşma / Kavga)
    if (user.adanaMode?.enabled) {
      const banterChance = Number(user.adanaMode.banterChance ?? 40);
      const roll = Math.random() * 100;
      if (roll <= banterChance) {
        const now = Date.now();
        const cooldown = (Number(user.adanaMode.cooldownSec) || 25) * 1000;
        if (!worker.lastAdanaReply || (now - worker.lastAdanaReply) > cooldown) {
          worker.lastAdanaReply = now;
          const replies = (user.adanaMode.funnyReplies && user.adanaMode.funnyReplies.length > 0)
            ? user.adanaMode.funnyReplies
            : require('./adanaQuotes').FUNNY_REPLIES;
          const pick = replies[Math.floor(Math.random() * replies.length)];
          const replyText = pick.replace(/{username}/g, username);
          await this.sendKickMessage(worker, user, replyText);
          return;
        }
      }
    }

    // 3. Gemini AI Cevabı (Bot'a seslenildiğinde: "bot ...", "!ai", vb.)
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
   * Kullanıcının bot token'ı:
   * - Kullanıcı kendi token'ını girdiyse öncelikle onu kullanır
   * - Girmediyse sistem varsayılan token'ını dener
   */
  getActiveBotToken(user) {
    if (user.customBot?.botToken && user.customBot.botToken.trim()) {
      return user.customBot.botToken.trim();
    }
    return config.DEFAULT_BOT.TOKEN || '';
  }

  getActiveBotUsername(user) {
    if (user.customBot?.botUsername && user.customBot.botUsername.trim()) {
      return user.customBot.botUsername.trim();
    }
    return config.DEFAULT_BOT.USERNAME || 'RoxenBot';
  }

  async sendKickMessage(worker, user, messageText) {
    const token = this.getActiveBotToken(user);
    const res = await this.sendKickMessageDirect({
      channelSlug: worker.channelSlug,
      chatroomId: worker.chatroomId,
      channelId: worker.channelId,
      broadcasterUserId: worker.broadcasterUserId || worker.channelId,
      token,
      messageText,
      botUsername: this.getActiveBotUsername(user)
    });
    return res.success;
  }

  async sendKickMessageDirect({
    channelSlug,
    chatroomId,
    channelId,
    broadcasterUserId,
    token,
    messageText,
    botUsername = 'RoxenBot'
  }) {
    if (!token) {
      console.warn(`[MultiKick] '${channelSlug}' için bot token tanımlı değil.`);
      return { success: false, error: 'Bot token girilmemiş! Lütfen geçerli bir Kick Bot Token yapıştırın.' };
    }

    let cleanToken = String(token || '').trim().replace(/^["']|["']$/g, '');
    while (cleanToken.toLowerCase().startsWith('bearer ')) {
      cleanToken = cleanToken.slice(7).trim();
    }

    const errors = [];

    // =========================================================================
    // YÖNTEM 1: Kick Resmi Public API (https://api.kick.com/public/v1/chat)
    // Cloudflare Datacenter IP engeli YOKTUR! Resmi OAuth / Developer tokenları içindir.
    // =========================================================================
    try {
      const targetUserId = Number(broadcasterUserId || channelId);
      console.log(`[MultiKick] Yöntem 1 (Resmi API) deneniyor: broadcaster_user_id=${targetUserId}`);
      const officialRes = await axios.post(
        'https://api.kick.com/public/v1/chat',
        {
          broadcaster_user_id: targetUserId,
          content: messageText,
          type: 'user'
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 7000
        }
      );

      if (officialRes.status === 200 || officialRes.status === 201) {
        console.log(`✅ [MultiKick Resmi API Başarılı] (${channelSlug}) -> "${messageText}" [Bot: ${botUsername}]`);
        return { success: true, apiType: 'official', data: officialRes.data };
      }
    } catch (err1) {
      const s1 = err1.response?.status;
      const m1 = err1.response?.data?.message || err1.message;
      console.warn(`[MultiKick Yöntem 1 Başarısız (${s1})]:`, m1);
      errors.push(`Resmi API (${s1 || 'Ağ'}): ${m1}`);
    }

    // =========================================================================
    // YÖNTEM 2: Kick Web v2 API (https://kick.com/api/v2/messages/send/${chatroomId})
    // =========================================================================
    try {
      const headers = {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Referer': `https://kick.com/${channelSlug}`,
        'Origin': 'https://kick.com',
        'x-app-platform': 'web',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      };

      // Cookie formatında ise Cookie başlığı olarak da ilet
      if (cleanToken.includes('session') || cleanToken.includes('=')) {
        headers['Cookie'] = cleanToken;
        const xsrfMatch = cleanToken.match(/XSRF-TOKEN=([^;]+)/i);
        if (xsrfMatch) {
          headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
        }
      }

      console.log(`[MultiKick] Yöntem 2 (Web v2) deneniyor: chatroomId=${chatroomId}`);
      const v2Res = await axios.post(
        `https://kick.com/api/v2/messages/send/${chatroomId}`,
        {
          content: messageText,
          type: 'message'
        },
        {
          headers,
          timeout: 7000
        }
      );

      console.log(`✅ [MultiKick Web v2 Başarılı] (${channelSlug}) -> "${messageText}" [Bot: ${botUsername}]`);
      return { success: true, apiType: 'web-v2', data: v2Res.data };
    } catch (err2) {
      const s2 = err2.response?.status;
      const m2 = err2.response?.data?.status?.message || err2.response?.data?.message || err2.message;
      console.warn(`[MultiKick Yöntem 2 Başarısız (${s2})]:`, m2);
      errors.push(`Web v2 (${s2 || 'Ağ'}): ${m2}`);
    }

    // =========================================================================
    // YÖNTEM 3: Kick Web v1 API (https://kick.com/api/v1/chatrooms/${chatroomId}/messages)
    // =========================================================================
    try {
      console.log(`[MultiKick] Yöntem 3 (Web v1) deneniyor: chatroomId=${chatroomId}`);
      const v1Res = await axios.post(
        `https://kick.com/api/v1/chatrooms/${chatroomId}/messages`,
        {
          content: messageText,
          type: 'message'
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': `https://kick.com/${channelSlug}`
          },
          timeout: 7000
        }
      );

      console.log(`✅ [MultiKick Web v1 Başarılı] (${channelSlug}) -> "${messageText}" [Bot: ${botUsername}]`);
      return { success: true, apiType: 'web-v1', data: v1Res.data };
    } catch (err3) {
      const s3 = err3.response?.status;
      const m3 = err3.response?.data?.status?.message || err3.response?.data?.message || err3.message;
      errors.push(`Web v1 (${s3 || 'Ağ'}): ${m3}`);
    }

    // Tüm denemeler başarısız olduysa
    console.error(`❌ [MultiKick Tüm Gönderme Yolları Başarısız] (${channelSlug}):`, errors.join(' | '));

    let userFriendlyError = errors.join(' • ');
    if (errors.some(e => e.includes('429'))) {
      userFriendlyError = `Kick Hız Sınırı (429): Kick sunucuları isteği hız sınırına taktı. Lütfen Kick sohbetinize '/mod ${botUsername}' yazarak bota MODERATÖR yetkisi verin ve tokenınızı yenileyin.`;
    } else if (errors.some(e => e.includes('401') || e.includes('403'))) {
      userFriendlyError = `Kick Yetki Hatası (401/403): Token geçersiz veya süresi dolmuş. Lütfen yeni bir Kick token girip kaydedin.`;
    }

    return {
      success: false,
      error: userFriendlyError,
      details: errors
    };
  }
}

module.exports = new MultiKickManager();
