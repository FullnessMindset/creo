// CREO Platform — Shared utilities
const SUPABASE_URL = "https://qddxoyjtoxtdcezwuvcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZHhveWp0b3h0ZGNlend1dmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUxNDIsImV4cCI6MjA5Nzk5MTE0Mn0.MEaMfib77T0B7HW-jI6nctc1a7WbIf1n7rKBhdc-Gm8";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Theme — light only
function initTheme() { document.documentElement.classList.remove('dark'); }
function toggleTheme() {}
function updateThemeIcons() {}

// HTML escape
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// Video embed helpers
function extractVideoId(url, type) {
  if (type === 'youtube') {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  if (type === 'tiktok') {
    const m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

function detectVideoType(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  if (/instagram\.com/.test(url)) return 'instagram';
  return 'direct';
}

function getEmbedHTML(url, type, aspectClass) {
  const cls = aspectClass || 'aspect-[9/16]';
  if (type === 'youtube') {
    const id = extractVideoId(url, 'youtube');
    if (!id) return `<div class="w-full ${cls} bg-gray-800 flex items-center justify-center text-gray-400">Invalid YouTube URL</div>`;
    return `<iframe src="https://www.youtube.com/embed/${id}?autoplay=0&rel=0" class="w-full ${cls} rounded-xl" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (type === 'tiktok') {
    const id = extractVideoId(url, 'tiktok');
    if (!id) return `<div class="w-full ${cls} bg-gray-800 flex items-center justify-center text-gray-400">Invalid TikTok URL</div>`;
    return `<iframe src="https://www.tiktok.com/embed/v2/${id}" class="w-full ${cls} rounded-xl" frameborder="0" allowfullscreen></iframe>`;
  }
  if (type === 'instagram') {
    return `<iframe src="${url.replace(/\/$/, '')}/embed" class="w-full ${cls} rounded-xl" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<video src="${esc(url)}" class="w-full ${cls} rounded-xl object-cover" controls></video>`;
}

// Toast notifications
function showToast(message, type) {
  const existing = document.getElementById('creo-toast');
  if (existing) existing.remove();
  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-creo-purple'
  };
  const toast = document.createElement('div');
  toast.id = 'creo-toast';
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-xl transition-all duration-300 ${colors[type] || colors.info}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Bottom Navigation
function renderBottomNav(activePage) {
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav';
  nav.className = 'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-2 pb-[env(safe-area-inset-bottom)] transition-colors';
  const items = [
    { id: 'feed', label: 'Creadores', href: 'feed.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
    { id: 'explore', label: 'Explorar', href: 'explore.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>' },
    { id: 'post', label: 'Publicar', href: 'index.html#post', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>', authOnly: true },
    { id: 'profile', label: 'Perfil', href: 'index.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
    { id: 'dashboard', label: 'Panel', href: 'index.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>', authOnly: true }
  ];
  const inner = document.createElement('div');
  inner.className = 'max-w-lg mx-auto flex justify-around items-center h-14';
  items.forEach(item => {
    const a = document.createElement('a');
    a.href = item.href;
    if (item.authOnly) a.setAttribute('data-auth-only', 'true');
    const isActive = activePage === item.id;
    a.className = `flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors ${isActive ? 'text-creo-purple' : 'text-gray-400 hover:text-gray-600'}`;
    a.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg><span class="text-[10px] font-medium">${item.label}</span>`;
    inner.appendChild(a);
  });
  nav.appendChild(inner);
  document.body.appendChild(nav);
  document.body.style.paddingBottom = '4rem';
}

async function updateNavAuth() {
  const { data: { user } } = await sb.auth.getUser();
  document.querySelectorAll('[data-auth-only]').forEach(el => {
    el.style.display = user ? '' : 'none';
  });
  if (user) {
    const { data } = await sb.from('profiles').select('username').eq('id', user.id).single();
    const profileLink = document.querySelector('#bottom-nav a[href="index.html"]:first-of-type');
    if (data && data.username) {
      const perfil = document.querySelector('#bottom-nav a:nth-child(4)');
      if (perfil) perfil.href = 'profile.html?u=' + data.username;
    }
  }
}

// Notifications
async function loadNotificationBell() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
  const existing = document.getElementById('notif-bell');
  if (existing) existing.remove();
  const bell = document.createElement('div');
  bell.id = 'notif-bell';
  bell.className = 'fixed top-3 right-14 z-[60] cursor-pointer';
  bell.onclick = () => toggleNotifPanel();
  bell.innerHTML = `<div class="relative p-2"><svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>${count > 0 ? `<span class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">${count > 9 ? '9+' : count}</span>` : ''}</div>`;
  document.body.appendChild(bell);
}

async function toggleNotifPanel() {
  let panel = document.getElementById('notif-panel');
  if (panel) { panel.remove(); return; }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data } = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'fixed top-12 right-4 z-[60] w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl';
  if (!data || data.length === 0) {
    panel.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">Sin notificaciones</p>';
  } else {
    const icons = { like: '❤️', comment: '💬', payment: '💰', approval: '✅', rejection: '❌' };
    panel.innerHTML = `<div class="p-3 border-b border-gray-200 flex justify-between items-center"><span class="font-bold text-sm">Notificaciones</span><button onclick="markAllRead()" class="text-xs text-creo-mint hover:underline">Marcar leídas</button></div>` +
      data.map(n => `<div class="px-3 py-2.5 border-b border-gray-100 ${n.is_read ? 'opacity-60' : ''} hover:bg-gray-50 transition"><div class="flex gap-2"><span>${icons[n.type] || '🔔'}</span><div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-900">${esc(n.title)}</p>${n.body ? `<p class="text-xs text-gray-500 truncate">${esc(n.body)}</p>` : ''}<p class="text-[10px] text-gray-400 mt-0.5">${new Date(n.created_at).toLocaleDateString()}</p></div></div></div>`).join('');
  }
  document.body.appendChild(panel);
  document.addEventListener('click', closeNotifOnClickOutside);
  await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  loadNotificationBell();
}

function closeNotifOnClickOutside(e) {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel && !panel.contains(e.target) && !bell.contains(e.target)) {
    panel.remove();
    document.removeEventListener('click', closeNotifOnClickOutside);
  }
}

async function markAllRead() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id);
  loadNotificationBell();
  const panel = document.getElementById('notif-panel');
  if (panel) panel.remove();
  showToast('Notificaciones marcadas como leídas', 'success');
}

initTheme();
