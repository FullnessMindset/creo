// CREO Platform — Shared utilities
const SUPABASE_URL = "https://qddxoyjtoxtdcezwuvcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZHhveWp0b3h0ZGNlend1dmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUxNDIsImV4cCI6MjA5Nzk5MTE0Mn0.MEaMfib77T0B7HW-jI6nctc1a7WbIf1n7rKBhdc-Gm8";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_EMAIL = 'fullnessmindset@gmail.com';

function isAdmin(email) { return email === ADMIN_EMAIL; }
function isPlatformCreator(email) { return email === ADMIN_EMAIL; }

// ========== AUTHENTICATION ==========

async function handlePostLoginRedirect() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data: profile } = await sb.from('profiles')
    .select('display_name, bio, username')
    .eq('id', user.id).single();
  if (profile && profile.display_name && profile.bio && profile.username) {
    window.location.href = 'profile.html?u=' + encodeURIComponent(profile.username);
  } else {
    window.location.href = 'index.html';
  }
}

async function signInWithGoogle() {
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://fullnessmindset.github.io/creo/redirect.html'
      }
    });
    if (error) {
      showToast('Error: ' + error.message, 'error');
      console.error('Google sign-in error:', error);
    }
  } catch (err) {
    showToast('Error al conectar con Google', 'error');
    console.error(err);
  }
}

async function signIn() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  if (!email || !password) { showToast('Email y contraseña requeridos', 'error'); return; }
  showToast('Iniciando sesión...', 'info');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('Error: ' + error.message, 'error');
  } else {
    showToast('¡Bienvenido!', 'success');
    setTimeout(() => handlePostLoginRedirect(), 500);
  }
}

async function signUp() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const termsSection = document.getElementById('register-terms');
  if (!email || !password) { showToast('Email y contraseña requeridos', 'error'); return; }
  if (termsSection?.classList.contains('hidden')) { termsSection.classList.remove('hidden'); return; }
  const acceptedTerms = document.getElementById('accept-terms')?.checked;
  const acceptedConduct = document.getElementById('accept-conduct')?.checked;
  if (!acceptedTerms || !acceptedConduct) { showToast('Debes aceptar los términos y conducta', 'error'); return; }
  showToast('Creando cuenta...', 'info');
  const { data: { user }, error } = await sb.auth.signUp({ email, password });
  if (error) {
    showToast('Error: ' + error.message, 'error');
  } else if (user) {
    const accountType = document.getElementById('reg-account-type')?.value || 'creator';
    const language = document.getElementById('reg-language')?.value || 'es';
    await sb.from('profiles').insert([{
      id: user.id, email: email, account_type: accountType,
      language: language, created_at: new Date().toISOString()
    }]).catch(err => console.log('Profile creation note:', err));
    showToast('¡Cuenta creada! Verifica tu email', 'success');
    setTimeout(() => handlePostLoginRedirect(), 1500);
  }
}

async function signOut() {
  await sb.auth.signOut();
  showToast('Sesión cerrada', 'success');
  setTimeout(() => location.reload(), 500);
}

async function checkAuthAndRedirect() {
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('panel') === '1') return;
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes('index.html') || currentPath === '/' || currentPath.endsWith('/creo/');
    if (isAuthPage) { await handlePostLoginRedirect(); }
  }
}

// ========== THEME ==========
function initTheme() {
  applyTheme('light');
}
function isDark() { return document.documentElement.classList.contains('dark'); }
function applyTheme(t) {
  const dark = t === 'dark';
  if (dark) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('bg-gray-900', 'text-white');
    document.body.classList.remove('bg-gray-50', 'text-gray-900');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.add('bg-gray-50', 'text-gray-900');
    document.body.classList.remove('bg-gray-900', 'text-white');
  }
  localStorage.setItem('creo-theme', t);
  updateThemeIcons();
  applyThemeToFixedElements(dark);
}
function toggleTheme() {
  const current = localStorage.getItem('creo-theme') || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
}
function updateThemeIcons() {
  const dk = document.documentElement.classList.contains('dark');
  document.querySelectorAll('.theme-icon-sun').forEach(e => e.classList.toggle('hidden', dk));
  document.querySelectorAll('.theme-icon-moon').forEach(e => e.classList.toggle('hidden', !dk));
}
function applyThemeToFixedElements(dark) {
  const nav = document.getElementById('bottom-nav');
  if (nav) {
    if (dark) {
      nav.classList.remove('bg-white', 'border-gray-200');
      nav.classList.add('bg-gray-900', 'border-gray-700');
      nav.querySelectorAll('a').forEach(a => {
        if (!a.classList.contains('text-creo-purple') && !a.classList.contains('text-creo-mint')) {
          a.classList.remove('text-gray-400', 'hover:text-gray-600');
          a.classList.add('text-gray-500', 'hover:text-gray-300');
        }
      });
    } else {
      nav.classList.remove('bg-gray-900', 'border-gray-700');
      nav.classList.add('bg-white', 'border-gray-200');
      nav.querySelectorAll('a').forEach(a => {
        if (!a.classList.contains('text-creo-purple') && !a.classList.contains('text-creo-mint')) {
          a.classList.remove('text-gray-500', 'hover:text-gray-300');
          a.classList.add('text-gray-400', 'hover:text-gray-600');
        }
      });
    }
  }
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    if (dark) {
      themeBtn.style.background = 'rgba(45,27,105,0.7)';
      themeBtn.style.borderColor = 'rgba(255,255,255,0.15)';
    } else {
      themeBtn.style.background = '';
      themeBtn.style.borderColor = '';
    }
  }
  document.querySelectorAll('.dark-aware-header').forEach(h => {
    if (dark) {
      h.classList.remove('bg-white/90', 'border-gray-200');
      h.classList.add('bg-gray-900/90', 'border-gray-700');
    } else {
      h.classList.remove('bg-gray-900/90', 'border-gray-700');
      h.classList.add('bg-white/90', 'border-gray-200');
    }
  });
  document.querySelectorAll('.dark-aware-card').forEach(c => {
    if (dark) {
      c.classList.remove('bg-white', 'border-gray-200', 'border-gray-100');
      c.classList.add('bg-gray-800', 'border-gray-700');
    } else {
      c.classList.remove('bg-gray-800', 'border-gray-700');
      c.classList.add('bg-white', 'border-gray-200');
    }
  });
  document.querySelectorAll('.dark-aware-input').forEach(inp => {
    if (dark) {
      inp.classList.remove('bg-gray-50', 'bg-gray-100', 'border-gray-300', 'border-gray-200', 'text-gray-900', 'placeholder-gray-400');
      inp.classList.add('bg-gray-800', 'border-gray-600', 'text-white', 'placeholder-gray-500');
    } else {
      inp.classList.remove('bg-gray-800', 'border-gray-600', 'text-white', 'placeholder-gray-500');
      inp.classList.add('bg-gray-50', 'border-gray-300', 'text-gray-900', 'placeholder-gray-400');
    }
  });
  document.querySelectorAll('.dark-aware-glass').forEach(g => {
    if (dark) {
      g.style.background = 'rgba(26,10,62,0.6)';
      g.style.borderColor = 'rgba(255,255,255,0.15)';
    } else {
      g.style.background = 'rgba(255,255,255,0.7)';
      g.style.borderColor = 'rgba(255,255,255,0.3)';
    }
  });
}

// Generic file upload helper — returns public URL or null
async function uploadToStorage(file, bucket, maxMB) {
  if (!file) return null;
  if (file.size > (maxMB || 10) * 1024 * 1024) { showToast('Archivo max ' + (maxMB || 10) + 'MB', 'error'); return null; }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { showToast('Inicia sesión', 'error'); return null; }
  const ext = file.name.split('.').pop();
  const path = user.id + '/' + Date.now() + '.' + ext;
  showToast('Subiendo...', 'info');
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) { showToast('Error: ' + error.message, 'error'); return null; }
  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

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
    { id: 'profile', label: 'Perfil', href: 'profile.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
    { id: 'dashboard', label: 'Panel', href: 'index.html?panel=1', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>', authOnly: true }
  ];
  const inner = document.createElement('div');
  inner.className = 'max-w-2xl mx-auto flex justify-around items-center h-14';
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
    if (data && data.username) {
      const perfil = document.querySelector('#bottom-nav a[href="profile.html"]');
      if (perfil) perfil.href = 'profile.html?u=' + encodeURIComponent(data.username);
    }
    if (isAdmin(user.email)) {
      const nav = document.querySelector('#bottom-nav .max-w-2xl');
      if (nav) {
        const isAdminMode = sessionStorage.getItem('admin_mode') === 'true';
        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors ' + (isAdminMode ? 'text-creo-mint' : 'text-gray-400 hover:text-creo-purple');
        btn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span class="text-[10px] font-medium">Admin</span>';
        btn.onclick = (e) => {
          e.preventDefault();
          if (isAdminMode) {
            sessionStorage.removeItem('admin_mode');
            window.location.href = 'index.html';
          } else {
            sessionStorage.setItem('admin_mode', 'true');
            window.location.href = 'admin.html';
          }
        };
        nav.appendChild(btn);
      }
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
  const bellIcon = bell.querySelector('svg');
  if (bellIcon && isDark()) bellIcon.classList.replace('text-gray-500', 'text-gray-300');
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
  const dk = isDark();
  panel.className = 'fixed top-12 right-4 z-[60] w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl ' + (dk ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200');
  if (!data || data.length === 0) {
    panel.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">Sin notificaciones</p>';
  } else {
    const icons = { like: '❤️', comment: '💬', payment: '💰', approval: '✅', rejection: '❌', invite: '🤝', share: '🔗', meta_like: '❤️', meta_comment: '💬' };
    const actionLabels = { comment: 'Responder', meta_comment: 'Responder', invite: 'Ver invitación', like: 'Ver perfil', meta_like: 'Ver meta', payment: 'Ver detalles', share: 'Ver perfil' };
    const borderCls = dk ? 'border-gray-700' : 'border-gray-200';
    const borderItemCls = dk ? 'border-gray-700' : 'border-gray-100';
    const hoverCls = dk ? 'hover:bg-gray-700' : 'hover:bg-gray-50';
    const titleCls = dk ? 'text-white' : 'text-gray-900';
    const subtitleCls = dk ? 'text-gray-400' : 'text-gray-500';
    panel.innerHTML = `<div class="p-3 border-b ${borderCls} flex justify-between items-center"><span class="font-bold text-sm ${titleCls}">Notificaciones</span><button onclick="markAllRead()" class="text-xs text-creo-mint hover:underline">Marcar leídas</button></div>` +
      data.map(n => {
        const link = n.link || getNotifDefaultLink(n);
        const actionLabel = actionLabels[n.type] || 'Ver';
        return `<div class="px-3 py-2.5 border-b ${borderItemCls} ${n.is_read ? 'opacity-60' : ''} ${hoverCls} transition cursor-pointer" onclick="${link ? `window.location.href='${link}'` : ''}">
          <div class="flex gap-2">
            <span>${icons[n.type] || '🔔'}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium ${titleCls}">${esc(n.title)}</p>
              ${n.body ? `<p class="text-xs ${subtitleCls} truncate">${esc(n.body)}</p>` : ''}
              <div class="flex items-center justify-between mt-1">
                <p class="text-[10px] text-gray-400">${new Date(n.created_at).toLocaleDateString()}</p>
                ${link ? `<span class="text-[10px] text-creo-mint font-semibold">${actionLabel} →</span>` : ''}
              </div>
            </div>
          </div>
        </div>`;
      }).join('');
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

async function createNotification(targetUserId, type, title, body, link) {
  if (!targetUserId) return;
  const { data: { user } } = await sb.auth.getUser();
  if (user && user.id === targetUserId) return;
  await sb.from('notifications').insert([{ user_id: targetUserId, type, title, body, link: link || null }]);
}

function getNotifDefaultLink(n) {
  if (n.type === 'invite') return 'index.html#metas';
  if (n.type === 'comment' || n.type === 'meta_comment') return n.link || 'index.html';
  if (n.type === 'payment') return 'index.html#stripe';
  if (n.type === 'approval') return 'index.html#verify';
  if (n.type === 'rejection') return 'index.html#verify';
  return null;
}

// Emoji Picker
const EMOJI_CATEGORIES = {
  'Frecuentes': ['😀','😂','🥹','❤️','🔥','👏','🙌','💯','✨','🎉','👍','🙏','😍','🥰','😘','💪','🤝','💜','💚','🤩','😎','🫶','💕','🌟','⭐'],
  'Caras': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀'],
  'Gestos': ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪'],
  'Corazones': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝'],
  'Animales': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦆','🦉','🦋','🐛','🐝','🐞','🦀','🐙','🐚','🐬','🐳','🐊','🦕','🦖','🦈'],
  'Comida': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍕','🍔','🍟','🌭','🌮','🌯','🍿','🧁','🍰','🍩','🍪','🍫','🍬','☕','🍵','🧃','🍺','🍷','🥂','🍾'],
  'Objetos': ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🎮','🕹️','🎯','🎪','🎨','🎬','🎤','🎧','🎵','🎶','🎹','🥁','🎷','🎺','🎸','💻','📱','📸','🔑','💡','📚','✏️','📌','💰','💎','🏆','🥇','🎖️','🏅','🎗️']
};

function createEmojiPicker(inputId, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    let existing = document.getElementById('emoji-picker-panel');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'emoji-picker-panel';
    const epDk = isDark();
    panel.className = 'fixed z-[200] rounded-2xl shadow-2xl p-3 w-80 max-h-80 ' + (epDk ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200');
    const rect = btn.getBoundingClientRect();
    panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 330)) + 'px';
    let activeCategory = 'Frecuentes';
    function renderPicker() {
      const tabs = Object.keys(EMOJI_CATEGORIES).map(cat =>
        `<button class="px-2 py-1 text-xs rounded-lg whitespace-nowrap ${cat === activeCategory ? 'bg-creo-purple text-white' : 'text-gray-500 hover:bg-gray-100'}" data-cat="${cat}">${cat}</button>`
      ).join('');
      const emojis = EMOJI_CATEGORIES[activeCategory].map(e =>
        `<button class="w-9 h-9 text-xl hover:bg-gray-100 rounded-lg transition flex items-center justify-center emoji-pick" data-emoji="${e}">${e}</button>`
      ).join('');
      panel.innerHTML = `<div class="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-gray-100 emoji-tabs">${tabs}</div><div class="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">${emojis}</div>`;
    }
    renderPicker();
    panel.addEventListener('click', (ev) => {
      const catBtn = ev.target.closest('[data-cat]');
      if (catBtn) { activeCategory = catBtn.dataset.cat; renderPicker(); return; }
      const emojiBtn = ev.target.closest('[data-emoji]');
      if (emojiBtn) {
        const input = document.getElementById(inputId);
        if (input) {
          const start = input.selectionStart || input.value.length;
          input.value = input.value.slice(0, start) + emojiBtn.dataset.emoji + input.value.slice(input.selectionEnd || start);
          input.focus();
          input.selectionStart = input.selectionEnd = start + emojiBtn.dataset.emoji.length;
        }
      }
    });
    document.body.appendChild(panel);
    setTimeout(() => {
      const closePicker = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
          panel.remove(); document.removeEventListener('click', closePicker);
        }
      };
      document.addEventListener('click', closePicker);
    }, 10);
  };
}

function emojiButton(btnId) {
  return `<button type="button" id="${btnId}" class="p-1.5 text-gray-400 hover:text-yellow-500 transition rounded-lg hover:bg-gray-100" title="Emojis">😊</button>`;
}


// Cookie Consent Banner
function initCookieConsent() {
  if (localStorage.getItem('creo-cookies-accepted')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-consent';
  banner.className = 'fixed bottom-16 left-0 right-0 z-[80] px-4 pb-2';
  const ckDk = isDark();
  const ckBg = ckDk ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const ckTitle = ckDk ? 'text-white' : 'text-gray-900';
  const ckText = ckDk ? 'text-gray-400' : 'text-gray-500';
  const ckBtn2 = ckDk ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50';
  banner.innerHTML = `
    <div class="max-w-2xl mx-auto ${ckBg} border rounded-2xl shadow-2xl p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="text-2xl flex-shrink-0">🍪</span>
        <div>
          <p class="text-sm font-semibold ${ckTitle}">Cookies y Privacidad</p>
          <p class="text-xs ${ckText} mt-1">CREO utiliza cookies esenciales para autenticación y almacenamiento local para tus preferencias (tema, idioma). No usamos cookies de seguimiento ni publicidad. Al continuar, aceptas nuestro uso de cookies.</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="acceptCookies()" class="flex-1 bg-creo-purple text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-creo-light transition">Aceptar</button>
        <a href="privacidad.html" class="flex-1 text-center border ${ckBtn2} text-sm font-semibold py-2.5 rounded-xl transition">Más info</a>
      </div>
      <div class="flex justify-center gap-4 text-[10px] text-gray-400">
        <a href="terminos.html" class="hover:text-creo-mint underline">Términos</a>
        <a href="privacidad.html" class="hover:text-creo-mint underline">Privacidad</a>
      </div>
    </div>`;
  document.body.appendChild(banner);
}

function acceptCookies() {
  localStorage.setItem('creo-cookies-accepted', Date.now());
  const banner = document.getElementById('cookie-consent');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(20px)';
    setTimeout(() => banner.remove(), 300);
  }
}

// Inject global dark-mode CSS overrides
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .dark .glass { background: rgba(26,10,62,0.6) !important; border-color: rgba(255,255,255,0.15) !important; }
    .dark .glass-dark { background: rgba(26,10,62,0.8) !important; }
    .dark .text-gray-900 { color: #f3f4f6 !important; }
    .dark .text-gray-800 { color: #e5e7eb !important; }
    .dark .text-gray-700 { color: #d1d5db !important; }
    .dark .text-gray-600 { color: #9ca3af !important; }
    .dark .bg-gray-50 { background-color: #111827 !important; }
    .dark .bg-gray-100 { background-color: #1f2937 !important; }
    .dark .bg-white { background-color: #1f2937 !important; }
    .dark .bg-white\\/90 { background-color: rgba(17,24,39,0.9) !important; }
    .dark .border-gray-200 { border-color: #374151 !important; }
    .dark .border-gray-300 { border-color: #4b5563 !important; }
    .dark .border-gray-100 { border-color: #374151 !important; }
    .dark input, .dark textarea, .dark select { color: #f3f4f6 !important; }
    .dark input::placeholder, .dark textarea::placeholder { color: #6b7280 !important; }
    .dark input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]),
    .dark textarea, .dark select {
      background-color: #1f2937 !important;
      border-color: #4b5563 !important;
    }
    .dark input:focus, .dark textarea:focus, .dark select:focus {
      border-color: #33f0b0 !important;
    }
    .dark .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.4), 0 8px 10px -6px rgba(0,0,0,0.4) !important; }
    .dark .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5) !important; }
    .dark .hover\\:bg-gray-50:hover { background-color: #374151 !important; }
    .dark .hover\\:bg-gray-100:hover { background-color: #374151 !important; }
    .dark .hover\\:bg-gray-200:hover { background-color: #4b5563 !important; }
    .dark .divide-gray-200 > :not([hidden]) ~ :not([hidden]) { border-color: #374151 !important; }
    .dark .bg-creo-purple\\/5 { background-color: rgba(45,27,105,0.2) !important; }
    .dark .bg-amber-50 { background-color: rgba(120,80,0,0.2) !important; }
    .dark .text-amber-800 { color: #fbbf24 !important; }
    .dark .border-amber-200 { border-color: rgba(251,191,36,0.3) !important; }
    body.bg-gray-900 { background-color: #111827 !important; }
  `;
  document.head.appendChild(style);
})();

initTheme();
initCookieConsent();
