// CREO Platform — Shared utilities
const SUPABASE_URL = "https://qddxoyjtoxtdcezwuvcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZHhveWp0b3h0ZGNlend1dmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUxNDIsImV4cCI6MjA5Nzk5MTE0Mn0.MEaMfib77T0B7HW-jI6nctc1a7WbIf1n7rKBhdc-Gm8";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_EMAIL = 'fullnessmindset@gmail.com';

function isAdmin(email) { return email === ADMIN_EMAIL; }
function isPlatformCreator(email) { return email === ADMIN_EMAIL; }

// ========== AUTHENTICATION (Google-only) ==========

async function handlePostLoginRedirect() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await ensureProfileExists(user);
  window.location.href = 'comunidad.html';
}

async function ensureProfileExists(user) {
  const { data: existing } = await sb.from('profiles')
    .select('id').eq('id', user.id).single();
  if (!existing) {
    await sb.from('profiles').insert([{
      id: user.id,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      created_at: new Date().toISOString()
    }]).catch(err => console.log('Profile creation note:', err));
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

async function signOut() {
  await sb.auth.signOut();
  showToast('Sesión cerrada', 'success');
  setTimeout(() => { window.location.href = 'comunidad.html'; }, 500);
}

// ========== CREO ID (Stripe Identity Verification Gate) ==========

let _creoIdVerified = null;

async function isCreoIdVerified() {
  if (_creoIdVerified !== null) return _creoIdVerified;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  if (isAdmin(user.email)) { _creoIdVerified = true; return true; }
  const { data } = await sb.from('profiles').select('identity_verified').eq('id', user.id).single();
  _creoIdVerified = data?.identity_verified === true;
  return _creoIdVerified;
}

async function requireCreoId(action) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { showToast('Inicia sesión para ' + (action || 'continuar'), 'error'); return false; }
  const verified = await isCreoIdVerified();
  if (!verified) { showCreoIdModal(); return false; }
  return true;
}

function showCreoIdModal() {
  let modal = document.getElementById('creo-id-modal');
  if (modal) { modal.classList.remove('hidden'); return; }
  modal = document.createElement('div');
  modal.id = 'creo-id-modal';
  modal.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-filter backdrop-blur-sm" onclick="closeCreoIdModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="text-center space-y-2">
        <div class="w-16 h-16 rounded-full bg-creo-purple/10 flex items-center justify-center mx-auto">
          <img src="assets/logo-icon.png" class="w-10 h-10 rounded-full" alt="CREO">
        </div>
        <h3 class="text-xl font-bold text-gray-900">Verifica tu Creo ID</h3>
        <p class="text-sm text-gray-500">Para interactuar en CREO necesitas verificar tu identidad</p>
      </div>

      <div class="space-y-3">
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🛡️</span>
          <div>
            <p class="text-sm font-bold text-green-800">Personas reales</p>
            <p class="text-xs text-green-700">Cada usuario de CREO es una persona real verificada. Tu seguridad es nuestra prioridad.</p>
          </div>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🎓</span>
          <div>
            <p class="text-sm font-bold text-blue-800">Sin menores</p>
            <p class="text-xs text-blue-700">Los niños deben estar jugando, aprendiendo y en la escuela. Solo aceptamos mayores de 18 con identificación.</p>
          </div>
        </div>

        <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🔒</span>
          <div>
            <p class="text-sm font-bold text-purple-800">Tu ID, tu seguridad</p>
            <p class="text-xs text-purple-700">Verificamos tu identidad una sola vez. Tu información está protegida y nunca se comparte.</p>
          </div>
        </div>
      </div>

      <button onclick="startCreoIdVerification()" id="creo-id-verify-btn" class="w-full bg-creo-purple hover:bg-creo-light text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2">
        <img src="assets/logo-icon.png" class="w-5 h-5 rounded-full" alt="">
        <span>Verificar mi Creo ID</span>
      </button>

      <button onclick="closeCreoIdModal()" class="w-full text-gray-400 text-sm hover:text-gray-600 transition py-1">Ahora no</button>

      <div class="text-center">
        <p class="text-[10px] text-gray-400">La verificación es rápida, segura y solo se hace una vez.</p>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closeCreoIdModal() {
  const modal = document.getElementById('creo-id-modal');
  if (modal) modal.classList.add('hidden');
}

async function startCreoIdVerification() {
  const btn = document.getElementById('creo-id-verify-btn');
  if (btn) { btn.textContent = 'Preparando...'; btn.disabled = true; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Inicia sesión primero', 'error'); return; }
    const res = await fetch(SUPABASE_URL + '/functions/v1/create-identity-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token }
    });
    const result = await res.json();
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    if (result.url) {
      window.location.href = result.url;
    } else {
      showToast('No se pudo iniciar la verificación', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
    console.error(e);
  } finally {
    if (btn) { btn.innerHTML = '<img src="assets/logo-icon.png" class="w-5 h-5 rounded-full" alt=""><span>Verificar mi Creo ID</span>'; btn.disabled = false; }
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
    document.body.classList.remove('bg-white', 'text-gray-900');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.add('bg-white', 'text-gray-900');
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
  const sidebar = document.getElementById('creo-sidebar');
  if (sidebar) {
    if (dark) {
      sidebar.classList.remove('bg-white', 'border-gray-200');
      sidebar.classList.add('bg-gray-900', 'border-gray-700');
    } else {
      sidebar.classList.remove('bg-gray-900', 'border-gray-700');
      sidebar.classList.add('bg-white', 'border-gray-200');
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
    if (dark) { h.classList.remove('bg-white/90', 'border-gray-200'); h.classList.add('bg-gray-900/90', 'border-gray-700'); }
    else { h.classList.remove('bg-gray-900/90', 'border-gray-700'); h.classList.add('bg-white/90', 'border-gray-200'); }
  });
  document.querySelectorAll('.dark-aware-card').forEach(c => {
    if (dark) { c.classList.remove('bg-white', 'border-gray-200', 'border-gray-100'); c.classList.add('bg-gray-800', 'border-gray-700'); }
    else { c.classList.remove('bg-gray-800', 'border-gray-700'); c.classList.add('bg-white', 'border-gray-200'); }
  });
  document.querySelectorAll('.dark-aware-input').forEach(inp => {
    if (dark) { inp.classList.remove('bg-gray-50', 'bg-gray-100', 'border-gray-300', 'border-gray-200', 'text-gray-900', 'placeholder-gray-400'); inp.classList.add('bg-gray-800', 'border-gray-600', 'text-white', 'placeholder-gray-500'); }
    else { inp.classList.remove('bg-gray-800', 'border-gray-600', 'text-white', 'placeholder-gray-500'); inp.classList.add('bg-gray-50', 'border-gray-300', 'text-gray-900', 'placeholder-gray-400'); }
  });
}

// Generic file upload helper
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
  const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-creo-purple' };
  const toast = document.createElement('div');
  toast.id = 'creo-toast';
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[500] px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-xl transition-all duration-300 ${colors[type] || colors.info}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ========== SIDEBAR NAVIGATION ==========

function renderSidebar(activePage) {
  const items = [
    { id: 'comunidad', label: 'Comunidad', href: 'comunidad.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>' },
    { id: 'explore', label: 'Explorar', href: 'explore.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>' },
    { id: 'messages', label: 'Mensajes', href: 'messages.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>', authOnly: true },
    { id: 'profile', label: 'Perfil', href: 'profile.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
    { id: 'deals', label: 'Brand Deals', href: 'brand-deals.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.193 23.193 0 0112 15c-3.183 0-6.22-.64-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>' },
    { id: 'dashboard', label: 'Panel', href: 'index.html?panel=1', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>', authOnly: true }
  ];

  // Desktop sidebar
  const sidebar = document.createElement('aside');
  sidebar.id = 'creo-sidebar';
  sidebar.className = 'fixed left-0 top-0 bottom-0 w-[220px] bg-white border-r border-gray-200 z-40 hidden lg:flex flex-col transition-colors';
  sidebar.innerHTML = `
    <div class="p-5 flex items-center gap-3">
      <img src="assets/logo-icon.png" class="w-8 h-8 rounded-full" alt="CREO">
      <span class="text-lg font-bold tracking-[0.15em] text-creo-purple">CREO</span>
    </div>
    <nav class="flex-1 px-3 space-y-1">
      ${items.map(item => `
        <a href="${item.href}" ${item.authOnly ? 'data-auth-only="true"' : ''} class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${activePage === item.id ? 'bg-creo-purple/10 text-creo-purple' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
          ${item.label}
        </a>`).join('')}
      <a href="admin.html" data-admin-only="true" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-gray-600 hover:bg-gray-100 hover:text-gray-900" style="display:none">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        Admin
      </a>
    </nav>
    <div class="p-4 border-t border-gray-200 space-y-2">
      <button onclick="toggleTheme()" class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition w-full">
        <svg class="w-5 h-5 theme-icon-sun" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        <svg class="w-5 h-5 theme-icon-moon hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
        Tema
      </button>
      <div id="sidebar-auth-area"></div>
    </div>`;
  document.body.appendChild(sidebar);

  // Mobile header + hamburger
  const header = document.createElement('header');
  header.id = 'creo-mobile-header';
  header.className = 'fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between lg:hidden transition-colors';
  header.innerHTML = `
    <div class="flex items-center gap-3">
      <button onclick="toggleMobileMenu()" id="hamburger-btn" class="p-1.5 rounded-lg hover:bg-gray-100 transition">
        <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <a href="comunidad.html" class="flex items-center gap-2">
        <img src="assets/logo-icon.png" class="w-7 h-7 rounded-full" alt="CREO">
        <span class="text-base font-bold tracking-[0.15em] text-creo-purple">CREO</span>
      </a>
    </div>
    <div class="flex items-center gap-2" id="mobile-header-right"></div>`;
  document.body.appendChild(header);

  // Mobile menu overlay
  const mobileMenu = document.createElement('div');
  mobileMenu.id = 'creo-mobile-menu';
  mobileMenu.className = 'fixed inset-0 z-[45] hidden';
  mobileMenu.innerHTML = `
    <div class="absolute inset-0 bg-black/40" onclick="closeMobileMenu()"></div>
    <div class="absolute left-0 top-0 bottom-0 w-[260px] bg-white shadow-2xl flex flex-col transform transition-transform" id="mobile-menu-panel">
      <div class="p-5 flex items-center justify-between border-b border-gray-100">
        <div class="flex items-center gap-3">
          <img src="assets/logo-icon.png" class="w-8 h-8 rounded-full" alt="CREO">
          <span class="text-lg font-bold tracking-[0.15em] text-creo-purple">CREO</span>
        </div>
        <button onclick="closeMobileMenu()" class="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1">
        ${items.map(item => `
          <a href="${item.href}" ${item.authOnly ? 'data-auth-only="true"' : ''} class="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${activePage === item.id ? 'bg-creo-purple/10 text-creo-purple' : 'text-gray-600 hover:bg-gray-100'}">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
            ${item.label}
          </a>`).join('')}
        <a href="admin.html" data-admin-only="true" class="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition text-gray-600 hover:bg-gray-100" style="display:none">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          Admin
        </a>
      </nav>
      <div class="p-4 border-t border-gray-200 space-y-2">
        <button onclick="toggleTheme()" class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition w-full">
          <svg class="w-5 h-5 theme-icon-sun" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <svg class="w-5 h-5 theme-icon-moon hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          Tema
        </button>
        <div id="mobile-auth-area"></div>
      </div>
    </div>`;
  document.body.appendChild(mobileMenu);

  // Adjust body padding and make modals respect sidebar on desktop
  document.body.style.paddingTop = '60px';
  document.body.classList.add('lg:pl-[220px]');
  const style = document.createElement('style');
  style.textContent = `
    @media(min-width:1024px){
      body{padding-top:0!important;}
      .fixed.inset-0:not(#creo-sidebar):not(#creo-mobile-menu):not(#creo-mobile-header){left:220px!important;}
    }`;
  document.head.appendChild(style);

  updateSidebarAuth();
}

function toggleMobileMenu() {
  const menu = document.getElementById('creo-mobile-menu');
  menu.classList.toggle('hidden');
}
function closeMobileMenu() {
  document.getElementById('creo-mobile-menu').classList.add('hidden');
}

async function updateSidebarAuth() {
  const { data: { user } } = await sb.auth.getUser();
  document.querySelectorAll('[data-auth-only]').forEach(el => {
    el.style.display = user ? '' : 'none';
  });
  if (user) {
    const { data } = await sb.from('profiles').select('username').eq('id', user.id).single();
    if (data && data.username) {
      document.querySelectorAll('a[href="profile.html"]').forEach(a => {
        a.href = 'profile.html?u=' + encodeURIComponent(data.username);
      });
    }
    if (isAdmin(user.email)) {
      document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = ''; });
    }
    const authHtml = `<button onclick="signOut()" class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition w-full">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
      Salir</button>`;
    const sa = document.getElementById('sidebar-auth-area');
    if (sa) sa.innerHTML = authHtml;
    const ma = document.getElementById('mobile-auth-area');
    if (ma) ma.innerHTML = authHtml;
  } else {
    const loginHtml = `<a href="index.html" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-creo-purple text-white hover:bg-creo-light transition w-full justify-center">
      <svg class="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/></svg>
      Entrar con Google</a>`;
    const sa = document.getElementById('sidebar-auth-area');
    if (sa) sa.innerHTML = loginHtml;
    const ma = document.getElementById('mobile-auth-area');
    if (ma) ma.innerHTML = loginHtml;
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
  bell.className = 'cursor-pointer';
  bell.onclick = () => toggleNotifPanel();
  bell.innerHTML = `<div class="relative p-2"><svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>${count > 0 ? `<span class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">${count > 9 ? '9+' : count}</span>` : ''}</div>`;
  const mobileRight = document.getElementById('mobile-header-right');
  if (mobileRight) mobileRight.appendChild(bell);
}

async function toggleNotifPanel() {
  let panel = document.getElementById('notif-panel');
  if (panel) { panel.remove(); return; }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data } = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'fixed top-12 right-4 z-[60] w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl bg-white border border-gray-200';
  if (!data || data.length === 0) {
    panel.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">Sin notificaciones</p>';
  } else {
    const icons = { like: '❤️', comment: '💬', payment: '💰', approval: '✅', rejection: '❌', invite: '🤝', share: '🔗', meta_like: '❤️', meta_comment: '💬' };
    panel.innerHTML = `<div class="p-3 border-b border-gray-200 flex justify-between items-center"><span class="font-bold text-sm text-gray-900">Notificaciones</span><button onclick="markAllRead()" class="text-xs text-creo-mint hover:underline">Marcar leídas</button></div>` +
      data.map(n => {
        const link = n.link || getNotifDefaultLink(n);
        return `<div class="px-3 py-2.5 border-b border-gray-100 ${n.is_read ? 'opacity-60' : ''} hover:bg-gray-50 transition cursor-pointer" onclick="${link ? `window.location.href='${link}'` : ''}">
          <div class="flex gap-2">
            <span>${icons[n.type] || '🔔'}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900">${esc(n.title)}</p>
              ${n.body ? `<p class="text-xs text-gray-500 truncate">${esc(n.body)}</p>` : ''}
              <p class="text-[10px] text-gray-400 mt-0.5">${new Date(n.created_at).toLocaleDateString()}</p>
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
  if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
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
  'Objetos': ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🎮','🕹️','🎯','🎪','🎨','🎬','🎤','🎧','🎵','🎶','🎹','🥁','🎷','🎺','🎸','💻','📱','📸','🔑','💡','📚','✏️','📌','💰','💎','🏆','🥇','🎖️','🏅','🎗️']
};

function createEmojiPicker(inputId, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const wrapper = btn.parentElement;
  if (wrapper && getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    let existing = document.getElementById('emoji-picker-panel');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'emoji-picker-panel';
    panel.className = 'absolute z-[200] rounded-2xl shadow-2xl p-3 bg-white border border-gray-200';
    panel.style.cssText = 'bottom:100%;left:0;margin-bottom:8px;width:min(320px,calc(100vw - 32px));max-height:320px;';
    let activeCategory = 'Frecuentes';
    function renderPicker() {
      const tabs = Object.keys(EMOJI_CATEGORIES).map(cat =>
        `<button class="px-2 py-1 text-xs rounded-lg whitespace-nowrap ${cat === activeCategory ? 'bg-creo-purple text-white' : 'text-gray-500 hover:bg-gray-100'}" data-cat="${cat}">${cat}</button>`
      ).join('');
      const emojis = EMOJI_CATEGORIES[activeCategory].map(e =>
        `<button class="w-9 h-9 text-xl hover:bg-gray-100 rounded-lg transition flex items-center justify-center emoji-pick" data-emoji="${e}">${e}</button>`
      ).join('');
      panel.innerHTML = `<div class="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-gray-100 emoji-tabs" style="-webkit-overflow-scrolling:touch">${tabs}</div><div class="grid grid-cols-7 gap-0.5 max-h-48 overflow-y-auto" style="-webkit-overflow-scrolling:touch">${emojis}</div>`;
    }
    renderPicker();
    panel.addEventListener('click', (ev) => {
      const catBtn = ev.target.closest('[data-cat]');
      if (catBtn) { activeCategory = catBtn.dataset.cat; renderPicker(); return; }
      const emojiBtn = ev.target.closest('[data-emoji]');
      if (emojiBtn) {
        const input = document.getElementById(inputId);
        if (input) {
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? start;
          input.value = input.value.slice(0, start) + emojiBtn.dataset.emoji + input.value.slice(end);
          input.focus();
          const pos = start + emojiBtn.dataset.emoji.length;
          input.setSelectionRange(pos, pos);
        }
      }
    });
    wrapper.appendChild(panel);
    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect();
      if (r.top < 0) { panel.style.bottom = 'auto'; panel.style.top = '100%'; panel.style.marginBottom = '0'; panel.style.marginTop = '8px'; }
      if (r.right > window.innerWidth) { panel.style.left = 'auto'; panel.style.right = '0'; }
    });
    setTimeout(() => {
      const closePicker = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
          panel.remove(); document.removeEventListener('click', closePicker);
          document.removeEventListener('touchend', closePicker);
        }
      };
      document.addEventListener('click', closePicker);
      document.addEventListener('touchend', closePicker);
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
  banner.className = 'fixed bottom-4 left-4 right-4 z-[80] max-w-md mx-auto';
  banner.innerHTML = `
    <div class="bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="text-2xl flex-shrink-0">🍪</span>
        <div>
          <p class="text-sm font-semibold text-gray-900">Cookies y Privacidad</p>
          <p class="text-xs text-gray-500 mt-1">CREO utiliza cookies esenciales para autenticación y almacenamiento local para tus preferencias. No usamos cookies de seguimiento ni publicidad.</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="acceptCookies()" class="flex-1 bg-creo-purple text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-creo-light transition">Aceptar</button>
        <a href="privacidad.html" class="flex-1 text-center border border-gray-300 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition">Más info</a>
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
    body.bg-gray-900 { background-color: #111827 !important; }
  `;
  document.head.appendChild(style);
})();

// Notification Sound System
const CREO_SOUNDS = [
  { id: 'creo-default', name: 'CREO Original' }
];

function getNotifSoundPrefs() {
  try {
    const saved = localStorage.getItem('creo_sound_prefs');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return { soundId: 'creo-default', volume: 0.7, enabled: true };
}

function saveNotifSoundPrefs(prefs) {
  localStorage.setItem('creo_sound_prefs', JSON.stringify(prefs));
}

function playNotificationSound() {
  const prefs = getNotifSoundPrefs();
  if (!prefs.enabled) return;
  try {
    const audio = new Audio(`assets/sounds/${prefs.soundId}.mp3`);
    audio.volume = prefs.volume;
    audio.play().catch(() => {});
  } catch(e) {}
}

function previewNotificationSound(soundId) {
  const prefs = getNotifSoundPrefs();
  try {
    const audio = new Audio(`assets/sounds/${soundId || prefs.soundId}.mp3`);
    audio.volume = prefs.volume;
    audio.play().catch(() => {});
  } catch(e) {}
}

let _lastNotifCount = -1;
async function pollNotifications() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    if (_lastNotifCount >= 0 && count > _lastNotifCount) {
      playNotificationSound();
    }
    _lastNotifCount = count;
  } catch(e) {}
}

(function startNotifPolling() {
  setTimeout(() => {
    pollNotifications();
    setInterval(pollNotifications, 30000);
  }, 3000);
})();

// Backward compatibility — old pages still calling renderBottomNav
function renderBottomNav(activePage) { renderSidebar(activePage); }
function updateNavAuth() { updateSidebarAuth(); }

initTheme();
initCookieConsent();
