const APP_KEY = 'stackpdf';
const APP_NEXT = '/app/stackpdf/';

async function loadAuthConfig() {
  const response = await fetch('/api/auth-config', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('auth-config');
  return response.json();
}

function showBlocked(message) {
  const loading = document.getElementById('loading');
  const blocked = document.getElementById('blocked');
  const statusMessage = document.getElementById('status-message');
  if (loading) loading.hidden = true;
  if (blocked) blocked.hidden = false;
  if (message && statusMessage) statusMessage.textContent = message;
}

function showApp() {
  const shell = document.querySelector('.app-shell');
  const frame = document.getElementById('app-frame');
  if (document.getElementById('loading')) document.getElementById('loading').hidden = true;
  if (document.getElementById('blocked')) document.getElementById('blocked').hidden = true;
  if (shell) shell.style.display = 'none';
  if (frame) {
    frame.hidden = false;
    frame.style.position = 'fixed';
    frame.style.inset = '0';
    frame.style.width = '100%';
    frame.style.height = '100dvh';
  }
}

async function hasAccess(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('app_access')
    .select('id')
    .eq('app_key', APP_KEY)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

(async () => {
  try {
    const config = await loadAuthConfig();
    if (!config.enabled) {
      showBlocked('Acceso no disponible temporalmente.');
      return;
    }
    const supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      const next = encodeURIComponent(APP_NEXT);
      window.location.href = `/acceso/?app=${APP_KEY}&next=${next}`;
      return;
    }
    const allowed = await hasAccess(supabaseClient);
    if (!allowed) {
      showBlocked();
      return;
    }
    showApp();
  } catch (error) {
    showBlocked('No fue posible validar tu acceso en este momento.');
    console.error('stackpdf boot error', error);
  }
})();
