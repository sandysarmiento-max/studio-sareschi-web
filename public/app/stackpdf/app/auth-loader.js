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

async function bootStackPdf() {
  const allowed = await validateAccess();
  if (!allowed) return;

  const css = await decodeGzipBase64('./styles.css.gz.b64.txt');
  const style = document.createElement('style');
  style.setAttribute('data-stackpdf', 'styles');
  style.textContent = css + '\n.brand-logo-img{display:block!important;width:auto!important;height:48px!important;max-width:300px!important;object-fit:contain!important}.brand-stackpdf{display:flex!important;align-items:center!important;gap:14px!important}.brand-logo-fallback{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:150px!important;width:auto!important;height:34px!important;padding:0 18px!important;border-radius:999px!important;font-size:14px!important;font-weight:900!important;letter-spacing:.02em!important;background:#fff8f4!important;color:#8b5d6f!important;border:1px solid rgba(139,93,111,.20)!important;box-shadow:none!important}';
  document.head.appendChild(style);

  const ui = await fetchText('./ui.html');
  document.body.removeAttribute('style');
  document.body.innerHTML = ui;
  await applyEmbeddedLogo();

  await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const js = await decodeGzipBase64(['./app.js.gz.b64.00.txt', './app.js.gz.b64.01.txt', './app.js.gz.b64.02.txt']);
  new Function(js)();
}

bootStackPdf().catch((error) => {
  console.error('stackpdf auth/load error', error);
  authBlock('No fue posible cargar StackPDF. Usa Chrome o Edge actualizado, o actualiza la página e intenta otra vez.');
});
