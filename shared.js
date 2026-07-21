// CREO Platform — Shared utilities

// CSP: restrict script/connect sources to trusted origins only
(function injectCSP() {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const csp = document.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "connect-src 'self' https://qddxoyjtoxtdcezwuvcq.supabase.co wss://qddxoyjtoxtdcezwuvcq.supabase.co https://api.giphy.com https://api.stripe.com https://js.stripe.com",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https://qddxoyjtoxtdcezwuvcq.supabase.co",
    "frame-src https://checkout.stripe.com https://connect.stripe.com https://js.stripe.com",
    "font-src 'self' data: https://fonts.gstatic.com",
  ].join('; ');
  document.head.prepend(csp);
})();

const SUPABASE_URL = "https://qddxoyjtoxtdcezwuvcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZHhveWp0b3h0ZGNlend1dmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUxNDIsImV4cCI6MjA5Nzk5MTE0Mn0.MEaMfib77T0B7HW-jI6nctc1a7WbIf1n7rKBhdc-Gm8";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_EMAIL = 'fullnessmindset@gmail.com';

function isAdmin(email) { return email === ADMIN_EMAIL; }
function isPlatformCreator(email) { return email === ADMIN_EMAIL; }

// ========== CACHE LAYER ==========
const _cache = new Map();
const CACHE_TTL = {
  profile: 60000,
  notifications_count: 15000,
  notifications_list: 30000,
  announcements: 120000,
  auth_user: 30000,
  creo_id: 60000,
};

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > (CACHE_TTL[entry.type] || 30000)) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, type) {
  _cache.set(key, { data, ts: Date.now(), type });
}

function cacheInvalidate(prefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

function cacheClear() { _cache.clear(); }

let _cachedUser = null;
let _cachedUserTs = 0;
async function getCachedUser() {
  if (_cachedUser && Date.now() - _cachedUserTs < CACHE_TTL.auth_user) return _cachedUser;
  const { data: { user } } = await sb.auth.getUser();
  _cachedUser = user;
  _cachedUserTs = Date.now();
  return user;
}

async function getCachedProfile(userId) {
  const key = 'profile:' + userId;
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (data) cacheSet(key, data, 'profile');
  return data;
}

// ========== ASYNC BATCH HELPERS ==========
const _pendingActivity = { timer: null, dirty: false };

function trackActivityDebounced() {
  _pendingActivity.dirty = true;
  if (_pendingActivity.timer) return;
  _pendingActivity.timer = setTimeout(async () => {
    _pendingActivity.timer = null;
    if (!_pendingActivity.dirty) return;
    _pendingActivity.dirty = false;
    const user = await getCachedUser();
    if (user) {
      sb.from('profiles').update({ last_activity_at: new Date().toISOString() }).eq('id', user.id).then(() => {});
    }
  }, 30000);
}

let _notifCountPending = null;
async function getNotifCountCached() {
  const user = await getCachedUser();
  if (!user) return 0;
  const key = 'notif_count:' + user.id;
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  if (_notifCountPending) return _notifCountPending;
  _notifCountPending = (async () => {
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    const val = count || 0;
    cacheSet(key, val, 'notifications_count');
    _notifCountPending = null;
    return val;
  })();
  return _notifCountPending;
}

// ========== INTERNATIONALIZATION (i18n) ==========
const CREO_TRANSLATIONS = {
  es: {
    // Nav & sidebar
    comunidad: 'Comunidad', explorar: 'Explorar', creadores: 'Creadores', mensajes: 'Mensajes', perfil: 'Perfil',
    brandDeals: 'Brand Deals', panel: 'Panel', admin: 'Admin', tema: 'Tema', salir: 'Salir',
    entrarGoogle: 'Entrar con Google', idioma: 'Idioma',
    entrarCreoId: 'Iniciar sesión con CREO ID',

    // Auth
    sesionCerrada: 'Sesión cerrada', errorGoogle: 'Error al conectar con Google',
    ingresaEmail: 'Ingresa tu email', emailPlaceholder: 'tu@email.com',
    continuar: 'Continuar', cancelar: 'Cancelar',
    linkEnviado: 'Link de acceso enviado a tu email',
    iniciaSesion: 'Inicia sesión', iniciaSesionPrimero: 'Inicia sesión primero',
    authHeading: 'Inicia sesión para gestionar tu panel',
    authSubtext: 'Usa tu cuenta de Google para acceder de forma segura',
    continuarConGoogle: 'Continuar con Google',
    authSecurityNote: 'CREO usa exclusivamente Google para inicio de sesión. Tu cuenta está protegida por la autenticación de Google.',
    eresEmpresa: '¿Eres una empresa o marca?',
    registrarEmpresa: 'Registrar como Empresa',
    aceptaTerminos: 'Acepta los términos para continuar',
    debesAceptarTerminos: 'Debes aceptar los Términos y Política de Privacidad',
    debesAceptarConducta: 'Debes aceptar las normas de conducta',
    cuentaCreada: 'Cuenta creada. Revisa tu email para confirmar.',
    ingresaEmailPassword: 'Ingresa email y contraseña',

    // Verification bar
    connectStripe: 'Conecta tu cuenta de Stripe para recibir pagos',
    completaCreoId: 'Completa tu verificación CREO ID',
    conectando: 'Conectando...', iniciandoVerif: 'Iniciando verificación...',
    stripeYaConectado: 'Tu cuenta de Stripe ya está conectada.',
    errorStripe: 'Error al conectar con Stripe.', errorVerif: 'Error al iniciar verificación.',
    errorSubiendo: 'Error subiendo archivo',

    // Notifications
    notifVerifIniciada: 'Verificación Iniciada', notifVerifEnviada: 'Verificación Enviada',
    notifVerificada: '¡Identidad Verificada!', notifVerifRechazada: 'Verificación Rechazada',
    y: 'y', noNotifs: 'No hay notificaciones', marcarLeidas: 'Leer todas',
    notificaciones: 'Notificaciones', marcarLeidasFull: 'Marcar leídas',
    sinNotificaciones: 'Sin notificaciones',
    notifsMarcadasLeidas: 'Notificaciones marcadas como leídas',

    // Reports
    reporteEnviado: 'Reporte enviado. Gracias por ayudar a la comunidad.',
    reportarCreador: 'Reportar Creador',
    reportarSubtext: 'Ayúdanos a mantener la comunidad segura. Tu reporte es confidencial.',
    seleccionaMotivo: 'Selecciona un motivo',
    motivoSexual: 'Contenido con insinuación sexual',
    motivoDrogas: 'Uso o promoción de drogas',
    motivoViolencia: 'Incitación a la violencia',
    motivoLenguaje: 'Palabras soeces / lenguaje ofensivo',
    motivoDiscriminacion: 'Discriminación',
    motivoSpam: 'Spam o estafa',
    motivoOtro: 'Otro',
    detallesPlaceholder: 'Describe el problema (opcional)',
    enviarReporte: 'Enviar Reporte',

    // Cookie consent
    cookiesTitle: 'Cookies y Privacidad',
    cookiesText: 'CREO utiliza cookies esenciales para autenticación y almacenamiento local para tus preferencias. No usamos cookies de seguimiento ni publicidad.',
    aceptar: 'Aceptar', masInfo: 'Más info',

    // CREO ID modal
    verificaCreoId: 'Verifica tu Creo ID',
    creoIdSubtext: 'Para publicar deals y recibir pagos necesitas verificar tu identidad',
    personasReales: 'Personas reales',
    personasRealesDesc: 'Cada usuario de CREO es una persona real verificada. Tu seguridad es nuestra prioridad.',
    sinMenores: 'Sin menores',
    sinMenoresDesc: 'Los niños deben estar jugando, aprendiendo y en la escuela. Solo aceptamos mayores de 18 con identificación.',
    tuIdSeguridad: 'Tu ID, tu seguridad',
    tuIdSeguridadDesc: 'Verificamos tu identidad una sola vez. Tu información está protegida y nunca se comparte.',
    verificarCreoId: 'Verificar mi Creo ID',
    ahoraNo: 'Ahora no',
    verificacionRapida: 'La verificación es rápida, segura y solo se hace una vez.',
    preparando: 'Preparando...',
    noSePudoVerif: 'No se pudo iniciar la verificación',
    errorConexion: 'Error de conexión',

    // Upload helper
    archivoMax: 'Archivo max',
    subiendo: 'Subiendo...',

    // ===== COMUNIDAD PAGE =====
    muro: 'Muro', cineLocal: 'Cine Local', galeria: 'Galería', biblioteca: 'Biblioteca',
    musica: 'Música', eventos: 'Eventos', general: 'General',
    queCompartir: '¿Qué quieres compartir con la comunidad?',
    tituloOpcional: 'Título (opcional)',
    normal: 'Normal', evento: 'Evento', enVivo: 'En Vivo',
    enlaceEvento: 'Enlace (Zoom, Meet, URL)',
    desdeNavegador: 'Desde el navegador',
    urlStream: 'URL del stream',
    foto: 'Foto', video: 'Video', grabarVideo: 'Grabar Video', grabarAudio: 'Grabar Audio',
    publicar: 'Publicar', publicando: 'Publicando...',
    escribeAlgoOMedia: 'Escribe algo o agrega media',
    publicadoEnComunidad: '¡Publicado en Comunidad!',
    editarPost: 'Editar Post', titulo: 'Título', contenido: 'Contenido', media: 'Media',
    guardarCambios: 'Guardar Cambios',
    eliminar: 'Eliminar', confirmarEliminar: '¿Eliminar?',
    postEliminado: 'Post eliminado', postActualizado: 'Post actualizado',
    comentar: 'Comentar', comentaPlaceholder: 'Comenta...',
    enviar: 'Enviar', sinComentarios: 'Sin comentarios aún',
    compartir: 'Compartir', enlaceCopiado: 'Enlace copiado',
    editar: 'Editar',
    ahora: 'ahora', mes: 'mes',
    reaccion: 'Reacción',
    iniciarSesionParaLike: 'Inicia sesión para dar like',
    iniciarSesionParaComentar: 'Inicia sesión para comentar',
    iniciarSesionParaSeguir: 'Inicia sesión para seguir',
    iniciarSesionParaMensajes: 'Inicia sesión para enviar mensajes',
    iniciarSesionParaReportar: 'Inicia sesión para reportar',
    bienvenidoComunidad: 'Bienvenido a la Comunidad',
    normasComunidad: 'Normas de la Comunidad',
    grabandoVideo: 'Grabando Video', grabandoAudio: 'Grabando Audio',
    grabando: 'Grabando...', procesando: 'Procesando...',
    listoParaGrabar: 'Listo para grabar',
    guardar: 'Guardar', grabacionLista: 'Grabación lista',
    subiendoGrabacion: 'Subiendo grabación...',

    // ===== MESSAGES PAGE =====
    conversaciones: 'Conversaciones', buscarConversacion: 'Buscar conversación...',
    nuevaConversacion: 'Nueva conversación',
    escribeMensaje: 'Escribe un mensaje...',
    iniciaConversacion: 'Inicia la conversación',
    sinConversaciones: 'No tienes conversaciones aún',
    enviando: 'Enviando...',
    buscarGif: 'Buscar GIF...',
    enviarGif: 'Enviar GIF',
    enviarImagen: 'Enviar imagen',
    grabarAudioMsg: 'Grabar audio',
    grabarVideoMsg: 'Grabar video',
    verPerfil: 'Ver perfil',
    detener: 'Detener',
    imagenMax10mb: 'Imagen máx 10MB',
    errorMicrofono: 'No se pudo acceder al micrófono',
    errorCamara: 'No se pudo acceder a la cámara',
    errorSubiendoImagen: 'Error subiendo imagen: ',
    errorSubiendoVideo: 'Error subiendo video: ',
    errorSubiendoAudio: 'Error subiendo audio: ',
    errorEnviandoMensaje: 'Error al enviar mensaje',
    errorEnviandoVideo: 'Error al enviar video',
    videoSubido: 'Video subido',
    enviarVideo: 'Enviar',
    seleccionaConversacion: 'Selecciona una conversación',
    buscaCreadorParaIniciar: 'o busca un creador para iniciar',
    noSeEncontraronCreadores: 'No se encontraron creadores',
    escribeAlMenos2: 'Escribe al menos 2 caracteres',
    buscarPorNombre: 'Buscar por nombre o @username...',
    buscarCreadores: 'Buscar creadores...',
    sinMensajes: 'Sin mensajes',
    noTienesMensajes: 'No tienes mensajes aún',
    buscaCreadorIniciar: 'Busca un creador para iniciar',
    nuevoMensaje: 'Nuevo Mensaje',
    iniciarSesionVerMensajes: 'Inicia sesión para ver tus mensajes',
    suelteParaEnviar: 'Suelta para enviar',
    mantenParaGrabar: 'Mantén para grabar',
    enviaUnMensaje: 'Envía un mensaje para iniciar',
    errorAlEnviar: 'Error al enviar',
    errorAlEnviarAudio: 'Error al enviar audio',

    // ===== BRAND DEALS PAGE =====
    crearDeal: 'Crear Deal',
    misDeals: 'Mis Deals', todosDeals: 'Todos los Deals',
    tituloDeal: 'Título del Deal',
    descripcionDeal: 'Descripción',
    presupuesto: 'Presupuesto ($)',
    categoria: 'Categoría',
    requisitos: 'Requisitos',
    terminosCondiciones: 'Términos y Condiciones',
    fechaEntrega: 'Fecha de entrega',
    vibeVideo: 'Vibe del video',
    descripcionPago: 'Descripción del pago',
    portada: 'Portada',
    publicarDeal: 'Publicar Deal',
    verDetalle: 'Ver Detalle',
    aplicar: 'Aplicar',
    chat: 'Chat',
    tratoHecho: 'Trato Hecho',
    pagarCreador: 'Pagar al Creador',
    dealPublicado: 'Deal publicado',
    errorCreandoDeal: 'Error al crear deal',
    completaCampos: 'Completa todos los campos requeridos',

    // ===== PROFILE PAGE =====
    cargando: 'Cargando...',
    seguidores: 'Seguidores', siguiendo: 'Siguiendo',
    bienvenidoPagina: 'Bienvenido a mi página de apoyo.',
    seguir: 'Seguir', siguiendoBtn: 'Siguiendo',
    mensaje: 'Mensaje', reportar: 'Reportar',
    noVerificadoTitulo: 'Este creador aún no ha sido verificado',
    noVerificadoSubtext: 'Los pagos estarán disponibles una vez sea aprobado.',
    miHistoria: 'Mi Historia',
    yoCreoEnEllos: 'Yo Creo en Ellos',
    metasAlcanzadas: 'Metas Alcanzadas',
    publicaciones: 'Publicaciones',
    misCreaciones: 'Mis Creaciones',
    verTodo: 'Ver todo', slider: 'Slider',
    yoCreoEnTi: 'Yo Creo en Ti',
    miMeta: 'Mi Meta',
    apoyoFull: 'Apoyo Full',
    desdeMeta: 'Desde Meta',
    enviaApoyoUnico: 'Envía un apoyo único al creador',
    cantidadUsd: 'Cantidad (USD)',
    apoyarCreador: 'Apoyar Creador',
    noMetasPublicadas: 'No hay metas publicadas aún',
    noMetasOwner: 'Aún no has publicado ninguna meta',
    noMetasOwnerSub: 'Comparte tu meta con la comunidad de CREO y recibe apoyo',
    crearPrimeraMeta: 'Crear mi primera Meta',
    animaPrefix: 'Anima a @',
    animaSuffix: ' que comparta su meta con la comunidad de CREO.',
    contribuir: 'Contribuir',
    apoyarDesdeMeta: 'Apoyar desde mi Meta',
    apoyarDesdeMetaSub: 'Comparte fondos de tu meta activa con este creador',
    seleccionaTuMeta: 'Selecciona tu Meta',
    cantidadEnviar: 'Cantidad a enviar (USD)',
    enviarDesdeMeta: 'Enviar desde mi Meta',
    fondosTransferencia: 'Los fondos se transfieren directamente de tu meta al creador',
    disponible: 'disponible',
    apoyoFullHeading: 'Apoyo Full',
    apoyoFullSub: 'Apoya mensualmente con una cantidad que tú elijas',
    cantidadMensual: 'Cantidad Mensual (USD)',
    porMes: '/mes',
    suscribirme: 'Suscribirme Mensualmente',
    cancelarEnCualquier: 'Puedes cancelar en cualquier momento',
    metaCompletadaLegit: 'Meta Completada Legítimamente',
    completadaAntes: 'Completada Antes de lo Esperado',
    cancelada: 'Cancelada', enReview: 'En Review',
    completada: 'Completada', expirada: 'Expirada', finalizada: 'Finalizada',
    alcanzado: '% alcanzado', de: 'de',
    verProductoPrecio: 'Ver producto / precio',
    verMas: 'Ver más', verMenos: 'Ver menos',
    colaborador: 'colaborador', colaboradores: 'colaboradores',
    escribirComentario: 'Escribe un comentario...',
    creamos: 'Creamos',
    creamosSubtext: 'Invita a otro creador a unirse a esta meta',
    creamosPlaceholder: 'Username del creador (ej: mi_amigo)',
    enviarInvitacion: 'Enviar Invitación',
    noPerfilSeleccionado: 'No se seleccionó perfil',
    perfilNoEncontrado: 'Perfil No Encontrado',
    perfilNoEncontradoDesc: 'Este creador no existe o no ha configurado su página.',
    pagosNoDisponibles: 'Pagos no disponibles',
    montoMinimo1: 'Monto mínimo: $1.00',
    montoMinimoMensual3: 'Monto mínimo mensual: $3.00',
    seleccionaUnaMeta: 'Selecciona una meta',
    montoMinimo1d: 'Monto mínimo: $1',
    ingresaUsername: 'Ingresa un username',
    errorInvitando: 'Error al invitar',
    errorEnviandoReporte: 'Error al enviar reporte',
    seguimientoNoDisponible: 'Seguimiento no disponible aún',
    funcionSeguimientoNo: 'Función de seguimiento no disponible aún',
    invitacionEnviada: 'Invitación enviada a @',
    graciasApoyo: '¡Gracias por tu apoyo!',
    graciasMeta: '¡Gracias por contribuir a la meta!',
    suscripcionActivada: '¡Suscripción activada! Gracias por tu apoyo mensual.',
    publicadoAmbosPerfil: '¡Publicado en tu perfil y Comunidad!',
    publicadoSoloPerfil: '¡Publicado solo en tu perfil!',
    archivosSubidos: ' archivo(s) subido(s)',
    creadorVerificado: 'Creador Verificado',

    // Profile — Edit Story Modal
    editarHistoria: 'Editar Historia',
    tituloLabel: 'Titulo',
    resumenYoCreo: 'Resumen para "Yo Creo en Ti"',
    resumenHint: 'Este texto aparece cuando alguien te destaca en su sección "Yo Creo en Ellos". Escribe algo breve que inspire a otros a apoyarte.',
    resumenPlaceholder: 'Ej: Soy músico independiente creando mi primer álbum...',
    tuHistoriaCompleta: 'Tu Historia Completa',
    historiaCompletaHint: 'El contenido completo de tu historia. Aquí cuentas tu camino, tu visión y por qué haces lo que haces.',
    historiaCompletaPlaceholder: 'Cuéntale al mundo tu historia...',
    videoPrincipal: 'Video Principal',
    sinVideoPrincipal: 'Sin video principal',
    videoUrlPlaceholder: 'URL de YouTube o video directo...',
    oSubeArchivo: 'o sube un archivo:',
    subirVideo: 'Subir Video',
    eliminarVideo: 'Eliminar Video',
    mediaAdjunta: 'Media Adjunta (imagenes, videos, audio)',
    sinArchivosAdjuntos: 'Sin archivos adjuntos',
    agregarImagenes: 'Agregar Imagenes',
    grabarVideoOp: 'Grabar Video', subirVideoOp: 'Subir Video',
    grabarAudioOp: 'Grabar Audio', subirAudioOp: 'Subir Audio',
    guardando: 'Guardando...',
    subiendoVideoPrincipal: 'Subiendo video principal...',
    archivosAdjuntos: 'Archivos adjuntos',
    audio: 'Audio', archivo: 'Archivo',
    max5min: 'Max 5 min',
    historiaActualizada: 'Historia actualizada',
    historiaEliminada: 'Historia eliminada',
    grabacionGuardada: 'Grabación guardada',
    historiaPublicada: 'Historia publicada',

    // Profile — DM modal
    verPerfilTitle: 'Ver perfil',

    // Profile — Footer
    footerDisclaimer: 'Los pagos son voluntarios, no reembolsables y no deducibles de impuestos. Los creadores son responsables de sus propios impuestos.',
    terminos: 'Términos', privacidad: 'Privacidad', contacto: 'Contacto',

    // Profile — Loading
    yoCreoEnTiLoading: 'Yo Creo en Ti',
    preparandoApoyo: 'Preparando tu apoyo...',
    verPerfilFlecha: 'Ver perfil →',

    // Profile — Time
    teApoyoCon: 'te apoyó con $',
    aAlguienLeGusto: 'A alguien le gustó tu meta',
    alguienCompartio: 'Alguien compartió tu meta',
    nuevoComentarioMeta: 'Nuevo comentario en tu meta',
    nuevoComentarioHistoria: 'Nuevo comentario en tu historia',
    nuevoSeguidor: 'Tienes un nuevo seguidor',
    unCreador: 'Un creador',
    eliminarHistoriaConfirm: '¿Eliminar esta historia? Esta acción no se puede deshacer.',

    // Profile — Admin impersonation
    actuarComo: 'Actuar como ',
    modoImpersonacion: 'Modo impersonación: ',

    // ===== INDEX (DASHBOARD) PAGE =====
    panelCreador: 'Panel de Creador',
    posts: 'Posts', likes: 'Likes', metas: 'Metas', comments: 'Comments',
    tabPerfil: 'Perfil', tabHistoria: 'Historia', tabPosts: 'Posts',
    tabMetas: 'Metas', tabCreaciones: 'Creaciones', tabCreoEnEllos: 'Creo en Ellos',
    tabHerramientas: 'Herramientas', tabMisMetas: 'Mis Metas', tabMecenas: 'Mecenas',
    tabYoCreoEnTi: 'Yo Creo en Ti', tabApoyoFull: 'Apoyo Full',
    tabVerificacion: 'Verificación', tabStripe: 'Stripe',
    tabBranding: 'Mi Branding', tabSonidos: 'Sonidos',

    // Dashboard — Profile tab
    infoPerfilHeading: 'Información del Perfil',
    fotoPerfilLabel: 'Foto de Perfil',
    imagenPortada: 'Imagen de Portada',
    sinPortada: 'Sin portada',
    portadaRecomendacion: 'JPG, PNG. Max 5MB. Recomendado: 1200×400px',
    nombre: 'Nombre', apellido: 'Apellido',
    tuNombre: 'Tu nombre', tuApellido: 'Tu apellido',
    nombreUsuario: 'Nombre de Usuario',
    nombreUsuarioPlaceholder: 'mi_nombre',
    nombreMostrar: 'Nombre para Mostrar',
    nombreMostrarPlaceholder: 'Se genera automáticamente',
    bio: 'Bio', bioPlaceholder: 'Cuéntale al mundo quién eres...',
    infoContacto: 'Información de Contacto',
    infoContactoSub: 'Visible en tu perfil público (opcional)',
    emailContacto: 'Email de contacto',
    telefonoWhatsapp: 'Teléfono o WhatsApp',
    telefono: 'Teléfono', whatsapp: 'WhatsApp',
    sitioWeb: 'Sitio web (https://...)',
    ciudad: 'Ciudad', pais: 'País',
    redesSociales: 'Redes Sociales',
    alMenos1Red: 'Al menos 1 red social es requerida',
    guardarPerfil: 'Guardar Perfil',
    tuEnlacePublico: 'Tu Enlace Público:',
    nombreApellidoRequeridos: 'Nombre y apellido son requeridos',
    usernameMin3: 'Username mínimo 3 caracteres',
    agregaRedSocial: 'Agrega al menos 1 red social',
    perfilGuardado: 'Perfil guardado',

    // Dashboard — Verification tab
    verificacionHeading: 'Solicitud de Verificación',
    verificacionDesc: 'Para proteger a los Supporters y mantener la integridad de CREO, todos los creadores deben ser verificados antes de recibir pagos. Completa la información y envía tu solicitud.',
    politicaContenido: 'Política de Contenido',
    noContenidoSexual: 'No se permite contenido sexual o para adultos',
    noContenidoDrogas: 'No se permiten metas para drogas o sustancias ilegales',
    noContenidoDonaciones: 'No se aceptan solicitudes de donaciones — todo es apoyo voluntario',
    metasLegitimas: 'Las metas deben ser para herramientas, equipos o necesidades legítimas del creador',
    empresasDocumentos: 'Empresas deben presentar documentos legales (LLC, licencia comercial)',
    infoPersonal: 'Información Personal',
    nombreCompleto: 'Nombre Completo',
    nombreApellidoPlaceholder: 'Nombre Apellido',
    tipoDeCliente: 'Tipo de Cuenta',
    personal: 'Personal', personalDesc: 'Creador individual',
    empresa: 'Empresa', empresaDesc: 'LLC / Negocio',
    nombreEmpresa: 'Nombre de la Empresa',
    nombreEmpresaPlaceholder: 'Mi Empresa LLC',
    documentosLegales: 'Documentos Legales (LLC, Licencia Comercial)',
    documentosLegalesHint: 'PDF, JPG o PNG. Sube tus documentos de incorporación.',
    socialVerifRequerido: 'Requerido: al menos 2 perfiles de redes sociales activos',
    socialVerifNota: 'Las redes se toman de tu perfil. Guarda tu perfil primero si aún no las has agregado.',
    identidadVerifHeading: 'Verificación de Identidad (Stripe Identity)',
    identidadVerifDesc: 'Stripe verificará tu identidad con foto de documento + selfie. Esto garantiza que eres una persona real. Costo: $1.50 USD (cargo único al creador).',
    noVerificado: 'No verificado',
    iniciarVerifIdentidad: 'Iniciar Verificación de Identidad — $1.50',
    enviarSolicitud: 'Enviar Solicitud para Revisión',
    enviarSolicitudHint: 'Tu perfil será revisado por nuestro equipo. Te notificaremos cuando seas aprobado.',
    cuentaVerificada: 'Cuenta Verificada',
    cuentaVerificadaDesc: 'Tu cuenta está aprobada y activa',
    enRevision: 'En Revisión',
    enRevisionDesc: 'Tu solicitud está siendo revisada por nuestro equipo',
    enRevisionBanner: 'Tu solicitud de verificación está en revisión',
    solicitudRechazada: 'Solicitud Rechazada',
    sinRazon: 'No se proporcionó razón',
    solicitudRechazadaHint: 'Puedes corregir y enviar de nuevo.',
    noVerificadoLabel: 'No Verificado',
    noVerificadoDesc: 'Completa el formulario abajo para solicitar verificación',
    identidadVerificada: 'Identidad verificada',
    identidadVerificadaBtn: 'Verificado ✓',
    completaNombreTelEmail: 'Completa nombre, teléfono y email',
    agregaSocial: 'Agrega al menos 1 red social en tu perfil primero',
    ingresaNombreEmpresa: 'Ingresa el nombre de tu empresa',
    solicitudEnviada: 'Solicitud enviada. Te notificaremos pronto.',
    identidadVerificadaExito: '¡Identidad verificada exitosamente!',
    verificacionEnProceso: 'Verificación en proceso. Tu estado se actualizará en unos minutos.',
    stripeConectadoExito: '¡Stripe conectado exitosamente! Ya puedes recibir pagos.',
    stripeIncompleto: 'Configuración de Stripe incompleta. Intenta de nuevo.',
    verificacionCompletada: 'Verificación completada. Confirmando resultado...',

    // Dashboard — Metas tab
    metaBloqueadaTitulo: 'Debes ser verificado para crear metas',
    metaBloqueadaHint: 'Ve a la pestaña "Verificación" para iniciar el proceso.',
    crearMeta: 'Crear Nueva Meta',
    metaRecomendacion: 'Recomendación: Sube screenshots de los precios del producto/herramienta que necesitas con el link directo de compra. Esto genera credibilidad y transparencia para tus Supporters.',
    metaTituloPlaceholder: 'Título de la meta (ej: Nueva cámara para contenido)',
    metaDescPlaceholder: '¿Qué necesitas y para qué? Describe brevemente tu meta y cómo ayudará a tu trabajo como creador...',
    metaImagenesLabel: 'Imágenes / Screenshots de precio',
    metaImagenesHint: 'Sube imágenes del producto, screenshots de precios, o evidencia visual',
    metaVideoLabel: 'Video de la meta (opcional)',
    metaVideoHint: 'Sube un video explicando tu meta (Máx 50MB)',
    metaLinkLabel: 'Link de compra del producto (opcional pero recomendado)',
    metaGoalLabel: 'Meta ($)',
    metaInicioLabel: 'Inicio',
    metaFinLabel: 'Fin',
    crearMetaBtn: 'Crear Meta',
    invitacionesMetas: 'Invitaciones a Metas',
    metaAlcanzada: 'Meta Alcanzada',
    debesSerVerificado: 'Debes ser verificado para crear metas',
    creando: 'Creando...',
    completaMetaFields: 'Completa título, descripción, meta ($10 min), y fechas',
    subeMetaMedia: 'Sube al menos una imagen o video de tu meta',
    metaCreada: 'Meta creada',
    confirmarEliminarMeta: '¿Eliminar esta meta?',
    metaEliminada: 'Meta eliminada',
    metaTituloRequerido: 'El titulo es requerido',
    metaMinGoal: 'La meta debe ser al menos $1',
    metaActualizada: 'Meta actualizada',
    editarMeta: 'Editar Meta',
    metaDescLabel: 'Descripcion',
    estado: 'Estado',
    fechaInicio: 'Fecha Inicio', fechaFin: 'Fecha Fin',
    imagenesVideos: 'Imágenes / Videos',
    activa: 'Activa', inactiva: 'Inactiva',

    // Dashboard — 3-stage fund release
    liberacionFondos: 'Sistema de Liberación de Fondos en 3 Etapas',
    liberacionFondosDesc: 'Para proteger a los supporters y garantizar transparencia, los fondos de cada meta se liberan en 3 etapas verificadas.',
    etapa1Titulo: 'Retención en Stripe (7-14 días)',
    etapa1Desc: 'Los fondos se retienen para verificar que no sean pagos fraudulentos o tarjetas robadas.',
    etapa2Titulo: 'Primera liberación (50%)',
    etapa2Desc: 'Recibes la mitad. Debes subir recibo de compra + actualización a la comunidad (foto/video con descripción).',
    etapa3Titulo: 'Liberación final (50% restante)',
    etapa3Desc: 'Sube recibos finales, fotos y videos de la adquisición. El admin revisa y aprueba.',
    retencionStripe: 'Retención Stripe',
    confirmarProcederEtapa2: 'Confirmar y Proceder a Etapa 2',
    enviado: 'Enviado',
    esperandoAprobacion: 'Esperando aprobación...',
    reciboScreenshot: 'Recibo / Screenshot de compra *',
    actualizacionComunidad: 'Actualización para la comunidad * (qué hiciste con los fondos)',
    actualizacionPlaceholder: 'Ej: Compré el micrófono Blue Yeti en Amazon. ¡Llega en 3 días!',
    evidenciaFotoVideo: 'Foto o video de evidencia *',
    enviarEtapa2: 'Enviar Etapa 2 para Revisión',
    recibosFinales: 'Recibos finales y comprobantes *',
    descripcionAdquisicion: 'Descripción de la adquisición *',
    descripcionAdquisicionPlaceholder: 'Ej: Ya tengo el micrófono instalado. Aquí fotos del unboxing y setup completo.',
    enviarPruebaFinal: 'Enviar Prueba Final para Revisión',
    cancelarMeta: 'Cancelar esta meta',
    cancelarMetaWarning: 'Cancelar una meta requiere una explicación pública:',
    cancelarRazonPlaceholder: 'Explica por qué cancelas esta meta...',
    confirmarCancelacion: 'Confirmar Cancelación',
    noMantener: 'No, Mantener',
    etapa1Completa: 'Etapa 1 completada. Sube tus recibos para la Etapa 2.',
    subeRecibo: 'Sube al menos un recibo',
    escribeActualizacion: 'Escribe una actualización para tu comunidad',
    subeEvidencia: 'Sube al menos una foto o video de evidencia',
    subiendoDocumentos: 'Subiendo documentos...',
    etapa2Enviada: 'Etapa 2 enviada para revisión del admin',
    subePruebas: 'Sube recibos y pruebas de la adquisición',
    escribeDescAdquisicion: 'Escribe una descripción de la adquisición',
    subiendoPruebasFinales: 'Subiendo pruebas finales...',
    etapa3Enviada: 'Prueba final enviada para revisión del admin',
    debesEscribirRazon: 'Debes escribir una razón para cancelar',
    metaCancelada: 'Meta cancelada. El admin revisará tu explicación.',

    // Dashboard — Meta status badges
    creadorBaneado: 'Creador Baneado',
    fraudeCancelada: 'Meta Cancelada — Fraude',
    completadaAntesGracias: 'Meta Completada Antes de lo Esperado — Gracias al apoyo de todos',
    metaCanceladaBadge: 'Meta Cancelada',
    metaCompletadaLegitBadge: 'Meta Completada Legítimamente',
    adminReview: 'Meta en Review por Admin',
    adminRechazada: 'Rechazada por Admin',

    // Dashboard — Meta invites
    teInvitoColaborar: 'te invitó a colaborar',
    metaLabel: 'Meta:',
    sinTitulo: 'Sin título',
    unirseCreamos: 'Creamos',
    declinar: 'Declinar',
    alguienInvito: 'Alguien',
    teUnisteAMeta: '¡Te uniste a la meta! Ahora es una meta conjunta.',
    invitacionDeclinada: 'Invitación declinada',

    // Dashboard — Posts tab
    nuevaPublicacion: 'Nueva Publicación',
    nuevaPublicacionSub: 'Tu publicación aparecerá en la Comunidad para que todos la vean.',
    noPostsAun: 'Aún no tienes publicaciones',

    // Dashboard — Story tab
    miHistoriaTab: 'Mi Historia',
    miHistoriaSub: 'Deja que la gente te conozca más. Comparte cómo has llegado hasta aquí.',
    tituloHistoriaPlaceholder: 'Ej: Mi camino como creador',
    descripcionHistoria: 'Descripción',
    descripcionHistoriaPlaceholder: 'Cuéntale al mundo tu historia...',
    videoPrincipalHint: 'Explícale al mundo tu historia en no más de 5 minutos. Comparte cómo has llegado hasta aquí y luego di tu meta. (Máx 50MB)',
    mediaAdicional: 'Imágenes y Audios Adicionales',
    mediaAdicionalHint: 'Sube fotos de cartas escritas a mano, fotos de equipos antiguos, o graba un audio con tu historia. (Máx 10MB c/u)',
    compartirMuroComunidad: 'Compartir en el Muro de Comunidad',
    compartirMuroComunidadHint: 'Tu historia aparecerá en el feed de la comunidad',
    publicarHistoria: 'Publicar Historia',
    historiasPublicadas: 'Historias Publicadas',
    sinHistorias: 'Aún no has publicado historias',
    videoActual: 'Video actual',
    agregaDescVideoMedia: 'Agrega al menos una descripción, video o media',
    historiaPublicadaCompartida: 'Historia publicada y compartida en la comunidad',
    eliminarError: 'Error al eliminar',

    // Dashboard — Creaciones tab
    misCreacionesHeading: 'Mis Creaciones',
    misCreacionesSub: 'Agrega enlaces a tus productos, sitios web o servicios (máximo 10).',
    tituloEnlace: 'Título del enlace',
    urlEnlace: 'https://tu-sitio.com',
    descripcionCorta: 'Descripción corta (opcional)',
    imagenOpcional: 'Imagen (opcional)',
    agregarEnlace: 'Agregar Enlace',
    sinEnlaces: 'No tienes enlaces de negocio aún.',
    editarEnlace: 'Editar Enlace',
    tituloUrlRequeridos: 'Título y URL son requeridos',
    maxEnlaces: 'Máximo 10 enlaces permitidos',
    agregando: 'Agregando...',
    enlaceAgregado: 'Enlace agregado',
    confirmarEliminarEnlace: '¿Eliminar este enlace?',
    enlaceEliminado: 'Enlace eliminado',
    enlaceActualizado: 'Enlace actualizado',

    // Dashboard — Stripe tab
    stripeHeading: 'Conexión con Stripe',
    stripeSub: 'Conecta tu cuenta de Stripe para recibir pagos.',
    stripeConectarBtn: 'Conectar Stripe',
    stripeComision: 'CREO retiene un 5% de comisión por transacción. Stripe maneja todo el procesamiento de pagos de forma segura.',
    stripePlataforma: 'Cuenta de Plataforma',
    stripePlataformaDesc: 'Esta es la cuenta principal de CREO. Las comisiones del 5% se depositan directamente aquí.',

    // Dashboard — Branding tab
    brandingHeading: 'Mi Branding',
    brandingSub: 'Personaliza cómo los visitantes ven tu perfil.',
    imagenesPerfilHeading: 'Imágenes de perfil',
    cambiarFoto: 'Cambiar foto',
    cambiarPortada: 'Cambiar portada',
    temaPerfil: 'Tema del perfil',
    temaClaro: 'Claro', temaOscuro: 'Oscuro',
    textoPrincipal: 'Texto principal',
    titulosColor: 'Títulos',
    textoBoton: 'Texto de botones',
    fondoSecciones: 'Fondo de secciones',
    fondoBotones: 'Fondo de botones',
    fondoPagina: 'Fondo de página',
    tipografia: 'Tipografía',
    vistaPrevia: 'Vista previa de la tipografía seleccionada',
    bgMedia: 'Imagen o video de fondo',
    bgMediaPasteHint: 'O pega un enlace directo:',
    preview: 'Vista previa',
    previewPerfil: 'Así se verá tu perfil',
    previewSub: 'Los textos y secciones reflejan tus colores',
    previewCreoEnTi: 'Creo en Ti',
    previewApoyoFull: 'Apoyo Full',
    textoInvisible: 'Texto invisible.',
    botonPocoVisible: 'Texto de botón poco visible sobre el fondo',
    guardarBranding: 'Guardar Branding General',
    seccionMetasHeading: 'Sección de Metas',
    seccionMetasSub: 'Personaliza cómo se ven las metas en tu perfil',
    tituloSeccion: 'Título de la sección',
    colorBoton: 'Color del botón',
    colorTarjeta: 'Color de la tarjeta',
    guardarMetasBranding: 'Guardar Metas Branding',
    brandingGuardado: 'Branding guardado. Visita tu perfil para verlo.',
    textoInvisibleBloqueo: 'El texto no es visible sobre el fondo de secciones. Ajusta los colores.',
    errorGuardando: 'Error al guardar',
    avatarError: 'Error al guardar avatar',
    avatarActualizado: 'Foto de perfil actualizada',
    portadaError: 'Error al guardar portada',
    portadaActualizada: 'Portada actualizada',
    imagenMaxSize: 'Cada imagen max 5MB',
    errorSubiendoImagenToast: 'Error subiendo imagen',
    imagenesSubidas: ' imagen(es) subida(s)',
    docMaxSize: 'Documento max 10MB',
    docsSubidos: 'Documentos subidos',
    redirigiendo: 'Redirigiendo...',
    bgMediaSubida: 'Imagen de fondo cargada',
    mecenasGuardado: 'Mecenas guardado',
    imagenActualizada: 'Imagen actualizada',

    // Dashboard — Sounds tab
    sonidoNotifHeading: 'Sonido de Notificación',
    sonidoNotifSub: 'Elige el sonido que se reproducirá cuando recibas una nueva notificación.',
    activarSonidos: 'Activar sonidos',
    sonido: 'Sonido',
    volumen: 'Volumen:',
    previsualizar: 'Previsualizar',
    sonidosActivados: 'Sonidos activados',
    sonidosDesactivados: 'Sonidos desactivados',

    // Dashboard — Creo en Ellos tab
    creoEnEllosHeading: 'Yo Creo en Ellos',
    creoEnEllosSub: 'Selecciona los creadores que quieres destacar en tu perfil. Aparecerán en la sección "Yo Creo en Ellos" de tu página pública.',
    buscarCreador: 'Buscar creador por nombre o @usuario...',
    creadoresDestacados: 'Creadores destacados',
    sinCreadores: 'No has seleccionado ningún creador aún.',
    buscaArriba: 'Busca arriba para agregar creadores a tu sección.',
    buscando: 'Buscando...',
    sinResultados: 'No se encontraron creadores.',
    agregar: 'Agregar', quitar: 'Quitar',
    maxCreadores: 'Máximo 10 creadores destacados',

    // Dashboard — Mecenas tabs
    mecTipHeading: 'Yo Creo en Ti',
    mecTipSub: 'Personaliza cómo se ve la sección de tips en tu perfil',
    mecSubHeading: 'Apoyo Full',
    mecSubSub: 'Personaliza la sección de suscripciones mensuales',
    mecMetaDefaultTitle: 'Mi Meta',
    mecMetaDefaultDesc: 'Apoya mis metas como creador',

    // Dashboard — Onboarding
    onboardingBienvenido: '¡Bienvenido a CREO!',
    onboardingBienvenidoMsg: 'Tu cuenta ha sido confirmada. Te guiaremos paso a paso para configurar tu perfil de creador.',
    onboardingPerfil: 'Completa tu Perfil',
    onboardingPerfilMsg: 'Agrega tu nombre, foto de perfil y biografía. Esto es lo primero que verán las personas que te apoyan.',
    onboardingHistoria: 'Comparte tu Historia',
    onboardingHistoriaMsg: 'Cuéntale al mundo quién eres. Sube un video de hasta 5 minutos y fotos que cuenten tu historia. No es obligatorio, pero los creadores con historia reciben hasta 3x más apoyo.',
    onboardingHistoriaHighlight: 'Los creadores que comparten su historia reciben significativamente más apoyo. ¡Te lo recomendamos!',
    onboardingMeta: 'Crea tu Primera Meta',
    onboardingMetaMsg: 'Las metas son objetivos financieros. Publica qué necesitas, cuánto cuesta y deja que la comunidad te ayude a lograrlo.',
    onboardingStripe: 'Conecta Stripe',
    onboardingStripeMsg: 'Para recibir pagos necesitas conectar tu cuenta de Stripe. Es gratis y toma solo 5 minutos.',
    onboardingListo: '¡Listo para empezar!',
    onboardingListoMsg: 'Tu perfil público estará disponible en tu enlace personal. Compártelo en redes sociales para que te descubran.',
    saltarGuia: 'Saltar guía',
    atras: 'Atrás', siguiente: 'Siguiente', empezar: '¡Empezar!',

    // Dashboard — Misc
    hola: 'Hola, ',
    miHistoriaPost: 'Mi Historia',
    historia: 'historia', historias: 'historias',
    errorCamara2: 'No se pudo acceder: ',
    noAccesoDispositivo: 'No se pudo acceder a ',
    laCamara: 'la cámara', elMicrofono: 'el micrófono',

    // Emojis panel
    emojis: 'Emojis',

    // ===== EXPLORE PAGE =====
    explorarHeader: 'EXPLORAR',
    buscarCreadoresHistorias: 'Buscar creadores, historias...',
    sinHistoriasPublicadas: 'Aún no hay historias publicadas',
    resultados: 'Resultados',
    sinResultadosBusqueda: 'No se encontraron resultados',
    comentarios: 'Comentarios',
    escribirComentarioPlaceholder: 'Escribe un comentario...',
    linkCopiado: 'Link copiado al portapapeles',
    creador: 'Creador',
    historiaDe: 'Historia de ',
    iniciarSesionParaCreo: 'Inicia sesión para dar Creo',

    // Onboarding
    obWelcome1: 'CREO es una plataforma donde los creadores reciben apoyo directo de su comunidad.',
    obWelcome2: 'Puedes recibir tips, suscripciones mensuales y crear metas de fondeo.',
    obWelcome3: 'Tu perfil es tu escaparate — personalízalo con tu historia, redes y contenido.',
    obWelcome4: 'Estamos aquí para ayudarte a crecer. ¡Bienvenido/a!',
    obCreoIdTitle: 'Verificación CREO ID',
    obCreoIdDesc: 'Verifica tu identidad para recibir pagos y obtener la insignia de verificado.',
    obCreoIdBtn: 'Verificar mi identidad',
    obCreoIdSkip: 'Ahora no',
    obStripeTitle: 'Conectar Stripe',
    obStripeDesc: 'Conecta tu cuenta de Stripe para recibir pagos directamente.',
    obStripeBtn: 'Conectar Stripe',
    obStripeSkip: 'Configurar después',
    obTermsTitle: 'Términos y Condiciones',
    obTermsDesc: 'Para continuar, acepta nuestros términos de servicio y normas de comunidad.',
    obTermsAccept: 'Acepto los términos y condiciones',
    obTermsAcceptConduct: 'Acepto las normas de comunidad',
    obTermsBtn: 'Continuar',
  },

  en: {
    // Nav & sidebar
    comunidad: 'Community', explorar: 'Explore', creadores: 'Creators', mensajes: 'Messages', perfil: 'Profile',
    brandDeals: 'Brand Deals', panel: 'Dashboard', admin: 'Admin', tema: 'Theme', salir: 'Sign Out',
    entrarGoogle: 'Sign in with Google', idioma: 'Language',
    entrarCreoId: 'Sign in with CREO ID',

    // Auth
    sesionCerrada: 'Session closed', errorGoogle: 'Error connecting to Google',
    ingresaEmail: 'Enter your email', emailPlaceholder: 'you@email.com',
    continuar: 'Continue', cancelar: 'Cancel',
    linkEnviado: 'Access link sent to your email',
    iniciaSesion: 'Sign in', iniciaSesionPrimero: 'Sign in first',
    authHeading: 'Sign in to manage your dashboard',
    authSubtext: 'Use your Google account for secure access',
    continuarConGoogle: 'Continue with Google',
    authSecurityNote: 'CREO exclusively uses Google for sign-in. Your account is protected by Google authentication.',
    eresEmpresa: 'Are you a business or brand?',
    registrarEmpresa: 'Register as Business',
    aceptaTerminos: 'Accept the terms to continue',
    debesAceptarTerminos: 'You must accept the Terms and Privacy Policy',
    debesAceptarConducta: 'You must accept the community guidelines',
    cuentaCreada: 'Account created. Check your email to confirm.',
    ingresaEmailPassword: 'Enter email and password',

    // Verification bar
    connectStripe: 'Connect your Stripe account to receive payments',
    completaCreoId: 'Complete your CREO ID verification',
    conectando: 'Connecting...', iniciandoVerif: 'Starting verification...',
    stripeYaConectado: 'Your Stripe account is already connected.',
    errorStripe: 'Error connecting to Stripe.', errorVerif: 'Error starting verification.',
    errorSubiendo: 'Error uploading file',

    // Notifications
    notifVerifIniciada: 'Verification Started', notifVerifEnviada: 'Verification Submitted',
    notifVerificada: 'Identity Verified!', notifVerifRechazada: 'Verification Rejected',
    y: 'and', noNotifs: 'No notifications', marcarLeidas: 'Mark all read',
    notificaciones: 'Notifications', marcarLeidasFull: 'Mark read',
    sinNotificaciones: 'No notifications',
    notifsMarcadasLeidas: 'Notifications marked as read',

    // Reports
    reporteEnviado: 'Report sent. Thank you for helping the community.',
    reportarCreador: 'Report Creator',
    reportarSubtext: 'Help us keep the community safe. Your report is confidential.',
    seleccionaMotivo: 'Select a reason',
    motivoSexual: 'Sexually suggestive content',
    motivoDrogas: 'Drug use or promotion',
    motivoViolencia: 'Incitement to violence',
    motivoLenguaje: 'Profanity / offensive language',
    motivoDiscriminacion: 'Discrimination',
    motivoSpam: 'Spam or scam',
    motivoOtro: 'Other',
    detallesPlaceholder: 'Describe the issue (optional)',
    enviarReporte: 'Submit Report',

    // Cookie consent
    cookiesTitle: 'Cookies & Privacy',
    cookiesText: 'CREO uses essential cookies for authentication and local storage for your preferences. We do not use tracking or advertising cookies.',
    aceptar: 'Accept', masInfo: 'Learn more',

    // CREO ID modal
    verificaCreoId: 'Verify your CREO ID',
    creoIdSubtext: 'To publish deals and receive payments you need to verify your identity',
    personasReales: 'Real people',
    personasRealesDesc: 'Every CREO user is a verified real person. Your safety is our priority.',
    sinMenores: 'No minors',
    sinMenoresDesc: 'Children should be playing, learning, and in school. We only accept adults 18+ with ID.',
    tuIdSeguridad: 'Your ID, your safety',
    tuIdSeguridadDesc: 'We verify your identity only once. Your information is protected and never shared.',
    verificarCreoId: 'Verify my CREO ID',
    ahoraNo: 'Not now',
    verificacionRapida: 'Verification is fast, secure, and done only once.',
    preparando: 'Preparing...',
    noSePudoVerif: 'Could not start verification',
    errorConexion: 'Connection error',

    // Upload helper
    archivoMax: 'File max',
    subiendo: 'Uploading...',

    // ===== COMUNIDAD PAGE =====
    muro: 'Wall', cineLocal: 'Local Cinema', galeria: 'Gallery', biblioteca: 'Library',
    musica: 'Music', eventos: 'Events', general: 'General',
    queCompartir: 'What do you want to share with the community?',
    tituloOpcional: 'Title (optional)',
    normal: 'Normal', evento: 'Event', enVivo: 'Live',
    enlaceEvento: 'Link (Zoom, Meet, URL)',
    desdeNavegador: 'From the browser',
    urlStream: 'Stream URL',
    foto: 'Photo', video: 'Video', grabarVideo: 'Record Video', grabarAudio: 'Record Audio',
    publicar: 'Publish', publicando: 'Publishing...',
    escribeAlgoOMedia: 'Write something or add media',
    publicadoEnComunidad: 'Published to Community!',
    editarPost: 'Edit Post', titulo: 'Title', contenido: 'Content', media: 'Media',
    guardarCambios: 'Save Changes',
    eliminar: 'Delete', confirmarEliminar: 'Delete?',
    postEliminado: 'Post deleted', postActualizado: 'Post updated',
    comentar: 'Comment', comentaPlaceholder: 'Comment...',
    enviar: 'Send', sinComentarios: 'No comments yet',
    compartir: 'Share', enlaceCopiado: 'Link copied',
    editar: 'Edit',
    ahora: 'now', mes: 'month',
    reaccion: 'Reaction',
    iniciarSesionParaLike: 'Sign in to like',
    iniciarSesionParaComentar: 'Sign in to comment',
    iniciarSesionParaSeguir: 'Sign in to follow',
    iniciarSesionParaMensajes: 'Sign in to send messages',
    iniciarSesionParaReportar: 'Sign in to report',
    bienvenidoComunidad: 'Welcome to the Community',
    normasComunidad: 'Community Guidelines',
    grabandoVideo: 'Recording Video', grabandoAudio: 'Recording Audio',
    grabando: 'Recording...', procesando: 'Processing...',
    listoParaGrabar: 'Ready to record',
    guardar: 'Save', grabacionLista: 'Recording ready',
    subiendoGrabacion: 'Uploading recording...',

    // ===== MESSAGES PAGE =====
    conversaciones: 'Conversations', buscarConversacion: 'Search conversation...',
    nuevaConversacion: 'New conversation',
    escribeMensaje: 'Write a message...',
    iniciaConversacion: 'Start the conversation',
    sinConversaciones: 'You have no conversations yet',
    enviando: 'Sending...',
    buscarGif: 'Search GIF...',
    enviarGif: 'Send GIF',
    enviarImagen: 'Send image',
    grabarAudioMsg: 'Record audio',
    grabarVideoMsg: 'Record video',
    verPerfil: 'View profile',
    detener: 'Stop',
    imagenMax10mb: 'Image max 10MB',
    errorMicrofono: 'Could not access microphone',
    errorCamara: 'Could not access camera',
    errorSubiendoImagen: 'Error uploading image: ',
    errorSubiendoVideo: 'Error uploading video: ',
    errorSubiendoAudio: 'Error uploading audio: ',
    errorEnviandoMensaje: 'Error sending message',
    errorEnviandoVideo: 'Error sending video',
    videoSubido: 'Video uploaded',
    enviarVideo: 'Send',
    seleccionaConversacion: 'Select a conversation',
    buscaCreadorParaIniciar: 'or search a creator to start',
    noSeEncontraronCreadores: 'No creators found',
    escribeAlMenos2: 'Type at least 2 characters',
    buscarPorNombre: 'Search by name or @username...',
    buscarCreadores: 'Search creators...',
    sinMensajes: 'No messages',
    noTienesMensajes: 'You have no messages yet',
    buscaCreadorIniciar: 'Search a creator to start',
    nuevoMensaje: 'New Message',
    iniciarSesionVerMensajes: 'Sign in to see your messages',
    suelteParaEnviar: 'Release to send',
    mantenParaGrabar: 'Hold to record',
    enviaUnMensaje: 'Send a message to start',
    errorAlEnviar: 'Error sending',
    errorAlEnviarAudio: 'Error sending audio',

    // ===== BRAND DEALS PAGE =====
    crearDeal: 'Create Deal',
    misDeals: 'My Deals', todosDeals: 'All Deals',
    tituloDeal: 'Deal Title',
    descripcionDeal: 'Description',
    presupuesto: 'Budget ($)',
    categoria: 'Category',
    requisitos: 'Requirements',
    terminosCondiciones: 'Terms & Conditions',
    fechaEntrega: 'Delivery date',
    vibeVideo: 'Video vibe',
    descripcionPago: 'Payment description',
    portada: 'Cover',
    publicarDeal: 'Publish Deal',
    verDetalle: 'View Details',
    aplicar: 'Apply',
    chat: 'Chat',
    tratoHecho: 'Deal Done',
    pagarCreador: 'Pay Creator',
    dealPublicado: 'Deal published',
    errorCreandoDeal: 'Error creating deal',
    completaCampos: 'Complete all required fields',

    // ===== PROFILE PAGE =====
    cargando: 'Loading...',
    seguidores: 'Followers', siguiendo: 'Following',
    bienvenidoPagina: 'Welcome to my support page.',
    seguir: 'Follow', siguiendoBtn: 'Following',
    mensaje: 'Message', reportar: 'Report',
    noVerificadoTitulo: 'This creator has not been verified yet',
    noVerificadoSubtext: 'Payments will be available once approved.',
    miHistoria: 'My Story',
    yoCreoEnEllos: 'I Believe in Them',
    metasAlcanzadas: 'Goals Reached',
    publicaciones: 'Publications',
    misCreaciones: 'My Creations',
    verTodo: 'See all', slider: 'Slider',
    yoCreoEnTi: 'I Believe in You',
    miMeta: 'My Goal',
    apoyoFull: 'Full Support',
    desdeMeta: 'From Goal',
    enviaApoyoUnico: 'Send a one-time support to the creator',
    cantidadUsd: 'Amount (USD)',
    apoyarCreador: 'Support Creator',
    noMetasPublicadas: 'No goals published yet',
    noMetasOwner: 'You haven\'t published any goals yet',
    noMetasOwnerSub: 'Share your goal with the CREO community and receive support',
    crearPrimeraMeta: 'Create my first Goal',
    animaPrefix: 'Encourage @',
    animaSuffix: ' to share their goal with the CREO community.',
    contribuir: 'Contribute',
    apoyarDesdeMeta: 'Support from my Goal',
    apoyarDesdeMetaSub: 'Share funds from your active goal with this creator',
    seleccionaTuMeta: 'Select your Goal',
    cantidadEnviar: 'Amount to send (USD)',
    enviarDesdeMeta: 'Send from my Goal',
    fondosTransferencia: 'Funds are transferred directly from your goal to the creator',
    disponible: 'available',
    apoyoFullHeading: 'Full Support',
    apoyoFullSub: 'Support monthly with an amount you choose',
    cantidadMensual: 'Monthly Amount (USD)',
    porMes: '/month',
    suscribirme: 'Subscribe Monthly',
    cancelarEnCualquier: 'You can cancel at any time',
    metaCompletadaLegit: 'Goal Legitimately Completed',
    completadaAntes: 'Completed Ahead of Schedule',
    cancelada: 'Cancelled', enReview: 'In Review',
    completada: 'Completed', expirada: 'Expired', finalizada: 'Finalized',
    alcanzado: '% reached', de: 'of',
    verProductoPrecio: 'View product / price',
    verMas: 'See more', verMenos: 'See less',
    colaborador: 'contributor', colaboradores: 'contributors',
    escribirComentario: 'Write a comment...',
    creamos: 'Let\'s Create',
    creamosSubtext: 'Invite another creator to join this goal',
    creamosPlaceholder: 'Creator username (e.g.: my_friend)',
    enviarInvitacion: 'Send Invitation',
    noPerfilSeleccionado: 'No profile selected',
    perfilNoEncontrado: 'Profile Not Found',
    perfilNoEncontradoDesc: 'This creator does not exist or has not set up their page.',
    pagosNoDisponibles: 'Payments not available',
    montoMinimo1: 'Minimum amount: $1.00',
    montoMinimoMensual3: 'Minimum monthly amount: $3.00',
    seleccionaUnaMeta: 'Select a goal',
    montoMinimo1d: 'Minimum amount: $1',
    ingresaUsername: 'Enter a username',
    errorInvitando: 'Error inviting',
    errorEnviandoReporte: 'Error sending report',
    seguimientoNoDisponible: 'Follow feature not available yet',
    funcionSeguimientoNo: 'Follow feature not available yet',
    invitacionEnviada: 'Invitation sent to @',
    graciasApoyo: 'Thank you for your support!',
    graciasMeta: 'Thank you for contributing to the goal!',
    suscripcionActivada: 'Subscription activated! Thank you for your monthly support.',
    publicadoAmbosPerfil: 'Published to your profile and Community!',
    publicadoSoloPerfil: 'Published to your profile only!',
    archivosSubidos: ' file(s) uploaded',
    creadorVerificado: 'Verified Creator',

    // Profile — Edit Story Modal
    editarHistoria: 'Edit Story',
    tituloLabel: 'Title',
    resumenYoCreo: 'Summary for "I Believe in You"',
    resumenHint: 'This text appears when someone features you in their "I Believe in Them" section. Write something brief that inspires others to support you.',
    resumenPlaceholder: 'E.g.: I\'m an independent musician creating my first album...',
    tuHistoriaCompleta: 'Your Full Story',
    historiaCompletaHint: 'The full content of your story. Here you tell your journey, your vision, and why you do what you do.',
    historiaCompletaPlaceholder: 'Tell the world your story...',
    videoPrincipal: 'Main Video',
    sinVideoPrincipal: 'No main video',
    videoUrlPlaceholder: 'YouTube URL or direct video...',
    oSubeArchivo: 'or upload a file:',
    subirVideo: 'Upload Video',
    eliminarVideo: 'Remove Video',
    mediaAdjunta: 'Attached Media (images, videos, audio)',
    sinArchivosAdjuntos: 'No attachments',
    agregarImagenes: 'Add Images',
    grabarVideoOp: 'Record Video', subirVideoOp: 'Upload Video',
    grabarAudioOp: 'Record Audio', subirAudioOp: 'Upload Audio',
    guardando: 'Saving...',
    subiendoVideoPrincipal: 'Uploading main video...',
    archivosAdjuntos: 'Attachments',
    audio: 'Audio', archivo: 'File',
    max5min: 'Max 5 min',
    historiaActualizada: 'Story updated',
    historiaEliminada: 'Story deleted',
    grabacionGuardada: 'Recording saved',
    historiaPublicada: 'Story published',

    // Profile — DM modal
    verPerfilTitle: 'View profile',

    // Profile — Footer
    footerDisclaimer: 'Payments are voluntary, non-refundable, and not tax-deductible. Creators are responsible for their own taxes.',
    terminos: 'Terms', privacidad: 'Privacy', contacto: 'Contact',

    // Profile — Loading
    yoCreoEnTiLoading: 'I Believe in You',
    preparandoApoyo: 'Preparing your support...',
    verPerfilFlecha: 'View profile →',

    // Profile — Notifications text
    teApoyoCon: 'supported you with $',
    aAlguienLeGusto: 'Someone liked your goal',
    alguienCompartio: 'Someone shared your goal',
    nuevoComentarioMeta: 'New comment on your goal',
    nuevoComentarioHistoria: 'New comment on your story',
    nuevoSeguidor: 'You have a new follower',
    unCreador: 'A creator',
    eliminarHistoriaConfirm: 'Delete this story? This action cannot be undone.',

    // Profile — Admin impersonation
    actuarComo: 'Act as ',
    modoImpersonacion: 'Impersonation mode: ',

    // ===== INDEX (DASHBOARD) PAGE =====
    panelCreador: 'Creator Dashboard',
    posts: 'Posts', likes: 'Likes', metas: 'Goals', comments: 'Comments',
    tabPerfil: 'Profile', tabHistoria: 'Story', tabPosts: 'Posts',
    tabMetas: 'Goals', tabCreaciones: 'Creations', tabCreoEnEllos: 'I Believe in Them',
    tabHerramientas: 'Tools', tabMisMetas: 'My Goals', tabMecenas: 'Patrons',
    tabYoCreoEnTi: 'I Believe in You', tabApoyoFull: 'Full Support',
    tabVerificacion: 'Verification', tabStripe: 'Stripe',
    tabBranding: 'My Branding', tabSonidos: 'Sounds',

    // Dashboard — Profile tab
    infoPerfilHeading: 'Profile Information',
    fotoPerfilLabel: 'Profile Photo',
    imagenPortada: 'Cover Image',
    sinPortada: 'No cover',
    portadaRecomendacion: 'JPG, PNG. Max 5MB. Recommended: 1200×400px',
    nombre: 'First Name', apellido: 'Last Name',
    tuNombre: 'Your first name', tuApellido: 'Your last name',
    nombreUsuario: 'Username',
    nombreUsuarioPlaceholder: 'my_name',
    nombreMostrar: 'Display Name',
    nombreMostrarPlaceholder: 'Auto-generated',
    bio: 'Bio', bioPlaceholder: 'Tell the world who you are...',
    infoContacto: 'Contact Information',
    infoContactoSub: 'Visible on your public profile (optional)',
    emailContacto: 'Contact email',
    telefonoWhatsapp: 'Phone or WhatsApp',
    telefono: 'Phone', whatsapp: 'WhatsApp',
    sitioWeb: 'Website (https://...)',
    ciudad: 'City', pais: 'Country',
    redesSociales: 'Social Media',
    alMenos1Red: 'At least 1 social network is required',
    guardarPerfil: 'Save Profile',
    tuEnlacePublico: 'Your Public Link:',
    nombreApellidoRequeridos: 'First and last name are required',
    usernameMin3: 'Username minimum 3 characters',
    agregaRedSocial: 'Add at least 1 social network',
    perfilGuardado: 'Profile saved',

    // Dashboard — Verification tab
    verificacionHeading: 'Verification Request',
    verificacionDesc: 'To protect Supporters and maintain CREO\'s integrity, all creators must be verified before receiving payments. Complete the information and submit your request.',
    politicaContenido: 'Content Policy',
    noContenidoSexual: 'Sexual or adult content is not allowed',
    noContenidoDrogas: 'Goals for drugs or illegal substances are not allowed',
    noContenidoDonaciones: 'Donation requests are not accepted — everything is voluntary support',
    metasLegitimas: 'Goals must be for tools, equipment, or legitimate creator needs',
    empresasDocumentos: 'Businesses must submit legal documents (LLC, business license)',
    infoPersonal: 'Personal Information',
    nombreCompleto: 'Full Name',
    nombreApellidoPlaceholder: 'First Last',
    tipoDeCliente: 'Account Type',
    personal: 'Personal', personalDesc: 'Individual creator',
    empresa: 'Business', empresaDesc: 'LLC / Business',
    nombreEmpresa: 'Business Name',
    nombreEmpresaPlaceholder: 'My Business LLC',
    documentosLegales: 'Legal Documents (LLC, Business License)',
    documentosLegalesHint: 'PDF, JPG or PNG. Upload your incorporation documents.',
    socialVerifRequerido: 'Required: at least 2 active social media profiles',
    socialVerifNota: 'Social networks are taken from your profile. Save your profile first if you haven\'t added them yet.',
    identidadVerifHeading: 'Identity Verification (Stripe Identity)',
    identidadVerifDesc: 'Stripe will verify your identity with a document photo + selfie. This ensures you are a real person. Cost: $1.50 USD (one-time charge to creator).',
    noVerificado: 'Not verified',
    iniciarVerifIdentidad: 'Start Identity Verification — $1.50',
    enviarSolicitud: 'Submit Application for Review',
    enviarSolicitudHint: 'Your profile will be reviewed by our team. We\'ll notify you when approved.',
    cuentaVerificada: 'Verified Account',
    cuentaVerificadaDesc: 'Your account is approved and active',
    enRevision: 'Under Review',
    enRevisionDesc: 'Your application is being reviewed by our team',
    enRevisionBanner: 'Your verification request is under review',
    solicitudRechazada: 'Application Rejected',
    sinRazon: 'No reason provided',
    solicitudRechazadaHint: 'You can correct and resubmit.',
    noVerificadoLabel: 'Not Verified',
    noVerificadoDesc: 'Complete the form below to request verification',
    identidadVerificada: 'Identity verified',
    identidadVerificadaBtn: 'Verified ✓',
    completaNombreTelEmail: 'Complete name, phone, and email',
    agregaSocial: 'Add at least 1 social network in your profile first',
    ingresaNombreEmpresa: 'Enter your business name',
    solicitudEnviada: 'Application submitted. We\'ll notify you soon.',
    identidadVerificadaExito: 'Identity verified successfully!',
    verificacionEnProceso: 'Verification in progress. Your status will update in a few minutes.',
    stripeConectadoExito: 'Stripe connected successfully! You can now receive payments.',
    stripeIncompleto: 'Stripe setup incomplete. Try again.',
    verificacionCompletada: 'Verification completed. Confirming result...',

    // Dashboard — Metas tab
    metaBloqueadaTitulo: 'You must be verified to create goals',
    metaBloqueadaHint: 'Go to the "Verification" tab to start the process.',
    crearMeta: 'Create New Goal',
    metaRecomendacion: 'Recommendation: Upload screenshots of the product/tool prices you need with a direct purchase link. This builds credibility and transparency for your Supporters.',
    metaTituloPlaceholder: 'Goal title (e.g.: New camera for content)',
    metaDescPlaceholder: 'What do you need and why? Briefly describe your goal and how it will help your work as a creator...',
    metaImagenesLabel: 'Images / Price screenshots',
    metaImagenesHint: 'Upload product images, price screenshots, or visual evidence',
    metaVideoLabel: 'Goal video (optional)',
    metaVideoHint: 'Upload a video explaining your goal (Max 50MB)',
    metaLinkLabel: 'Product purchase link (optional but recommended)',
    metaGoalLabel: 'Goal ($)',
    metaInicioLabel: 'Start',
    metaFinLabel: 'End',
    crearMetaBtn: 'Create Goal',
    invitacionesMetas: 'Goal Invitations',
    metaAlcanzada: 'Goal Reached',
    debesSerVerificado: 'You must be verified to create goals',
    creando: 'Creating...',
    completaMetaFields: 'Complete title, description, goal ($10 min), and dates',
    subeMetaMedia: 'Upload at least one image or video of your goal',
    metaCreada: 'Goal created',
    confirmarEliminarMeta: 'Delete this goal?',
    metaEliminada: 'Goal deleted',
    metaTituloRequerido: 'Title is required',
    metaMinGoal: 'Goal must be at least $1',
    metaActualizada: 'Goal updated',
    editarMeta: 'Edit Goal',
    metaDescLabel: 'Description',
    estado: 'Status',
    fechaInicio: 'Start Date', fechaFin: 'End Date',
    imagenesVideos: 'Images / Videos',
    activa: 'Active', inactiva: 'Inactive',

    // Dashboard — 3-stage fund release
    liberacionFondos: '3-Stage Fund Release System',
    liberacionFondosDesc: 'To protect supporters and ensure transparency, funds for each goal are released in 3 verified stages.',
    etapa1Titulo: 'Stripe Hold (7-14 days)',
    etapa1Desc: 'Funds are held to verify they are not fraudulent payments or stolen cards.',
    etapa2Titulo: 'First Release (50%)',
    etapa2Desc: 'You receive half. You must upload a purchase receipt + community update (photo/video with description).',
    etapa3Titulo: 'Final Release (remaining 50%)',
    etapa3Desc: 'Upload final receipts, photos, and videos of the acquisition. Admin reviews and approves.',
    retencionStripe: 'Stripe Hold',
    confirmarProcederEtapa2: 'Confirm and Proceed to Stage 2',
    enviado: 'Sent',
    esperandoAprobacion: 'Waiting for approval...',
    reciboScreenshot: 'Receipt / Purchase screenshot *',
    actualizacionComunidad: 'Community update * (what you did with the funds)',
    actualizacionPlaceholder: 'E.g.: I bought the Blue Yeti microphone on Amazon. Arriving in 3 days!',
    evidenciaFotoVideo: 'Photo or video evidence *',
    enviarEtapa2: 'Submit Stage 2 for Review',
    recibosFinales: 'Final receipts and proof *',
    descripcionAdquisicion: 'Acquisition description *',
    descripcionAdquisicionPlaceholder: 'E.g.: I now have the microphone installed. Here are photos of the unboxing and complete setup.',
    enviarPruebaFinal: 'Submit Final Proof for Review',
    cancelarMeta: 'Cancel this goal',
    cancelarMetaWarning: 'Cancelling a goal requires a public explanation:',
    cancelarRazonPlaceholder: 'Explain why you are cancelling this goal...',
    confirmarCancelacion: 'Confirm Cancellation',
    noMantener: 'No, Keep It',
    etapa1Completa: 'Stage 1 completed. Upload your receipts for Stage 2.',
    subeRecibo: 'Upload at least one receipt',
    escribeActualizacion: 'Write an update for your community',
    subeEvidencia: 'Upload at least one photo or video evidence',
    subiendoDocumentos: 'Uploading documents...',
    etapa2Enviada: 'Stage 2 submitted for admin review',
    subePruebas: 'Upload receipts and proof of acquisition',
    escribeDescAdquisicion: 'Write an acquisition description',
    subiendoPruebasFinales: 'Uploading final proof...',
    etapa3Enviada: 'Final proof submitted for admin review',
    debesEscribirRazon: 'You must write a reason for cancellation',
    metaCancelada: 'Goal cancelled. Admin will review your explanation.',

    // Dashboard — Meta status badges
    creadorBaneado: 'Creator Banned',
    fraudeCancelada: 'Goal Cancelled — Fraud',
    completadaAntesGracias: 'Goal Completed Ahead of Schedule — Thanks to everyone\'s support',
    metaCanceladaBadge: 'Goal Cancelled',
    metaCompletadaLegitBadge: 'Goal Legitimately Completed',
    adminReview: 'Goal Under Admin Review',
    adminRechazada: 'Rejected by Admin',

    // Dashboard — Meta invites
    teInvitoColaborar: 'invited you to collaborate',
    metaLabel: 'Goal:',
    sinTitulo: 'No title',
    unirseCreamos: 'Let\'s Create',
    declinar: 'Decline',
    alguienInvito: 'Someone',
    teUnisteAMeta: 'You joined the goal! It\'s now a joint goal.',
    invitacionDeclinada: 'Invitation declined',

    // Dashboard — Posts tab
    nuevaPublicacion: 'New Post',
    nuevaPublicacionSub: 'Your post will appear in the Community for everyone to see.',
    noPostsAun: 'You don\'t have any posts yet',

    // Dashboard — Story tab
    miHistoriaTab: 'My Story',
    miHistoriaSub: 'Let people get to know you better. Share how you got here.',
    tituloHistoriaPlaceholder: 'E.g.: My journey as a creator',
    descripcionHistoria: 'Description',
    descripcionHistoriaPlaceholder: 'Tell the world your story...',
    videoPrincipalHint: 'Tell the world your story in no more than 5 minutes. Share how you got here and then state your goal. (Max 50MB)',
    mediaAdicional: 'Additional Images and Audio',
    mediaAdicionalHint: 'Upload photos of handwritten letters, old equipment photos, or record an audio with your story. (Max 10MB each)',
    compartirMuroComunidad: 'Share on Community Wall',
    compartirMuroComunidadHint: 'Your story will appear in the community feed',
    publicarHistoria: 'Publish Story',
    historiasPublicadas: 'Published Stories',
    sinHistorias: 'You haven\'t published any stories yet',
    videoActual: 'Current video',
    agregaDescVideoMedia: 'Add at least a description, video, or media',
    historiaPublicadaCompartida: 'Story published and shared in the community',
    eliminarError: 'Error deleting',

    // Dashboard — Creaciones tab
    misCreacionesHeading: 'My Creations',
    misCreacionesSub: 'Add links to your products, websites, or services (max 10).',
    tituloEnlace: 'Link title',
    urlEnlace: 'https://your-site.com',
    descripcionCorta: 'Short description (optional)',
    imagenOpcional: 'Image (optional)',
    agregarEnlace: 'Add Link',
    sinEnlaces: 'You don\'t have any business links yet.',
    editarEnlace: 'Edit Link',
    tituloUrlRequeridos: 'Title and URL are required',
    maxEnlaces: 'Maximum 10 links allowed',
    agregando: 'Adding...',
    enlaceAgregado: 'Link added',
    confirmarEliminarEnlace: 'Delete this link?',
    enlaceEliminado: 'Link deleted',
    enlaceActualizado: 'Link updated',

    // Dashboard — Stripe tab
    stripeHeading: 'Stripe Connection',
    stripeSub: 'Connect your Stripe account to receive payments.',
    stripeConectarBtn: 'Connect Stripe',
    stripeComision: 'CREO retains a 5% commission per transaction. Stripe handles all payment processing securely.',
    stripePlataforma: 'Platform Account',
    stripePlataformaDesc: 'This is CREO\'s main account. The 5% commissions are deposited directly here.',

    // Dashboard — Branding tab
    brandingHeading: 'My Branding',
    brandingSub: 'Customize how visitors see your profile.',
    imagenesPerfilHeading: 'Profile images',
    cambiarFoto: 'Change photo',
    cambiarPortada: 'Change cover',
    temaPerfil: 'Profile theme',
    temaClaro: 'Light', temaOscuro: 'Dark',
    textoPrincipal: 'Main text',
    titulosColor: 'Titles',
    textoBoton: 'Button text',
    fondoSecciones: 'Section background',
    fondoBotones: 'Button background',
    fondoPagina: 'Page background',
    tipografia: 'Typography',
    vistaPrevia: 'Selected typography preview',
    bgMedia: 'Background image or video',
    bgMediaPasteHint: 'Or paste a direct link:',
    preview: 'Preview',
    previewPerfil: 'This is how your profile will look',
    previewSub: 'Text and sections reflect your colors',
    previewCreoEnTi: 'I Believe',
    previewApoyoFull: 'Full Support',
    textoInvisible: 'Invisible text.',
    botonPocoVisible: 'Button text barely visible on background',
    guardarBranding: 'Save General Branding',
    seccionMetasHeading: 'Goals Section',
    seccionMetasSub: 'Customize how goals look on your profile',
    tituloSeccion: 'Section title',
    colorBoton: 'Button color',
    colorTarjeta: 'Card color',
    guardarMetasBranding: 'Save Goals Branding',
    brandingGuardado: 'Branding saved. Visit your profile to see it.',
    textoInvisibleBloqueo: 'Text is not visible on the section background. Adjust the colors.',
    errorGuardando: 'Error saving',
    avatarError: 'Error saving avatar',
    avatarActualizado: 'Profile photo updated',
    portadaError: 'Error saving cover',
    portadaActualizada: 'Cover updated',
    imagenMaxSize: 'Each image max 5MB',
    errorSubiendoImagenToast: 'Error uploading image',
    imagenesSubidas: ' image(s) uploaded',
    docMaxSize: 'Document max 10MB',
    docsSubidos: 'Documents uploaded',
    redirigiendo: 'Redirecting...',
    bgMediaSubida: 'Background image loaded',
    mecenasGuardado: 'Patron settings saved',
    imagenActualizada: 'Image updated',

    // Dashboard — Sounds tab
    sonidoNotifHeading: 'Notification Sound',
    sonidoNotifSub: 'Choose the sound that will play when you receive a new notification.',
    activarSonidos: 'Enable sounds',
    sonido: 'Sound',
    volumen: 'Volume:',
    previsualizar: 'Preview',
    sonidosActivados: 'Sounds enabled',
    sonidosDesactivados: 'Sounds disabled',

    // Dashboard — Creo en Ellos tab
    creoEnEllosHeading: 'I Believe in Them',
    creoEnEllosSub: 'Select the creators you want to feature on your profile. They will appear in the "I Believe in Them" section of your public page.',
    buscarCreador: 'Search creator by name or @username...',
    creadoresDestacados: 'Featured creators',
    sinCreadores: 'You haven\'t selected any creators yet.',
    buscaArriba: 'Search above to add creators to your section.',
    buscando: 'Searching...',
    sinResultados: 'No creators found.',
    agregar: 'Add', quitar: 'Remove',
    maxCreadores: 'Maximum 10 featured creators',

    // Dashboard — Mecenas tabs
    mecTipHeading: 'I Believe in You',
    mecTipSub: 'Customize how the tips section looks on your profile',
    mecSubHeading: 'Full Support',
    mecSubSub: 'Customize the monthly subscriptions section',
    mecMetaDefaultTitle: 'My Goal',
    mecMetaDefaultDesc: 'Support my goals as a creator',

    // Dashboard — Onboarding
    onboardingBienvenido: 'Welcome to CREO!',
    onboardingBienvenidoMsg: 'Your account has been confirmed. We\'ll guide you step by step to set up your creator profile.',
    onboardingPerfil: 'Complete your Profile',
    onboardingPerfilMsg: 'Add your name, profile photo, and bio. This is the first thing people who support you will see.',
    onboardingHistoria: 'Share your Story',
    onboardingHistoriaMsg: 'Tell the world who you are. Upload a video up to 5 minutes and photos that tell your story. It\'s not mandatory, but creators with stories receive up to 3x more support.',
    onboardingHistoriaHighlight: 'Creators who share their story receive significantly more support. We highly recommend it!',
    onboardingMeta: 'Create your First Goal',
    onboardingMetaMsg: 'Goals are financial objectives. Post what you need, how much it costs, and let the community help you achieve it.',
    onboardingStripe: 'Connect Stripe',
    onboardingStripeMsg: 'To receive payments you need to connect your Stripe account. It\'s free and takes only 5 minutes.',
    onboardingListo: 'Ready to go!',
    onboardingListoMsg: 'Your public profile will be available at your personal link. Share it on social media so people can discover you.',
    saltarGuia: 'Skip guide',
    atras: 'Back', siguiente: 'Next', empezar: 'Let\'s go!',

    // Dashboard — Misc
    hola: 'Hello, ',
    miHistoriaPost: 'My Story',
    historia: 'story', historias: 'stories',
    errorCamara2: 'Could not access: ',
    noAccesoDispositivo: 'Could not access ',
    laCamara: 'the camera', elMicrofono: 'the microphone',

    // Emojis panel
    emojis: 'Emojis',

    // ===== EXPLORE PAGE =====
    explorarHeader: 'EXPLORE',
    buscarCreadoresHistorias: 'Search creators, stories...',
    sinHistoriasPublicadas: 'No stories published yet',
    resultados: 'Results',
    sinResultadosBusqueda: 'No results found',
    comentarios: 'Comments',
    escribirComentarioPlaceholder: 'Write a comment...',
    linkCopiado: 'Link copied to clipboard',
    creador: 'Creator',
    historiaDe: 'Story by ',
    iniciarSesionParaCreo: 'Sign in to give Creo',

    // Onboarding
    obWelcome1: 'CREO is a platform where creators receive direct support from their community.',
    obWelcome2: 'You can receive tips, monthly subscriptions, and create funding goals.',
    obWelcome3: 'Your profile is your showcase — customize it with your story, social links, and content.',
    obWelcome4: 'We\'re here to help you grow. Welcome!',
    obCreoIdTitle: 'CREO ID Verification',
    obCreoIdDesc: 'Verify your identity to receive payments and earn your verified badge.',
    obCreoIdBtn: 'Verify my identity',
    obCreoIdSkip: 'Not now',
    obStripeTitle: 'Connect Stripe',
    obStripeDesc: 'Connect your Stripe account to receive payments directly.',
    obStripeBtn: 'Connect Stripe',
    obStripeSkip: 'Set up later',
    obTermsTitle: 'Terms & Conditions',
    obTermsDesc: 'To continue, accept our terms of service and community guidelines.',
    obTermsAccept: 'I accept the terms and conditions',
    obTermsAcceptConduct: 'I accept the community guidelines',
    obTermsBtn: 'Continue',
  }
};

function getCreoLang() { return localStorage.getItem('creo_lang') || 'es'; }
function setCreoLang(lang) {
  localStorage.setItem('creo_lang', lang);
  window.location.reload();
}
function t(key) { return (CREO_TRANSLATIONS[getCreoLang()] || CREO_TRANSLATIONS.es)[key] || (CREO_TRANSLATIONS.es)[key] || key; }
function toggleCreoLang() { setCreoLang(getCreoLang() === 'es' ? 'en' : 'es'); }

function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && val !== key) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val && val !== key) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val && val !== key) el.title = val;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = t(key);
    if (val && val !== key) el.innerHTML = val;
  });
}

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
    const username = 'user_' + Math.floor(Math.random() * 100000);
    await sb.from('profiles').insert([{
      id: user.id,
      username,
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
    showToast(t('errorGoogle'), 'error');
    console.error(err);
  }
}

async function signOut() {
  await sb.auth.signOut();
  showToast(t('sesionCerrada'), 'success');
  setTimeout(() => { window.location.href = 'comunidad.html'; }, 500);
}

async function signInWithCreoId() {
  const emailInput = document.getElementById('creo-id-email-input');
  if (!emailInput) return;
  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) { showToast(t('ingresaEmail'), 'error'); return; }
  try {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://fullnessmindset.github.io/creo/redirect.html' }
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(t('linkEnviado'), 'success');
    document.querySelectorAll('.creo-id-form').forEach(f => f.remove());
  } catch(e) { showToast(t('errorGoogle'), 'error'); }
}

function showCreoIdForm(container) {
  const existing = container.querySelector('.creo-id-form');
  if (existing) { existing.remove(); return; }
  const form = document.createElement('div');
  form.className = 'creo-id-form mt-2 space-y-2';
  form.innerHTML = `
    <input id="creo-id-email-input" type="email" placeholder="${t('emailPlaceholder')}" class="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-creo-purple focus:ring-1 focus:ring-creo-purple">
    <div class="flex gap-2">
      <button onclick="signInWithCreoId()" class="flex-1 bg-creo-purple text-white text-sm font-semibold py-2 rounded-lg hover:bg-creo-light transition">${t('continuar')}</button>
      <button onclick="this.closest('.creo-id-form').remove()" class="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition">${t('cancelar')}</button>
    </div>`;
  container.appendChild(form);
  form.querySelector('input').focus();
}

// ========== CREO ID (Stripe Identity Verification Gate) ==========

let _creoIdVerified = null;

async function isCreoIdVerified() {
  if (_creoIdVerified !== null) return _creoIdVerified;
  const user = await getCachedUser();
  if (!user) return false;
  if (isAdmin(user.email)) { _creoIdVerified = true; return true; }
  const profile = await getCachedProfile(user.id);
  _creoIdVerified = profile?.identity_verified === true;
  return _creoIdVerified;
}

async function requireCreoId(action) {
  const user = await getCachedUser();
  if (!user) { showToast(t('iniciaSesion'), 'error'); return false; }
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
        <h3 class="text-xl font-bold text-gray-900">${t('verificaCreoId')}</h3>
        <p class="text-sm text-gray-500">${t('creoIdSubtext')}</p>
      </div>

      <div class="space-y-3">
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🛡️</span>
          <div>
            <p class="text-sm font-bold text-green-800">${t('personasReales')}</p>
            <p class="text-xs text-green-700">${t('personasRealesDesc')}</p>
          </div>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🎓</span>
          <div>
            <p class="text-sm font-bold text-blue-800">${t('sinMenores')}</p>
            <p class="text-xs text-blue-700">${t('sinMenoresDesc')}</p>
          </div>
        </div>

        <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
          <span class="text-2xl flex-shrink-0">🔒</span>
          <div>
            <p class="text-sm font-bold text-purple-800">${t('tuIdSeguridad')}</p>
            <p class="text-xs text-purple-700">${t('tuIdSeguridadDesc')}</p>
          </div>
        </div>
      </div>

      <button onclick="startCreoIdVerification()" id="creo-id-verify-btn" class="w-full bg-creo-purple hover:bg-creo-light text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2">
        <img src="assets/logo-icon.png" class="w-5 h-5 rounded-full" alt="">
        <span>${t('verificarCreoId')}</span>
      </button>

      <button onclick="closeCreoIdModal()" class="w-full text-gray-400 text-sm hover:text-gray-600 transition py-1">${t('ahoraNo')}</button>

      <div class="text-center">
        <p class="text-[10px] text-gray-400">${t('verificacionRapida')}</p>
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
  if (btn) { btn.textContent = t('preparando'); btn.disabled = true; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast(t('iniciaSesionPrimero'), 'error'); return; }
    const returnUrl = window.location.href.split('?')[0] + '?verification=complete';
    const res = await fetch(SUPABASE_URL + '/functions/v1/create-identity-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ return_url: returnUrl })
    });
    const result = await res.json();
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    if (result.url) {
      window.location.href = result.url;
    } else {
      showToast(t('noSePudoVerif'), 'error');
    }
  } catch (e) {
    showToast(t('errorConexion'), 'error');
    console.error(e);
  } finally {
    if (btn) { btn.innerHTML = '<img src="assets/logo-icon.png" class="w-5 h-5 rounded-full" alt=""><span>' + t('verificarCreoId') + '</span>'; btn.disabled = false; }
  }
}

// ========== THEME (light mode only) ==========
function initTheme() {
  localStorage.setItem('creo-theme', 'light');
  document.documentElement.classList.remove('dark');
  document.body.classList.add('bg-white', 'text-gray-900');
  document.body.classList.remove('bg-gray-900', 'text-white');
}
function isDark() { return false; }
function applyTheme() { initTheme(); }
function toggleTheme() {}
function updateThemeIcons() {}
function applyThemeToFixedElements() {}

// Generic file upload helper
async function uploadToStorage(file, bucket, maxMB) {
  if (!file) return null;
  if (file.size > (maxMB || 10) * 1024 * 1024) { showToast(t('archivoMax') + ' ' + (maxMB || 10) + 'MB', 'error'); return null; }
  const user = await getCachedUser();
  if (!user) { showToast(t('iniciaSesion'), 'error'); return null; }
  const ext = file.name.split('.').pop();
  const path = user.id + '/' + Date.now() + '.' + ext;
  showToast(t('subiendo'), 'info');
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
  if (window.self !== window.top) return;
  const items = [
    { id: 'comunidad', label: t('comunidad'), href: 'comunidad.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>' },
    { id: 'explore', label: t('explorar'), href: 'explore.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>' },
    { id: 'feed', label: t('creadores'), href: 'feed.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
    { id: 'messages', label: t('mensajes'), href: 'messages.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>', authOnly: true },
    { id: 'profile', label: t('perfil'), href: 'profile.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
    { id: 'deals', label: t('brandDeals'), href: 'brand-deals.html', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.193 23.193 0 0112 15c-3.183 0-6.22-.64-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>' },
    { id: 'dashboard', label: t('panel'), href: 'index.html?panel=1', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>', authOnly: true }
  ];

  // Desktop sidebar
  const sidebar = document.createElement('aside');
  sidebar.id = 'creo-sidebar';
  sidebar.className = 'fixed left-0 top-0 bottom-0 w-[220px] bg-white border-r border-gray-200 z-40 hidden lg:flex flex-col transition-colors';
  sidebar.innerHTML = `
    <div class="p-5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img src="assets/logo-icon.png" class="w-8 h-8 rounded-full" alt="CREO">
        <span class="text-lg font-bold tracking-[0.15em] text-creo-purple">CREO</span>
      </div>
      <div id="sidebar-bell-area"></div>
    </div>
    <nav class="flex-1 px-3 space-y-1">
      ${items.map(item => `
        <a href="${item.href}" ${item.authOnly ? 'data-auth-only="true"' : ''} class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${activePage === item.id ? 'bg-creo-purple/10 text-creo-purple' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
          ${item.label}
        </a>`).join('')}
      <a href="admin.html" data-admin-only="true" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-gray-600 hover:bg-gray-100 hover:text-gray-900" style="display:none">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        ${t('admin')}
      </a>
    </nav>
    <div class="p-4 border-t border-gray-200 space-y-2">
      <button onclick="toggleCreoLang()" class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition w-full">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
        ${getCreoLang() === 'es' ? 'English' : 'Español'}
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
          ${t('admin')}
        </a>
      </nav>
      <div class="p-4 border-t border-gray-200 space-y-2">
        <button onclick="toggleCreoLang()" class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition w-full">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
          ${getCreoLang() === 'es' ? 'English' : 'Español'}
        </button>
        <div id="mobile-auth-area"></div>
      </div>
    </div>`;
  document.body.appendChild(mobileMenu);

  // Global safe-area layout system via CSS variables
  const style = document.createElement('style');
  style.id = 'creo-layout-vars';
  style.textContent = `
    :root {
      --creo-header-h: 57px;
      --creo-sidebar-w: 220px;
      --creo-nav-top: var(--creo-header-h);
      --creo-nav-left: 0px;
      --creo-content-top: var(--creo-header-h);
      --creo-content-left: 0px;
    }
    @media(min-width:1024px){
      :root {
        --creo-header-h: 0px;
        --creo-nav-top: 0px;
        --creo-nav-left: var(--creo-sidebar-w);
        --creo-content-top: 0px;
        --creo-content-left: var(--creo-sidebar-w);
      }
      body { padding-top: 0 !important; padding-left: var(--creo-sidebar-w) !important; }
      .fixed.inset-0:not(#creo-sidebar):not(#creo-mobile-menu):not(#creo-mobile-header) { left: var(--creo-sidebar-w) !important; }
    }
    @media(max-width:1023px){
      body { padding-top: var(--creo-header-h) !important; }
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('lg:pl-[220px]');

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
  const user = await getCachedUser();
  document.querySelectorAll('[data-auth-only]').forEach(el => {
    el.style.display = user ? '' : 'none';
  });
  if (user) {
    const data = await getCachedProfile(user.id);
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
      ${t('salir')}</button>`;
    const sa = document.getElementById('sidebar-auth-area');
    if (sa) sa.innerHTML = authHtml;
    const ma = document.getElementById('mobile-auth-area');
    if (ma) ma.innerHTML = authHtml;
  } else {
    const googleIcon = `<svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;
    const creoIdIcon = `<img src="assets/logo-icon.png" class="w-5 h-5 rounded-full flex-shrink-0" alt="CREO">`;
    const loginHtml = `<div class="space-y-2">
      <button onclick="signInWithGoogle()" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition w-full shadow-sm">
        ${googleIcon} ${t('entrarGoogle')}
      </button>
      <button onclick="showCreoIdForm(this.parentElement)" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-creo-purple text-white hover:bg-creo-light transition w-full">
        ${creoIdIcon} ${t('entrarCreoId')}
      </button>
    </div>`;
    const sa = document.getElementById('sidebar-auth-area');
    if (sa) sa.innerHTML = loginHtml;
    const ma = document.getElementById('mobile-auth-area');
    if (ma) ma.innerHTML = loginHtml;
  }
}

// Notifications
async function loadNotificationBell() {
  const user = await getCachedUser();
  if (!user) return;
  const count = await getNotifCountCached();
  const bellHTML = `<div class="relative p-2"><svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>${count > 0 ? `<span class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">${count > 9 ? '9+' : count}</span>` : ''}</div>`;
  document.querySelectorAll('.notif-bell-instance').forEach(el => el.remove());
  const targets = [document.getElementById('mobile-header-right'), document.getElementById('sidebar-bell-area')];
  targets.forEach(target => {
    if (!target) return;
    const bell = document.createElement('div');
    bell.id = 'notif-bell';
    bell.className = 'notif-bell-instance cursor-pointer';
    bell.onclick = () => toggleNotifPanel();
    bell.innerHTML = bellHTML;
    target.appendChild(bell);
  });
}

async function toggleNotifPanel() {
  let panel = document.getElementById('notif-panel');
  if (panel) { panel.remove(); return; }
  const user = await getCachedUser();
  if (!user) return;
  const { data } = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'fixed top-12 right-4 z-[60] w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl bg-white border border-gray-200';
  if (!data || data.length === 0) {
    panel.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">' + t('sinNotificaciones') + '</p>';
  } else {
    const defaultIcons = { like: '❤️', comment: '💬', payment: '💰', approval: '✅', rejection: '❌', invite: '🤝', share: '🔗', meta_like: '❤️', meta_comment: '💬', follow: '👤', message: '✉️' };
    const categoryColors = { verification: 'border-l-purple-500', payment: 'border-l-creo-mint', admin: 'border-l-blue-500', warning: 'border-l-red-500', general: 'border-l-gray-300' };
    const priorityBg = { urgent: 'bg-red-50', high: 'bg-yellow-50', normal: '', low: '' };
    panel.innerHTML = `<div class="p-3 border-b border-gray-200 flex justify-between items-center"><span class="font-bold text-sm text-gray-900">${t('notificaciones')}</span><button onclick="markAllRead()" class="text-xs text-creo-mint hover:underline">${t('marcarLeidasFull')}</button></div>` +
      data.map(n => {
        const link = n.action_url || n.link || getNotifDefaultLink(n);
        const icon = n.icon || defaultIcons[n.type] || '🔔';
        const catClass = categoryColors[n.category] || 'border-l-gray-300';
        const priBg = priorityBg[n.priority] || '';
        const safeLink = link ? link.replace(/['"<>&]/g, c => ({'\'':'&#39;','"':'&quot;','<':'&lt;','>':'&gt;','&':'&amp;'}[c])) : '';
        return `<div class="px-3 py-2.5 border-b border-gray-100 border-l-3 ${catClass} ${priBg} ${n.is_read ? 'opacity-60' : ''} hover:bg-gray-50 transition cursor-pointer" style="border-left-width:3px" onclick="${safeLink ? `window.location.href='${safeLink}'` : ''}">
          <div class="flex gap-2">
            <span>${icon}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900">${esc(n.title)}${n.priority === 'urgent' ? ' <span class="text-[10px] text-red-500 font-bold">URGENTE</span>' : ''}</p>
              ${n.body ? `<p class="text-xs text-gray-500 truncate">${esc(n.body)}</p>` : ''}
              <p class="text-[10px] text-gray-400 mt-0.5">${new Date(n.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>`;
      }).join('');
  }
  document.body.appendChild(panel);
  document.addEventListener('click', closeNotifOnClickOutside);
  sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false).then(() => {});
  cacheInvalidate('notif_count');
  loadNotificationBell();
}

function closeNotifOnClickOutside(e) {
  const panel = document.getElementById('notif-panel');
  const isBell = e.target.closest('.notif-bell-instance');
  if (panel && !panel.contains(e.target) && !isBell) {
    panel.remove();
    document.removeEventListener('click', closeNotifOnClickOutside);
  }
}

async function markAllRead() {
  const user = await getCachedUser();
  if (!user) return;
  await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id);
  cacheInvalidate('notif_count');
  loadNotificationBell();
  const panel = document.getElementById('notif-panel');
  if (panel) panel.remove();
  showToast(t('notifsMarcadasLeidas'), 'success');
}

async function createNotification(targetUserId, type, title, body, link, opts = {}) {
  if (!targetUserId) return;
  const user = await getCachedUser();
  if (user && user.id === targetUserId) return;
  await sb.from('notifications').insert([{
    user_id: targetUserId, type, title, body, link: link || null,
    category: opts.category || 'general',
    priority: opts.priority || 'normal',
    icon: opts.icon || null,
    action_url: opts.action_url || null
  }]);
}

function getNotifDefaultLink(n) {
  if (n.type === 'invite') return 'index.html#metas';
  if (n.type === 'comment' || n.type === 'meta_comment') return n.link || 'index.html';
  if (n.type === 'payment') return 'index.html#stripe';
  if (n.type === 'approval') return 'index.html#verify';
  if (n.type === 'rejection') return 'index.html#verify';
  return null;
}

// Emoji Picker — Full iOS emoji library
const EMOJI_CATEGORIES = {
  '😀 Caras': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊'],
  '👋 Gestos': ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','🫷','🫸','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🫦'],
  '👤 Personas': ['👶','👧','🧒','👦','👩','🧑','👨','👩‍🦱','🧑‍🦱','👨‍🦱','👩‍🦰','🧑‍🦰','👨‍🦰','👱‍♀️','👱','👱‍♂️','👩‍🦳','🧑‍🦳','👨‍🦳','👩‍🦲','🧑‍🦲','👨‍🦲','🧔‍♀️','🧔','🧔‍♂️','👵','🧓','👴','👲','👳‍♀️','👳','👳‍♂️','🧕','👮‍♀️','👮','👮‍♂️','👷‍♀️','👷','👷‍♂️','💂‍♀️','💂','💂‍♂️','🕵️‍♀️','🕵️','🕵️‍♂️','👩‍⚕️','🧑‍⚕️','👨‍⚕️','👩‍🌾','🧑‍🌾','👨‍🌾','👩‍🍳','🧑‍🍳','👨‍🍳','👩‍🎓','🧑‍🎓','👨‍🎓','👩‍🎤','🧑‍🎤','👨‍🎤','👩‍🏫','🧑‍🏫','👨‍🏫','👩‍🏭','🧑‍🏭','👨‍🏭','👩‍💻','🧑‍💻','👨‍💻','👩‍💼','🧑‍💼','👨‍💼','👩‍🔧','🧑‍🔧','👨‍🔧','👩‍🔬','🧑‍🔬','👨‍🔬','👩‍🎨','🧑‍🎨','👨‍🎨','👩‍🚒','🧑‍🚒','👨‍🚒','👩‍✈️','🧑‍✈️','👨‍✈️','👩‍🚀','🧑‍🚀','👨‍🚀','👩‍⚖️','🧑‍⚖️','👨‍⚖️','🤴','👸','🫅','🦸‍♀️','🦸','🦸‍♂️','🦹‍♀️','🦹','🦹‍♂️','🧙‍♀️','🧙','🧙‍♂️','🧚‍♀️','🧚','🧚‍♂️','🧛‍♀️','🧛','🧛‍♂️','🧜‍♀️','🧜','🧜‍♂️','🧝‍♀️','🧝','🧝‍♂️','🧞‍♀️','🧞','🧞‍♂️','🧟‍♀️','🧟','🧟‍♂️','🧌','💆‍♀️','💆','💆‍♂️','💇‍♀️','💇','💇‍♂️','🚶‍♀️','🚶','🚶‍♂️','🧍‍♀️','🧍','🧍‍♂️','🧎‍♀️','🧎','🧎‍♂️','🏃‍♀️','🏃','🏃‍♂️','💃','🕺','🕴️','👯‍♀️','👯','👯‍♂️','🧖‍♀️','🧖','🧖‍♂️','🧗‍♀️','🧗','🧗‍♂️'],
  '❤️ Corazones': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🩷','🩵','🩶'],
  '🐾 Animales': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🫎','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🪼','🐊','🐅','🐆','🦓','🫏','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🪿','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  '🍔 Comida': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫛','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🫚','🥐','🥖','🍞','🥨','🥯','🫓','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🫕','🥙','🧆','🥚','🍲','🫙','🥘','🍝','🍜','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🫘','🍯','🥛','🫗','🍼','🍵','☕','🫖','🧃','🥤','🧋','🫧','🍶','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊'],
  '⚽ Deportes': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️‍♀️','🏋️','🏋️‍♂️','🤸‍♀️','🤸','🤸‍♂️','⛹️‍♀️','⛹️','⛹️‍♂️','🤺','🤾‍♀️','🤾','🤾‍♂️','🏌️‍♀️','🏌️','🏌️‍♂️','🏇','🧘‍♀️','🧘','🧘‍♂️','🏄‍♀️','🏄','🏄‍♂️','🏊‍♀️','🏊','🏊‍♂️','🤽‍♀️','🤽','🤽‍♂️','🚣‍♀️','🚣','🚣‍♂️','🧗‍♀️','🧗','🧗‍♂️','🚵‍♀️','🚵','🚵‍♂️','🚴‍♀️','🚴','🚴‍♂️','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪'],
  '🚗 Viajes': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','🛞','⛽','🛞','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🛶','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🛝','🎡','🎢','💈','🎪','🗾','🎑','🏞️'],
  '💡 Objetos': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','🪙','💵','💴','💶','💷','🪪','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
  '🔣 Símbolos': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','👁️‍🗨️','🔚','🔙','🔛','🔝','🔜','〰️','➰','➿','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢'],
  '🏁 Banderas': ['🏳️','🏴','🏴‍☠️','🏁','🚩','🎌','🏳️‍🌈','🏳️‍⚧️','🇺🇸','🇪🇸','🇲🇽','🇦🇷','🇧🇷','🇨🇴','🇨🇱','🇵🇪','🇻🇪','🇪🇨','🇬🇹','🇨🇺','🇩🇴','🇭🇳','🇨🇷','🇵🇦','🇵🇷','🇺🇾','🇵🇾','🇧🇴','🇸🇻','🇳🇮','🇫🇷','🇩🇪','🇮🇹','🇬🇧','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇨🇦','🇦🇺','🇷🇺','🇵🇹','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇮🇪','🇵🇱','🇹🇷','🇬🇷','🇮🇱','🇪🇬','🇿🇦','🇳🇬','🇰🇪','🇲🇦','🇸🇦','🇦🇪','🇶🇦','🇹🇭','🇻🇳','🇵🇭','🇮🇩','🇲🇾','🇸🇬','🇳🇿']
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
  return `<button type="button" id="${btnId}" class="p-1.5 text-gray-400 hover:text-yellow-500 transition rounded-lg hover:bg-gray-100" title="${t('emojis')}">😊</button>`;
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
          <p class="text-sm font-semibold text-gray-900">${t('cookiesTitle')}</p>
          <p class="text-xs text-gray-500 mt-1">${t('cookiesText')}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="acceptCookies()" class="flex-1 bg-creo-purple text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-creo-light transition">${t('aceptar')}</button>
        <a href="privacidad.html" class="flex-1 text-center border border-gray-300 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition">${t('masInfo')}</a>
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

// Inject global CSS
(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* Real-time notification bubble */
    .creo-notif-bubble {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      max-width: 320px;
      min-width: 220px;
      padding: 14px 18px;
      background: linear-gradient(135deg, #1a0a3e 0%, #6b21a8 100%);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(26,10,62,0.5), 0 0 0 1px rgba(51,240,176,0.3);
      opacity: 0;
      transform: translateX(120%);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    }
    @media(min-width:1024px) {
      .creo-notif-bubble { right: 24px; top: 20px; }
    }
    @keyframes creo-bell-ring {
      0%,100% { transform: rotate(0); }
      15% { transform: rotate(14deg); }
      30% { transform: rotate(-12deg); }
      45% { transform: rotate(10deg); }
      60% { transform: rotate(-8deg); }
      75% { transform: rotate(4deg); }
    }
    .creo-bell-ring svg { animation: creo-bell-ring 0.6s ease-in-out; }
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

let _creoAudio = null;
function _playCreoMp3(volume) {
  try {
    if (_creoAudio) { _creoAudio.pause(); _creoAudio.currentTime = 0; }
    _creoAudio = new Audio('assets/sounds/creo-default.mp3');
    _creoAudio.volume = Math.min(1, Math.max(0, volume));
    _creoAudio.play().catch(() => {});
  } catch(e) {}
}

function playNotificationSound() {
  const prefs = getNotifSoundPrefs();
  if (!prefs.enabled) return;
  _playCreoMp3(prefs.volume);
}

function previewNotificationSound(soundId) {
  const prefs = getNotifSoundPrefs();
  _playCreoMp3(prefs.volume);
}

// Real-time notification system via Supabase Realtime
const NOTIF_ICONS = { like: '❤️', comment: '💬', payment: '💰', approval: '✅', rejection: '❌', invite: '🤝', share: '🔗', meta_like: '❤️', meta_comment: '💬', follow: '👤', message: '✉️' };

function showNotifBubble(notif) {
  const icon = notif.icon || NOTIF_ICONS[notif.type] || '🔔';
  const catBorders = { verification: '#8b5cf6', payment: '#33f0b0', admin: '#3b82f6', warning: '#ef4444' };
  const borderColor = catBorders[notif.category] || '#33f0b0';
  const bubble = document.createElement('div');
  bubble.className = 'creo-notif-bubble';
  bubble.style.borderLeft = `3px solid ${borderColor}`;
  bubble.innerHTML = `
    <div class="flex items-center gap-2.5">
      <span class="text-lg flex-shrink-0">${icon}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white truncate">${esc(notif.title || 'Nueva notificación')}${notif.priority === 'urgent' ? ' ⚠️' : ''}</p>
        ${notif.body ? `<p class="text-xs text-white/70 truncate">${esc(notif.body)}</p>` : ''}
      </div>
    </div>`;
  document.body.appendChild(bubble);
  requestAnimationFrame(() => {
    bubble.style.opacity = '1';
    bubble.style.transform = 'translateX(0)';
  });
  setTimeout(() => flyToBell(bubble), 2500);
}

function flyToBell(bubble) {
  const bell = document.querySelector('.notif-bell-instance');
  if (!bell) { bubble.remove(); return; }
  const bellRect = bell.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const dx = bellRect.left + bellRect.width / 2 - (bubbleRect.left + bubbleRect.width / 2);
  const dy = bellRect.top + bellRect.height / 2 - (bubbleRect.top + bubbleRect.height / 2);
  bubble.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
  bubble.style.transform = `translate(${dx}px, ${dy}px) scale(0.1)`;
  bubble.style.opacity = '0';
  bubble.style.borderRadius = '50%';
  setTimeout(() => {
    bubble.remove();
    document.querySelectorAll('.notif-bell-instance').forEach(b => {
      b.classList.add('creo-bell-ring');
      setTimeout(() => b.classList.remove('creo-bell-ring'), 600);
    });
    loadNotificationBell();
  }, 500);
}

// Real-time via Supabase Realtime + polling fallback
let _realtimeNotifChannel = null;
let _lastNotifCount = -1;
let _notifPollTimer = null;

async function initRealtimeNotifications() {
  const user = await getCachedUser();
  if (!user) return;
  if (_realtimeNotifChannel) sb.removeChannel(_realtimeNotifChannel);
  _realtimeNotifChannel = sb.channel('notif-' + user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, (payload) => {
      const notif = payload.new;
      playNotificationSound();
      showNotifBubble(notif);
      loadNotificationBell();
    })
    .subscribe((status) => {
      console.log('[CREO] Realtime notif status:', status);
      if (status === 'SUBSCRIBED') {
        if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startNotifPolling();
      }
    });
}

async function pollNotifications() {
  try {
    const user = await getCachedUser();
    if (!user) return;
    cacheInvalidate('notif_count');
    const { data, count } = await sb.from('notifications').select('*', { count: 'exact' }).eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(1);
    if (_lastNotifCount >= 0 && count > _lastNotifCount && data && data[0]) {
      const notif = data[0];
      playNotificationSound();
      showNotifBubble(notif);
      loadNotificationBell();
    }
    _lastNotifCount = count || 0;
  } catch(e) {}
}

function startNotifPolling() {
  if (_notifPollTimer) return;
  _notifPollTimer = setInterval(pollNotifications, 15000);
  pollNotifications();
}

(function startNotifSystem() {
  setTimeout(async () => {
    try {
      const user = await getCachedUser();
      if (!user) return;
      _lastNotifCount = -1;
      const count = await getNotifCountCached();
      _lastNotifCount = count || 0;
      await initRealtimeNotifications();
    } catch(e) { console.log('[CREO] Notif init error:', e); startNotifPolling(); }
  }, 2000);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      _lastNotifCount = -1;
      setTimeout(() => { initRealtimeNotifications(); }, 1000);
    }
    if (event === 'SIGNED_OUT') {
      cacheClear(); _cachedUser = null; _cachedUserTs = 0; _creoIdVerified = null;
      if (_realtimeNotifChannel) { sb.removeChannel(_realtimeNotifChannel); _realtimeNotifChannel = null; }
      if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
    }
  });
})();

// Backward compatibility — old pages still calling renderBottomNav
function renderBottomNav(activePage) { renderSidebar(activePage); }
function updateNavAuth() { updateSidebarAuth(); }

// ========== ANNOUNCEMENT BUBBLE ==========
let _annBubbleTimer = null;
const ANN_MAX_VIEWS = 3;

function getAnnTracker() {
  try { return JSON.parse(localStorage.getItem('creo_ann_tracker') || '{}'); } catch { return {}; }
}
function saveAnnTracker(tracker) {
  localStorage.setItem('creo_ann_tracker', JSON.stringify(tracker));
}
function shouldShowAnn(id) {
  const tracker = getAnnTracker();
  const entry = tracker[id];
  if (!entry) return true;
  if (entry.views >= ANN_MAX_VIEWS) return false;
  const today = new Date().toDateString();
  if (entry.lastShown === today) return false;
  return true;
}
function recordAnnView(id) {
  const tracker = getAnnTracker();
  const today = new Date().toDateString();
  if (!tracker[id]) tracker[id] = { views: 0, lastShown: '' };
  tracker[id].views += 1;
  tracker[id].lastShown = today;
  saveAnnTracker(tracker);
}

async function loadAnnouncementBar() {
  try {
    const user = await getCachedUser();
    const { data: anns } = await sb.from('announcements').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (!anns || !anns.length) return;
    let profile = null;
    if (user) profile = await getCachedProfile(user.id);
    const matching = anns.filter(a => {
      if (!shouldShowAnn(a.id)) return false;
      if (a.target_type === 'global') return true;
      if (a.target_type === 'user') return user && a.target_user_id === user.id;
      if (!profile) return false;
      const t = profile.account_type || 'creator';
      if (a.target_type === 'creator') return t === 'creator';
      if (a.target_type === 'empresa' || a.target_type === 'brand') return t === 'brand' || t === 'empresa' || t === 'business';
      if (a.target_type === 'admin') return t === 'admin';
      return false;
    });
    if (!matching.length) return;
    showAnnouncementBubble(matching[0], user);
  } catch(e) { console.log('Announcement bubble:', e); }
}

function showAnnouncementBubble(a, user) {
  const existing = document.getElementById('announcement-bubble');
  if (existing) existing.remove();
  if (_annBubbleTimer) { clearTimeout(_annBubbleTimer); _annBubbleTimer = null; }

  const borderColors = { info: '#4f46e5', success: '#33f0b0', warning: '#facc15', error: '#ef4444' };
  const progressColors = { info: '#4f46e5', success: '#33f0b0', warning: '#facc15', error: '#ef4444' };
  const borderColor = borderColors[a.style] || borderColors.info;
  const progressColor = progressColors[a.style] || progressColors.info;
  const icon = a.icon || '';

  const bubble = document.createElement('div');
  bubble.id = 'announcement-bubble';
  bubble.setAttribute('data-ann-id', a.id);
  bubble.setAttribute('data-ann-creator', a.created_by || '');
  bubble.setAttribute('data-ann-message', a.message || '');
  bubble.setAttribute('data-ann-icon', a.icon || '');
  bubble.style.cssText = `position:fixed;bottom:80px;right:16px;z-index:9999;max-width:340px;width:calc(100% - 32px);background:rgba(255,255,255,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#1a0a3e;border-radius:16px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.06);border:2px solid ${borderColor};animation:annBubbleIn 0.35s ease-out;font-family:inherit;`;
  bubble.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      ${icon ? `<span style="font-size:20px;flex-shrink:0;margin-top:1px;">${icon}</span>` : ''}
      <div style="flex:1;min-width:0;">
        <p style="font-size:11px;color:#6b7280;margin:0 0 3px;font-weight:600;letter-spacing:0.05em;">CREO</p>
        <p style="font-size:14px;line-height:1.4;margin:0;word-wrap:break-word;color:#1f2937;">${esc(a.message)}</p>
      </div>
      <button onclick="dismissAnnouncement('${esc(a.id)}')" style="flex-shrink:0;background:rgba(0,0,0,0.06);border:none;color:#9ca3af;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;margin-top:-2px;transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.12)'" onmouseout="this.style.background='rgba(0,0,0,0.06)'" aria-label="Close">&times;</button>
    </div>
    <div style="margin-top:8px;height:3px;background:rgba(0,0,0,0.06);border-radius:2px;overflow:hidden;">
      <div id="ann-bubble-progress" style="height:100%;background:${progressColor};border-radius:2px;width:100%;transition:width 10s linear;"></div>
    </div>`;
  document.body.appendChild(bubble);

  if (!document.getElementById('ann-bubble-style')) {
    const s = document.createElement('style');
    s.id = 'ann-bubble-style';
    s.textContent = `@keyframes annBubbleIn{from{opacity:0;transform:translateY(20px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}@keyframes annBubbleOut{from{opacity:1;transform:translateY(0) scale(1);}to{opacity:0;transform:translateY(20px) scale(0.9);}}@media(min-width:1024px){#announcement-bubble{right:32px;bottom:32px;max-width:380px;}}`;
    document.head.appendChild(s);
  }

  requestAnimationFrame(() => {
    const bar = document.getElementById('ann-bubble-progress');
    if (bar) bar.style.width = '0%';
  });

  recordAnnView(a.id);
  _annBubbleTimer = setTimeout(() => dismissAnnouncement(a.id), 10000);
}

async function dismissAnnouncement(id) {
  if (_annBubbleTimer) { clearTimeout(_annBubbleTimer); _annBubbleTimer = null; }
  const bubble = document.getElementById('announcement-bubble');
  if (!bubble) return;

  const annId = bubble.getAttribute('data-ann-id');
  const creatorId = bubble.getAttribute('data-ann-creator');
  const message = bubble.getAttribute('data-ann-message');
  const annIcon = bubble.getAttribute('data-ann-icon') || '';

  bubble.style.animation = 'annBubbleOut 0.25s ease-in forwards';
  setTimeout(() => bubble.remove(), 250);

  // Save as message only on the final (3rd) view
  const tracker = getAnnTracker();
  const entry = tracker[id];
  const isFinalView = entry && entry.views >= ANN_MAX_VIEWS;

  if (isFinalView) {
    try {
      const user = await getCachedUser();
      if (user && creatorId && creatorId !== user.id && message) {
        const prefix = annIcon ? annIcon + ' ' : '';
        await sb.from('messages').insert({
          sender_id: creatorId,
          receiver_id: user.id,
          body: prefix + message,
          is_read: true
        });
      }
    } catch(e) { console.log('Save announcement to messages:', e); }
  }
}
setTimeout(loadAnnouncementBar, 1500);

// ========== VERIFICATION REMINDER BAR ==========
async function showVerificationReminder() {
  try {
    if (localStorage.getItem('creo_dismiss_verify_bar')) return;
    const user = await getCachedUser();
    if (!user || user.email === ADMIN_EMAIL) return;
    const p = await getCachedProfile(user.id);
    if (!p) return;
    const needsStripe = !p.stripe_onboarded;
    const needsCreoId = !p.identity_verified;
    if (!needsStripe && !needsCreoId) return;
    const msgs = [];
    if (needsStripe) msgs.push(t('connectStripe'));
    if (needsCreoId) msgs.push(t('completaCreoId'));
    const bar = document.createElement('div');
    bar.id = 'verify-reminder-bar';
    bar.className = 'bg-gradient-to-r from-creo-purple to-purple-700 text-white text-sm text-center py-2.5 px-4 relative z-50';
    const action = needsStripe ? 'startVerifyStripe' : 'startVerifyCreoId';
    bar.innerHTML = `<a href="#" onclick="event.preventDefault();window.${action}(this)" class="hover:underline font-medium">${msgs.join(' ' + t('y') + ' ')} →</a><button onclick="dismissVerifyBar()" class="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 text-lg leading-none">&times;</button>`;
    const existing = document.getElementById('announcement-bar');
    if (existing) existing.after(bar);
    else document.body.prepend(bar);
  } catch(e) {}
}
function dismissVerifyBar() {
  localStorage.setItem('creo_dismiss_verify_bar', '1');
  const bar = document.getElementById('verify-reminder-bar');
  if (bar) bar.remove();
}

window.startVerifyStripe = async function(el) {
  try {
    if (el) el.textContent = t('conectando');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const res = await fetch(SUPABASE_URL + '/functions/v1/stripe-onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ redirect_url: window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'redirect.html' })
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; }
    else if (data.already_connected) { showToast(t('stripeYaConectado'), 'success'); dismissVerifyBar(); }
    else { showToast(data.error || t('errorStripe'), 'error'); if (el) el.textContent = t('connectStripe') + ' →'; }
  } catch(e) { showToast(t('errorStripe'), 'error'); if (el) el.textContent = t('connectStripe') + ' →'; }
};

window.startVerifyCreoId = async function(el) {
  try {
    if (el) el.textContent = t('iniciandoVerif');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const res = await fetch(SUPABASE_URL + '/functions/v1/create-identity-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ return_url: window.location.href.split('?')[0] + '?verification=complete' })
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; }
    else { showToast(data.error || t('errorVerif'), 'error'); if (el) el.textContent = t('completaCreoId') + ' →'; }
  } catch(e) { showToast(t('errorVerif'), 'error'); if (el) el.textContent = t('completaCreoId') + ' →'; }
};

setTimeout(showVerificationReminder, 2000);

// ========== RETURN URL HANDLERS ==========
(function handleReturnParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('verification') === 'complete' && !window.location.pathname.includes('index.html')) {
    setTimeout(() => showToast('Verificación de identidad completada.', 'success'), 1000);
  }
  if (p.get('stripe') === 'success' && !window.location.pathname.includes('index.html') && !window.location.pathname.includes('redirect.html')) {
    setTimeout(() => showToast('¡Stripe conectado exitosamente!', 'success'), 1000);
  }
  if (p.get('status') === 'payment_sent' && !window.location.pathname.includes('brand-deals.html')) {
    setTimeout(() => showToast('Pago enviado exitosamente.', 'success'), 1000);
  }
})();

initTheme();
initCookieConsent();

// ========== ONBOARDING SYSTEM ==========
const ONBOARDING_VERSION = '1.0';

let _onboardingTriggered = false;
let _engagementScore = 0;
const ENGAGEMENT_THRESHOLD = 3;

function getOnboardingState() {
  try { return JSON.parse(localStorage.getItem('creo_onboarding') || '{}'); } catch(e) { return {}; }
}
function saveOnboardingState(updates) {
  const state = { ...getOnboardingState(), ...updates };
  localStorage.setItem('creo_onboarding', JSON.stringify(state));
}

function trackEngagement(signal) {
  if (_onboardingTriggered) return;
  _engagementScore++;
  if (_engagementScore >= ENGAGEMENT_THRESHOLD) {
    checkAndTriggerOnboarding();
  }
}

async function checkAndTriggerOnboarding() {
  if (_onboardingTriggered) return;
  const user = await getCachedUser();
  if (!user) return;
  if (isAdmin(user.email)) return;

  const profile = await getCachedProfile(user.id);

  if (profile?.onboarding_completed || profile?.terms_accepted_at) {
    saveOnboardingState({ completed: true });
    return;
  }

  const state = getOnboardingState();
  if (state.completed || state.dismissedAt) {
    const dismissedAge = Date.now() - (state.dismissedAt || 0);
    if (dismissedAge < 24 * 60 * 60 * 1000) return;
  }

  _onboardingTriggered = true;
  showOnboardingModal(user, profile);
}

function showOnboardingModal(user, profile) {
  let existing = document.getElementById('creo-onboarding-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'creo-onboarding-modal';
  modal.className = 'fixed inset-0 z-[400] flex items-center justify-center p-4';
  modal.style.cssText = 'animation: onboard-fade-in 0.4s ease';

  const steps = [
    { id: 'welcome', render: renderWelcomeStep },
    { id: 'creoid', render: renderCreoIdStep },
    { id: 'stripe', render: renderStripeStep },
    { id: 'terms', render: renderTermsStep },
  ];
  let currentStep = 0;

  function render() {
    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" style="animation:onboard-fade-in 0.3s ease"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" style="animation:onboard-slide-up 0.4s cubic-bezier(0.16,1,0.3,1)">
        <div class="h-1 bg-gray-100 rounded-t-2xl overflow-hidden">
          <div class="h-full bg-gradient-to-r from-creo-purple to-creo-mint transition-all duration-500" style="width:${progress}%"></div>
        </div>
        <div class="p-6" id="onboard-step-content"></div>
      </div>`;
    const container = modal.querySelector('#onboard-step-content');
    step.render(container);
  }

  function nextStep() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      render();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      render();
    }
  }

  window._onboardNext = nextStep;
  window._onboardPrev = prevStep;
  window._onboardDismiss = () => {
    saveOnboardingState({ dismissedAt: Date.now() });
    modal.remove();
  };
  window._onboardAcceptTerms = async () => {
    const cb1 = document.getElementById('ob-terms-check');
    const cb2 = document.getElementById('ob-privacy-check');
    const cb3 = document.getElementById('ob-community-check');
    const cb4 = document.getElementById('ob-stripe-check');
    if (!cb1?.checked || !cb2?.checked || !cb3?.checked || !cb4?.checked) {
      showToast(t('aceptaTerminos'), 'error');
      return;
    }
    const btn = document.getElementById('ob-accept-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('guardando'); }
    try {
      await sb.rpc('accept_platform_terms', { p_policy_version: ONBOARDING_VERSION, p_app_version: ONBOARDING_VERSION });
      saveOnboardingState({ completed: true });
      modal.remove();
      showToast(t('onboardingBienvenido'), 'success');
      _creoIdVerified = null;
    } catch(e) {
      console.error('Terms acceptance error:', e);
      const { data: { user: u } } = await sb.auth.getUser();
      if (u) {
        await sb.from('profiles').update({ terms_accepted_at: new Date().toISOString(), onboarding_completed: true, onboarding_completed_at: new Date().toISOString() }).eq('id', u.id);
      }
      saveOnboardingState({ completed: true });
      modal.remove();
      showToast(t('onboardingBienvenido'), 'success');
    }
  };

  render();
  document.body.appendChild(modal);
}

function renderWelcomeStep(container) {
  container.innerHTML = `
    <div class="text-center space-y-4">
      <div class="w-20 h-20 rounded-full bg-gradient-to-br from-creo-purple to-creo-light flex items-center justify-center mx-auto shadow-lg">
        <img src="assets/logo-icon.png" class="w-12 h-12 rounded-full" alt="CREO">
      </div>
      <h2 class="text-2xl font-bold text-gray-900">${t('onboardingBienvenido')}</h2>
      <div class="space-y-3 text-left">
        <p class="text-sm text-gray-600 leading-relaxed">${t('obWelcome1')}</p>
        <p class="text-sm text-gray-600 leading-relaxed">${t('obWelcome2')}</p>
        <p class="text-sm text-gray-600 leading-relaxed">${t('obWelcome3')}</p>
        <p class="text-sm text-gray-600 leading-relaxed">${t('obWelcome4')}</p>
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="_onboardDismiss()" class="flex-1 text-gray-400 text-sm hover:text-gray-600 transition py-2.5">${t('ahoraNo')}</button>
        <button onclick="_onboardNext()" class="flex-1 bg-creo-purple hover:bg-creo-light text-white font-bold py-2.5 rounded-xl transition">${t('continuar')}</button>
      </div>
    </div>`;
}

function renderCreoIdStep(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button onclick="_onboardPrev()" class="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="text-xl font-bold text-gray-900 flex-1">${t('obCreoIdTitle')}</h2>
      </div>
      <div class="space-y-3">
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
          <span class="text-xl flex-shrink-0">🛡️</span>
          <div>
            <p class="text-sm font-bold text-green-800">Personas Reales</p>
            <p class="text-xs text-green-700">La verificación de identidad confirma que cada usuario es una persona real. Esto protege a toda la comunidad.</p>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <span class="text-xl flex-shrink-0">🔒</span>
          <div>
            <p class="text-sm font-bold text-blue-800">Protección de Datos</p>
            <p class="text-xs text-blue-700">CREO <strong>nunca almacena</strong> tus documentos de identidad. La verificación es realizada de forma segura por <strong>Stripe Identity</strong>.</p>
          </div>
        </div>
        <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
          <span class="text-xl flex-shrink-0">✅</span>
          <div>
            <p class="text-sm font-bold text-purple-800">Comunidad Protegida</p>
            <p class="text-xs text-purple-700">La verificación protege a creadores, apoyadores y marcas contra fraude y actividad maliciosa.</p>
          </div>
        </div>
      </div>
      <button onclick="_onboardNext()" class="w-full bg-creo-purple hover:bg-creo-light text-white font-bold py-3 rounded-xl transition">Continuar</button>
    </div>`;
}

function renderStripeStep(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button onclick="_onboardPrev()" class="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="text-xl font-bold text-gray-900 flex-1">${t('obStripeTitle')}</h2>
      </div>
      <div class="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5 space-y-3">
        <div class="flex items-center gap-2">
          <svg class="w-8 h-8 text-indigo-600" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
          <span class="text-lg font-bold text-indigo-900">Stripe</span>
        </div>
        <p class="text-sm text-indigo-800">Stripe es nuestra infraestructura de pagos segura. Protege:</p>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>💳</span> Pagos</div>
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>💚</span> Tips</div>
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>⭐</span> Suscripciones</div>
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>🤝</span> Brand Deals</div>
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>🪪</span> Verificación de Identidad</div>
          <div class="flex items-center gap-2 text-xs text-indigo-700"><span>🔒</span> Datos Bancarios</div>
        </div>
      </div>
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-3">
        <span class="text-xl flex-shrink-0">🔐</span>
        <div>
          <p class="text-sm font-bold text-gray-800">Tu información está segura</p>
          <p class="text-xs text-gray-600">CREO <strong>nunca almacena</strong> información bancaria. Toda la información sensible de pago permanece con Stripe.</p>
        </div>
      </div>
      <button onclick="_onboardNext()" class="w-full bg-creo-purple hover:bg-creo-light text-white font-bold py-3 rounded-xl transition">Continuar</button>
    </div>`;
}

function renderTermsStep(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button onclick="_onboardPrev()" class="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="text-xl font-bold text-gray-900 flex-1">${t('obTermsTitle')}</h2>
      </div>
      <p class="text-sm text-gray-500">Para usar CREO, acepta los siguientes términos:</p>
      <div class="space-y-3">
        <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-creo-mint transition group">
          <input type="checkbox" id="ob-terms-check" class="accent-creo-mint w-4 h-4 mt-0.5 flex-shrink-0">
          <div>
            <span class="text-sm font-medium text-gray-900 group-hover:text-creo-purple transition">Acepto los <a href="terminos.html" target="_blank" class="text-creo-purple underline hover:text-creo-light">Términos de Servicio</a></span>
          </div>
        </label>
        <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-creo-mint transition group">
          <input type="checkbox" id="ob-privacy-check" class="accent-creo-mint w-4 h-4 mt-0.5 flex-shrink-0">
          <div>
            <span class="text-sm font-medium text-gray-900 group-hover:text-creo-purple transition">Acepto la <a href="privacidad.html" target="_blank" class="text-creo-purple underline hover:text-creo-light">Política de Privacidad</a></span>
          </div>
        </label>
        <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-creo-mint transition group">
          <input type="checkbox" id="ob-community-check" class="accent-creo-mint w-4 h-4 mt-0.5 flex-shrink-0">
          <div>
            <span class="text-sm font-medium text-gray-900 group-hover:text-creo-purple transition">Acepto las <a href="normas-comunidad.html" target="_blank" class="text-creo-purple underline hover:text-creo-light">Normas de la Comunidad</a></span>
          </div>
        </label>
        <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-creo-mint transition group">
          <input type="checkbox" id="ob-stripe-check" class="accent-creo-mint w-4 h-4 mt-0.5 flex-shrink-0">
          <div>
            <span class="text-sm font-medium text-gray-900 group-hover:text-creo-purple transition">Entiendo que <a href="terminos.html#stripe" target="_blank" class="text-creo-purple underline hover:text-creo-light">Stripe</a> provee el procesamiento de pagos y la verificación de identidad</span>
          </div>
        </label>
      </div>
      <button onclick="_onboardAcceptTerms()" id="ob-accept-btn" class="w-full bg-creo-mint hover:bg-creo-mintDark text-creo-purple font-bold py-3.5 rounded-xl transition text-sm">Aceptar y Comenzar</button>
      <p class="text-[10px] text-gray-400 text-center">Al aceptar, confirmas que has leído y comprendes los términos de la plataforma.</p>
    </div>`;
}

// Engagement detection — attach listeners
(function initEngagementTracking() {
  if (window.location.pathname.includes('admin.html') || window.location.pathname.includes('redirect.html')) return;

  let scrollTracked = false;
  let timeTracked = false;

  window.addEventListener('scroll', () => {
    if (!scrollTracked && window.scrollY > 400) {
      scrollTracked = true;
      trackEngagement('scroll');
    }
  }, { passive: true });

  setTimeout(() => {
    if (!timeTracked) {
      timeTracked = true;
      trackEngagement('time_spent');
    }
  }, 45000);

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="profile.html"]');
    if (link) trackEngagement('profile_view');
    const likeBtn = e.target.closest('[onclick*="Like"], [onclick*="like"]');
    if (likeBtn) trackEngagement('like');
    const commentBtn = e.target.closest('[onclick*="Comment"], [onclick*="comment"]');
    if (commentBtn) trackEngagement('comment');
    const followBtn = e.target.closest('[onclick*="Follow"], [onclick*="follow"]');
    if (followBtn) trackEngagement('follow');
    const dealLink = e.target.closest('a[href*="brand-deals"]');
    if (dealLink) trackEngagement('brand_deals');
  }, { passive: true });
})();

// Onboarding modal animations
(function() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes onboard-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes onboard-slide-up { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
    #creo-onboarding-modal label:has(input:checked) { border-color: #33f0b0; background: rgba(51,240,176,0.05); }
    .notif-payment { border-left: 3px solid #33f0b0; }
    .notif-admin { border-left: 3px solid #3b82f6; }
    .notif-warning { border-left: 3px solid #ef4444; }
    .notif-verification { border-left: 3px solid #8b5cf6; }
  `;
  document.head.appendChild(style);
})();

// Update last_activity_at debounced (max once per 30s)
trackActivityDebounced();

// ========== SERVICE WORKER REGISTRATION ==========
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/creo/sw.js').catch(() => {});
  });
}

// ========== APPLE PWA META TAGS (injected once) ==========
(function injectAppleMeta() {
  const tags = [
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title', content: 'CREO' },
  ];
  tags.forEach(({ name, content }) => {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  });
})();

// ========== GLOBAL ERROR HANDLER ==========
window.onerror = function(msg, src, line) {
  console.error('CREO Error:', msg, src, line);
  if (typeof showToast === 'function') showToast('Algo salió mal. Intenta recargar.', 'error');
  return false;
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('CREO Unhandled Promise:', e.reason);
});

// ========== PWA INSTALL PROMPT ==========
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (localStorage.getItem('creo_install_dismissed')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  const banner = document.createElement('div');
  banner.id = 'creo-install-banner';
  banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:#1a0a3e;color:#fff;padding:12px 20px;border-radius:16px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-size:14px;max-width:360px;width:calc(100% - 32px);';
  banner.innerHTML = `
    <img src="assets/logo-icon.png" style="width:40px;height:40px;border-radius:10px;" alt="CREO">
    <div style="flex:1">
      <div style="font-weight:700;">Instalar CREO</div>
      <div style="font-size:12px;opacity:0.7;">Acceso rápido desde tu pantalla</div>
    </div>
    <button id="creo-install-btn" style="background:#33f0b0;color:#1a0a3e;border:none;padding:8px 16px;border-radius:999px;font-weight:700;font-size:13px;cursor:pointer;">Instalar</button>
    <button id="creo-install-dismiss" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:18px;cursor:pointer;padding:4px;">✕</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('creo-install-btn').addEventListener('click', async () => {
    if (_deferredInstallPrompt) {
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') showToast('CREO instalado', 'success');
      _deferredInstallPrompt = null;
    }
    banner.remove();
  });
  document.getElementById('creo-install-dismiss').addEventListener('click', () => {
    localStorage.setItem('creo_install_dismissed', '1');
    banner.remove();
  });
}

// ========== ACCOUNT DELETION ==========
async function requestAccountDeletion() {
  const user = await getCachedUser();
  if (!user) { showToast(t('iniciaSesion'), 'error'); return; }
  const confirmed = confirm('¿Estás seguro de que deseas eliminar tu cuenta? Esta acción es irreversible. Todos tus datos serán eliminados permanentemente en 7 días.');
  if (!confirmed) return;
  const confirmText = prompt('Escribe ELIMINAR para confirmar:');
  if (confirmText !== 'ELIMINAR') { showToast('Cancelado', 'info'); return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/delete-account', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ user_id: user.id }),
    });
    const result = await res.json();
    if (res.ok) {
      showToast('Cuenta programada para eliminación en 7 días. Revisa tu email.', 'success');
      await sb.auth.signOut();
      setTimeout(() => { window.location.href = 'explore.html'; }, 2000);
    } else {
      showToast(result.error || 'Error al eliminar cuenta', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ========== DATA EXPORT ==========
async function requestDataExport() {
  const user = await getCachedUser();
  if (!user) { showToast(t('iniciaSesion'), 'error'); return; }
  showToast('Preparando tu descarga de datos...', 'info');
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/export-data', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ user_id: user.id }),
    });
    if (!res.ok) { showToast('Error al exportar datos', 'error'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'creo-mis-datos.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Datos descargados', 'success');
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ============================================================
// MediaUploadService — Centralized media upload pipeline
// ============================================================
const MediaUploadService = (function() {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 1000;
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  const UPLOAD_FN_URL = SUPABASE_URL + '/functions/v1/media-upload';

  const BLOCKED_EXTENSIONS = new Set([
    'exe','bat','cmd','com','msi','scr','pif','vbs','vbe',
    'js','jse','ws','wsf','wsc','wsh','ps1','ps2','psc1',
    'reg','inf','lnk','dll','sys','drv','cpl',
  ]);

  const MIME_ICONS = {
    image: '📷', video: '🎥', audio: '🎤', document: '📄',
    archive: '📦', code: '💻', file: '📎', other: '📎',
  };

  const CATEGORY_MAP = {
    'image/': 'image', 'video/': 'video', 'audio/': 'audio',
  };

  const DOC_MIMES = new Set([
    'application/pdf','application/msword','text/plain','text/csv',
    'application/json','application/xml','text/html','text/markdown',
  ]);
  const ARCHIVE_MIMES = new Set([
    'application/zip','application/x-rar-compressed','application/gzip',
    'application/x-tar','application/x-7z-compressed',
  ]);

  function categorize(mime) {
    for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
      if (mime.startsWith(prefix)) return cat;
    }
    if (DOC_MIMES.has(mime) || mime.includes('officedocument') || mime.includes('vnd.ms-')) return 'document';
    if (ARCHIVE_MIMES.has(mime)) return 'archive';
    return 'file';
  }

  function getIcon(category) { return MIME_ICONS[category] || '📎'; }

  function sanitizeName(name) {
    return name.replace(/[^\w.\-]/g, '_').replace(/\.{2,}/g, '.').replace(/^\./, '_').slice(-200);
  }

  function getExtension(name) {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return Math.round(bytesPerSec) + ' B/s';
    if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
    return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
  }

  // Validate file before upload
  function validate(file) {
    if (!file) return { ok: false, error: 'No file selected' };
    if (file.size === 0) return { ok: false, error: 'File is empty' };
    if (file.size > MAX_FILE_SIZE) return { ok: false, error: 'File exceeds ' + formatSize(MAX_FILE_SIZE) + ' limit' };
    const ext = getExtension(file.name);
    if (BLOCKED_EXTENSIONS.has(ext)) return { ok: false, error: 'File type .' + ext + ' is not allowed' };
    return { ok: true, category: categorize(file.type || 'application/octet-stream') };
  }

  // Generate image thumbnail as data URL
  async function generateImageThumbnail(file, maxDim) {
    maxDim = maxDim || 300;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ url: canvas.toDataURL('image/jpeg', 0.7), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  // Extract video metadata
  async function extractVideoMeta(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const timer = setTimeout(() => resolve(null), 8000);
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 4);
      };
      video.onseeked = () => {
        clearTimeout(timer);
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 400);
        canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve({
          width: video.videoWidth, height: video.videoHeight,
          duration: video.duration,
          thumbnail: canvas.toDataURL('image/jpeg', 0.6),
        });
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => { clearTimeout(timer); resolve(null); };
      video.src = URL.createObjectURL(file);
    });
  }

  // Extract audio metadata
  async function extractAudioMeta(file) {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      const timer = setTimeout(() => resolve(null), 5000);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve({ duration: audio.duration });
        URL.revokeObjectURL(audio.src);
      };
      audio.onerror = () => { clearTimeout(timer); resolve(null); };
      audio.src = URL.createObjectURL(file);
    });
  }

  // Generate audio waveform (simplified)
  async function generateWaveform(file) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      const raw = decoded.getChannelData(0);
      const samples = 50;
      const blockSize = Math.floor(raw.length / samples);
      const waveform = [];
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j]);
        waveform.push(Math.round((sum / blockSize) * 100) / 100);
      }
      const max = Math.max(...waveform, 0.01);
      ctx.close();
      return waveform.map(v => Math.round((v / max) * 100) / 100);
    } catch { return null; }
  }

  // Retry with exponential backoff
  async function withRetry(fn, retries) {
    retries = retries || MAX_RETRIES;
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try { return await fn(); }
      catch (e) {
        lastErr = e;
        if (i < retries) await new Promise(r => setTimeout(r, RETRY_BASE_DELAY * Math.pow(2, i)));
      }
    }
    throw lastErr;
  }

  // Get auth token
  async function getToken() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return session.access_token;
  }

  // Call media-upload Edge Function
  async function callUploadApi(action, payload) {
    const token = await getToken();
    const res = await fetch(UPLOAD_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload API error');
    return data;
  }

  // Upload queue
  const uploadQueue = [];
  let activeUploads = 0;
  const MAX_CONCURRENT = 3;

  function processQueue() {
    while (activeUploads < MAX_CONCURRENT && uploadQueue.length > 0) {
      const job = uploadQueue.shift();
      activeUploads++;
      job.execute().finally(() => { activeUploads--; processQueue(); });
    }
  }

  // ===== MAIN UPLOAD FUNCTION =====
  async function upload(file, options) {
    options = options || {};
    const onProgress = options.onProgress || function() {};
    const onStatus = options.onStatus || function() {};
    const onComplete = options.onComplete || function() {};
    const onError = options.onError || function() {};

    const validation = validate(file);
    if (!validation.ok) {
      onError(validation.error);
      return { ok: false, error: validation.error };
    }

    const uploadId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const category = validation.category;
    const startTime = Date.now();
    let cancelled = false;
    let abortController = new AbortController();

    const state = {
      id: uploadId,
      file: file,
      category: category,
      status: 'queued',
      progress: 0,
      speed: 0,
      eta: 0,
      error: null,
      result: null,
      cancel: function() {
        cancelled = true;
        abortController.abort();
        state.status = 'cancelled';
        onStatus('cancelled');
      },
      retry: null,
    };

    // Save to local storage for recovery
    try {
      const pending = JSON.parse(localStorage.getItem('creo_pending_uploads') || '[]');
      pending.push({ id: uploadId, fileName: file.name, fileSize: file.size, category, timestamp: Date.now() });
      if (pending.length > 20) pending.splice(0, pending.length - 20);
      localStorage.setItem('creo_pending_uploads', JSON.stringify(pending));
    } catch {}

    const execute = async () => {
      try {
        state.status = 'initiating';
        onStatus('initiating');

        // 1. Initiate upload via Edge Function
        const initResult = await withRetry(() => callUploadApi('initiate', {
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        }));

        if (cancelled) return state;

        const { attachment_id, storage_path, bucket } = initResult;

        // 2. Upload file to storage
        state.status = 'uploading';
        onStatus('uploading');

        let uploadedBytes = 0;
        const totalBytes = file.size;

        if (initResult.upload_mode === 'direct' || totalBytes <= CHUNK_SIZE) {
          // Direct upload
          await withRetry(async () => {
            const { error } = await sb.storage.from(bucket).upload(storage_path, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: true,
            });
            if (error) throw error;
          });
          uploadedBytes = totalBytes;
          state.progress = 100;
          onProgress(100, formatSpeed(totalBytes / ((Date.now() - startTime) / 1000)), '0s');
        } else {
          // Chunked upload — upload as single file with progress tracking via XMLHttpRequest
          await new Promise((resolve, reject) => {
            const token = sb.realtime?.accessToken || '';
            const url = SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + storage_path;

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.setRequestHeader('x-upsert', 'true');

            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable) return;
              uploadedBytes = e.loaded;
              const pct = Math.round((e.loaded / e.total) * 100);
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = e.loaded / elapsed;
              const remaining = (e.total - e.loaded) / speed;
              state.progress = pct;
              state.speed = speed;
              state.eta = remaining;
              onProgress(pct, formatSpeed(speed), Math.ceil(remaining) + 's');
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error('Upload failed: ' + xhr.status));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.onabort = () => reject(new Error('Upload cancelled'));

            abortController.signal.addEventListener('abort', () => xhr.abort());
            xhr.send(file);
          });
        }

        if (cancelled) return state;

        // 3. Extract metadata
        state.status = 'processing';
        onStatus('processing');

        const meta = {};
        if (category === 'image') {
          const thumbData = await generateImageThumbnail(file);
          if (thumbData) {
            meta.width = thumbData.width;
            meta.height = thumbData.height;
            meta.thumbnail_url = thumbData.url;
          }
        } else if (category === 'video') {
          const videoMeta = await extractVideoMeta(file);
          if (videoMeta) {
            meta.width = videoMeta.width;
            meta.height = videoMeta.height;
            meta.duration_seconds = videoMeta.duration;
            meta.thumbnail_url = videoMeta.thumbnail;
          }
        } else if (category === 'audio') {
          const audioMeta = await extractAudioMeta(file);
          if (audioMeta) meta.duration_seconds = audioMeta.duration;
          if (file.size < 20 * 1024 * 1024) {
            const waveform = await generateWaveform(file);
            if (waveform) meta.waveform_data = waveform;
          }
        }

        if (cancelled) return state;

        // 4. Complete upload
        state.status = 'completing';
        onStatus('completing');

        const completeResult = await withRetry(() => callUploadApi('complete', {
          attachment_id,
          ...meta,
        }));

        // 5. Done
        state.status = 'complete';
        state.progress = 100;
        state.result = {
          attachment_id,
          public_url: completeResult.public_url,
          category: completeResult.category || category,
          mime_type: completeResult.mime_type || file.type,
          file_name: completeResult.file_name || file.name,
          file_size: file.size,
          ...meta,
        };

        onStatus('complete');
        onComplete(state.result);

        // Remove from pending
        try {
          const pending = JSON.parse(localStorage.getItem('creo_pending_uploads') || '[]');
          const filtered = pending.filter(p => p.id !== uploadId);
          localStorage.setItem('creo_pending_uploads', JSON.stringify(filtered));
        } catch {}

        return state;

      } catch (err) {
        if (cancelled) return state;
        state.status = 'failed';
        state.error = err.message || 'Upload failed';
        onStatus('failed');
        onError(state.error);

        // Retry function
        state.retry = () => {
          cancelled = false;
          abortController = new AbortController();
          state.status = 'queued';
          state.error = null;
          onStatus('retrying');
          return execute();
        };

        return state;
      }
    };

    // Queue or execute immediately
    if (activeUploads < MAX_CONCURRENT) {
      activeUploads++;
      execute().finally(() => { activeUploads--; processQueue(); });
    } else {
      state.status = 'queued';
      onStatus('queued');
      uploadQueue.push({ execute });
    }

    return state;
  }

  // Upload a Blob (for recorded audio/video)
  async function uploadBlob(blob, fileName, options) {
    const file = new File([blob], fileName, { type: blob.type });
    return upload(file, options);
  }

  // Send a message with an attachment
  async function sendMediaMessage(receiverId, attachmentResult, textBody) {
    return callUploadApi('send', {
      receiver_id: receiverId,
      body: textBody || null,
      attachment_id: attachmentResult.attachment_id,
      media_url: attachmentResult.public_url,
      media_type: attachmentResult.category,
    });
  }

  // Send text-only message
  async function sendTextMessage(receiverId, body) {
    const { error } = await sb.from('messages').insert({
      sender_id: (await sb.auth.getUser()).data.user.id,
      receiver_id: receiverId,
      body: body,
    });
    if (error) throw error;
    await createNotification(receiverId, 'message', body.substring(0, 80), null, 'messages.html');
  }

  // Send GIF message
  async function sendGifMessage(receiverId, gifUrl) {
    const userId = (await sb.auth.getUser()).data.user.id;
    await sb.from('messages').insert({
      sender_id: userId,
      receiver_id: receiverId,
      media_url: gifUrl,
      media_type: 'gif',
    });
    await createNotification(receiverId, 'message', '🎬 GIF', null, 'messages.html#chat-' + userId);
  }

  // Get pending uploads from localStorage
  function getPendingUploads() {
    try { return JSON.parse(localStorage.getItem('creo_pending_uploads') || '[]'); }
    catch { return []; }
  }

  // Create upload progress UI element
  function createProgressUI(file, container) {
    const category = categorize(file.type || 'application/octet-stream');
    const icon = getIcon(category);
    const el = document.createElement('div');
    el.className = 'upload-progress-item flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 mb-2 text-sm';
    el.innerHTML =
      '<span class="text-lg flex-shrink-0">' + icon + '</span>' +
      '<div class="flex-1 min-w-0">' +
        '<p class="font-medium text-gray-800 truncate text-xs">' + esc(file.name) + '</p>' +
        '<div class="flex items-center gap-2 mt-1">' +
          '<div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">' +
            '<div class="upload-bar h-full bg-creo-purple rounded-full transition-all duration-300" style="width:0%"></div>' +
          '</div>' +
          '<span class="upload-pct text-[10px] text-gray-400 w-8 text-right">0%</span>' +
        '</div>' +
        '<p class="upload-status text-[10px] text-gray-400 mt-0.5">En cola...</p>' +
      '</div>' +
      '<button class="upload-cancel text-gray-300 hover:text-red-500 transition text-xs flex-shrink-0" title="Cancelar">✕</button>';

    if (container) container.appendChild(el);

    return {
      el,
      updateProgress(pct, speed, eta) {
        const bar = el.querySelector('.upload-bar');
        const pctEl = el.querySelector('.upload-pct');
        if (bar) bar.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
        const status = el.querySelector('.upload-status');
        if (status && speed) status.textContent = speed + (eta ? ' · ' + eta + ' restante' : '');
      },
      updateStatus(status) {
        const statusEl = el.querySelector('.upload-status');
        if (!statusEl) return;
        const map = {
          queued: 'En cola...', initiating: 'Iniciando...', uploading: 'Subiendo...',
          processing: 'Procesando...', completing: 'Completando...', complete: '✓ Completado',
          failed: '✗ Error', cancelled: 'Cancelado', retrying: 'Reintentando...',
        };
        statusEl.textContent = map[status] || status;
        if (status === 'complete') {
          el.querySelector('.upload-bar')?.classList.replace('bg-creo-purple', 'bg-green-500');
          el.querySelector('.upload-cancel')?.remove();
          setTimeout(() => el.classList.add('opacity-50'), 2000);
        } else if (status === 'failed') {
          el.querySelector('.upload-bar')?.classList.replace('bg-creo-purple', 'bg-red-500');
          const cancelBtn = el.querySelector('.upload-cancel');
          if (cancelBtn) { cancelBtn.textContent = '↻'; cancelBtn.title = 'Reintentar'; }
        }
      },
      remove() { el.remove(); },
      setCancelHandler(fn) {
        const btn = el.querySelector('.upload-cancel');
        if (btn) btn.onclick = fn;
      },
    };
  }

  // ===== REALTIME SUBSCRIPTION =====
  function subscribeToMessages(userId, onNewMessage) {
    const channel = sb.channel('dm-realtime-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'receiver_id=eq.' + userId,
      }, (payload) => {
        if (onNewMessage) onNewMessage(payload.new);
      })
      .subscribe();
    return channel;
  }

  // ===== RENDER MEDIA IN MESSAGE =====
  function renderAttachment(msg) {
    const mt = msg.media_type;
    const url = msg.media_url;
    if (!mt || !url) return '';

    if (mt === 'gif') {
      return '<img src="' + esc(url) + '" class="max-w-[220px] rounded-xl" alt="GIF" loading="lazy">';
    }
    if (mt === 'image') {
      return '<img src="' + esc(url) + '" class="max-w-[240px] rounded-xl cursor-pointer" alt="" loading="lazy" onclick="window.open(this.src,\'_blank\')">';
    }
    if (mt === 'video') {
      return '<div class="relative max-w-[260px]">' +
        '<video src="' + esc(url) + '" controls playsinline preload="metadata" class="w-full rounded-xl"></video>' +
      '</div>';
    }
    if (mt === 'audio') {
      return '<div class="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 max-w-[260px]">' +
        '<audio controls src="' + esc(url) + '" class="w-full" style="height:36px"></audio>' +
      '</div>';
    }
    if (mt === 'document' || mt === 'file' || mt === 'archive' || mt === 'code' || mt === 'other') {
      const icon = getIcon(mt);
      const name = msg.file_name || url.split('/').pop() || 'Archivo';
      const size = msg.file_size ? ' · ' + formatSize(msg.file_size) : '';
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition max-w-[260px]">' +
        '<span class="text-2xl flex-shrink-0">' + icon + '</span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-xs font-medium truncate">' + esc(name) + '</p>' +
          '<p class="text-[10px] opacity-60">' + mt.charAt(0).toUpperCase() + mt.slice(1) + size + '</p>' +
        '</div>' +
        '<svg class="w-4 h-4 opacity-50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>' +
      '</a>';
    }
    return '';
  }

  return {
    upload,
    uploadBlob,
    validate,
    categorize,
    getIcon,
    formatSize,
    formatDuration,
    formatSpeed,
    sanitizeName,
    sendMediaMessage,
    sendTextMessage,
    sendGifMessage,
    getPendingUploads,
    createProgressUI,
    subscribeToMessages,
    renderAttachment,
    generateImageThumbnail,
    extractVideoMeta,
    extractAudioMeta,
    generateWaveform,
    MIME_ICONS,
    MAX_FILE_SIZE,
  };
})();
