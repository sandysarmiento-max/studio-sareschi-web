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
  const brand = document.querySelector('.brand-stackpdf');
  if (brand) {
    brand.style.setProperty('display', 'none', 'important');
  }

  try {
    const logoBase64 = (await fetchText('./stackpdf-logo.png.b64.txt')).trim();
    const existing = document.querySelector('.stackpdf-header-brand-layer');
    if (existing) existing.remove();

    const layer = document.createElement('div');
    layer.className = 'stackpdf-header-brand-layer';
    layer.setAttribute('aria-label', 'StackPDF by Studio Sareschi');

    const logo = document.createElement('img');
    logo.className = 'stackpdf-header-logo-img';
    logo.alt = 'StackPDF';
    logo.src = `data:image/png;base64,${logoBase64}`;

    const copy = document.createElement('div');
    copy.className = 'stackpdf-header-copy';
    copy.innerHTML = '<p>Une y ordena tus PDFs para imprimir.</p><p>by <strong>Studio Sareschi</strong></p>';

    layer.append(logo, copy);
    document.body.appendChild(layer);
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
body{padding:0!important;display:block!important;place-items:initial!important;position:relative!important}
.topbar{position:relative!important;display:flex!important;align-items:center!important;width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;box-sizing:border-box!important;overflow:visible!important;min-height:91px!important;height:91px!important;padding:16px 24px 16px 580px!important;gap:22px!important}
.brand-stackpdf,.brand.brand-stackpdf,.brand-logo-img,.brand-copy-stackpdf{display:none!important}
.stackpdf-header-brand-layer{position:absolute!important;left:32px!important;top:14px!important;width:520px!important;height:70px!important;display:flex!important;align-items:center!important;gap:18px!important;z-index:9999!important;pointer-events:none!important;overflow:visible!important}
.stackpdf-header-logo-img{display:block!important;width:240px!important;min-width:240px!important;max-width:none!important;height:auto!important;max-height:none!important;object-fit:contain!important;object-position:left center!important;border:0!important;background:transparent!important;box-shadow:none!important;clip-path:none!important;overflow:visible!important}
.stackpdf-header-copy{display:block!important;min-width:250px!important;max-width:280px!important;font-size:12px!important;line-height:1.35!important;color:#5d4a4d!important;white-space:normal!important;overflow:visible!important}
.stackpdf-header-copy p{margin:0 0 4px!important;padding:0!important;color:#5d4a4d!important;font-size:12px!important;line-height:1.35!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important}
.stackpdf-header-copy strong{font-weight:800!important;color:#815a5b!important}
.tabs{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:8px!important;width:auto!important;min-width:330px!important;white-space:nowrap!important}
.tab{white-space:nowrap!important;min-width:0!important;width:auto!important;padding-left:24px!important;padding-right:24px!important}
.top-actions{margin-left:auto!important;display:flex!important;align-items:center!important;gap:14px!important;flex:0 0 auto!important;white-space:nowrap!important}
.top-actions .ghost-btn,.top-actions .primary-btn{white-space:nowrap!important;flex:0 0 auto!important}
.app-shell,.workspace{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
@media (max-width:1100px){.topbar{padding-left:300px!important;gap:12px!important}.stackpdf-header-brand-layer{left:24px!important;width:260px!important}.stackpdf-header-logo-img{width:235px!important;min-width:235px!important}.stackpdf-header-copy{display:none!important}.tabs{min-width:auto!important}.tab{padding-left:16px!important;padding-right:16px!important}}
@media (max-width:820px){.topbar{height:auto!important;min-height:132px!important;padding:78px 14px 12px 14px!important;flex-wrap:wrap!important}.stackpdf-header-brand-layer{left:16px!important;top:16px!important;width:235px!important;height:58px!important}.stackpdf-header-logo-img{width:220px!important;min-width:220px!important}.tabs{width:100%!important}.top-actions{width:100%!important;margin-left:0!important}}
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
