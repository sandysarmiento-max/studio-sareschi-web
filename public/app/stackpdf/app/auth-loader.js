const APP_KEY = 'stackpdf';
const LOGIN_URL = '/acceso/?app=stackpdf&next=%2Fapp%2Fstackpdf%2F';
const CSS_PARTS = ["styles-css.b64.00.txt", "styles-css.b64.01.txt", "styles-css.b64.02.txt", "styles-css.b64.03.txt", "styles-css.b64.04.txt", "styles-css.b64.05.txt"];
const JS_PARTS = ["app-js.b64.00.txt", "app-js.b64.01.txt", "app-js.b64.02.txt", "app-js.b64.03.txt", "app-js.b64.04.txt", "app-js.b64.05.txt"];

function authBlock(text) {
  const message = document.getElementById('stackpdfAuthMessage');
  const link = document.getElementById('stackpdfAuthLink');
  if (message) message.textContent = text;
  if (link) link.hidden = false;
}

async function fetchText(path) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.text();
}

async function decodeBase64Parts(parts) {
  const base64 = (await Promise.all(parts.map(fetchText))).join('');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
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

async function validateAccess() {
  const response = await fetch('/api/auth-config', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('auth-config');
  const config = await response.json();
  if (!config.enabled) {
    authBlock('Acceso no disponible temporalmente.');
    return false;
  }
  const supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = LOGIN_URL;
    return false;
  }
  const allowed = await hasAccess(supabaseClient);
  if (!allowed) {
    authBlock('Tu cuenta no tiene acceso activo a StackPDF.');
    return false;
  }
  return true;
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function bootStackPdf() {
  const allowed = await validateAccess();
  if (!allowed) return;

  const css = await decodeBase64Parts(CSS_PARTS);
  const style = document.createElement('style');
  style.setAttribute('data-stackpdf', 'styles');
  style.textContent = css + '\n.brand-logo-fallback{display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:.04em;background:#fff8f4;color:#8b5d6f;border:1px solid rgba(139,93,111,.20)}';
  document.head.appendChild(style);

  const ui = await fetchText('./ui.html');
  document.body.removeAttribute('style');
  document.body.innerHTML = ui;

  await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const js = await decodeBase64Parts(JS_PARTS);
  new Function(js)();
}

bootStackPdf().catch((error) => {
  console.error('stackpdf auth/load error', error);
  authBlock('No fue posible cargar StackPDF. Actualiza la página e intenta otra vez.');
});
