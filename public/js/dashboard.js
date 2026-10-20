let currentUser = null;
let currentBotRunning = false;
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  try {
    const res = await fetch('/api/auth/me').then(r => r.json());
    if (!res || !res.success) {
      window.location.href = '/login.html';
      return;
    }

    currentUser = res.user;
    currentBotRunning = Boolean(res.botRunning);

    renderUserProfile();
    renderChannelSettings();
    renderCustomBotSection();
    renderWidgetLinks();
    renderGeminiSection();
    renderCommandsList();
    updateBotStatusUI(currentBotRunning);

    if (res.isAdmin) {
      const adminBtn = document.getElementById('btn-admin-portal');
      if (adminBtn) adminBtn.classList.remove('hidden');
    }

    // Socket.IO bağlantısı
    socket = io();
    socket.emit('join_dashboard', currentUser.id);

    socket.on('subscription_updated', (sub) => {
      currentUser.subscription = sub;
      renderUserProfile();
      renderCustomBotSection();
      showToast('🎉 Tebrikler! VIP PRO üyeliğiniz aktif edildi!', 'success');
    });

  } catch (err) {
    console.error('Init error:', err);
    window.location.href = '/login.html';
  }
}

function renderUserProfile() {
  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.innerText = currentUser.name;

  const avatarEl = document.getElementById('user-avatar-img');
  if (avatarEl && currentUser.avatar) avatarEl.src = currentUser.avatar;

  const isPro = currentUser.subscription?.plan === 'pro';
  const planBadge = document.getElementById('user-plan-badge');
  const statPlan = document.getElementById('stat-sub-plan');

  if (planBadge) {
    planBadge.innerText = isPro ? '⭐ VIP PRO ÜYE' : 'ÜCRETSİZ PLAN';
    planBadge.className = isPro ? 'text-[10px] font-black uppercase text-purple-400' : 'text-[10px] font-black uppercase text-slate-400';
  }

  if (statPlan) {
    statPlan.innerText = isPro ? '⭐ VIP PRO Planı' : 'Standart Ücretsiz';
    statPlan.className = isPro ? 'text-lg font-black text-purple-400' : 'text-lg font-black text-white';
  }

  const upgradeCard = document.getElementById('pro-upgrade-card');
  if (upgradeCard) {
    if (isPro) {
      upgradeCard.innerHTML = `
        <div class="flex items-center gap-2 text-kick text-xs font-black uppercase tracking-wider">
          <i data-lucide="check-circle" class="w-4 h-4"></i> VIP PRO Aktif
        </div>
        <p class="text-xs text-slate-300">Özel Bot Adı ve tüm PRO avantajlarınız sınırsız olarak tanımlanmıştır.</p>
      `;
      lucide.createIcons({ root: upgradeCard });
    }
  }
}

function renderChannelSettings() {
  const slugInput = document.getElementById('input-channel-slug');
  if (slugInput && currentUser.settings?.channelSlug) {
    slugInput.value = currentUser.settings.channelSlug;
  }
}

function renderCustomBotSection() {
  const isPro = currentUser.subscription?.plan === 'pro';
  const lockBanner = document.getElementById('custom-bot-locked-banner');
  const toggle = document.getElementById('toggle-custom-bot-active');
  const userIn = document.getElementById('input-custom-bot-username');
  const tokenIn = document.getElementById('input-custom-bot-token');
  const activeName = document.getElementById('display-active-bot-name');
  const typeBadge = document.getElementById('display-bot-type-badge');

  if (lockBanner) {
    lockBanner.style.display = 'none';
  }

  if (toggle) {
    toggle.disabled = false;
    toggle.checked = Boolean(currentUser.customBot?.enabled);
  }

  if (userIn) {
    userIn.disabled = false;
    userIn.value = currentUser.customBot?.botUsername || '';
  }

  if (tokenIn) {
    tokenIn.disabled = false;
    tokenIn.value = currentUser.customBot?.botToken || '';
  }

  if (activeName) {
    if (isPro && currentUser.customBot?.enabled && currentUser.customBot?.botUsername) {
      activeName.innerText = currentUser.customBot.botUsername + ' (Özel Bot)';
      activeName.className = 'font-mono text-purple-400 font-bold';
      if (typeBadge) {
        typeBadge.innerText = '⭐ VIP PRO';
        typeBadge.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30';
      }
    } else {
      activeName.innerText = 'RoxenBot (Standart)';
      activeName.className = 'font-mono text-kick font-bold';
      if (typeBadge) {
        typeBadge.innerText = 'Ücretsiz';
        typeBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-slate-400';
      }
    }
  }
}

function renderWidgetLinks() {
  const origin = window.location.origin;
  const token = currentUser.apiKey;

  const alertInput = document.getElementById('url-widget-alertbox');
  if (alertInput) alertInput.value = `${origin}/widget/alertbox?token=${token}`;

  const chatInput = document.getElementById('url-widget-chat');
  if (chatInput) chatInput.value = `${origin}/widget/chat?token=${token}`;

  const goalInput = document.getElementById('url-widget-goal');
  if (goalInput) goalInput.value = `${origin}/widget/goal?token=${token}`;
}

function renderGeminiSection() {
  const g = currentUser.geminiAI || {};
  const toggle = document.getElementById('toggle-gemini-enabled');
  if (toggle) toggle.checked = Boolean(g.enabled);

  const keyIn = document.getElementById('input-gemini-key');
  if (keyIn) keyIn.value = g.apiKey || '';

  const modelSel = document.getElementById('select-gemini-model');
  if (modelSel && g.model) modelSel.value = g.model;

  const promptText = document.getElementById('textarea-gemini-personality');
  if (promptText && g.personality) promptText.value = g.personality;
}

function renderCommandsList() {
  const container = document.getElementById('commands-list-container');
  if (!container) return;

  const cmds = currentUser.commands || [];
  if (cmds.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-500">Henüz komut eklenmemiş. Yukarıdaki "Komut Ekle" butonuna basın.</div>`;
    return;
  }

  container.innerHTML = '';
  cmds.forEach((c, idx) => {
    const item = document.createElement('div');
    item.className = 'p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs';
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-mono font-bold">!${c.name}</span>
        <span class="text-slate-300 truncate max-w-xs sm:max-w-md">${c.response}</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="deleteCommand(${idx})" class="text-slate-500 hover:text-red-400 transition p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    `;
    container.appendChild(item);
  });
  lucide.createIcons({ root: container });
}

// =================== EYLEMLER ===================

async function saveChannelSettings() {
  const slug = document.getElementById('input-channel-slug')?.value?.trim();
  if (!slug) {
    showToast('Lütfen geçerli bir Kick kanal adı girin.', 'error');
    return;
  }

  const res = await fetch('/api/user/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelSlug: slug })
  }).then(r => r.json());

  if (res && res.success) {
    currentUser = res.user;
    showToast(`✅ Kick kanal adı '${slug}' olarak kaydedildi!`, 'success');
  }
}

async function saveCustomBotSettings() {
  const enabled = document.getElementById('toggle-custom-bot-active')?.checked ?? false;
  const botUsername = document.getElementById('input-custom-bot-username')?.value?.trim() || '';
  const botToken = document.getElementById('input-custom-bot-token')?.value?.trim() || '';

  const res = await fetch('/api/user/custom-bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, botUsername, botToken })
  }).then(r => r.json());

  if (res && res.success) {
    currentUser = res.user;
    renderCustomBotSection();
    showToast('✅ Özel bot ayarlarınız başarıyla güncellendi!', 'success');
  } else {
    showToast(res?.error || 'Hata oluştu.', 'error');
  }
}

async function saveGeminiSettings() {
  const enabled = document.getElementById('toggle-gemini-enabled')?.checked ?? true;
  const apiKey = document.getElementById('input-gemini-key')?.value?.trim() || '';
  const model = document.getElementById('select-gemini-model')?.value || 'gemini-2.5-flash';
  const personality = document.getElementById('textarea-gemini-personality')?.value?.trim() || '';

  const res = await fetch('/api/user/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, apiKey, model, personality })
  }).then(r => r.json());

  if (res && res.success) {
    showToast('✅ Gemini AI ayarları kaydedildi!', 'success');
  }
}

async function toggleBotExecution() {
  const btn = document.getElementById('btn-toggle-bot');
  const btnText = document.getElementById('btn-toggle-bot-text');

  if (currentBotRunning) {
    // Durdur
    const res = await fetch('/api/bot/stop', { method: 'POST' }).then(r => r.json());
    if (res && res.success) {
      currentBotRunning = false;
      updateBotStatusUI(false);
      showToast('Bot bağlantısı durduruldu.', 'info');
    }
  } else {
    // Başlat
    btn.disabled = true;
    btnText.innerText = 'Bağlanıyor...';
    const res = await fetch('/api/bot/start', { method: 'POST' }).then(r => r.json());
    btn.disabled = false;

    if (res && res.success) {
      currentBotRunning = true;
      updateBotStatusUI(true);
      showToast(`🟢 '${res.channelSlug}' kanalına başarıyla bağlandı!`, 'success');
    } else {
      showToast(res?.error || 'Kanal bağlantısı başarısız.', 'error');
      btnText.innerText = 'Botu Başlat';
    }
  }
}

function updateBotStatusUI(running) {
  const badgeDot = document.getElementById('header-status-dot');
  const badgeText = document.getElementById('header-status-text');
  const btn = document.getElementById('btn-toggle-bot');
  const btnText = document.getElementById('btn-toggle-bot-text');
  const wsStat = document.getElementById('stat-ws-status');

  if (running) {
    if (badgeDot) badgeDot.className = 'w-2 h-2 rounded-full bg-kick animate-ping';
    if (badgeText) { badgeText.innerText = 'Canlı & Yayında'; badgeText.className = 'text-kick'; }
    if (btn) btn.className = 'px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-red-600/20';
    if (btnText) btnText.innerText = 'Botu Durdur';
    if (wsStat) { wsStat.innerText = '🟢 Çevrimiçi'; wsStat.className = 'text-lg font-black text-kick'; }
  } else {
    if (badgeDot) badgeDot.className = 'w-2 h-2 rounded-full bg-slate-500';
    if (badgeText) { badgeText.innerText = 'Bot Kapalı'; badgeText.className = 'text-slate-400'; }
    if (btn) btn.className = 'px-6 py-2.5 rounded-xl bg-kick hover:bg-kick-hover text-black font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-kick/20';
    if (btnText) btnText.innerText = 'Botu Başlat';
    if (wsStat) { wsStat.innerText = 'Bağlı Değil'; wsStat.className = 'text-lg font-black text-slate-400'; }
  }
  lucide.createIcons();
}

async function simulateUpgradeToPro() {
  const res = await fetch('/api/payment/simulate-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'monthly' })
  }).then(r => r.json());

  if (res && res.success) {
    currentUser = res.user;
    renderUserProfile();
    renderCustomBotSection();
    showToast(res.message, 'success');
  }
}

function copyWidgetUrl(type) {
  const input = document.getElementById(`url-widget-${type}`);
  if (input) {
    navigator.clipboard.writeText(input.value);
    showToast(`📋 ${type.toUpperCase()} OBS linki panoya kopyalandı!`, 'success');
  }
}

function switchTab(tabId) {
  document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const activePane = document.getElementById(`pane-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activePane) activePane.classList.remove('hidden');
  if (activeBtn) activeBtn.classList.add('active');
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

function showToast(msg, type = 'info') {
  const box = document.getElementById('toast-box');
  if (!box) return;

  box.innerText = msg;
  box.className = `fixed bottom-6 right-6 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-none px-5 py-3 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2.5 ${
    type === 'success' ? 'bg-kick text-black' : (type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white')
  }`;

  setTimeout(() => {
    box.className = 'fixed bottom-6 right-6 z-50 transform translate-y-20 opacity-0 transition-all duration-300 pointer-events-none px-5 py-3 rounded-2xl text-xs font-bold shadow-2xl';
  }, 3500);
}
