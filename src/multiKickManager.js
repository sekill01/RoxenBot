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

        // 🌶️ Adanalı Darlama (Idle) Kontrolü (VIP PRO)
        worker.idleCheckInterval = setInterval(async () => {
          const u = db.getUserById(worker.userId);
          if (!u || !db.isVip(u.id) || !u.adanaMode?.enabled || !worker.lastChatUsers) return;
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

    // 0. 🛡️ SPAM & MODERASYON KONTROLÜ (Tüm Kullanıcılar İçin Aktif)
    if (user.moderation) {
      // Yasaklı Kelime Filtresi
      if (user.moderation.bannedWords?.enabled && Array.isArray(user.moderation.bannedWords.words)) {
        const hasBanned = user.moderation.bannedWords.words.some(w => w && lower.includes(w.toLowerCase().trim()));
        if (hasBanned) {
          const warnMsg = (user.moderation.bannedWords.warningMessage || '@{username} Lütfen sohbet kurallarına uygun kelimeler kullanınız!').replace(/{username}/g, username);
          await this.sendKickMessage(worker, user, warnMsg);
          return;
        }
      }

      // Link Paylaşım Koruması (Yayıncı hariç)
      if (user.moderation.linkProtection?.enabled && username.toLowerCase() !== (user.settings?.channelSlug || '').toLowerCase()) {
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|gg|tv|me|xyz|app|online)\b)/i;
        if (linkRegex.test(text)) {
          const warnMsg = (user.moderation.linkProtection.warningMessage || '@{username} Sohbette link paylaşımı yasaktır!').replace(/{username}/g, username);
          await this.sendKickMessage(worker, user, warnMsg);
          return;
        }
      }

      // Büyük Harf (Caps) Koruması
      if (user.moderation.capsProtection?.enabled) {
        const minLetters = user.moderation.capsProtection.minLetters || 8;
        const maxPercent = user.moderation.capsProtection.maxPercent || 70;
        const letters = text.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
        if (letters.length >= minLetters) {
          const upperCount = (letters.match(/[A-ZÇĞİÖŞÜ]/g) || []).length;
          const upperPercent = (upperCount / letters.length) * 100;
          if (upperPercent >= maxPercent) {
            const warnMsg = (user.moderation.capsProtection.warningMessage || '@{username} Lütfen büyük harf spamı yapmayınız!').replace(/{username}/g, username);
            await this.sendKickMessage(worker, user, warnMsg);
            return;
          }
        }
      }
    }

    // İzleyicinin son konuşma zamanını kaydet (Adanalı darlama takibi için)
    if (!worker.lastChatUsers) worker.lastChatUsers = {};
    worker.lastChatUsers[username] = Date.now();

    // 👑 VIP PRO Yetki Kontrolü
    const isVip = db.isVip(user.id);

    // 🎵 1. ŞARKI İSTEK MODÜLÜ (!sr / !şarkı / !sırada / !skip) - [VIP ÖZELLİK]
    if (lower.startsWith('!sr ') || lower.startsWith('!sarki ') || lower.startsWith('!şarkı ') || lower.startsWith('!song ') || lower.startsWith('!istek ')) {
      if (!isVip) {
        await this.sendKickMessage(worker, user, `⚠️ @${username} Şarkı İstek (!sr) özelliği VIP PRO yayıncılara özeldir kirvem! Detaylar: roxenbot.onrender.com`);
        return;
      }
      if (user.songRequest?.enabled !== false) {
        const query = text.replace(/^(!sr|!sarki|!şarkı|!song|!istek)\s+/i, '').trim();
        if (query) {
          if (!user.songRequest) user.songRequest = { enabled: true, queue: [], currentSong: null };
          if (!user.songRequest.queue) user.songRequest.queue = [];

          const newSong = {
            id: 'sr_' + Date.now(),
            title: query,
            requestedBy: username,
            time: new Date().toLocaleTimeString('tr-TR')
          };

          if (!user.songRequest.currentSong) {
            user.songRequest.currentSong = newSong;
            if (this.io) {
              this.io.to('obs_' + user.apiKey).emit('song_change', newSong);
            }
          } else {
            user.songRequest.queue.push(newSong);
          }

          db.updateUser(user.id, { songRequest: user.songRequest });
          if (this.io) {
            this.io.to('dashboard_' + user.id).emit('song_update', user.songRequest);
          }

          const pos = user.songRequest.currentSong?.id === newSong.id ? 'Şimdi Çalıyor!' : `Sıra: #${user.songRequest.queue.length}`;
          await this.sendKickMessage(worker, user, `🎵 @${username}, "${query}" listeye eklendi! [${pos}] 🎶`);
          return;
        }
      }
    }

    if (lower === '!şarkı' || lower === '!sarki' || lower === '!currentsong' || lower === '!song') {
      if (user.songRequest?.currentSong) {
        await this.sendKickMessage(worker, user, `🎶 Şu an çalan parça: "${user.songRequest.currentSong.title}" (İsteyen: @${user.songRequest.currentSong.requestedBy || 'Yayıncı'})`);
      } else {
        await this.sendKickMessage(worker, user, `🎶 Şu an çalan parça yok kirvem! !sr <şarkı adı> yaz sıraya ekleyelim!`);
      }
      return;
    }

    if (lower === '!sırada' || lower === '!sirada' || lower === '!queue') {
      const queue = user.songRequest?.queue || [];
      if (queue.length === 0) {
        await this.sendKickMessage(worker, user, `🎶 Şarkı sırası boş gardaş! İlk parçayı sen ekle: !sr <şarkı adı>`);
      } else {
        const nextSongs = queue.slice(0, 3).map((s, idx) => `${idx + 1}. ${s.title} (@${s.requestedBy})`).join(' | ');
        await this.sendKickMessage(worker, user, `🎶 Sırada bekleyenler: ${nextSongs} (Toplam: ${queue.length})`);
      }
      return;
    }

    if (lower === '!skip' || lower === '!geç' || lower === '!gec') {
      if (isVip && user.songRequest) {
        const next = (user.songRequest.queue && user.songRequest.queue.length > 0) ? user.songRequest.queue.shift() : null;
        user.songRequest.currentSong = next;
        db.updateUser(user.id, { songRequest: user.songRequest });
        if (this.io) {
          this.io.to('obs_' + user.apiKey).emit('song_change', next);
          this.io.to('dashboard_' + user.id).emit('song_update', user.songRequest);
        }
        if (next) {
          await this.sendKickMessage(worker, user, `⏭️ Şarkı geçildi! Şimdi çalan: "${next.title}" (İsteyen: @${next.requestedBy})`);
        } else {
          await this.sendKickMessage(worker, user, `⏭️ Şarkı geçildi! Sırada başka parça kalmadı kirvem.`);
        }
        return;
      }
    }

    // 🎁 2. ÇEKİLİŞ KATILIM TAKİBİ - [VIP ÖZELLİK]
    if (isVip && user.giveaway?.active && user.giveaway.keyword) {
      const kw = user.giveaway.keyword.toLowerCase().trim();
      if (lower === kw || lower.startsWith(kw + ' ')) {
        const parts = user.giveaway.participants || [];
        if (!parts.some(p => p.username?.toLowerCase() === username.toLowerCase())) {
          parts.push({ username, joinedAt: Date.now() });
          user.giveaway.participants = parts;
          db.updateUser(user.id, { giveaway: user.giveaway });
          if (this.io) {
            this.io.to('dashboard_' + user.id).emit('giveaway_update', user.giveaway);
          }
          console.log(`🎁 [Çekiliş] ${username} çekilişe katıldı! Toplam: ${parts.length}`);
        }
      }
    }

    // 🥤 3. SADAKAT / PUAN SİSTEMİ & !puan - [VIP ÖZELLİK]
    if (isVip && user.loyalty?.enabled) {
      if (!user.loyalty.users) user.loyalty.users = {};
      const addPts = Number(user.loyalty.bonusPerChat) || 5;
      user.loyalty.users[username] = (user.loyalty.users[username] || 0) + addPts;
      db.updateUser(user.id, { loyalty: user.loyalty });

      if (lower === '!puan' || lower === '!points' || lower === '!salgam') {
        const pts = user.loyalty.users[username] || 0;
        const ptsName = user.loyalty.pointsName || 'Şalgam Puanı';
        await this.sendKickMessage(worker, user, `🥤 @${username} senin toplam ${pts} ${ptsName}'n var! Afiyet şeker olsun kirvem!`);
        return;
      }
    }

    // 🎰 4. SLOT OYUNU (!slot [miktar])
    if (lower === '!slot' || lower.startsWith('!slot ')) {
      const emojis = ['🍒', '🍋', '🍇', '🔔', '💎', '🌶️'];
      const r1 = emojis[Math.floor(Math.random() * emojis.length)];
      const r2 = emojis[Math.floor(Math.random() * emojis.length)];
      const r3 = emojis[Math.floor(Math.random() * emojis.length)];
      const reelStr = `[ ${r1} | ${r2} | ${r3} ]`;

      let bet = parseInt(text.split(' ')[1], 10);
      const loyaltyActive = isVip && Boolean(user.loyalty?.enabled);
      const userPoints = loyaltyActive ? (user.loyalty.users[username] || 0) : 0;
      const ptsName = user.loyalty?.pointsName || 'Şalgam Puanı';

      if (loyaltyActive && !isNaN(bet) && bet > 0) {
        if (bet > userPoints) {
          await this.sendKickMessage(worker, user, `⚠️ @${username} yeterli ${ptsName}'n yok kirvem! Mevcut bakiyen: ${userPoints}`);
          return;
        }
      } else {
        bet = 0;
      }

      if (r1 === r2 && r2 === r3) {
        if (r1 === '🌶️') {
          const win = bet > 0 ? bet * 10 : 500;
          if (loyaltyActive) {
            user.loyalty.users[username] = (user.loyalty.users[username] || 0) + win;
            db.updateUser(user.id, { loyalty: user.loyalty });
          }
          await this.sendKickMessage(worker, user, `🎰 @${username} ${reelStr} 🔥🔥🔥 ADANA YANIYOR! JACKPOT! 10 KATINI KAZANDIN! (+${win} ${ptsName}) 👑🌶️`);
        } else {
          const win = bet > 0 ? bet * 4 : 200;
          if (loyaltyActive) {
            user.loyalty.users[username] = (user.loyalty.users[username] || 0) + win;
            db.updateUser(user.id, { loyalty: user.loyalty });
          }
          await this.sendKickMessage(worker, user, `🎰 @${username} ${reelStr} 💥 TEBRİKLER! 3'ü bir arada vurdun! (+${win} ${ptsName}) 🎉`);
        }
      } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        const win = bet > 0 ? Math.floor(bet * 1.5) : 50;
        if (loyaltyActive) {
          user.loyalty.users[username] = (user.loyalty.users[username] || 0) + win;
          db.updateUser(user.id, { loyalty: user.loyalty });
        }
        await this.sendKickMessage(worker, user, `🎰 @${username} ${reelStr} ✨ Fena değil kirvem! İki tanesi tuttu! (+${win} ${ptsName})`);
      } else {
        if (loyaltyActive && bet > 0) {
          user.loyalty.users[username] = Math.max(0, userPoints - bet);
          db.updateUser(user.id, { loyalty: user.loyalty });
          await this.sendKickMessage(worker, user, `🎰 @${username} ${reelStr} 💀 Hayıflanma kirvem, bu el tutmadı! (-${bet} ${ptsName}) Acılı şalgam iç teselli bul!`);
        } else {
          await this.sendKickMessage(worker, user, `🎰 @${username} ${reelStr} Bu sefer şans gülmedi kirvem! Bir dahaki sefere kebap aşkına! 🌶️`);
        }
      }
      return;
    }

    // 🎡 5. RULET OYUNU (!rulet <secim> <miktar>)
    if (lower.startsWith('!rulet ') || lower.startsWith('!roulette ')) {
      const parts = text.split(' ').filter(Boolean);
      const choice = (parts[1] || '').toLowerCase();
      const bet = parseInt(parts[2], 10);

      const loyaltyActive = isVip && Boolean(user.loyalty?.enabled);
      const userPoints = loyaltyActive ? (user.loyalty.users[username] || 0) : 0;
      const ptsName = user.loyalty?.pointsName || 'Şalgam Puanı';

      if (!choice || isNaN(bet) || bet <= 0) {
        await this.sendKickMessage(worker, user, `🎡 @${username} Rulet Kullanımı: !rulet <kırmızı|siyah|01|sayı> <miktar> (Örn: !rulet kırmızı 50 veya !rulet 01 100)`);
        return;
      }

      if (loyaltyActive && bet > userPoints) {
        await this.sendKickMessage(worker, user, `⚠️ @${username} Rulet masasına oturacak kadar ${ptsName}'n yok! Bakiyen: ${userPoints}`);
        return;
      }

      const rollNum = Math.floor(Math.random() * 37);
      let rollColor = 'siyah';
      if (rollNum === 0 || rollNum === 1) rollColor = '01';
      else if ([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(rollNum)) rollColor = 'kırmızı';
      else rollColor = 'siyah';

      let won = false;
      let multiplier = 2;

      if ((choice === 'kırmızı' || choice === 'kirmizi' || choice === 'red') && rollColor === 'kırmızı') {
        won = true;
        multiplier = 2;
      } else if ((choice === 'siyah' || choice === 'black') && rollColor === 'siyah') {
        won = true;
        multiplier = 2;
      } else if ((choice === '01' || choice === 'yeşil' || choice === 'yesil' || choice === 'green') && (rollNum === 0 || rollNum === 1)) {
        won = true;
        multiplier = 14;
      } else if (parseInt(choice, 10) === rollNum) {
        won = true;
        multiplier = 36;
      }

      if (won) {
        const winAmount = bet * multiplier;
        if (loyaltyActive) {
          user.loyalty.users[username] = (userPoints - bet) + winAmount;
          db.updateUser(user.id, { loyalty: user.loyalty });
        }
        await this.sendKickMessage(worker, user, `🎡 Rulet Çarkı Döndü: [ ${rollNum} ${rollColor.toUpperCase()} ] 💥 KAZANDIN @${username}! Tam ${multiplier}x vurdun! (+${winAmount} ${ptsName}) 👑`);
      } else {
        if (loyaltyActive) {
          user.loyalty.users[username] = Math.max(0, userPoints - bet);
          db.updateUser(user.id, { loyalty: user.loyalty });
        }
        await this.sendKickMessage(worker, user, `🎡 Rulet Çarkı Döndü: [ ${rollNum} ${rollColor.toUpperCase()} ] 💀 Kaybettin @${username}! (-${bet} ${ptsName}). Baraj gölüne karşı çay iç gardaş!`);
      }
      return;
    }

    // 📢 6. YAYINCI TANITIMI (!so / !shoutout)
    if (lower.startsWith('!so ') || lower.startsWith('!shoutout ')) {
      const target = text.replace(/^(!so|!shoutout)\s+/i, '').trim().replace(/^@/, '');
      if (target) {
        await this.sendKickMessage(worker, user, `📢 Gardaşlar toplanın! @${target} kral bir yayıncıdır, hemen takibe alın: https://kick.com/${target} 🚀 Kalitenin adresi!`);
        return;
      }
    }

    // 📌 7. KLİP / ÖNEMLİ ANLAR (!klip / !vurgu) - [VIP ÖZELLİK]
    if (lower === '!klip' || lower === '!vurgu' || lower.startsWith('!klip ') || lower.startsWith('!vurgu ')) {
      if (!isVip) {
        await this.sendKickMessage(worker, user, `⚠️ @${username} Önemli an kaydetme (!klip) özelliği VIP PRO üyelere özeldir!`);
        return;
      }
      const time = new Date().toLocaleTimeString('tr-TR');
      const note = text.replace(/^(!klip|!vurgu)\s*/i, '').trim() || 'Chat Vurgusu';
      const list = user.highlights || [];
      const hl = { id: 'hl_' + Date.now(), streamTime: time, username, note };
      list.unshift(hl);
      db.updateUser(user.id, { highlights: list });
      if (this.io) {
        this.io.to('dashboard_' + user.id).emit('highlight_added', hl);
      }
      await this.sendKickMessage(worker, user, `📌 @${username} önemli anı kaydettim kirvem! [${time} - ${note}]`);
      return;
    }

    // 🎲 8. STANDART MİNİ EĞLENCE OYUNLARI (Herkes İçin Açık)
    if (lower === '!zar') {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const sum = d1 + d2;
      const comment = sum >= 9 ? 'Helal olsun kirvem, düşeş attın!' : sum <= 4 ? 'Şansına küs gardaş, acılı şalgam iyi gelir!' : 'Fena değil aslanım!';
      await this.sendKickMessage(worker, user, `🎲 @${username} zar attı: [${d1} - ${d2}] Toplam: ${sum}! ${comment}`);
      return;
    }

    if (lower === '!yazitura' || lower === '!yazıtura') {
      const res = Math.random() > 0.5 ? 'YAZI' : 'TURA';
      await this.sendKickMessage(worker, user, `🪙 @${username} madeni para attı: ${res} geldi gardaş!`);
      return;
    }

    if (lower === '!kebap' || lower === '!şalgam') {
      const lezzetler = [
        'Metrelik acılı Adana kebabı',
        'Bol buzlu bici bici',
        'Acılı şalgam ve köz biber',
        'Kazancılar Çarşısı ciğeri',
        'Taşköprü manzaralı kaçak çay',
        'Közde pişmiş sıcak şırdan'
      ];
      const pick = lezzetler[Math.floor(Math.random() * lezzetler.length)];
      await this.sendKickMessage(worker, user, `🌶️ @${username} sana benden bir porsiyon ${pick} ısmarladım, afiyet şeker olsun kirvem!`);
      return;
    }

    if (lower.startsWith('!duello') || lower.startsWith('!düello')) {
      const target = text.split(' ')[1] || 'Yayıncı';
      const winner = Math.random() > 0.5 ? username : target.replace(/^@/, '');
      await this.sendKickMessage(worker, user, `⚔️ @${username} ile ${target} Taşköprü'de Adana usulü düelloya tutuştu! Kazanan: @${winner}! 👑`);
      return;
    }

    // 9. ÖZEL KOMUTLAR (!dc, !oyun, !instagram vb.) - Değişken Desteği ile
    const cmdTrigger = lower.split(' ')[0].replace(/^!/, '');
    const matchedCmd = (user.commands || []).find(c => c.enabled && (
      c.name.toLowerCase() === cmdTrigger ||
      (Array.isArray(c.aliases) && c.aliases.map(a => a.toLowerCase()).includes(cmdTrigger))
    ));

    if (matchedCmd) {
      const args = text.split(' ').slice(1);
      const targetUser = args[0] ? args[0].replace(/^@/, '') : username;
      const rnd100 = Math.floor(Math.random() * 100) + 1;
      const userPts = user.loyalty?.users ? (user.loyalty.users[username] || 0) : 0;

      let resp = matchedCmd.response || '';
      resp = resp.replace(/{user}/gi, username);
      resp = resp.replace(/{username}/gi, username);
      resp = resp.replace(/{touser}/gi, targetUser);
      resp = resp.replace(/{target}/gi, targetUser);
      resp = resp.replace(/{random\.1-100}/gi, rnd100);
      resp = resp.replace(/{points}/gi, userPts);
      resp = resp.replace(/{channel}/gi, user.settings?.channelSlug || '');

      await this.sendKickMessage(worker, user, resp);
      return;
    }

    // 10. OTOMATİK CEVAPLAR (sa, selam, slm, vb.)
    const matchedAuto = (user.autoReplies || []).find(r => r.enabled && r.keywords.some(k => lower === k.toLowerCase() || lower.startsWith(k.toLowerCase() + ' ')));
    if (matchedAuto) {
      await this.sendKickMessage(worker, user, matchedAuto.response);
      return;
    }

    // 11. 🌶️ ADANALI MODU (Espirili Sataşma / Kavga) - [VIP ÖZELLİK]
    if (isVip && user.adanaMode?.enabled) {
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

    // 12. GEMINI AI CEVABI - [VIP ÖZELLİK]
    const isAiTrigger = lower.startsWith('!ai') ||
                        lower.startsWith('!gemini') ||
                        /\b(bot|roxen|roxenbot)\b/i.test(text);

    if (isAiTrigger && user.geminiAI?.enabled && user.geminiAI?.apiKey) {
      if (!isVip) {
        await this.sendKickMessage(worker, user, `🧠 @${username} Gemini AI Canlı Yayın Asistanı VIP PRO yayıncılara özeldir!`);
        return;
      }
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
