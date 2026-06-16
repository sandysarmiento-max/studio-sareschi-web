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

async function applyEmbeddedLogo() {
  const logo = document.querySelector('.brand-logo-img[data-logo-base64-src]');
  if (!logo) return;
  try {
    const logoBase64 = (await fetchText(logo.dataset.logoBase64Src)).trim();
    logo.src = `data:image/png;base64,${logoBase64}`;
  } catch (error) {
    console.warn('No se pudo cargar el logo de StackPDF', error);
    logo.replaceWith(Object.assign(document.createElement('div'), {
      className: 'brand-logo brand-logo-fallback',
      textContent: 'StackPDF',
    }));
  }
}

function pinLogoLayout() {
  const brand = document.querySelector('.brand-stackpdf');
  const logo = document.querySelector('.brand-logo-img');
  const copy = document.querySelector('.brand-copy-stackpdf');

  if (copy) copy.style.setProperty('display', 'none', 'important');

  if (brand) {
    brand.style.setProperty('width', '340px', 'important');
    brand.style.setProperty('min-width', '340px', 'important');
    brand.style.setProperty('max-width', '340px', 'important');
    brand.style.setProperty('height', '76px', 'important');
    brand.style.setProperty('min-height', '76px', 'important');
    brand.style.setProperty('overflow', 'visible', 'important');
    brand.style.setProperty('display', 'flex', 'important');
    brand.style.setProperty('align-items', 'center', 'important');
    brand.style.setProperty('padding', '0', 'important');
    brand.style.setProperty('gap', '0', 'important');
  }

  if (logo) {
    logo.style.setProperty('display', 'block', 'important');
    logo.style.setProperty('width', '320px', 'important');
    logo.style.setProperty('min-width', '320px', 'important');
    logo.style.setProperty('max-width', '320px', 'important');
    logo.style.setProperty('height', '74px', 'important');
    logo.style.setProperty('min-height', '74px', 'important');
    logo.style.setProperty('max-height', '74px', 'important');
    logo.style.setProperty('object-fit', 'contain', 'important');
    logo.style.setProperty('object-position', 'left center', 'important');
    logo.style.setProperty('overflow', 'visible', 'important');
    logo.style.setProperty('clip-path', 'none', 'important');
    logo.style.setProperty('background', 'transparent', 'important');
    logo.style.setProperty('border', '0', 'important');
    logo.style.setProperty('box-shadow', 'none', 'important');
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
.topbar{width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;box-sizing:border-box!important;overflow:visible!important;min-height:92px!important;height:auto!important;align-items:center!important;padding-top:8px!important;padding-bottom:8px!important}
.brand-stackpdf,.brand.brand-stackpdf{display:flex!important;align-items:center!important;gap:0!important;flex:0 0 340px!important;min-width:340px!important;width:340px!important;max-width:340px!important;height:76px!important;min-height:76px!important;max-height:76px!important;overflow:visible!important;padding:0!important}
.brand-logo-img{display:block!important;flex:0 0 320px!important;width:320px!important;min-width:320px!important;max-width:320px!important;height:74px!important;min-height:74px!important;max-height:74px!important;object-fit:contain!important;object-position:left center!important;overflow:visible!important;clip-path:none!important;border:0!important;background:transparent!important;box-shadow:none!important}
.brand-copy-stackpdf{display:none!important}
.app-shell,.workspace{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
.brand-logo-fallback{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:150px!important;width:auto!important;height:34px!important;padding:0 18px!important;border-radius:999px!important;font-size:14px!important;font-weight:900!important;letter-spacing:.02em!important;background:#fff8f4!important;color:#8b5d6f!important;border:1px solid rgba(139,93,111,.20)!important;box-shadow:none!important}
@media (max-width:980px){.brand-stackpdf,.brand.brand-stackpdf{flex-basis:260px!important;min-width:260px!important;width:260px!important;max-width:260px!important}.brand-logo-img{flex-basis:245px!important;width:245px!important;min-width:245px!important;max-width:245px!important;height:58px!important;min-height:58px!important;max-height:58px!important}.brand-copy-stackpdf{display:none!important}}
`;
  document.head.appendChild(style);

  const ui = await fetchText('./ui.html');
  document.body.removeAttribute('style');
  document.body.innerHTML = ui;
  await applyEmbeddedLogo();
  pinLogoLayout();

  await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const js = await decodeGzipBase64(['./app.js.gz.b64.00.txt', './app.js.gz.b64.01.txt', './app.js.gz.b64.02.txt']);
  new Function(js)();
  pinLogoLayout();
  window.setTimeout(pinLogoLayout, 50);
  window.setTimeout(pinLogoLayout, 250);
}

bootStackPdf().catch((error) => {
  console.error('stackpdf auth/load error', error);
  authBlock('No fue posible cargar StackPDF. Usa Chrome o Edge actualizado, o actualiza la página e intenta otra vez.');
});
