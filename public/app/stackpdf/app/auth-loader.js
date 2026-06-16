const APP_KEY = 'stackpdf';
const LOGIN_URL = '/acceso/?app=stackpdf&next=%2Fapp%2Fstackpdf%2F';

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

async function decodeGzipBase64(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const base64 = (await Promise.all(list.map(fetchText))).join('');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  if (!('DecompressionStream' in window)) {
    throw new Error('El navegador no soporta DecompressionStream');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
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

async function installHeaderLogo() {
  const topbar = document.querySelector('.topbar');
  const brand = document.querySelector('.brand-stackpdf');
  if (!topbar) return;

  if (brand) {
    brand.style.setProperty('display', 'none', 'important');
  }

  try {
    const logoBase64 = (await fetchText('./stackpdf-logo.png.b64.txt')).trim();
    const existing = topbar.querySelector('.stackpdf-header-logo');
    if (existing) existing.remove();

    const logoLayer = document.createElement('div');
    logoLayer.className = 'stackpdf-header-logo';
    logoLayer.setAttribute('aria-label', 'StackPDF');
    logoLayer.style.setProperty('background-image', `url(data:image/png;base64,${logoBase64})`, 'important');
    topbar.prepend(logoLayer);
  } catch (error) {
    console.warn('No se pudo cargar el logo de StackPDF', error);
    if (brand) {
      brand.style.setProperty('display', 'flex', 'important');
    }
  }
}

async function bootStackPdf() {
  const allowed = await validateAccess();
  if (!allowed) return;

  const css = await decodeGzipBase64('./styles.css.gz.b64.txt');
  const style = document.createElement('style');
  style.setAttribute('data-stackpdf', 'styles');
  style.textContent = css + `
html,body{overflow-x:hidden!important}
body{padding:0!important;display:block!important;place-items:initial!important}
.topbar{position:relative!important;width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;box-sizing:border-box!important;overflow:visible!important;min-height:94px!important;height:auto!important;align-items:center!important;padding-top:8px!important;padding-bottom:8px!important;padding-left:470px!important}
.brand-stackpdf,.brand.brand-stackpdf{display:none!important}
.brand-logo-img,.brand-copy-stackpdf{display:none!important}
.stackpdf-header-logo{position:absolute!important;left:24px!important;top:50%!important;transform:translateY(-50%)!important;width:390px!important;height:82px!important;background-repeat:no-repeat!important;background-position:left center!important;background-size:contain!important;z-index:50!important;pointer-events:none!important;overflow:visible!important}
.app-shell,.workspace{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
@media (max-width:980px){.topbar{padding-left:285px!important;min-height:80px!important}.stackpdf-header-logo{left:18px!important;width:245px!important;height:62px!important}}
`;
  document.head.appendChild(style);

  const ui = await fetchText('./ui.html');
  document.body.removeAttribute('style');
  document.body.innerHTML = ui;
  await installHeaderLogo();

  await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const js = await decodeGzipBase64(['./app.js.gz.b64.00.txt', './app.js.gz.b64.01.txt', './app.js.gz.b64.02.txt']);
  new Function(js)();
  await installHeaderLogo();
  window.setTimeout(installHeaderLogo, 50);
  window.setTimeout(installHeaderLogo, 250);
}

bootStackPdf().catch((error) => {
  console.error('stackpdf auth/load error', error);
  authBlock('No fue posible cargar StackPDF. Usa Chrome o Edge actualizado, o actualiza la página e intenta otra vez.');
});
