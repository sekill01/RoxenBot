// RoxenBot Kick Dashboard JavaScript
const socket = io();

let currentTab = 'dashboard';
let currentAlertTab = 'follow';
let currentWidgetConfig = null;
let currentModerationConfig = null;
let currentSettings = null;
let currentLicense = null;

// DOM Yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupSocketListeners();
  loadAllData();
});

// Toast Bildirimi Göster
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  let bgClass = 'bg-kick text-black font-extrabold';
  let icon = 'check-circle-2';
  if (type === 'error') {
    bgClass = 'bg-red-500 text-white font-bold';
    icon = 'alert-triangle';
  } else if (type === 'info') {
    bgClass = 'bg-sky-500 text-white font-bold';
    icon = 'info';
  }

  toast.className = `flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs pointer-events-auto transition-all transform translate-y-2 opacity-0 ${bgClass}`;
  toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

// =================== TAB YÖNETİMİ ===================
function switchTab(tabId) {
  currentTab = tabId;

  // Tüm tab içeriklerini gizle
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

  // Seçilen tabı göster
  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  // Menü butonlarının aktifliğini güncelle
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.className = 'nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all text-slate-300 hover:bg-panel-card hover:text-white';
  });
  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.className = 'nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all bg-kick text-black font-bold shadow-md shadow-kick/20';
  }

  // Header başlığını güncelle
  const titleMap = {
    'dashboard': { title: 'Genel Bakış', sub: 'Kanal istatistikleri ve canlı bot durumu' },
    'widgets': { title: "Widget'lar (OBS Stüdyosu)", sub: 'Yayın ekranınız için canlı bildirim kutusu ve sohbet pencereleri' },
    'test': { title: 'Test & Simülasyon Merkezi', sub: 'Yayın açmadan bildirimleri, alert seslerini ve sohbet botunu canlı test edin' },
    'commands': { title: 'Özel Komutlar', sub: 'İzleyicilerin sohbette kullanabileceği !komut listesi' },
    'timers': { title: 'Otomatik Mesajlar (Zamanlayıcılar)', sub: 'Belirlenen aralıklarla sohbete gönderilen periyodik duyurular' },
    'auto-replies': { title: 'Otomatik Cevaplar', sub: 'Anahtar kelimelere anında verilen otomatik karşılıklar' },
    'moderation': { title: 'Spam & Moderasyon Koruması', sub: 'Sohbet kurallarını korumak için otomatik filtreler' },
    'adana': { title: '🌶️ Adanalı Modu (Kavga & Darlama)', sub: 'Adana şivesiyle espirili laf atma ve sessiz kalanları etiketleme motoru' },
    'songs': { title: '🎵 Canlı Şarkı İstek (Song Request !sr)', sub: 'İzleyicilerin müzik sırası ve OBS canlı müzik bannerı' },
    'loyalty': { title: '🥤 Puan & Sadakat Sistemi', sub: 'İzleyicilerin yayında kalma süresine ve mesajlarına göre puan kazanma yönetimi' },
    'giveaway': { title: '🎁 Çekiliş Yönetim Merkezi', sub: 'OBS ekranında konfeti ve ses animasyonlu canlı kura çekimi' },
    'highlights': { title: '📌 Önemli Anlar & Klipler', sub: 'Yayın esnasında chate !klip yazılarak yakalanan vurgular ve Shorts zaman damgaları' },
    'discord': { title: '📢 Discord Canlı Yayın Duyuruları', sub: "Kick'te yayına başladığınızda Discord sunucunuza zengin bildirim gönderin" },
    'gemini-ai': { title: '🧠 Google Gemini AI Canlı Yayın & Ses Asistanı', sub: 'Oynanan oyunu ve yayıncının sesini algılayıp Kick sohbetine akıllı esprili cevaplar yazan yapay zeka' },
    'settings': { title: 'Bot & Kanal Ayarları', sub: 'Kick kanalı ve bot kimlik yapılandırması' }
  };
  const t = titleMap[tabId] || { title: 'RoxenBot', sub: '' };
  document.getElementById('page-title').innerText = t.title;
  document.getElementById('page-subtitle').innerText = t.sub;

  if (tabId === 'gemini-ai') {
    loadGeminiConfig();
  }
  if (tabId === 'songs') {
    loadSongRequestData();
  }

  lucide.createIcons();
}

// =================== SOCKET.IO DİNLEYİCİLERİ ===================
function setupSocketListeners() {
  socket.on('status_change', (data) => {
    updateStatusUI(data.status, data.channel);
  });

  socket.on('subscription_updated', (sub) => {
    if (currentUser) currentUser.subscription = sub;
    showToast('👑 VIP PRO Lisansınız Başarıyla Güncellendi!', 'success');
    fetch('/api/license/status').then(r => r.json()).then(lic => applyLicenseUI(lic));
  });

  socket.on('song_update', (sr) => {
    renderSongData(sr);
  });

  socket.on('channel_loaded', (data) => {
    document.getElementById('stat-followers').innerText = (data.followersCount || 0).toLocaleString();
    document.getElementById('stat-viewers').innerText = (data.viewerCount || 0).toLocaleString();
    document.getElementById('stat-stream-title').innerText = data.title || 'Çevrimdışı';
    document.getElementById('sidebar-channel-name').innerText = data.username || data.channelSlug;
    document.getElementById('sidebar-live-status').innerText = data.isLive ? '🟢 CANLI YAYINDA' : '⚪ Çevrimdışı';
    document.getElementById('chat-stream-channel').innerText = `kick.com/${data.username}`;

    // Gemini canlı bağlam güncelle
    const catEl = document.getElementById('gemini-current-category');
    if (catEl && data.category) catEl.innerText = data.category.name || data.category;
    const titleEl = document.getElementById('gemini-current-title');
    if (titleEl && data.title) titleEl.innerText = data.title;

    showToast(`'${data.username}' kanalına başarıyla bağlanıldı!`, 'success');
  });

  socket.on('stats_update', (stats) => {
    if (stats.followersCount !== undefined) {
      document.getElementById('stat-followers').innerText = stats.followersCount.toLocaleString();
    }
    if (stats.viewerCount !== undefined) {
      document.getElementById('stat-viewers').innerText = stats.viewerCount.toLocaleString();
    }
    if (stats.title) {
      document.getElementById('stat-stream-title').innerText = stats.title;
      const titleEl = document.getElementById('gemini-current-title');
      if (titleEl) titleEl.innerText = stats.title;
    }
    if (stats.category) {
      const catEl = document.getElementById('gemini-current-category');
      if (catEl) catEl.innerText = stats.category;
    }
    document.getElementById('sidebar-live-status').innerText = stats.isLive ? '🟢 CANLI YAYINDA' : '⚪ Çevrimdışı';
  });

  socket.on('gemini_reply', (data) => {
    addGeminiLog(data);
    if (data.reply) {
      const lastReplyEl = document.getElementById('gemini-last-reply-text');
      if (lastReplyEl) lastReplyEl.innerText = `"${data.reply}"`;
      const repliesCountEl = document.getElementById('gemini-stat-replies');
      if (repliesCountEl) {
        const current = parseInt(repliesCountEl.innerText) || 0;
        repliesCountEl.innerText = `${current + 1} Mesaj`;
      }
    }
  });

  socket.on('chat_message', (msg) => {
    addMessageToLiveChat(msg);
    // Sohbet sayacını güncelle
    const msgEl = document.getElementById('stat-messages');
    msgEl.innerText = (parseInt(msgEl.innerText || '0') + 1).toLocaleString();
  });

  socket.on('bot_message', (msg) => {
    addBotMessageToLiveChat(msg);
  });

  socket.on('giveaway_update', (gw) => {
    renderGiveawayUI(gw);
  });

  socket.on('giveaway_winner', (winner) => {
    showGiveawayWinnerBanner(winner);
  });

  socket.on('highlight_added', (hl) => {
    showToast(`📌 Yeni önemli an kaydedildi: [${hl.streamTime}] ${hl.note}`, 'info');
    loadHighlightsData();
  });
}

function updateStatusUI(status, channel) {
  const badge = document.getElementById('sidebar-status-badge');
  const nameEl = document.getElementById('sidebar-channel-name');
  const btn = document.getElementById('btn-header-connect');

  if (status === 'connected') {
    badge.className = 'flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-kick/20 text-kick';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-kick animate-pulse"></span> Bağlı';
    nameEl.innerText = channel || 'Aktif';
    btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Bağlı';
  } else if (status === 'connecting') {
    badge.className = 'flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-spin"></span> Bağlanıyor...';
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Bağlanıyor';
  } else {
    badge.className = 'flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Çevrimdışı';
    btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4"></i> Bağlan';
  }
  lucide.createIcons();
}

function addMessageToLiveChat(msg) {
  const box = document.getElementById('live-chat-messages');
  if (box.children.length === 1 && box.children[0].innerText.includes('Kanala bağlandığınızda')) {
    box.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'p-2 rounded-xl bg-panel-bg border border-panel-border/60 hover:border-panel-border transition';
  
  let badgeText = '';
  if (msg.isBroadcaster) badgeText = '<span class="px-1.5 py-0.5 rounded bg-kick/20 text-kick font-bold text-[10px] mr-1.5">Yayıncı</span>';
  else if (msg.isMod) badgeText = '<span class="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold text-[10px] mr-1.5">Mod</span>';
  else if (msg.isSub) badgeText = '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px] mr-1.5">Abone</span>';

  const userColor = msg.color || '#53fc18';
  item.innerHTML = `
    <div class="flex items-center justify-between mb-0.5">
      <div>
        ${badgeText}
        <span class="font-bold" style="color: ${userColor}">${escapeHtml(msg.username)}</span>
      </div>
      <span class="text-[10px] text-slate-500">${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="text-slate-200 pl-0.5 break-words">${escapeHtml(msg.content)}</div>
  `;
  box.appendChild(item);
  box.scrollTop = box.scrollHeight;

  // 100 mesajdan fazlasını temizle
  while (box.children.length > 100) {
    box.removeChild(box.firstChild);
  }
}

function addBotMessageToLiveChat(msg) {
  const box = document.getElementById('live-chat-messages');
  const item = document.createElement('div');
  item.className = 'p-2 rounded-xl bg-kick/10 border border-kick/30 text-xs';
  item.innerHTML = `
    <div class="flex items-center gap-1.5 text-kick font-bold mb-0.5">
      <i data-lucide="bot" class="w-3.5 h-3.5"></i>
      <span>RoxenBot ${msg.simulated ? '(Simülasyon)' : ''}</span>
    </div>
    <div class="text-slate-100 font-medium pl-0.5">${escapeHtml(msg.content)}</div>
  `;
  box.appendChild(item);
  lucide.createIcons({ root: item });
  box.scrollTop = box.scrollHeight;
}

// =================== VERİ YÜKLEME ===================
let currentUser = null;

async function loadAllData() {
  try {
    // 0. Oturum Kontrolü (Cloud Multi-tenant)
    const meRes = await fetch('/api/auth/me').then(r => r.json()).catch(() => null);
    if (!meRes || !meRes.success) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = meRes.user;

    // Kullanıcı Profil Arayüzü
    const avatarEl = document.getElementById('header-user-avatar');
    if (avatarEl && currentUser.avatar) avatarEl.src = currentUser.avatar;
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.innerText = currentUser.name || 'Yayıncı';
    const planEl = document.getElementById('header-plan-badge');
    if (planEl) planEl.innerText = currentUser.subscription?.plan === 'pro' ? '⭐ VIP PRO' : 'Ücretsiz Plan';
    if (meRes.isAdmin) {
      const adminBtn = document.getElementById('header-admin-btn');
      if (adminBtn) adminBtn.classList.remove('hidden');
    }

    // Socket.IO Odasına Katıl
    socket.emit('join_dashboard', currentUser.id);

    const [statusRes, settingsRes, commandsRes, timersRes, repliesRes, modRes, widgetsRes, adanaRes, licenseRes] = await Promise.all([
      fetch('/api/status').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/commands').then(r => r.json()),
      fetch('/api/timers').then(r => r.json()),
      fetch('/api/auto-replies').then(r => r.json()),
      fetch('/api/moderation').then(r => r.json()),
      fetch('/api/widgets').then(r => r.json()),
      fetch('/api/adana').then(r => r.json()),
      fetch('/api/license/status').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    // 0. Lisans Durumu & Arayüzü Uygula
    applyLicenseUI(licenseRes);

    // Gemini AI Ayarlarını Yükle
    loadGeminiConfig();

    // 1. Ayarlar & Durum
    currentSettings = settingsRes.settings || {};
    if (currentSettings.channelSlug) {
      document.getElementById('header-slug-input').value = currentSettings.channelSlug;
      document.getElementById('setting-channel-slug').value = currentSettings.channelSlug;
      document.getElementById('sidebar-channel-name').innerText = currentSettings.channelSlug;
    }
    if (currentSettings.botToken) {
      document.getElementById('setting-bot-token').value = currentSettings.botToken;
    }
    if (currentSettings.botUsername) {
      const uIn = document.getElementById('setting-bot-username');
      if (uIn) uIn.value = currentSettings.botUsername;
    }
    updateModPreview();

    // OBS Widget Linklerini Kullanıcının API Key'i ile Güncelle
    const baseUrl = window.location.origin;
    const apikey = currentUser.apiKey || '';
    const urlAlert = document.getElementById('url-alertbox-preview');
    if (urlAlert) urlAlert.innerText = `${baseUrl}/widget/alertbox?token=${apikey}`;
    const urlChat = document.getElementById('url-chat-preview');
    if (urlChat) urlChat.innerText = `${baseUrl}/widget/chat?token=${apikey}`;
    const urlGoal = document.getElementById('url-goal-preview');
    if (urlGoal) urlGoal.innerText = `${baseUrl}/widget/goal?token=${apikey}`;
    const urlGiveaway = document.getElementById('url-giveaway-preview');
    if (urlGiveaway) urlGiveaway.innerText = `${baseUrl}/widget/giveaway?token=${apikey}`;
    const urlSong = document.getElementById('url-song-preview');
    if (urlSong) urlSong.innerText = `${baseUrl}/widget/song?token=${apikey}`;
    const urlSongWidget = document.getElementById('url-song-preview-widget');
    if (urlSongWidget) urlSongWidget.innerText = `${baseUrl}/widget/song?token=${apikey}`;

    if (statusRes.isConnected) {
      updateStatusUI('connected', currentSettings.channelSlug);
    }

    document.getElementById('stat-commands').innerText = (commandsRes.commands || []).length;

    // 2. Tabloları doldur
    renderCommandsTable(commandsRes.commands || []);
    renderTimersTable(timersRes.timers || []);
    renderAutoRepliesTable(repliesRes.autoReplies || []);

    // 3. Moderasyon formu
    currentModerationConfig = modRes.moderation || {};
    populateModerationForm(currentModerationConfig);

    // 4. Widget formu
    currentWidgetConfig = widgetsRes.widgets || {};
    populateWidgetForms(currentWidgetConfig);

    // 5. Adanalı Modu formu
    currentAdanaConfig = adanaRes.adanaMode || {};
    populateAdanaForm(currentAdanaConfig);

    // 6. Sadakat, Çekiliş, Klipler, Discord
    loadLoyaltyData();
    loadGiveawayData();
    loadHighlightsData();
    loadDiscordData();

  } catch (err) {
    console.error('Veri yükleme hatası:', err);
    showToast('Veriler yüklenirken hata oluştu', 'error');
  }
}

// =================== KANAL BAĞLANTISI ===================
async function handleConnectClick() {
  const slugInput = document.getElementById('header-slug-input');
  const slug = slugInput.value.trim();
  if (!slug) {
    showToast('Lütfen bir Kick kanal adı girin', 'error');
    return;
  }

  updateStatusUI('connecting', slug);
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelSlug: slug })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`'${slug}' kanalına bağlanılıyor...`, 'info');
    } else {
      showToast(data.message || 'Bağlantı kurulamadı', 'error');
      updateStatusUI('disconnected');
    }
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message, 'error');
    updateStatusUI('disconnected');
  }
}

// =================== KOMUTLAR YÖNETİMİ ===================
function renderCommandsTable(commands) {
  const tbody = document.getElementById('commands-table-body');
  tbody.innerHTML = '';

  if (commands.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Henüz komut eklenmemiş.</td></tr>';
    return;
  }

  commands.forEach(cmd => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-panel-card/60 transition';

    const permMap = {
      'everyone': '<span class="text-slate-400">Herkes</span>',
      'sub': '<span class="text-amber-400 font-semibold">Abone</span>',
      'mod': '<span class="text-sky-400 font-semibold">Mod</span>',
      'broadcaster': '<span class="text-kick font-semibold">Yayıncı</span>'
    };

    tr.innerHTML = `
      <td class="px-5 py-3.5 font-bold text-white flex items-center gap-1.5">
        <span class="text-kick">!</span>${escapeHtml(cmd.name)}
        ${cmd.aliases?.length ? `<span class="text-[10px] text-slate-500">(${cmd.aliases.map(a => '!' + a).join(', ')})</span>` : ''}
      </td>
      <td class="px-5 py-3.5 text-slate-300 max-w-xs truncate">${escapeHtml(cmd.response)}</td>
      <td class="px-5 py-3.5">${cmd.cooldown || 5}s</td>
      <td class="px-5 py-3.5">${permMap[cmd.permission] || cmd.permission}</td>
      <td class="px-5 py-3.5">
        <button onclick="toggleCommand('${cmd.id}', ${!cmd.enabled})" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold transition ${cmd.enabled ? 'bg-kick/20 text-kick' : 'bg-slate-700 text-slate-400'}">
          ${cmd.enabled ? 'Aktif' : 'Pasif'}
        </button>
      </td>
      <td class="px-5 py-3.5 text-right space-x-2">
        <button onclick="editCommand('${cmd.id}')" class="p-1.5 rounded-lg bg-panel-card hover:bg-slate-700 text-slate-300 transition">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteCommand('${cmd.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons({ root: tbody });
}

function openCommandModal(cmd = null) {
  const modal = document.getElementById('command-modal');
  const title = document.getElementById('command-modal-title');
  title.innerText = cmd ? 'Komutu Düzenle' : 'Yeni Komut Ekle';

  document.getElementById('modal-cmd-id').value = cmd ? cmd.id : '';
  document.getElementById('modal-cmd-name').value = cmd ? cmd.name : '';
  document.getElementById('modal-cmd-aliases').value = cmd && cmd.aliases ? cmd.aliases.join(', ') : '';
  document.getElementById('modal-cmd-response').value = cmd ? cmd.response : '';
  document.getElementById('modal-cmd-cooldown').value = cmd ? cmd.cooldown : 5;
  document.getElementById('modal-cmd-permission').value = cmd ? cmd.permission : 'everyone';

  modal.classList.remove('hidden');
}

function closeCommandModal() {
  document.getElementById('command-modal').classList.add('hidden');
}

async function saveCommandModal() {
  const id = document.getElementById('modal-cmd-id').value;
  const name = document.getElementById('modal-cmd-name').value.trim();
  const aliases = document.getElementById('modal-cmd-aliases').value.split(',').map(a => a.trim()).filter(Boolean);
  const response = document.getElementById('modal-cmd-response').value.trim();
  const cooldown = Number(document.getElementById('modal-cmd-cooldown').value) || 5;
  const permission = document.getElementById('modal-cmd-permission').value;

  if (!name || !response) {
    showToast('Komut adı ve yanıtı zorunludur', 'error');
    return;
  }

  const payload = { name, aliases, response, cooldown, permission, enabled: true };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/commands/${id}` : '/api/commands';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Komut kaydedildi!', 'success');
      closeCommandModal();
      refreshCommands();
    }
  } catch (e) {
    showToast('Kayıt hatası: ' + e.message, 'error');
  }
}

async function refreshCommands() {
  const res = await fetch('/api/commands').then(r => r.json());
  renderCommandsTable(res.commands || []);
  document.getElementById('stat-commands').innerText = (res.commands || []).length;
}

async function toggleCommand(id, newStatus) {
  await fetch(`/api/commands/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: newStatus })
  });
  refreshCommands();
}

async function editCommand(id) {
  const res = await fetch('/api/commands').then(r => r.json());
  const cmd = (res.commands || []).find(c => c.id === id);
  if (cmd) openCommandModal(cmd);
}

async function deleteCommand(id) {
  if (!confirm('Bu komutu silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/commands/${id}`, { method: 'DELETE' });
  showToast('Komut silindi', 'info');
  refreshCommands();
}

// =================== ZAMANLAYICILAR (TIMERS) ===================
function renderTimersTable(timers) {
  const tbody = document.getElementById('timers-table-body');
  tbody.innerHTML = '';

  if (timers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Henüz zamanlayıcı eklenmemiş.</td></tr>';
    return;
  }

  timers.forEach(t => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-panel-card/60 transition';
    tr.innerHTML = `
      <td class="px-5 py-3.5 font-bold text-white">${escapeHtml(t.name)}</td>
      <td class="px-5 py-3.5 text-slate-300 max-w-xs truncate">${escapeHtml(t.message)}</td>
      <td class="px-5 py-3.5">${t.intervalMinutes} dk</td>
      <td class="px-5 py-3.5">${t.minChatMessages || 3} mesaj</td>
      <td class="px-5 py-3.5">
        <button onclick="toggleTimer('${t.id}', ${!t.enabled})" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold transition ${t.enabled ? 'bg-kick/20 text-kick' : 'bg-slate-700 text-slate-400'}">
          ${t.enabled ? 'Aktif' : 'Pasif'}
        </button>
      </td>
      <td class="px-5 py-3.5 text-right space-x-2">
        <button onclick="editTimer('${t.id}')" class="p-1.5 rounded-lg bg-panel-card hover:bg-slate-700 text-slate-300 transition">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteTimer('${t.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons({ root: tbody });
}

function openTimerModal(timer = null) {
  const modal = document.getElementById('timer-modal');
  document.getElementById('timer-modal-title').innerText = timer ? 'Zamanlayıcıyı Düzenle' : 'Yeni Zamanlayıcı Ekle';
  document.getElementById('modal-timer-id').value = timer ? timer.id : '';
  document.getElementById('modal-timer-name').value = timer ? timer.name : '';
  document.getElementById('modal-timer-message').value = timer ? timer.message : '';
  document.getElementById('modal-timer-interval').value = timer ? timer.intervalMinutes : 15;
  document.getElementById('modal-timer-min-msgs').value = timer ? timer.minChatMessages : 5;
  modal.classList.remove('hidden');
}

function closeTimerModal() {
  document.getElementById('timer-modal').classList.add('hidden');
}

async function saveTimerModal() {
  const id = document.getElementById('modal-timer-id').value;
  const name = document.getElementById('modal-timer-name').value.trim();
  const message = document.getElementById('modal-timer-message').value.trim();
  const intervalMinutes = Number(document.getElementById('modal-timer-interval').value) || 15;
  const minChatMessages = Number(document.getElementById('modal-timer-min-msgs').value) || 5;

  if (!name || !message) {
    showToast('Başlık ve mesaj zorunludur', 'error');
    return;
  }

  const payload = { name, message, intervalMinutes, minChatMessages, enabled: true };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/timers/${id}` : '/api/timers';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    showToast('Zamanlayıcı kaydedildi!', 'success');
    closeTimerModal();
    const refresh = await fetch('/api/timers').then(r => r.json());
    renderTimersTable(refresh.timers || []);
  }
}

async function toggleTimer(id, newStatus) {
  await fetch(`/api/timers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: newStatus })
  });
  const refresh = await fetch('/api/timers').then(r => r.json());
  renderTimersTable(refresh.timers || []);
}

async function editTimer(id) {
  const res = await fetch('/api/timers').then(r => r.json());
  const timer = (res.timers || []).find(t => t.id === id);
  if (timer) openTimerModal(timer);
}

async function deleteTimer(id) {
  if (!confirm('Bu zamanlayıcıyı silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/timers/${id}`, { method: 'DELETE' });
  showToast('Zamanlayıcı silindi', 'info');
  const refresh = await fetch('/api/timers').then(r => r.json());
  renderTimersTable(refresh.timers || []);
}

// =================== OTOMATİK CEVAPLAR ===================
function renderAutoRepliesTable(replies) {
  const tbody = document.getElementById('auto-replies-table-body');
  tbody.innerHTML = '';

  if (replies.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Henüz otomatik cevap eklenmemiş.</td></tr>';
    return;
  }

  const matchMap = {
    'contains': 'İçeriyorsa',
    'word': 'Tam Kelime',
    'exact': 'Birebir Aynı'
  };

  replies.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-panel-card/60 transition';
    tr.innerHTML = `
      <td class="px-5 py-3.5 font-bold text-kick">${escapeHtml(Array.isArray(r.keywords) ? r.keywords.join(', ') : r.keywords)}</td>
      <td class="px-5 py-3.5 text-slate-300 max-w-xs truncate">${escapeHtml(r.response)}</td>
      <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded bg-panel-card text-[11px]">${matchMap[r.matchType] || r.matchType}</span></td>
      <td class="px-5 py-3.5">${r.cooldown || 10}s</td>
      <td class="px-5 py-3.5">
        <button onclick="toggleAutoReply('${r.id}', ${!r.enabled})" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold transition ${r.enabled ? 'bg-kick/20 text-kick' : 'bg-slate-700 text-slate-400'}">
          ${r.enabled ? 'Aktif' : 'Pasif'}
        </button>
      </td>
      <td class="px-5 py-3.5 text-right space-x-2">
        <button onclick="editAutoReply('${r.id}')" class="p-1.5 rounded-lg bg-panel-card hover:bg-slate-700 text-slate-300 transition">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteAutoReply('${r.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons({ root: tbody });
}

function openAutoReplyModal(reply = null) {
  const modal = document.getElementById('reply-modal');
  document.getElementById('reply-modal-title').innerText = reply ? 'Cevabı Düzenle' : 'Yeni Otomatik Cevap Ekle';
  document.getElementById('modal-reply-id').value = reply ? reply.id : '';
  document.getElementById('modal-reply-keywords').value = reply ? (Array.isArray(reply.keywords) ? reply.keywords.join(', ') : reply.keywords) : '';
  document.getElementById('modal-reply-response').value = reply ? reply.response : '';
  document.getElementById('modal-reply-match-type').value = reply ? reply.matchType : 'contains';
  document.getElementById('modal-reply-cooldown').value = reply ? reply.cooldown : 10;
  modal.classList.remove('hidden');
}

function closeAutoReplyModal() {
  document.getElementById('reply-modal').classList.add('hidden');
}

async function saveAutoReplyModal() {
  const id = document.getElementById('modal-reply-id').value;
  const keywords = document.getElementById('modal-reply-keywords').value.trim();
  const response = document.getElementById('modal-reply-response').value.trim();
  const matchType = document.getElementById('modal-reply-match-type').value;
  const cooldown = Number(document.getElementById('modal-reply-cooldown').value) || 10;

  if (!keywords || !response) {
    showToast('Kelimeler ve yanıt zorunludur', 'error');
    return;
  }

  const payload = { keywords, response, matchType, cooldown, enabled: true };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/auto-replies/${id}` : '/api/auto-replies';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    showToast('Otomatik cevap kaydedildi!', 'success');
    closeAutoReplyModal();
    const refresh = await fetch('/api/auto-replies').then(r => r.json());
    renderAutoRepliesTable(refresh.autoReplies || []);
  }
}

async function toggleAutoReply(id, newStatus) {
  await fetch(`/api/auto-replies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: newStatus })
  });
  const refresh = await fetch('/api/auto-replies').then(r => r.json());
  renderAutoRepliesTable(refresh.autoReplies || []);
}

async function editAutoReply(id) {
  const res = await fetch('/api/auto-replies').then(r => r.json());
  const reply = (res.autoReplies || []).find(r => r.id === id);
  if (reply) openAutoReplyModal(reply);
}

async function deleteAutoReply(id) {
  if (!confirm('Bu otomatik cevabı silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/auto-replies/${id}`, { method: 'DELETE' });
  showToast('Otomatik cevap silindi', 'info');
  const refresh = await fetch('/api/auto-replies').then(r => r.json());
  renderAutoRepliesTable(refresh.autoReplies || []);
}

// =================== MODERASYON AYARLARI ===================
function populateModerationForm(mod) {
  if (!mod) return;
  if (mod.bannedWords) {
    document.getElementById('mod-banned-words-enabled').checked = !!mod.bannedWords.enabled;
    document.getElementById('mod-banned-words-list').value = (mod.bannedWords.words || []).join(', ');
    document.getElementById('mod-banned-words-msg').value = mod.bannedWords.warningMessage || '';
  }
  if (mod.linkProtection) {
    document.getElementById('mod-links-enabled').checked = !!mod.linkProtection.enabled;
    document.getElementById('mod-links-msg').value = mod.linkProtection.warningMessage || '';
  }
  if (mod.capsProtection) {
    document.getElementById('mod-caps-enabled').checked = !!mod.capsProtection.enabled;
    document.getElementById('mod-caps-percent').value = mod.capsProtection.maxPercent || 70;
    document.getElementById('mod-caps-min').value = mod.capsProtection.minLetters || 8;
    document.getElementById('mod-caps-msg').value = mod.capsProtection.warningMessage || '';
  }
}

async function saveModerationConfig() {
  const payload = {
    bannedWords: {
      enabled: document.getElementById('mod-banned-words-enabled').checked,
      words: document.getElementById('mod-banned-words-list').value.split(',').map(w => w.trim()).filter(Boolean),
      warningMessage: document.getElementById('mod-banned-words-msg').value.trim()
    },
    linkProtection: {
      enabled: document.getElementById('mod-links-enabled').checked,
      permitMods: true,
      warningMessage: document.getElementById('mod-links-msg').value.trim()
    },
    capsProtection: {
      enabled: document.getElementById('mod-caps-enabled').checked,
      maxPercent: Number(document.getElementById('mod-caps-percent').value) || 70,
      minLetters: Number(document.getElementById('mod-caps-min').value) || 8,
      warningMessage: document.getElementById('mod-caps-msg').value.trim()
    }
  };

  try {
    const res = await fetch('/api/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Moderasyon ayarları başarıyla kaydedildi!', 'success');
    }
  } catch (e) {
    showToast('Kaydetme hatası: ' + e.message, 'error');
  }
}

// =================== ADANALI MODU (KAVGA & DARLAMA) ===================
let currentAdanaConfig = null;

function populateAdanaForm(adana) {
  if (!adana) return;
  currentAdanaConfig = adana;

  const enabled = !!adana.enabled;
  const toggle = document.getElementById('adana-enabled');
  if (toggle) toggle.checked = enabled;

  const statusText = document.getElementById('adana-status-text');
  if (statusText) statusText.innerText = enabled ? 'Adanalı Modu Aktif' : 'Adanalı Modu Pasif';

  const idleMinutes = adana.idleMinutes || 2;
  const idleInput = document.getElementById('adana-idle-minutes');
  if (idleInput) {
    idleInput.value = idleMinutes;
    const valLabel = document.getElementById('adana-idle-val');
    if (valLabel) valLabel.innerText = idleMinutes + ' Dakika';
  }

  const banterChance = adana.banterChance || 35;
  const chanceInput = document.getElementById('adana-banter-chance');
  if (chanceInput) {
    chanceInput.value = banterChance;
    const valLabel = document.getElementById('adana-chance-val');
    if (valLabel) valLabel.innerText = '%' + banterChance;
  }

  const cooldownSec = adana.cooldownSec || 25;
  const coolInput = document.getElementById('adana-cooldown-sec');
  if (coolInput) {
    coolInput.value = cooldownSec;
    const valLabel = document.getElementById('adana-cooldown-val');
    if (valLabel) valLabel.innerText = cooldownSec + ' sn';
  }

  const replies = adana.funnyReplies || [];
  const repliesText = document.getElementById('adana-replies-text');
  if (repliesText) {
    repliesText.value = replies.join('\n');
    const cntLabel = document.getElementById('adana-replies-count');
    if (cntLabel) cntLabel.innerText = replies.length + ' Cümle';
  }

  const callouts = adana.idleCallouts || [];
  const calloutsText = document.getElementById('adana-callouts-text');
  if (calloutsText) {
    calloutsText.value = callouts.join('\n');
    const cntLabel = document.getElementById('adana-callouts-count');
    if (cntLabel) cntLabel.innerText = callouts.length + ' Cümle';
  }
}

function toggleAdanaStatus(checked) {
  const statusText = document.getElementById('adana-status-text');
  if (statusText) statusText.innerText = checked ? 'Adanalı Modu Aktif' : 'Adanalı Modu Pasif';
  saveAdanaSettings(true);
}

async function saveAdanaSettings(silent = false) {
  const toggle = document.getElementById('adana-enabled');
  const enabled = toggle ? toggle.checked : true;
  const idleMinutes = Number(document.getElementById('adana-idle-minutes').value) || 2;
  const banterChance = Number(document.getElementById('adana-banter-chance').value) || 35;
  const cooldownSec = Number(document.getElementById('adana-cooldown-sec').value) || 25;

  const repliesRaw = document.getElementById('adana-replies-text').value;
  const funnyReplies = repliesRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const calloutsRaw = document.getElementById('adana-callouts-text').value;
  const idleCallouts = calloutsRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const payload = {
    enabled,
    idleMinutes,
    banterChance,
    cooldownSec,
    funnyReplies,
    idleCallouts
  };

  try {
    const res = await fetch('/api/adana', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      currentAdanaConfig = data.adanaMode;
      const rCnt = document.getElementById('adana-replies-count');
      if (rCnt) rCnt.innerText = (data.adanaMode.funnyReplies || []).length + ' Cümle';
      const cCnt = document.getElementById('adana-callouts-count');
      if (cCnt) cCnt.innerText = (data.adanaMode.idleCallouts || []).length + ' Cümle';
      if (!silent) {
        showToast('🌶️ Adanalı Modu ayarları başarıyla kaydedildi!', 'success');
      }
    }
  } catch (e) {
    showToast('Adanalı modu kaydetme hatası: ' + e.message, 'error');
  }
}

async function resetAdanaToDefaults() {
  if (!confirm('Adanalı modu cümlelerini ve ayarlarını varsayılana döndürmek istiyor musunuz?')) return;
  const defaultPayload = {
    enabled: true,
    idleMinutes: 2,
    banterChance: 35,
    cooldownSec: 25,
    funnyReplies: [
      "@{username} Gardaş sen hayırdır ya, Adana Demirspor tribünü mü burası artistlik yapıyon? Gel bi acılı şalgamımı iç sakinleş, hararetini alayım!",
      "@{username} Bak hele lafa bak! Kirvem seni Baraj yolunda bi turlatırım aklın uçar ha, klavye delikanlılığını bırak botla düzgün konuş!",
      "@{username} La gardaş klavyenin arkasından şekil yapmak kolay, gel Taşköprü'nün orada söyle bunları da delikanlılığını görek!",
      "@{username} Ula kirvem sen kime racon kesiyon gardaşşş? İki dakka efendi takıldık diye tepemize çıktın, valla barajın suyuna batırır çıkarırım ha!",
      "@{username} Gözünü sevdiğimin çocuğu, seni bi sıkarım Adana portakalı gibi suyun çıkar ha! Espiri yapıyok şurda artistlik yapma!",
      "@{username} Gardaş senin kafana Adana güneşi geçmiş belli, 45 derece sıcağı yememişsin klavyede artistlik taslıyon, git bi kafanı soğuk suya sok gel!",
      "@{username} Vay babayın kemiğine, lafa bak lafa! Gel sana çarşıda bi acılı Adana dürüm ısmarlayayım da tatlıya bağlayak şu mevzuyu, karnın doysun!",
      "@{username} Ağam sen hayırdır la? Ben yapay zekayım ama Seyhan sanayisinde rektifiye edildim, bana artistlik şükül sökmez aslanım!",
      "@{username} Bak hele moruk, laflara bak! Seni güneşe ateş eden dayılara havale ederim bak valla roket atarlar peşinden düzgün dur!",
      "@{username} Kirvem damarıma basma benim, Adana sıcağında asfalt gibi erimişim zaten, bi parlarsam fena bozarım ha haberin olsun!",
      "@{username} Gardaşşş sen ne anlatıyon ya? Bici biciye buz yetmemiş gibi triplere girmişsin, gel bi otur soluklan iki çift laf öğren!",
      "@{username} Ula gardaş senin havan kime? Gazipaşa bulvarında iki tur atınca kendini mafya babası mı zannettin, otur oturduğun yerde!",
      "@{username} Bak hele şu artistin lafına! Kirvem ben sabahları kahvaltıda acılı kebapla şırdan yiyen botum, senin lafın bana vız gelir tırıs gider!",
      "@{username} Gardaş senin canın sıkılmış anlaşılan, gel seni Büyüksaat'in altına götüreyim de orada anlatsana bu masalları dayılara!",
      "@{username} La oğlum senin derdin ne la? Yayında efendi efendi oturuyoz şurda, Adana çocuğu her yerde Adana çocuğudur damarımıza basma!",
      "@{username} Vay kirvem vay, laflara bak! Sanki Çetinkaya kavşağında yol verme kavgası ediyok, sakin ol gardaş şurda aile var!",
      "@{username} Bak hele gardaşım, fazla atarlanma motorun su kaynatır ha! Adana sıcağında vantilatör bile senin kadar hararet yapmıyor!",
      "@{username} Ula sen kendini ne sanıyon kirvem? Yüreğir sanayisindeki çıraklar bile senden daha delikanlı konuşuyor, az efendi ol!",
      "@{username} Gardaş sana bi şalgam bi de acılı cici büfe tostu söyleyeyim de çenen kapansın, maşallah makineli tüfek gibi laf yetiştiriyon!",
      "@{username} Kirvem lafların bana dokunmaz, benim arkamda 01 plakalı koca Adana var! Sen git kumda oyna şekil yapma bota!",
      "@{username} Bak hele, kime laf yetiştiriyon sen? Seni Baraj gölüne götürürüm, suyun dibinde inci aratırım ha, akıllı ol gardaşşş!",
      "@{username} Gardaş senin bu özgüven nereden geliyor la? Reşatbey'de iki tur atıp kendini Adana ağası mı sandın, efendi dur yayını izle!",
      "@{username} Ağam yavaş gel ciğerimi söktün! Sanki meclis kürsüsünde nutuk atıyor, iki dakka chatte durdun hemen herkese sataştın!",
      "@{username} La gardaş sen hayırdır? Adana Demirspor gol kaçırınca bizim dayıların sinirlendiği gibi sinirlenmişsin, sakin ol derin nefes al!",
      "@{username} Gözünü seveyim kirvem yapma şöyle hareketler, sonra Adana sokaklarında şırdancı ararken bulursun kendini, fena çarparım ha!",
      "@{username} Valla gardaşşş senin bu artisliklerini Adana sıcağı bile eritir! Az sakin ol, çayını çorbanı iç efendi gibi chatini yap!",
      "@{username} Bak hele canımın içi, bana şekil yapacam diye kendini paralamışsın. Gel Taşköprü manzarasına karşı bi kaçak çay içek sakinleş!",
      "@{username} Ula kirvem sen kime dikleniyon? Ben bot halimle senden daha delikanlıyım, gel Adana kebap feda olsun sana ama düzgün konuş!",
      "@{username} Gardaş senin bu havan kime la? Seni bi döner kavşakta bıraksam yolunu bulamazsın, gelmiş bota artistlik yapıyon!",
      "@{username} Kirvem az geri bas vitesin dağılmasın! Burası nezih yayın, Adana usulü kafa göz yarmayalım durduk yere, tatlı tatlı konuşak!",
      "@{username} Bak hele şu arkadaşa, sanki güneşe kurşun sıkan dayının yeğeni! O ne özgüven öyle kirvem, az bi sakin ol şalgam ısmarliim!",
      "@{username} La gardaş senin klavyen çok hızlı ama aklın geriden geliyor belli ki! Gel seni bi bici bici yemeye götüreyim kafan ferahlasın!",
      "@{username} Ağam sen bu lafları nerden öğrendin la? Seyhan nehri gibi coşmuşsun ama iki güne kurursun haberin olsun, yavaş ak!",
      "@{username} Gardaş bak valla Baraj yolu gençlerine havale ederim seni, sabaha kadar rap dinletirler sana aklın başından gider!",
      "@{username} Vay anam vay, chatte bir Adana canavarı türedi! Kirvem senin o şekillerini biz Büyüksaat'in dibinde tespih gibi sallıyoduk!",
      "@{username} Ula gardaş lafa bak lafa! Seni acılı Adana şalgamının içine atarım da rengin kırmızıya döner valla, akıllı ol bota sataşma!",
      "@{username} Kirvem damarıma basma benim, Adana güneşi kafama vurmuş gibi delirtme insanı, espirili takılıyok şurda tadımızı kaçırma!",
      "@{username} Bak hele moruk, sen kime artistlik taslıyon? Gel bi dürüstçe konuşak, ne derdin varsa çözek ama bota diklenme!",
      "@{username} Gardaş senin bu triplerin Adana sıcağında eriyen dondurma gibi hemen söner, gel efendi gibi yayınımızı izle keyfine bak!",
      "@{username} Kirvem gözünü seveyim fazla konuşma da yayıncı abimiz oyununu oynasın, seni bi Adana sanayisine çırak veririm feleğin şaşar ha!"
    ],
    idleCallouts: [
      "@{username} bak hele gardaşşş niye yazmıyon la? İki dakka muhabbet ettik hemen kayboldun, bici bici yemeye mi gittin yazsana!",
      "@{username} kirvem nereye kayboldun la? Klavyene çay mı döküldü gardaş bi ses ver hele, iki kelam et de chat şenlensin!",
      "@{username} gardaşım hayırdır daldın gittin, Adana sıcağı mı vurdu başına niye yazmıyon la? Parmakların mı yoruldu bi ses ver!",
      "@{username} la gardaş iki laklak edek dedik hemen arazi oldun! Hayırdır küstün mü bize, gel bi iki bişi yaz da bilek yaşadığını!",
      "@{username} bak hele moruk, yayıncıyı tek mi bırakacan? Bi ses ver de bilek buralarda olduğunu, öyle sessiz sessiz pusma köşede!",
      "@{username} gardaşşş nereye sıvıştın la? Taşköprü'den aşağı mı atladın naptın, gel iki kelam et kaçma öyle sessiz sessiz!",
      "@{username} ula kirvem iki dakka sustun ortalık buz kesti! Yoksa şırdancıya mı kaçtın, yazsana gardaş ne duruyon öyle melul melul!",
      "@{username} bak hele gardaş, klavyen mi bozuldu yoksa Adana sıcağından parmakların tuşlara mı yapıştı? Bi 'sa' yaz da görek!",
      "@{username} kirvem seni arıyok fellik fellik! Chatte kayboldun gittin, hayırdır baraj gölüne yüzmeye mi gittin ses ver hele!",
      "@{username} la gardaş iki kelime yazmak bu kadar mı zor? Bici bicinin buzunu bekler gibi seni bekliyok chatte, yazsana iki satır!",
      "@{username} bak hele ağam, az önce buralarda bülbül gibi şakıyodun, iki dakka geçti dut yemiş bülbüle döndün hayırdır ne oldu?",
      "@{username} gardaşım sesin soluğun kesildi, Adana dürümün acısı boğazına mı kaçtı naptın? Bi ses ver de içimiz rahat etsin!",
      "@{username} ula kirvem köşede hayalet gibi dikilme öyle, bi şeyler yaz da chat canlansın, yayıncıyı yalnız mı bırakacan!",
      "@{username} bak hele şu sessizliğe! Gardaşşş seni Seyhan zabıtaları mı kovaladı nereye kaçtın, iki dakka yazmayınca merak ediyok!",
      "@{username} kirvem valla darılırım ha, iki muhabbetin belini kırıyoduk hemen kaçtın! Gel hele buraya iki laklak edek!",
      "@{username} la gardaş parmaklarına kramp mı girdi? Adana sıcağında vantilatörün karşısında uyuya mı kaldın, uyan da yaz hele!",
      "@{username} bak hele moruk, öyle gizli gizli yayını izleyip tek kelime yazmamak yakışır mı Adana delikanlısına? Yazsana iki kelam!",
      "@{username} gardaş sen hayırdır la? Az önce buralardaydın, iki dakka sustun zannettik ki şalgam fabrikasına ortak olmaya gittin!",
      "@{username} kirvem nereye kayboldun gözünü seveyim? Seni Büyüksaat'in meydanında anons mu ettirek, bi ses ver hele buradayım de!",
      "@{username} ula gardaş iki dakka yazmadın chat kurudu valla! Gel bi canlandır buraları, kebap kokusunu almış kedi gibi bekleme öyle!",
      "@{username} bak hele kirvem, klavyeyi mi yedin naptın? İki dakka önce yazıyodun şimdi tık yok, hayırdır elektriğin mi kesildi?",
      "@{username} gardaşşş ses ver ses! Baraj yolunda drift atarken lastiğin mi patladı, niye yazmıyon la iki dakkadır merak ettik!",
      "@{username} la kirvem az konuş da çenemiz açılsın, öyle duvara bakar gibi bakma ekrana! Bi el salla bi 'burdayım' de bari!",
      "@{username} bak hele ağam, yoksa acılı şalgamın son yudumu boğazına mı takıldı? Sesin soluğun çıkmıyor, yazsana iki satır bir şey!",
      "@{username} gardaşım yayıncı abimizi tek başına mı koyacan buralarda? Gel iki omuz ver sohbete, kaçma öyle sessizce karanlıklara!",
      "@{username} ula kirvem seni Adana Emniyetine kayıp ilanı olarak vericem az kaldı! Neredesin la iki dakkadır, bi ses ver hele!",
      "@{username} bak hele moruk, ekranın başında heykel gibi mi dondun kaldın? Çözül de gel iki kelam et, Adana sıcağı bile eritir seni!",
      "@{username} gardaş seni kaçırdılar mı naptılar? İki dakka önce chatteydin şimdi toz oldun, gel hele bi iki laf at da neşen yerine gelsin!",
      "@{username} kirvem valla gözümüz yollarda kaldı, iki laklak edecektik hemen kaçtın bici bici tezgahına! Yazsana gardaş ne bekliyon!",
      "@{username} la gardaş yoksa klavyenin pilleri mi bitti? Gel Taşköprü'den iki taş al da tuşlara vur bari sesin gelsin buralara!",
      "@{username} bak hele şu sessizliğe, sanırsın gece saat 3'te Adana sokakları! Kirvem bi ses ver la, canımız sıkıldı sensiz burada!",
      "@{username} gardaşşş iki dakka yazmadın diye bütün chat seni arıyor! Nereye sıvıştın la, gel iki çift laf et de ortalık şenlensin!",
      "@{username} kirvem gözünü seveyim bi harf bile olsa yaz da yaşadığını bilek! Öyle sessizce pusmak delikanlı adama yakışmaz!",
      "@{username} ula ağam nereye kayboldun? Yoksa kebapçı çırağı siparişi mi getirdi de gömüyon köşede tek başına? Bize de söyle yaz hele!",
      "@{username} bak hele gardaş, iki dakka yazmadın ortalık yetim kaldı! Bi ses ver de keyfimiz yerine gelsin, yazsana la ne duruyon!"
    ]
  };

  const res = await fetch('/api/adana', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(defaultPayload)
  });
  const data = await res.json();
  if (data.success) {
    populateAdanaForm(data.adanaMode);
    showToast('Adanalı modu varsayılan ayarlara döndürüldü!', 'info');
  }
}

// Canlı Adana Banter Simülasyonu
async function testAdanaBanterLive() {
  const users = ['Mert_01', 'Can_Demir', 'Ahmet_Seyhan', 'Burak_Kozan'];
  const randomUser = users[Math.floor(Math.random() * users.length)];
  const prompts = ['bu bot ne diyo ya', 'bot artistlik yapma gardas', 'selam bot roxen', 'hava cok sicak la'];
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

  showToast(`🌶️ ${randomUser} mesajı simüle ediliyor: "${randomPrompt}"...`, 'info');
  await fetch('/api/test/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: randomUser, content: randomPrompt })
  });
}

// 1 Dakika Sessiz Kalan İzleyiciyi Simüle Etme
async function testAdanaIdleCalloutLive() {
  const targetUser = 'Baraj_Yolcusu';
  showToast(`⏱️ "${targetUser}" için sessizlik simüle ediliyor...`, 'info');
  
  // Önce bir mesaj attırıyoruz
  await fetch('/api/test/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: targetUser, content: 'selam millet ben geldim' })
  });

  // Ardından simülasyon olarak botun doğrudan bir darlama mesajı atmasını sağlıyoruz
  setTimeout(async () => {
    const callouts = (currentAdanaConfig && currentAdanaConfig.idleCallouts && currentAdanaConfig.idleCallouts.length) 
      ? currentAdanaConfig.idleCallouts 
      : ["@{username} bak hele gardaşşş niye yazmıyon la? İki dakka muhabbet ettik hemen kayboldun, bici bici yemeye mi gittin yazsana!"];
    const template = callouts[Math.floor(Math.random() * callouts.length)];
    let text = template;
    if (text.includes('{username}')) {
      text = text.replace(/{username}/g, targetUser);
    } else {
      text = `@${targetUser} ${text}`;
    }

    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    showToast(`🌶️ "${targetUser}" darlanarak etiketlendi!`, 'success');
  }, 1000);
}

// =================== WIDGET YÖNETİMİ ===================
function populateWidgetForms(widgets) {
  if (!widgets) return;

  // Chat Widget
  if (widgets.chat) {
    document.getElementById('chat-theme').value = widgets.chat.theme || 'neon';
    document.getElementById('chat-font-size').value = widgets.chat.fontSize || 16;
    document.getElementById('chat-lifetime').value = widgets.chat.messageLifetime || 20;
  }

  // Goal Bar
  if (widgets.goal) {
    document.getElementById('goal-title-input').value = widgets.goal.title || 'Takipçi Hedefi';
    document.getElementById('goal-type-select').value = widgets.goal.goalType || 'followers';
    document.getElementById('goal-current-input').value = widgets.goal.current || 0;
    document.getElementById('goal-target-input').value = widgets.goal.target || 100;
  }

  // Alert Box alt sekmesini render et
  renderAlertSubTabForm(currentAlertTab);
}

function switchAlertSubTab(tabName) {
  currentAlertTab = tabName;
  document.querySelectorAll('.alert-tab-btn').forEach(btn => {
    btn.className = 'alert-tab-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition';
  });
  const activeBtn = document.getElementById(`alert-subtab-${tabName}`);
  if (activeBtn) {
    activeBtn.className = 'alert-tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-kick text-black transition';
  }
  renderAlertSubTabForm(tabName);
}

function renderAlertSubTabForm(type) {
  const container = document.getElementById('alert-config-fields');
  const alertConfig = (currentWidgetConfig?.alertbox && currentWidgetConfig.alertbox[type]) || {};

  container.innerHTML = `
    <div>
      <label class="block font-bold text-slate-300 mb-1.5">Metin Şablonu</label>
      <input type="text" id="alert-template" value="${escapeHtml(alertConfig.textTemplate || '')}" class="w-full bg-panel-bg border border-panel-border rounded-xl px-3 py-2 text-white" />
      <p class="text-[10px] text-slate-500 mt-1">Kullanılabilir: {username}, {months}, {count}, {viewers}</p>
    </div>

    <div>
      <label class="block font-bold text-slate-300 mb-1.5">Animasyon Tipi</label>
      <select id="alert-animation" class="w-full bg-panel-bg border border-panel-border rounded-xl px-3 py-2 text-white">
        <option value="bounceIn" ${alertConfig.animation === 'bounceIn' ? 'selected' : ''}>Zıplama (BounceIn)</option>
        <option value="zoomIn" ${alertConfig.animation === 'zoomIn' ? 'selected' : ''}>Büyüme (ZoomIn)</option>
        <option value="fadeInDown" ${alertConfig.animation === 'fadeInDown' ? 'selected' : ''}>Yukarıdan Aşağı (FadeInDown)</option>
        <option value="tada" ${alertConfig.animation === 'tada' ? 'selected' : ''}>Tada / Kutlama (Tada)</option>
        <option value="pulse" ${alertConfig.animation === 'pulse' ? 'selected' : ''}>Nabız (Pulse)</option>
      </select>
    </div>

    <div>
      <label class="block font-bold text-slate-300 mb-1.5">Ekranda Kalma Süresi (Saniye)</label>
      <input type="number" id="alert-duration" min="2" max="30" value="${alertConfig.durationSec || 6}" class="w-full bg-panel-bg border border-panel-border rounded-xl px-3 py-2 text-white" />
    </div>

    <div>
      <label class="block font-bold text-slate-300 mb-1.5">GIF / Görsel URL'si</label>
      <input type="text" id="alert-image-url" value="${escapeHtml(alertConfig.imageUrl || '')}" class="w-full bg-panel-bg border border-panel-border rounded-xl px-3 py-2 text-white font-mono text-[11px]" />
    </div>
  `;
}

async function saveWidgetConfig() {
  if (!currentWidgetConfig) currentWidgetConfig = { alertbox: {}, chat: {}, goal: {} };

  // Alert Box current tab values
  const currentAlertObj = currentWidgetConfig.alertbox[currentAlertTab] || {};
  currentAlertObj.textTemplate = document.getElementById('alert-template').value;
  currentAlertObj.animation = document.getElementById('alert-animation').value;
  currentAlertObj.durationSec = Number(document.getElementById('alert-duration').value) || 6;
  currentAlertObj.imageUrl = document.getElementById('alert-image-url').value;
  currentWidgetConfig.alertbox[currentAlertTab] = currentAlertObj;

  // Chat widget
  currentWidgetConfig.chat = {
    theme: document.getElementById('chat-theme').value,
    fontSize: Number(document.getElementById('chat-font-size').value) || 16,
    messageLifetime: Number(document.getElementById('chat-lifetime').value) || 20
  };

  // Goal widget
  currentWidgetConfig.goal = {
    title: document.getElementById('goal-title-input').value,
    goalType: document.getElementById('goal-type-select').value,
    current: Number(document.getElementById('goal-current-input').value) || 0,
    target: Number(document.getElementById('goal-target-input').value) || 100
  };

  try {
    const res = await fetch('/api/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentWidgetConfig)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Widget ayarları kaydedildi ve OBS güncellendi!', 'success');
    }
  } catch (e) {
    showToast('Widget kaydetme hatası: ' + e.message, 'error');
  }
}

function copyWidgetUrl(path) {
  const token = currentUser?.apiKey ? `?token=${currentUser.apiKey}` : '';
  const fullUrl = window.location.origin + path + token;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast(`Widget URL kopyalandı! OBS'e ekleyebilirsiniz.`, 'success');
  }).catch(() => {
    prompt('Widget URL (Kopyalayınız):', fullUrl);
  });
}

function updateModPreview() {
  const userIn = document.getElementById('setting-bot-username');
  const modPreview = document.getElementById('mod-cmd-preview');
  const name = userIn?.value?.trim() || 'RoxenBot';
  if (modPreview) {
    modPreview.innerText = `/mod ${name}`;
  }
}

async function sendTestChatMessage() {
  const btn = document.getElementById('btn-header-test-msg');
  if (btn) btn.disabled = true;
  showToast('Test mesajı Kick sohbetine gönderiliyor...', 'info');

  try {
    const res = await fetch('/api/bot/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '🤖 [Test] RoxenBot sohbet bağlantısı aktif ve çalışıyor! 👋' })
    }).then(r => r.json());

    if (res && res.success) {
      const method = res.apiType === 'official' ? ' (Resmi API)' : res.apiType ? ` (${res.apiType})` : '';
      showToast(`🎉 Harika! Test mesajı Kick sohbetinize başarıyla gönderildi!${method}`, 'success');
    } else {
      showToast(res?.error || 'Mesaj gönderilemedi. Token geçerliliğini ve /mod yetkisini kontrol edin.', 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

// =================== TEST BUTONLARI ===================
async function triggerQuickTest(type) {
  try {
    await fetch('/api/test/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    showToast(`${type.toUpperCase()} test bildirimi OBS'e gönderildi!`, 'success');
  } catch (e) {
    showToast('Test hatası: ' + e.message, 'error');
  }
}

function testCurrentAlertTab() {
  triggerQuickTest(currentAlertTab);
}

async function sendManualChatMessage() {
  const input = document.getElementById('manual-chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (data.simulated) {
      showToast('Simülasyon modunda gönderildi (Bot tokeni ayarlanmamış)', 'info');
    } else if (data.success) {
      showToast('Mesaj Kick sohbetine gönderildi!', 'success');
    }
  } catch (e) {
    showToast('Mesaj gönderme hatası: ' + e.message, 'error');
  }
}

// =================== GENEL AYARLARI KAYDET ===================
async function saveGeneralSettings() {
  const slug = document.getElementById('setting-channel-slug').value.trim();
  const botUsername = document.getElementById('setting-bot-username')?.value?.trim() || '';
  const botToken = document.getElementById('setting-bot-token')?.value?.trim() || '';

  if (!slug) {
    showToast('Lütfen kanal adınızı girin', 'error');
    return;
  }

  showToast('Ayarlar kaydediliyor ve bağlanılıyor...', 'info');

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelSlug: slug, botUsername, botToken })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Ayarlar kaydedildi! Kanala bağlanılıyor...', 'success');
      handleConnectClick();
    }
  } catch (e) {
    showToast('Ayarları kaydetme hatası: ' + e.message, 'error');
  }
}

// =================== TEST MERKEZİ & SİMÜLASYON İŞLEMLERİ ===================
const RANDOM_NAMES = [
  'RoxenFan_42', 'Zeynep_Kick', 'Melih_35', 'Caner_TR', 'Efe_Pro',
  'Boran_99', 'Elif_Stream', 'ApexAvcisi', 'KralOyuncu', 'GeceKusu',
  'AhmetGamer', 'Berke_Live', 'Selin_94', 'FatihReis', 'Batuhan_7'
];

function randomizeName(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const rnd = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  el.value = rnd;
}

function reloadPreviewFrame() {
  const frame = document.getElementById('preview-alert-frame');
  if (frame) {
    frame.src = '/widgets/alertbox?t=' + Date.now();
    showToast('Önizleme ekranı yenilendi!', 'info');
  }
}

function setSubMonth(m) {
  document.getElementById('test-sub-months').value = m;
  document.querySelectorAll('.sub-month-btn').forEach(btn => {
    if (Number(btn.dataset.month) === Number(m)) {
      btn.className = 'sub-month-btn py-1 rounded-lg bg-amber-500/20 border border-amber-500 text-amber-400 font-bold';
    } else {
      btn.className = 'sub-month-btn py-1 rounded-lg bg-panel-bg border border-panel-border font-bold text-slate-300 hover:text-white';
    }
  });
}

function setGiftCount(c) {
  document.getElementById('test-gift-count').value = c;
  document.querySelectorAll('.gift-count-btn').forEach(btn => {
    if (Number(btn.dataset.count) === Number(c)) {
      btn.className = 'gift-count-btn py-1 rounded-lg bg-orange-500/20 border border-orange-500 text-orange-400 font-bold';
    } else {
      btn.className = 'gift-count-btn py-1 rounded-lg bg-panel-bg border border-panel-border font-bold text-slate-300 hover:text-white';
    }
  });
}

function setHostViewers(v) {
  document.getElementById('test-host-viewers').value = v;
  document.querySelectorAll('.host-viewers-btn').forEach(btn => {
    if (Number(btn.dataset.viewers) === Number(v)) {
      btn.className = 'host-viewers-btn py-1 rounded-lg bg-sky-500/20 border border-sky-500 text-sky-400 font-bold';
    } else {
      btn.className = 'host-viewers-btn py-1 rounded-lg bg-panel-bg border border-panel-border font-bold text-slate-300 hover:text-white';
    }
  });
}

async function sendCustomFollowTest() {
  const username = document.getElementById('test-follow-username').value.trim() || 'RoxenGamer';
  try {
    const res = await fetch('/api/test/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'follow', username })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⭐ ${username} için takip bildirimi tetiklendi!`, 'success');
    }
  } catch (e) {
    showToast('Test hatası: ' + e.message, 'error');
  }
}

async function sendCustomSubTest() {
  const username = document.getElementById('test-sub-username').value.trim() || 'KralIzleyici';
  const months = Number(document.getElementById('test-sub-months').value) || 3;
  try {
    const res = await fetch('/api/test/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'subscription', username, months })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`👑 ${username} için ${months}. Ay Abone bildirimi tetiklendi!`, 'success');
    }
  } catch (e) {
    showToast('Test hatası: ' + e.message, 'error');
  }
}

async function sendCustomGiftSubTest() {
  const username = document.getElementById('test-gift-username').value.trim() || 'CömertBaskan';
  const count = Number(document.getElementById('test-gift-count').value) || 5;
  try {
    const res = await fetch('/api/test/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'giftSub', username, count })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎁 ${username} tarafından ${count} adet hediye bildirimi tetiklendi!`, 'success');
    }
  } catch (e) {
    showToast('Test hatası: ' + e.message, 'error');
  }
}

async function sendCustomHostTest() {
  const username = document.getElementById('test-host-username').value.trim() || 'YayıncıDostu';
  const viewers = Number(document.getElementById('test-host-viewers').value) || 150;
  try {
    const res = await fetch('/api/test/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'host', username, viewers })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🚀 ${username} tarafından ${viewers} kişilik baskın bildirimi tetiklendi!`, 'success');
    }
  } catch (e) {
    showToast('Test hatası: ' + e.message, 'error');
  }
}

function fillAndSendChatSimulation(user, text) {
  document.getElementById('sim-chat-user').value = user;
  document.getElementById('sim-chat-content').value = text;
  executeChatSimulation();
}

async function executeChatSimulation() {
  const username = document.getElementById('sim-chat-user').value.trim() || 'Izleyici_Can';
  const content = document.getElementById('sim-chat-content').value.trim();
  if (!content) {
    showToast('Lütfen bir mesaj yazın', 'error');
    return;
  }

  try {
    const res = await fetch('/api/test/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, content })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`💬 "${content}" mesajı simüle edildi!`, 'info');
      document.getElementById('sim-chat-content').value = '';
    }
  } catch (e) {
    showToast('Simülasyon hatası: ' + e.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =================== 2. SADAKAT / PUAN SİSTEMİ (LOYALTY) ===================
async function loadLoyaltyData() {
  try {
    const res = await fetch('/api/loyalty').then(r => r.json());
    if (!res.success) return;

    const l = res.loyalty || {};
    const toggle = document.getElementById('loyalty-enabled');
    if (toggle) toggle.checked = !!l.enabled;

    const statusText = document.getElementById('loyalty-status-text');
    if (statusText) statusText.innerText = l.enabled ? 'Puan Sistemi Aktif' : 'Puan Sistemi Pasif';

    const pName = document.getElementById('loyalty-point-name');
    if (pName) pName.value = l.pointName || 'Şalgam Puanı';

    const intPts = document.getElementById('loyalty-interval-points');
    if (intPts) intPts.value = l.pointsPerInterval || 10;

    const chatBns = document.getElementById('loyalty-chat-bonus');
    if (chatBns) chatBns.value = l.chatBonusPoints || 2;

    renderLoyaltyTable(res.topUsers || []);
  } catch (e) {
    console.error('Loyalty load error:', e);
  }
}

function renderLoyaltyTable(users) {
  const tbody = document.getElementById('loyalty-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">Henüz puan kazanan izleyici yok. Sohbette aktif olanlar burada listelenecektir.</td></tr>';
    return;
  }

  users.forEach((u, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-panel-card/60 transition';

    let rankBadge = `<span class="font-mono font-bold text-slate-400">#${idx + 1}</span>`;
    if (idx === 0) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 font-black">🥇 1.</span>`;
    else if (idx === 1) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-slate-400/20 text-slate-300 font-bold">🥈 2.</span>`;
    else if (idx === 2) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-orange-700/20 text-orange-400 font-bold">🥉 3.</span>`;

    const lastActiveStr = u.lastActive ? new Date(u.lastActive).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-';

    tr.innerHTML = `
      <td class="px-4 py-3">${rankBadge}</td>
      <td class="px-4 py-3 font-bold text-white flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">${escapeHtml(u.username[0].toUpperCase())}</span>
        <span>${escapeHtml(u.username)}</span>
      </td>
      <td class="px-4 py-3 font-black text-amber-400 text-sm">${(u.points || 0).toLocaleString()}</td>
      <td class="px-4 py-3 text-slate-400">${u.watchTimeMinutes || 0} dk</td>
      <td class="px-4 py-3 text-slate-400 font-mono text-[11px]">${lastActiveStr}</td>
      <td class="px-4 py-3 text-right">
        <button onclick="editUserPointsPrompt('${escapeHtml(u.username)}', ${u.points || 0})" class="px-2.5 py-1 rounded-lg bg-panel-card hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">
          Puan Düzenle
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleLoyaltyStatus(checked) {
  const statusText = document.getElementById('loyalty-status-text');
  if (statusText) statusText.innerText = checked ? 'Puan Sistemi Aktif' : 'Puan Sistemi Pasif';
  saveLoyaltyConfig(true);
}

async function saveLoyaltyConfig(silent = false) {
  const enabled = document.getElementById('loyalty-enabled').checked;
  const pointName = document.getElementById('loyalty-point-name').value.trim() || 'Şalgam Puanı';
  const pointsPerInterval = Number(document.getElementById('loyalty-interval-points').value) || 10;
  const chatBonusPoints = Number(document.getElementById('loyalty-chat-bonus').value) || 2;

  try {
    const res = await fetch('/api/loyalty/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, pointName, pointsPerInterval, chatBonusPoints })
    });
    const data = await res.json();
    if (data.success && !silent) {
      showToast('Puan ve Sadakat ayarları başarıyla kaydedildi!', 'success');
      loadLoyaltyData();
    }
  } catch (e) {
    showToast('Kaydetme hatası: ' + e.message, 'error');
  }
}

async function editUserPointsPrompt(username, current) {
  const input = prompt(`@${username} kullanıcısının yeni puanını girin:`, current);
  if (input === null) return;
  const pts = parseInt(input, 10);
  if (isNaN(pts)) {
    showToast('Geçersiz puan miktarı', 'error');
    return;
  }

  try {
    const res = await fetch('/api/loyalty/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, points: pts })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`@${username} puanı ${pts} olarak güncellendi!`, 'success');
      loadLoyaltyData();
    }
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

async function resetAllLoyaltyPoints() {
  if (!confirm('TÜM izleyicilerin puanlarını sıfırlamak istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/loyalty/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Tüm puanlar sıfırlandı!', 'info');
      loadLoyaltyData();
    }
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

// =================== 4. ÇEKİLİŞ SİSTEMİ (GIVEAWAY) ===================
async function loadGiveawayData() {
  try {
    const res = await fetch('/api/giveaway').then(r => r.json());
    if (res.success && res.giveaway) {
      renderGiveawayUI(res.giveaway);
    }
  } catch (e) {
    console.error('Giveaway load error:', e);
  }
}

function renderGiveawayUI(gw) {
  const statusIndicator = document.getElementById('gw-live-indicator');
  const statusText = document.getElementById('gw-live-status-text');
  const liveCount = document.getElementById('gw-live-count');
  const chipsContainer = document.getElementById('gw-participants-chips');
  const rollBtn = document.getElementById('btn-roll-giveaway');

  if (!statusIndicator || !statusText) return;

  const isActive = !!gw.active;
  const count = (gw.participants || []).length;

  statusIndicator.className = isActive ? 'w-3 h-3 rounded-full bg-emerald-400 animate-pulse' : 'w-3 h-3 rounded-full bg-slate-600';
  statusText.innerText = isActive ? `🟢 Çekiliş Aktif: "${gw.prize}"` : 'Şu an aktif çekiliş yok';
  liveCount.innerText = `${count} Katılımcı`;

  if (rollBtn) {
    rollBtn.disabled = !isActive || count === 0;
  }

  // Katılımcı avatarları
  chipsContainer.innerHTML = '';
  if (!gw.participants || gw.participants.length === 0) {
    chipsContainer.innerHTML = '<span class="text-slate-500 text-xs italic">Henüz katılan yok. Sohbete katılım komutunu yazanlar burada görünecektir.</span>';
  } else {
    gw.participants.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'px-2.5 py-1 rounded-lg bg-panel-card border border-panel-border text-xs text-white flex items-center gap-1.5 font-medium';
      chip.innerHTML = `
        <span class="w-2 h-2 rounded-full" style="background-color: ${p.color || '#53fc18'}"></span>
        <span>${escapeHtml(p.username)}</span>
        ${p.tickets > 1 ? `<span class="text-[10px] px-1 rounded bg-amber-500/20 text-amber-400 font-bold">${p.tickets}x</span>` : ''}
      `;
      chipsContainer.appendChild(chip);
    });
  }

  if (gw.winner) {
    showGiveawayWinnerBanner(gw.winner);
  }
}

function showGiveawayWinnerBanner(winner) {
  const banner = document.getElementById('gw-winner-banner');
  const nameEl = document.getElementById('gw-winner-name');
  const prizeEl = document.getElementById('gw-winner-prize-text');
  if (!banner) return;

  nameEl.innerText = '@' + winner.username;
  prizeEl.innerText = 'Kazanılan Ödül: ' + (winner.prize || 'Hediye');
  banner.classList.remove('hidden');
}

async function startGiveawayClick() {
  const prize = document.getElementById('gw-input-prize').value.trim() || 'Steam Cüzdan Kodu';
  const keyword = document.getElementById('gw-input-keyword').value.trim() || '!katil';
  const subMultiplier = Number(document.getElementById('gw-input-sub-mult').value) || 1;

  try {
    const res = await fetch('/api/giveaway/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prize, keyword, subMultiplier })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 "${prize}" çekilişi başlatıldı!`, 'success');
      document.getElementById('gw-winner-banner').classList.add('hidden');
      renderGiveawayUI(data.giveaway);
    }
  } catch (e) {
    showToast('Çekiliş başlatma hatası: ' + e.message, 'error');
  }
}

async function rollGiveawayClick() {
  if (!confirm('Çekiliş kazananını belirlemek ve OBS ekranında patlatmak istiyor musunuz?')) return;
  try {
    const res = await fetch('/api/giveaway/roll', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`👑 Kazanan Belirlendi: @${data.winner.username}!`, 'success');
      showGiveawayWinnerBanner(data.winner);
    } else {
      showToast(data.message || 'Hata oluştu', 'error');
    }
  } catch (e) {
    showToast('Kura hatası: ' + e.message, 'error');
  }
}

async function endGiveawayClick() {
  try {
    const res = await fetch('/api/giveaway/end', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Çekiliş sonlandırıldı', 'info');
      renderGiveawayUI(data.giveaway);
    }
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

// =================== 6. ÖNEMLİ ANLAR / KLİPLER (HIGHLIGHTS) ===================
async function loadHighlightsData() {
  try {
    const res = await fetch('/api/highlights').then(r => r.json());
    if (res.success) {
      renderHighlightsTable(res.highlights || []);
    }
  } catch (e) {
    console.error('Highlights load error:', e);
  }
}

function renderHighlightsTable(list) {
  const tbody = document.getElementById('highlights-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Henüz kaydedilmiş klip veya önemli an yok. Chate !klip yazarak test edebilirsiniz.</td></tr>';
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-panel-card/60 transition';

    tr.innerHTML = `
      <td class="px-4 py-3">
        <span class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-400 font-mono font-bold text-xs">${escapeHtml(item.streamTime)}</span>
      </td>
      <td class="px-4 py-3 text-slate-400 font-mono text-[11px]">${escapeHtml(item.realTime || '')}</td>
      <td class="px-4 py-3 font-semibold text-white">${escapeHtml(item.note)}</td>
      <td class="px-4 py-3 text-slate-300">@${escapeHtml(item.username)}</td>
      <td class="px-4 py-3 text-right space-x-2">
        <button onclick="copySingleTimestamp('${escapeHtml(item.streamTime)}', '${escapeHtml(item.note)}')" class="px-2.5 py-1 rounded-lg bg-panel-card hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">
          Zamanı Kopyala
        </button>
        <button onclick="deleteHighlightClick('${item.id}')" class="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons({ root: tbody });
}

async function addManualHighlight() {
  const input = document.getElementById('manual-hl-note');
  const note = input.value.trim() || 'Manuel Kaydedilen An';

  try {
    const res = await fetch('/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`📌 [${data.highlight.streamTime}] "${note}" kaydedildi!`, 'success');
      input.value = '';
      loadHighlightsData();
    }
  } catch (e) {
    showToast('Kayıt hatası: ' + e.message, 'error');
  }
}

async function deleteHighlightClick(id) {
  try {
    const res = await fetch(`/api/highlights/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Klip kaydı silindi', 'info');
      loadHighlightsData();
    }
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

async function clearAllHighlightsClick() {
  if (!confirm('Tüm klip ve önemli an listesini silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/highlights', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Tüm liste temizlendi', 'info');
      loadHighlightsData();
    }
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

function copySingleTimestamp(time, note) {
  navigator.clipboard.writeText(`${time} - ${note}`);
  showToast(`📋 "${time} - ${note}" panoya kopyalandı!`, 'success');
}

async function copyHighlightsForShorts() {
  try {
    const res = await fetch('/api/highlights').then(r => r.json());
    const list = res.highlights || [];
    if (list.length === 0) {
      showToast('Kopyalanacak klip kaydı bulunamadı', 'error');
      return;
    }
    const text = list.map(item => `[${item.streamTime}] ${item.note} (@${item.username})`).join('\n');
    navigator.clipboard.writeText(text);
    showToast(`📋 ${list.length} adet klip zaman damgası Shorts/TikTok için kopyalandı!`, 'success');
  } catch (e) {
    showToast('Kopyalama hatası: ' + e.message, 'error');
  }
}

// =================== 12. DISCORD YAYIN DUYURULARI ===================
let currentDiscordConfig = null;
let currentDiscordBotUser = null;

async function loadDiscordData() {
  try {
    const res = await fetch('/api/discord').then(r => r.json());
    if (res.success) {
      currentDiscordConfig = res.config || {};
      currentDiscordBotUser = res.botUser;
      populateDiscordForm(currentDiscordConfig, currentDiscordBotUser, res.isGatewayOnline);
      refreshDiscordChannels(currentDiscordConfig.channelId);
    }
  } catch (err) {
    console.error('Discord veri yükleme hatası:', err);
  }
}

function populateDiscordForm(cfg, botUser, isGatewayOnline) {
  if (!cfg) return;

  const enabledToggle = document.getElementById('discord-enabled-toggle');
  if (enabledToggle) enabledToggle.checked = !!cfg.enabled;

  const autoToggle = document.getElementById('discord-auto-announce-toggle');
  if (autoToggle) autoToggle.checked = !!cfg.autoAnnounce;

  const customText = document.getElementById('discord-custom-text');
  if (customText) customText.value = cfg.customText || '';

  const botToken = document.getElementById('discord-bot-token');
  if (botToken) botToken.value = cfg.botToken || '';

  // Mention Radio Buttons
  const mention = cfg.mention || '@everyone';
  const mentionRadios = document.getElementsByName('discord-mention');
  for (const r of mentionRadios) {
    if (r.value === mention) r.checked = true;
  }

  // Bot bilgileri
  if (botUser) {
    const nameEl = document.getElementById('discord-bot-name');
    if (nameEl) nameEl.innerText = botUser.username || 'RoxenBot - KİCK';
    const prevNameEl = document.getElementById('preview-bot-name');
    if (prevNameEl) prevNameEl.innerText = botUser.username || 'RoxenBot - KİCK';
    const idEl = document.getElementById('discord-bot-id');
    if (idEl) idEl.innerText = `ID: ${botUser.id}`;
    if (botUser.avatar) {
      const avatarUrl = `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png`;
      const pAvatar = document.getElementById('preview-bot-avatar');
      if (pAvatar) pAvatar.src = avatarUrl;
      const bAvatarBox = document.getElementById('discord-bot-avatar');
      if (bAvatarBox) bAvatarBox.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-2xl" />`;
    }
    const badge = document.getElementById('discord-status-badge');
    if (badge) {
      if (isGatewayOnline !== false) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-kick/20 text-kick flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-kick animate-pulse"></span> 🟢 Çevrimiçi';
      } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 🟡 Bağlanıyor...';
      }
    }
  }

  const autoStatus = document.getElementById('discord-auto-status');
  if (autoStatus) {
    autoStatus.innerText = cfg.autoAnnounce ? 'Açık (Hazır)' : 'Kapalı';
    autoStatus.className = cfg.autoAnnounce ? 'text-base font-extrabold text-white mt-0.5' : 'text-base font-extrabold text-slate-500 mt-0.5';
  }

  const channelDisp = document.getElementById('discord-channel-display');
  if (channelDisp && cfg.channelName) {
    channelDisp.innerText = cfg.channelName;
  }

  updateDiscordPreview();
}

async function refreshDiscordChannels(selectedId) {
  try {
    const res = await fetch('/api/discord/channels').then(r => r.json());
    const select = document.getElementById('discord-channel-select');
    if (!select) return;

    if (res.success && Array.isArray(res.channels) && res.channels.length > 0) {
      select.innerHTML = '';
      res.channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.innerText = `#${ch.name}`;
        if (selectedId && ch.id === selectedId) {
          opt.selected = true;
        } else if (!selectedId && currentDiscordConfig?.channelId === ch.id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
      onDiscordChannelChange(false);
    }
  } catch (err) {
    console.error('Discord kanal listesi alma hatası:', err);
  }
}

function onDiscordChannelChange(shouldSave = true) {
  const select = document.getElementById('discord-channel-select');
  if (!select) return;
  const channelName = select.options[select.selectedIndex]?.text || '';
  const channelDisp = document.getElementById('discord-channel-display');
  if (channelDisp) channelDisp.innerText = channelName;

  if (shouldSave) {
    saveDiscordConfig(false);
  }
}

function updateDiscordPreview() {
  const textInput = document.getElementById('discord-custom-text');
  const customText = textInput ? textInput.value : '';

  let mention = '@everyone';
  const mentionRadios = document.getElementsByName('discord-mention');
  for (const r of mentionRadios) {
    if (r.checked) {
      mention = r.value;
      break;
    }
  }

  const tagEl = document.getElementById('preview-mention-tag');
  if (tagEl) {
    if (mention && mention !== 'none') {
      tagEl.innerText = mention;
      tagEl.classList.remove('hidden');
    } else {
      tagEl.classList.add('hidden');
    }
  }

  const textBodyEl = document.getElementById('preview-text-body');
  if (textBodyEl) {
    textBodyEl.innerText = customText ? ` ${customText}` : '';
  }

  const slug = currentSettings?.channelSlug || 'tolgayasin';
  const descEl = document.getElementById('preview-embed-desc');
  if (descEl) {
    descEl.innerText = `**${slug.toUpperCase()}** şu an Kick platformunda canlı yayında!`;
  }
}

async function saveDiscordConfig(showNotification = true) {
  const select = document.getElementById('discord-channel-select');
  const channelId = select?.value;
  const channelName = select?.options[select.selectedIndex]?.text || '📢𝙳𝚄𝚈𝚄𝚁𝚄';

  let mention = '@everyone';
  const mentionRadios = document.getElementsByName('discord-mention');
  for (const r of mentionRadios) {
    if (r.checked) {
      mention = r.value;
      break;
    }
  }

  const payload = {
    enabled: document.getElementById('discord-enabled-toggle')?.checked ?? true,
    autoAnnounce: document.getElementById('discord-auto-announce-toggle')?.checked ?? true,
    channelId: channelId || currentDiscordConfig?.channelId || '1546927211578396796',
    channelName: channelName,
    mention: mention,
    customText: document.getElementById('discord-custom-text')?.value || '',
    botToken: document.getElementById('discord-bot-token')?.value || ''
  };

  try {
    const res = await fetch('/api/discord/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    if (res.success) {
      currentDiscordConfig = res.config;
      const autoStatus = document.getElementById('discord-auto-status');
      if (autoStatus) {
        autoStatus.innerText = payload.autoAnnounce ? 'Açık (Hazır)' : 'Kapalı';
        autoStatus.className = payload.autoAnnounce ? 'text-base font-extrabold text-white mt-0.5' : 'text-base font-extrabold text-slate-500 mt-0.5';
      }
      if (showNotification) {
        showToast('Discord duyuru ayarları başarıyla kaydedildi!', 'success');
      }
    }
  } catch (err) {
    if (showNotification) {
      showToast('Ayar kaydedilirken hata: ' + err.message, 'error');
    }
  }
}

async function sendDiscordTestAnnouncement() {
  const btn = document.getElementById('btn-discord-test-trigger');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Gönderiliyor...`;
    lucide.createIcons({ root: btn });
  }

  const select = document.getElementById('discord-channel-select');
  const channelId = select?.value;

  let mention = '@everyone';
  const mentionRadios = document.getElementsByName('discord-mention');
  for (const r of mentionRadios) {
    if (r.checked) {
      mention = r.value;
      break;
    }
  }

  const customText = document.getElementById('discord-custom-text')?.value;

  try {
    const res = await fetch('/api/discord/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, customText, mention })
    }).then(r => r.json());

    if (res.success) {
      showToast('🚀 Canlı yayın duyurusu Discord kanalına gönderildi!', 'success');
      const box = document.getElementById('discord-last-sent-box');
      if (box) {
        box.classList.remove('hidden');
        document.getElementById('discord-last-sent-time').innerText = `Saat: ${new Date().toLocaleTimeString('tr-TR')}`;
        document.getElementById('discord-last-sent-id').innerText = `Mesaj ID: ${res.messageId || '-'}`;
      }
    } else {
      showToast('Duyuru gönderilemedi: ' + (res.error || res.message), 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> 🚀 Şimdi Discord'a Canlı Yayın Duyurusu Gönder`;
      lucide.createIcons({ root: btn });
    }
  }
}

function toggleDiscordTokenVisibility() {
  const input = document.getElementById('discord-bot-token');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

function reloadViewerFrame() {
  if (!currentLicense || !currentLicense.isVipPro) {
    showToast('Bu özellik VIP PRO lisans gerektirir.', 'error');
    return;
  }
  const frame = document.getElementById('viewer-bot-iframe');
  if (frame) {
    frame.src = '/viewer-bot/';
    showToast('Viewer Bot paneli yenilendi', 'info');
  }
}

// =================== VIP PRO LİSANS YÖNETİMİ ===================
function applyLicenseUI(lic) {
  currentLicense = lic || {};
  const isVip = Boolean(currentLicense.isVipPro);
  const hwid = currentLicense.hwid || 'ROXEN-HWID-ALINAMADI';

  // 1. HWID kutusu
  const hwidEl = document.getElementById('vip-user-hwid');
  if (hwidEl) hwidEl.innerText = hwid;

  // 2. Header Lisans Rozeti & VIP Butonu
  const headerPlanText = document.getElementById('header-plan-text');
  const headerPlanBadge = document.getElementById('header-plan-badge');
  const btnUpgradeVip = document.getElementById('btn-upgrade-vip');

  if (headerPlanText && headerPlanBadge) {
    if (isVip) {
      headerPlanBadge.className = 'text-[10px] text-kick font-black uppercase tracking-wider flex items-center gap-1';
      headerPlanText.innerHTML = '<span class="px-2 py-0.5 rounded-lg bg-kick/10 border border-kick/40 text-kick font-black">⭐ VIP PRO</span>';
      if (btnUpgradeVip) {
        btnUpgradeVip.className = 'px-2.5 py-1.5 rounded-lg bg-kick/10 border border-kick/30 text-kick text-xs font-bold transition flex items-center gap-1';
        btnUpgradeVip.innerHTML = '<i data-lucide="crown" class="w-3.5 h-3.5"></i> <span class="hidden sm:inline">VIP Aktif</span>';
      }
    } else {
      headerPlanBadge.className = 'text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1';
      headerPlanText.innerHTML = '<span class="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold">🆓 ÜCRETSİZ</span>';
      if (btnUpgradeVip) {
        btnUpgradeVip.className = 'px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-xs font-black transition flex items-center gap-1 shadow-md shadow-amber-500/20 animate-pulse';
        btnUpgradeVip.innerHTML = '<i data-lucide="crown" class="w-3.5 h-3.5 fill-current"></i> <span class="hidden sm:inline">VIP\'ye Yükselt</span>';
      }
    }
  }

  // 2.1 Şarkı İstek VIP Banner Görünürlüğü
  const songsVipBanner = document.getElementById('songs-vip-banner');
  if (songsVipBanner) {
    if (isVip) songsVipBanner.classList.add('hidden');
    else songsVipBanner.classList.remove('hidden');
  }

  const headerText = document.getElementById('header-license-text');
  const headerPill = document.getElementById('header-license-pill');
  if (headerPill && headerText) {
    if (isVip) {
      headerPill.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kick/10 border border-kick/40 text-xs font-black text-kick shadow-sm';
      headerText.innerHTML = `<i data-lucide="crown" class="w-3.5 h-3.5 text-kick inline mr-1"></i> ${escapeHtml(currentLicense.type || 'VIP PRO')}`;
    } else {
      headerPill.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-bold text-slate-300';
      headerText.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 text-sky-400 inline mr-1"></i> ${escapeHtml(currentLicense.type || 'STANDART PRO')}`;
    }
  }

  // 3. Sidebar Menüdeki Viewer Bot Rozeti
  const navBadge = document.getElementById('nav-viewer-badge');
  if (navBadge) {
    if (isVip) {
      navBadge.className = 'ml-auto text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-1 bg-emerald-500/20 text-emerald-400';
      navBadge.innerHTML = '<i data-lucide="crown" class="w-3 h-3"></i> VIP PRO';
    } else {
      navBadge.className = 'ml-auto text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30';
      navBadge.innerHTML = '<i data-lucide="lock" class="w-3 h-3"></i> KİLİTLİ';
    }
  }

  // 4. Kilitli / Açık İçerik Görünürlüğü
  const lockedBox = document.getElementById('viewer-vip-locked');
  const unlockedBox = document.getElementById('viewer-vip-unlocked');
  const iframe = document.getElementById('viewer-bot-iframe');

  if (isVip) {
    if (lockedBox) lockedBox.classList.add('hidden');
    if (unlockedBox) unlockedBox.classList.remove('hidden');
    // Sadece aktif tab viewer-bot ise veya açıldığında yükle
    if (currentTab === 'viewer-bot' && iframe && (iframe.src === 'about:blank' || !iframe.src.includes('/viewer-bot/'))) {
      iframe.src = '/viewer-bot/';
    }
  } else {
    if (unlockedBox) unlockedBox.classList.add('hidden');
    if (lockedBox) lockedBox.classList.remove('hidden');
    if (iframe) iframe.src = 'about:blank';
  }

  lucide.createIcons();
}

function copyHWIDFromDashboard() {
  const hwid = currentLicense?.hwid || document.getElementById('vip-user-hwid')?.innerText || '';
  if (!hwid || hwid.includes('YÜKLENİYOR')) {
    showToast('HWID henüz alınamadı', 'error');
    return;
  }
  navigator.clipboard.writeText(hwid).then(() => {
    showToast('📋 HWID panonuza kopyalandı! Tolga Yasin (@roxen) ile paylaşabilirsiniz.', 'success');
  }).catch(() => {
    showToast('HWID: ' + hwid, 'info');
  });
}

async function launchNativeViewerBot() {
  if (!currentLicense || !currentLicense.isVipPro) {
    showToast('Bu özellik VIP PRO lisans gerektirir.', 'error');
    return;
  }
  showToast('botkick.py masaüstü penceresi başlatılıyor...', 'info');
  try {
    const res = await fetch('/api/viewer/launch_native_gui', { method: 'POST' }).then(r => r.json());
    if (res && res.ok) {
      showToast(res.message || 'Masaüstü penceresi başlatıldı!', 'success');
    } else {
      showToast('Başlatılamadı: ' + (res?.error || 'Hata'), 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}

// =================== DASHBOARD TOKEN YÖNETİMİ ===================
let currentDashboardTokenType = 'chat';

async function openTokenModalFromDashboard(type = 'chat') {
  if (!currentLicense || !currentLicense.isVipPro) {
    showToast('Bu özellik VIP PRO lisans gerektirir.', 'error');
    return;
  }
  const modal = document.getElementById('dashboard-token-modal');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons({ root: modal });
  }
  switchDashboardTokenType(type);
}

function closeDashboardTokenModal() {
  const modal = document.getElementById('dashboard-token-modal');
  if (modal) modal.classList.add('hidden');
}

async function switchDashboardTokenType(type = 'chat') {
  currentDashboardTokenType = type;
  const tabChat = document.getElementById('dash-tab-chat-btn');
  const tabFollow = document.getElementById('dash-tab-follow-btn');
  const label = document.getElementById('dash-token-label');
  const textarea = document.getElementById('dash-token-textarea');
  const badge = document.getElementById('dash-token-count-badge');
  const counter = document.getElementById('dash-token-counter');

  if (tabChat && tabFollow) {
    if (type === 'chat') {
      tabChat.className = 'flex-1 py-2 rounded-lg bg-kick text-black font-extrabold transition flex items-center justify-center gap-1.5';
      tabFollow.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5';
      if (label) label.innerText = 'Sohbet Tokenleri (chat_tokens.txt):';
    } else {
      tabFollow.className = 'flex-1 py-2 rounded-lg bg-kick text-black font-extrabold transition flex items-center justify-center gap-1.5';
      tabChat.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5';
      if (label) label.innerText = 'Takipçi Tokenleri (follow_tokens.txt):';
    }
    lucide.createIcons();
  }

  if (textarea) {
    textarea.value = 'Yükleniyor...';
    textarea.disabled = true;
  }

  try {
    const res = await fetch(`/api/viewer/get_tokens?token_type=${type}`).then(r => r.json());
    if (res && res.ok) {
      if (textarea) {
        textarea.value = res.content || '';
        textarea.disabled = false;
      }
      const count = res.count || 0;
      if (badge) badge.innerText = `${count} Token`;
      if (counter) counter.innerText = `${count} geçerli token`;
    } else {
      showToast('Tokenler okunamadı: ' + (res?.error || 'Hata'), 'error');
      if (textarea) textarea.disabled = false;
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
    if (textarea) textarea.disabled = false;
  }
}

async function saveDashboardTokens() {
  const textarea = document.getElementById('dash-token-textarea');
  const saveBtn = document.getElementById('dash-token-save-btn');
  if (!textarea) return;

  const content = textarea.value;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Kaydediliyor...';
    lucide.createIcons({ root: saveBtn });
  }

  try {
    const res = await fetch('/api/viewer/save_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_type: currentDashboardTokenType, content })
    }).then(r => r.json());

    if (res && res.ok) {
      showToast(`✅ ${res.message || 'Tokenler başarıyla kaydedildi!'} (${res.count} adet)`, 'success');
      const badge = document.getElementById('dash-token-count-badge');
      const counter = document.getElementById('dash-token-counter');
      if (badge) badge.innerText = `${res.count || 0} Token`;
      if (counter) counter.innerText = `${res.count || 0} geçerli token`;

      // İframe içindeki viewer paneli de anında yenilensin
      reloadViewerFrame();
      setTimeout(() => closeDashboardTokenModal(), 600);
    } else {
      showToast('Kaydetme hatası: ' + (res?.error || 'Hata'), 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save" class="w-3.5 h-3.5"></i> Tokenleri Kaydet';
      lucide.createIcons({ root: saveBtn });
    }
  }
}

async function pasteClipboardDashboardTokens() {
  const textarea = document.getElementById('dash-token-textarea');
  if (!textarea) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Panoda metin bulunamadı.', 'info');
      return;
    }
    if (textarea.value.trim()) {
      textarea.value += '\n' + text.trim();
    } else {
      textarea.value = text.trim();
    }
    showToast('📋 Tokenler panodan yapıştırıldı!', 'success');
  } catch (err) {
    showToast('Panoya erişilemedi: ' + err.message, 'error');
  }
}

function formatDashboardTokens() {
  const textarea = document.getElementById('dash-token-textarea');
  if (!textarea) return;
  const lines = textarea.value.split('\n');
  const formatted = lines.map(line => {
    let t = line.trim();
    if (!t || t.startsWith('#')) return t;
    if (!t.toLowerCase().startsWith('bearer ') && t.length > 15) {
      t = 'Bearer ' + t;
    }
    return t;
  }).filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));
  textarea.value = formatted.join('\n');
  showToast('🧹 Tokenler düzenlendi ve "Bearer" formatına getirildi!', 'info');
}

// =================== GEMINI AI CHAT & VOICE ENGINE ===================
let speechRecognition = null;
let isMicListening = false;
let currentGeminiConfig = {};

const GEMINI_PERSONALITY_PRESETS = {
  pro_gamer: "Sen Kick canlı yayınında yer alan profesyonel bir esporcu ve taktik ustası AI chat botusun. Yayıncının oynadığı oyunu (${kategori}) çok iyi bilir, oyundaki silahlar, haritalar, mekanikler ve pozisyonlar üzerine esprili, bilgili ve taktiksel yorumlar yaparsın. Maksimum 1-2 cümle, chat jargonuna (clutch, aim, rush, win, gg, wp, crosshair vb.) hakim ol.",
  troll_buddy: "Sen Kick yayınında chatte takılan esprili, trol ve samimi bir kankasın. Yayıncının hareketlerine, ölümlerine veya vuruşlarına makara yapar, chati güldürürsün. Samimi, neşeli ve komik ol. Maksimum 1-2 cümle konuş.",
  adana_ai: "Sen Adana şivesiyle konuşan delikanlı bir Kick chat botusun. 'Gardaşşş', 'kirvem', 'bak hele', 'dürüm', 'şalgam' kelimelerini doğal kullanırsın. Yayında oynanan oyuna ve yayıncının dediğine Adana ağzıyla esprili ve tatlı-sert tepkiler verirsin. Maksimum 1-2 cümle konuş.",
  helpful_mod: "Sen saygılı, kibar ve yayıncıya destek olan kıdemli bir moderatör botsun. Oyun hakkındaki soruları cevaplar, yayının akışını destekler ve chatte pozitif bir hava yaratırsın. Maksimum 1-2 cümle konuş."
};

async function loadGeminiConfig() {
  try {
    const res = await fetch('/api/gemini/config').then(r => r.json());
    if (res && res.success) {
      currentGeminiConfig = res.config || {};
      
      const toggle = document.getElementById('gemini-toggle-enabled');
      if (toggle) toggle.checked = Boolean(currentGeminiConfig.enabled);
      
      const statusText = document.getElementById('gemini-status-text');
      if (statusText) {
        statusText.innerText = currentGeminiConfig.enabled ? 'Aktif & Dinlemede' : 'Devre Dışı';
        statusText.className = currentGeminiConfig.enabled ? 'text-[11px] font-semibold text-emerald-400' : 'text-[11px] font-semibold text-slate-500';
      }

      const apiKeyInput = document.getElementById('gemini-api-key');
      if (apiKeyInput) apiKeyInput.value = currentGeminiConfig.apiKey || '';

      const modelSelect = document.getElementById('gemini-model');
      if (modelSelect && currentGeminiConfig.model) modelSelect.value = currentGeminiConfig.model;

      const triggerSelect = document.getElementById('gemini-trigger-mode');
      if (triggerSelect && currentGeminiConfig.triggerMode) triggerSelect.value = currentGeminiConfig.triggerMode;

      const cooldownSelect = document.getElementById('gemini-cooldown');
      if (cooldownSelect && currentGeminiConfig.cooldownSeconds) cooldownSelect.value = String(currentGeminiConfig.cooldownSeconds);

      const chanceSelect = document.getElementById('gemini-chance');
      if (chanceSelect && currentGeminiConfig.replyChance) chanceSelect.value = String(currentGeminiConfig.replyChance);

      const sendToKickCheck = document.getElementById('gemini-send-to-kick');
      if (sendToKickCheck) sendToKickCheck.checked = currentGeminiConfig.sendToKickChat !== false;

      const wakeWordCheck = document.getElementById('gemini-mic-wakeword-toggle');
      if (wakeWordCheck) wakeWordCheck.checked = currentGeminiConfig.wakeWordOnly !== false;

      const personalityText = document.getElementById('gemini-personality-text');
      if (personalityText) personalityText.value = currentGeminiConfig.personality || '';

      // Canlı yayın bağlamı güncelleme
      const sc = res.streamContext || {};
      const catEl = document.getElementById('gemini-current-category');
      if (catEl) catEl.innerText = sc.category || 'Genel / Belirtilmemiş';

      const titleEl = document.getElementById('gemini-current-title');
      if (titleEl) titleEl.innerText = sc.title || 'Canlı Yayın';

      const repliesEl = document.getElementById('gemini-stat-replies');
      if (repliesEl && res.totalReplies !== undefined) repliesEl.innerText = `${res.totalReplies} Mesaj`;

      if (res.lastDetectedSpeech) {
        const lastSp = document.getElementById('gemini-last-speech-text');
        if (lastSp) lastSp.innerText = `"${res.lastDetectedSpeech}"`;
      }
      if (res.lastAiResponse) {
        const lastRep = document.getElementById('gemini-last-reply-text');
        if (lastRep) lastRep.innerText = `"${res.lastAiResponse}"`;
      }
    }
  } catch (err) {
    console.error('[Gemini Load Error]:', err);
  }
}

async function saveGeminiConfig() {
  const enabled = document.getElementById('gemini-toggle-enabled')?.checked ?? true;
  const apiKey = document.getElementById('gemini-api-key')?.value?.trim() || '';
  const model = document.getElementById('gemini-model')?.value || 'gemini-1.5-flash';
  const triggerMode = document.getElementById('gemini-trigger-mode')?.value || 'hybrid';
  const cooldownSeconds = parseInt(document.getElementById('gemini-cooldown')?.value, 10) || 8;
  const replyChance = parseInt(document.getElementById('gemini-chance')?.value, 10) || 85;
  const sendToKickChat = document.getElementById('gemini-send-to-kick')?.checked ?? true;
  const wakeWordOnly = document.getElementById('gemini-mic-wakeword-toggle')?.checked ?? true;
  const personality = document.getElementById('gemini-personality-text')?.value || '';

  const payload = {
    enabled,
    apiKey,
    model,
    triggerMode,
    cooldownSeconds,
    replyChance,
    sendToKickChat,
    wakeWordOnly,
    personality
  };

  try {
    const res = await fetch('/api/gemini/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    if (res && res.success) {
      showToast('✅ Gemini AI ayarları başarıyla kaydedildi!', 'success');
      currentGeminiConfig = res.config;
      const statusText = document.getElementById('gemini-status-text');
      if (statusText) {
        statusText.innerText = enabled ? 'Aktif & Dinlemede' : 'Devre Dışı';
        statusText.className = enabled ? 'text-[11px] font-semibold text-emerald-400' : 'text-[11px] font-semibold text-slate-500';
      }
    } else {
      showToast('Kaydetme hatası: ' + (res?.error || 'Hata'), 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

async function fetchAvailableGeminiModels() {
  const apiKey = document.getElementById('gemini-api-key')?.value?.trim();
  if (!apiKey) {
    showToast('Lütfen önce API anahtarınızı girin.', 'error');
    return;
  }
  showToast('Google AI Studio modelleri sorgulanıyor...', 'info');
  try {
    const res = await fetch(`/api/gemini/models?apiKey=${encodeURIComponent(apiKey)}`).then(r => r.json());
    if (res && res.success && Array.isArray(res.models) && res.models.length > 0) {
      const select = document.getElementById('gemini-model');
      if (select) {
        const currentVal = select.value;
        select.innerHTML = '';
        res.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          const icon = m.id.includes('flash') ? '⚡' : (m.id.includes('pro') ? '🧠' : '🤖');
          opt.textContent = `${icon} ${m.displayName || m.id} (${m.version})`;
          select.appendChild(opt);
        });
        if (res.models.some(m => m.id === currentVal)) {
          select.value = currentVal;
        } else if (res.models.length > 0) {
          const flash = res.models.find(m => m.id.includes('flash'));
          select.value = flash ? flash.id : res.models[0].id;
        }
      }
      showToast(`${res.models.length} adet Gemini modeli başarıyla listelendi!`, 'success');
      saveGeminiConfig();
    } else {
      showToast(res?.error || 'Kullanılabilir model bulunamadı.', 'error');
    }
  } catch (err) {
    showToast('Model sorgulama hatası: ' + err.message, 'error');
  }
}

async function testGeminiApiKey() {
  const apiKey = document.getElementById('gemini-api-key')?.value?.trim();
  const model = document.getElementById('gemini-model')?.value || 'gemini-1.5-flash';
  const testBtn = document.getElementById('gemini-test-btn');
  const resultBox = document.getElementById('gemini-test-result');

  if (!apiKey) {
    showToast('Lütfen test etmeden önce bir Gemini API Key girin.', 'error');
    return;
  }

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Test ediliyor...';
    lucide.createIcons({ root: testBtn });
  }

  try {
    const res = await fetch('/api/gemini/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model })
    }).then(r => r.json());

    if (resultBox) {
      resultBox.classList.remove('hidden');
      if (res && res.success) {
        resultBox.className = 'text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 block space-y-1';
        const modelBadge = res.workingModel ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-[11px] font-mono text-emerald-300 ml-1 font-bold">${res.workingModel} (${res.workingVersion || 'v1'})</span>` : '';
        resultBox.innerHTML = `<div><strong>✅ Başarılı!</strong> Google Gemini API bağlantısı kuruldu.${modelBadge}</div><div class="text-slate-300 italic">"AI Cevabı: ${res.reply}"</div>`;
        showToast('Google Gemini API başarıyla bağlandı!', 'success');

        // Otomatik algılanan çalışan modeli dropdown'da güncelle
        if (res.workingModel) {
          const select = document.getElementById('gemini-model');
          if (select) {
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].value === res.workingModel) {
                select.selectedIndex = i;
                found = true;
                break;
              }
            }
            if (!found) {
              const opt = document.createElement('option');
              opt.value = res.workingModel;
              opt.textContent = `⚡ ${res.workingModel} (${res.workingVersion || 'v1'})`;
              select.appendChild(opt);
              select.value = res.workingModel;
            }
          }
        }

        // Eğer mevcut modeller listesi geldiyse ve dropdown az seçenekliyse güncelle
        if (Array.isArray(res.availableModels) && res.availableModels.length > 0) {
          const select = document.getElementById('gemini-model');
          if (select && select.options.length <= 4) {
            select.innerHTML = '';
            res.availableModels.forEach(m => {
              const opt = document.createElement('option');
              opt.value = m.id;
              const icon = m.id.includes('flash') ? '⚡' : (m.id.includes('pro') ? '🧠' : '🤖');
              opt.textContent = `${icon} ${m.displayName || m.id} (${m.version})`;
              select.appendChild(opt);
            });
            if (res.workingModel) select.value = res.workingModel;
          }
        }

        saveGeminiConfig();
      } else {
        resultBox.className = 'text-xs p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 block';
        resultBox.innerHTML = `<strong>❌ API Hatası:</strong> ${res?.error || 'Bilinmeyen hata'}`;
        showToast('Gemini API Hatası: ' + (res?.error || 'Bağlanılamadı'), 'error');
      }
    }
  } catch (err) {
    showToast('Test hatası: ' + err.message, 'error');
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i data-lucide="zap" class="w-3.5 h-3.5 text-purple-400"></i> API Bağlantısını Test Et';
      lucide.createIcons({ root: testBtn });
    }
  }
}

function toggleGeminiKeyVisibility() {
  const input = document.getElementById('gemini-api-key');
  const eye = document.getElementById('gemini-key-eye');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (eye) eye.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    if (eye) eye.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

function setGeminiPersonalityPreset(presetKey) {
  const prompt = GEMINI_PERSONALITY_PRESETS[presetKey];
  const textarea = document.getElementById('gemini-personality-text');
  if (textarea && prompt) {
    textarea.value = prompt;
    showToast(`🎭 "${presetKey}" şablonu yüklendi!`, 'info');
    saveGeminiConfig();
  }
}

// 🎙️ Web Speech API (Mikrofon Dinleme)
function toggleStreamerMicrophone() {
  if (isMicListening) {
    stopStreamerMicrophone();
  } else {
    startStreamerMicrophone();
  }
}

function startStreamerMicrophone() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Tarayıcınız Web Speech API desteklemiyor. Lütfen Google Chrome veya Microsoft Edge kullanın.', 'error');
    return;
  }

  try {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'tr-TR';

    speechRecognition.onstart = () => {
      isMicListening = true;
      updateMicUI(true);
      showToast('🎙️ Yayıncı mikrofonu dinleniyor! Konuştuklarınız oyuna göre Gemini tarafından Kick chatine yazılacak.', 'success');
    };

    speechRecognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const interimBox = document.getElementById('gemini-live-interim');
      if (interimBox) {
        interimBox.innerText = interim || finalTranscript || 'Dinleniyor...';
      }

      if (finalTranscript && finalTranscript.trim().length > 2) {
        const spoken = finalTranscript.trim();
        const wakeWordEnabled = document.getElementById('gemini-mic-wakeword-toggle')?.checked ?? true;

        // Wake word kontrolü: "bot", "roxen", "roxenbot", "roksın", "hey bot", "bot burda mısın"
        const wakeRegex = /\b(bot|roxen|roxenbot|roks[ıi]n|roksen|hey\s*bot)\b/i;
        const hasWakeWord = wakeRegex.test(spoken);

        if (wakeWordEnabled && !hasWakeWord) {
          if (interimBox) {
            interimBox.innerHTML = `<span class="text-slate-400">🎙️ Konuşma algılandı ("${spoken}"), <em>"Bot ..."</em> seslenmesi bekleniyor.</span>`;
          }
          return;
        }

        const lastSp = document.getElementById('gemini-last-speech-text');
        if (lastSp) lastSp.innerText = `"${spoken}"`;

        if (interimBox) {
          interimBox.innerHTML = `<span class="text-emerald-400 font-bold">🎯 "Bot" seslenmesi algılandı! Gemini yanıt üretiyor... ("${spoken}")</span>`;
        }

        // Sunucuya gönder -> Gemini algılasın ve Kick chatine yazsın
        sendStreamerSpeechToServer(spoken);
      }
    };

    speechRecognition.onerror = (event) => {
      console.warn('[Speech Recognition Error]:', event.error);
      if (event.error === 'not-allowed') {
        showToast('Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofona izin verin.', 'error');
        stopStreamerMicrophone();
      }
    };

    speechRecognition.onend = () => {
      if (isMicListening) {
        try {
          speechRecognition.start();
        } catch (e) {}
      }
    };

    speechRecognition.start();
  } catch (err) {
    showToast('Mikrofon başlatılamadı: ' + err.message, 'error');
  }
}

function stopStreamerMicrophone() {
  isMicListening = false;
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch (e) {}
    speechRecognition = null;
  }
  updateMicUI(false);
  showToast('Mikrofon dinleme durduruldu.', 'info');
}

function updateMicUI(listening) {
  const btnText = document.getElementById('gemini-mic-btn-text');
  const btn = document.getElementById('gemini-mic-toggle-btn');
  const activeBox = document.getElementById('gemini-mic-active-box');
  const badge = document.getElementById('gemini-mic-badge');

  if (listening) {
    if (btnText) btnText.innerText = 'Dinlemeyi Durdur';
    if (btn) btn.className = 'px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-red-600/25';
    if (activeBox) activeBox.classList.remove('hidden');
    if (badge) {
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> <span class="text-red-400">Canlı Dinlemede</span>';
    }
  } else {
    if (btnText) btnText.innerText = 'Mikrofonu Başlat';
    if (btn) btn.className = 'px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-purple-600/25';
    if (activeBox) activeBox.classList.add('hidden');
    if (badge) {
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> <span class="text-slate-400">Pasif (Başlatılmadı)</span>';
    }
  }
  lucide.createIcons();
}

async function sendStreamerSpeechToServer(text) {
  try {
    const res = await fetch('/api/gemini/voice-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).then(r => r.json());

    if (res && res.ok && res.reply) {
      addGeminiLog(res);
      const lastRep = document.getElementById('gemini-last-reply-text');
      if (lastRep) lastRep.innerText = `"${res.reply}"`;
    }
  } catch (err) {
    console.error('[Send Speech Error]:', err);
  }
}

async function simulateStreamerSpeech() {
  const input = document.getElementById('gemini-sim-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    showToast('Lütfen test edilecek bir yayıncı cümlesi yazın.', 'info');
    return;
  }

  showToast('Gemini yanıtı oluşturuluyor...', 'info');
  try {
    const res = await fetch('/api/gemini/simulate-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).then(r => r.json());

    if (res && res.ok && res.reply) {
      showToast(`🤖 Gemini: "${res.reply}"`, 'success');
      addGeminiLog(res);
      const lastSp = document.getElementById('gemini-last-speech-text');
      if (lastSp) lastSp.innerText = `"${text}"`;
      const lastRep = document.getElementById('gemini-last-reply-text');
      if (lastRep) lastRep.innerText = `"${res.reply}"`;
      input.value = '';
    } else {
      showToast('Gemini yanıt veremedi: ' + (res?.error || 'Hata'), 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}

function addGeminiLog(data) {
  const container = document.getElementById('gemini-log-stream');
  if (!container) return;

  if (container.querySelector('.text-slate-500')) {
    container.innerHTML = '';
  }

  const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString();
  const isVoice = Boolean(data.isVoice);
  const tagColor = isVoice ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  const tagText = isVoice ? '🎙️ Yayıncı Sesi' : (data.username ? `@${data.username} Soru` : '💬 Chat');

  const card = document.createElement('div');
  card.className = 'p-3 rounded-xl bg-panel-bg border border-panel-border space-y-1.5 transition animate-fade-in';
  card.innerHTML = `
    <div class="flex items-center justify-between text-[10px]">
      <div class="flex items-center gap-1.5">
        <span class="px-2 py-0.5 rounded font-bold border ${tagColor}">${tagText}</span>
        <span class="px-2 py-0.5 rounded font-bold bg-purple-500/15 text-purple-300 border border-purple-500/25">🎮 ${data.category || 'Oyun'}</span>
      </div>
      <span class="text-slate-400 font-mono">${timeStr}</span>
    </div>
    <div class="text-slate-300 text-xs">
      <span class="text-slate-400">Algılanan:</span> "${data.triggerText || ''}"
    </div>
    <div class="text-purple-200 text-xs font-semibold flex items-start gap-1">
      <span class="text-kick font-bold">🤖 Kick Chat:</span>
      <span>${data.reply || ''}</span>
    </div>
  `;

  container.prepend(card);
}

function clearGeminiLogs() {
  const container = document.getElementById('gemini-log-stream');
  if (container) {
    container.innerHTML = '<div class="text-center py-10 text-slate-500 text-xs font-sans">Günlük temizlendi.</div>';
  }
}

// =================== ŞARKI İSTEK (SONG REQUEST) YÖNETİMİ ===================
let currentSongData = { queue: [], currentSong: null, enabled: true };

async function loadSongRequestData() {
  try {
    const res = await fetch('/api/song-request').then(r => r.json());
    if (res.success && res.songRequest) {
      renderSongData(res.songRequest);
    }
  } catch (err) {
    console.error('[SongRequest] Veri yükleme hatası:', err);
  }
}

function renderSongData(sr) {
  currentSongData = sr || { queue: [], currentSong: null };

  const currentTitleEl = document.getElementById('sr-current-title');
  const currentUserEl = document.getElementById('sr-current-user');
  const currentTimeEl = document.getElementById('sr-current-time');
  const badgeEl = document.getElementById('song-active-badge');

  if (currentSongData.currentSong) {
    if (currentTitleEl) currentTitleEl.innerText = currentSongData.currentSong.title;
    if (currentUserEl) currentUserEl.innerText = '@' + (currentSongData.currentSong.requestedBy || 'Yayıncı');
    if (currentTimeEl) currentTimeEl.innerText = currentSongData.currentSong.time || '';
    if (badgeEl) {
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      badgeEl.innerText = 'Çalıyor';
    }
  } else {
    if (currentTitleEl) currentTitleEl.innerText = 'Şu an çalan parça yok';
    if (currentUserEl) currentUserEl.innerText = '-';
    if (currentTimeEl) currentTimeEl.innerText = '--:--';
    if (badgeEl) {
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider bg-slate-800 text-slate-400';
      badgeEl.innerText = 'Boşta';
    }
  }

  const queueCountEl = document.getElementById('sr-queue-count');
  if (queueCountEl) queueCountEl.innerText = (currentSongData.queue || []).length;

  const tbody = document.getElementById('sr-queue-table-body');
  if (!tbody) return;

  if (!currentSongData.queue || currentSongData.queue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">Henüz sırada bekleyen şarkı yok. !sr yazarak ekleyebilirsiniz.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentSongData.queue.map((song, idx) => `
    <tr class="hover:bg-panel-bg/40 transition">
      <td class="py-3 font-mono font-bold text-kick">${idx + 1}</td>
      <td class="py-3 font-bold text-white max-w-[200px] truncate">${escapeHtml(song.title)}</td>
      <td class="py-3 text-slate-300">@${escapeHtml(song.requestedBy)}</td>
      <td class="py-3 text-slate-500 font-mono text-[11px]">${escapeHtml(song.time || '')}</td>
      <td class="py-3 text-right">
        <button onclick="removeSongFromQueue('${song.id}')" class="p-1.5 rounded-lg bg-panel-card hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition" title="Kuyruktan Çıkar">
          <i data-lucide="trash" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

async function addManualSong() {
  const input = document.getElementById('sr-manual-input');
  const title = input ? input.value.trim() : '';
  if (!title) {
    showToast('Lütfen bir şarkı adı veya linki girin', 'error');
    return;
  }

  try {
    const res = await fetch('/api/song-request/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    }).then(r => r.json());

    if (res.success) {
      showToast('Şarkı sıraya eklendi!', 'success');
      input.value = '';
      renderSongData(res.songRequest);
    } else {
      showToast(res.error || 'Şarkı eklenemedi', 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

async function playNextSong() {
  try {
    const res = await fetch('/api/song-request/play-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());

    if (res.success) {
      if (res.currentSong) {
        showToast(`Sıradaki parça çalıyor: ${res.currentSong.title}`, 'success');
      } else {
        showToast('Sırada başka parça kalmadı', 'info');
      }
      renderSongData(res.songRequest);
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}

async function clearSongQueue() {
  if (!confirm('Tüm şarkı sırasını temizlemek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/song-request/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());

    if (res.success) {
      showToast('Şarkı sırası temizlendi!', 'success');
      renderSongData(res.songRequest);
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}

async function removeSongFromQueue(id) {
  try {
    const res = await fetch('/api/song-request/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).then(r => r.json());

    if (res.success) {
      showToast('Şarkı kuyruktan kaldırıldı', 'success');
      renderSongData(res.songRequest);
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}

async function testSongWidget() {
  try {
    const res = await fetch('/api/test/song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Müslüm Gürses - Affet', requestedBy: 'RoxenFan01' })
    }).then(r => r.json());

    if (res.success) {
      showToast('OBS Müzik Bannerına test şarkısı gönderildi!', 'success');
    }
  } catch (err) {
    showToast('Test hatası: ' + err.message, 'error');
  }
}

// =================== VIP MODAL & LİSANS REDEEM ===================
function openVipModal() {
  const modal = document.getElementById('vip-upgrade-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const input = document.getElementById('modal-vip-code');
    if (input) {
      input.value = '';
      input.focus();
    }
    const statusEl = document.getElementById('modal-vip-status');
    if (statusEl) statusEl.classList.add('hidden');
  }
}

function closeVipModal() {
  const modal = document.getElementById('vip-upgrade-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitVipCode() {
  const input = document.getElementById('modal-vip-code');
  const code = input ? input.value.trim() : '';
  const statusEl = document.getElementById('modal-vip-status');
  const btn = document.getElementById('btn-submit-vip');

  if (!code) {
    if (statusEl) {
      statusEl.className = 'p-3 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30';
      statusEl.innerText = 'Lütfen geçerli bir lisans veya promosyon kodu giriniz.';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Doğrulanıyor...';
  }

  try {
    const res = await fetch('/api/license/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    }).then(r => r.json());

    if (res.success) {
      if (statusEl) {
        statusEl.className = 'p-3 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        statusEl.innerText = res.message || 'Tebrikler! VIP PRO lisansınız aktif edildi!';
        statusEl.classList.remove('hidden');
      }
      showToast('👑 VIP PRO Üyeliğiniz Aktif Edildi!', 'success');
      setTimeout(() => {
        closeVipModal();
        window.location.reload();
      }, 1500);
    } else {
      if (statusEl) {
        statusEl.className = 'p-3 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30';
        statusEl.innerText = res.error || 'Lisans doğrulanamadı.';
        statusEl.classList.remove('hidden');
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'p-3 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30';
      statusEl.innerText = 'Bağlantı hatası: ' + err.message;
      statusEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Lisansı Aktifleştir';
      lucide.createIcons();
    }
  }
}
