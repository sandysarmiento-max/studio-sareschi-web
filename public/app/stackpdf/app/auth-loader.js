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

function installHeaderLogo() {
  const brand = document.querySelector('.brand-stackpdf');
  if (brand) {
    brand.style.setProperty('display', 'none', 'important');
  }

  const existing = document.querySelector('.stackpdf-header-brand-layer');
  if (existing) existing.remove();

  const layer = document.createElement('div');
  layer.className = 'stackpdf-header-brand-layer';
  layer.setAttribute('aria-label', 'StackPDF by Studio Sareschi');

  const visual = document.createElement('div');
  visual.className = 'stackpdf-logo-visual';
  visual.innerHTML = `
    <svg class="stackpdf-logo-mark" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect x="7" y="16" width="43" height="47" rx="7" fill="#dfe9d9"/>
      <rect x="13" y="10" width="43" height="47" rx="7" fill="#f4e3dd"/>
      <path d="M23 5h27l13 13v38a7 7 0 0 1-7 7H23a7 7 0 0 1-7-7V12a7 7 0 0 1 7-7Z" fill="#fff8f5" stroke="#d98f87" stroke-width="4"/>
      <path d="M50 5v15h14" fill="none" stroke="#d98f87" stroke-width="4" stroke-linejoin="round"/>
      <path d="M30 43c9-14 11-26 7-27-5-1-5 9 0 17 4 7 12 13 18 11 5-2 0-8-9-6-8 2-17 9-21 14" fill="none" stroke="#d98f87" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M42 52h15M42 57h15" stroke="#d98f87" stroke-width="3.4" stroke-linecap="round"/>
    </svg>
    <div class="stackpdf-logo-word" aria-hidden="true"><span class="stackpdf-logo-stack">Stack</span><span class="stackpdf-logo-pdf">PDF</span></div>
  `;

  const copy = document.createElement('div');
  copy.className = 'stackpdf-header-copy';
  copy.innerHTML = '<p>Une y ordena tus PDFs para imprimir.</p><p>by <strong>Studio Sareschi</strong></p>';

  layer.append(visual, copy);
  document.body.appendChild(layer);
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
.stackpdf-logo-visual{display:flex!important;align-items:center!important;width:240px!important;min-width:240px!important;height:70px!important;overflow:visible!important;gap:7px!important}
.stackpdf-logo-mark{display:block!important;width:54px!important;height:54px!important;min-width:54px!important;overflow:visible!important}
.stackpdf-logo-word{display:flex!important;align-items:baseline!important;gap:0!important;white-space:nowrap!important;line-height:1!important;overflow:visible!important;font-family:Georgia,'Times New Roman',serif!important;font-weight:400!important;letter-spacing:-2.4px!important}
.stackpdf-logo-stack{font-size:42px!important;color:#3f3230!important;line-height:1!important}
.stackpdf-logo-pdf{font-size:42px!important;color:#d88983!important;line-height:1!important;margin-left:3px!important}
.stackpdf-header-copy{display:block!important;min-width:250px!important;max-width:280px!important;font-size:12px!important;line-height:1.35!important;color:#5d4a4d!important;white-space:normal!important;overflow:visible!important}
.stackpdf-header-copy p{margin:0 0 4px!important;padding:0!important;color:#5d4a4d!important;font-size:12px!important;line-height:1.35!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important}
.stackpdf-header-copy strong{font-weight:800!important;color:#815a5b!important}
.tabs{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:8px!important;width:auto!important;min-width:330px!important;white-space:nowrap!important}
.tab{white-space:nowrap!important;min-width:0!important;width:auto!important;padding-left:24px!important;padding-right:24px!important}
.top-actions{margin-left:auto!important;display:flex!important;align-items:center!important;gap:14px!important;flex:0 0 auto!important;white-space:nowrap!important}
.top-actions .ghost-btn,.top-actions .primary-btn{white-space:nowrap!important;flex:0 0 auto!important}
.app-shell,.workspace{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
@media (max-width:1100px){.topbar{padding-left:300px!important;gap:12px!important}.stackpdf-header-brand-layer{left:24px!important;width:260px!important}.stackpdf-logo-visual{width:235px!important;min-width:235px!important}.stackpdf-logo-stack,.stackpdf-logo-pdf{font-size:39px!important}.stackpdf-header-copy{display:none!important}.tabs{min-width:auto!important}.tab{padding-left:16px!important;padding-right:16px!important}}
@media (max-width:820px){.topbar{height:auto!important;min-height:132px!important;padding:78px 14px 12px 14px!important;flex-wrap:wrap!important}.stackpdf-header-brand-layer{left:16px!important;top:16px!important;width:235px!important;height:58px!important}.stackpdf-logo-visual{width:220px!important;min-width:220px!important;height:58px!important}.stackpdf-logo-mark{width:46px!important;height:46px!important;min-width:46px!important}.stackpdf-logo-stack,.stackpdf-logo-pdf{font-size:35px!important}.tabs{width:100%!important}.top-actions{width:100%!important;margin-left:0!important}}
`;
  document.head.appendChild(style);

  const ui = await fetchText('./ui.html');
  document.body.removeAttribute('style');
  document.body.innerHTML = ui;
  installHeaderLogo();

  await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const js = await decodeGzipBase64(['./app.js.gz.b64.00.txt', './app.js.gz.b64.01.txt', './app.js.gz.b64.02.txt']);
  new Function(js)();
  installHeaderLogo();
  window.setTimeout(installHeaderLogo, 50);
  window.setTimeout(installHeaderLogo, 250);
}

bootStackPdf().catch((error) => {
  console.error('stackpdf auth/load error', error);
  authBlock('No fue posible cargar StackPDF. Usa Chrome o Edge actualizado, o actualiza la página e intenta otra vez.');
});
