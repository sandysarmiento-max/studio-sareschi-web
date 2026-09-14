const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { getProductSlug } = require('./product-slugs');

const STOREFRONT_COLUMNS =
  'id,code,title,description,price_yape_pe,price_paypal_usd,hotmart_url,main_image_url,preview_01_url,preview_02_url,preview_03_url,active,sort_order';
const LEGACY_STOREFRONT_COLUMNS =
  'id,code,title,description,price_pdf_pe,price_pdf_int,price_canva_pe,price_canva_int,main_image_url,preview_01_url,preview_02_url,preview_03_url,active,sort_order';
const AGENDA_PREVIEW_COLUMNS =
  'id,title,slug,format,width_mm,height_mm,orientation,total_product_pages,buy_button_text,buy_url';
const AGENDA_PAGE_COLUMNS = 'position,page_type,storage_path';
const AGENDA_PREVIEW_BUCKET = 'agenda-previews';
const AGENDA_SIGNED_URL_SECONDS = 15 * 60;
const AGENDA_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FALLBACK_PRODUCTS = [
  {
    id: 'seed-paid-product',
    code: 'agenda-semanal-rosa',
    title: 'Agenda semanal Rosa (Demo)',
    description: 'Producto de prueba para validar el catálogo.',
    price_yape_pe: 8,
    price_paypal_usd: 3,
    hotmart_url: '',
    main_image_url: '/freebies/previews/fb_001_preview.jpg',
    preview_01_url: '/freebies/previews/fb_002_preview.jpg',
    preview_02_url: '/freebies/previews/fb_003_preview.jpg',
    preview_03_url: '/freebies/previews/fb_004_preview.jpg',
    active: true,
    sort_order: 0,
  },
];

const FALLBACK_DAILY = {
  id: 'daily-sample',
  title: 'Elige 1 PDF gratis al día',
  description: 'Accede a la selección disponible y descarga 1 archivo gratuito.',
};

function normalizeAction(action) {
  const normalized = String(action || '').trim().toLowerCase();
  if (normalized === 'buy-pdf-hq') {
    return 'buy-pdf';
  }
  if (normalized === 'buy-canva-editable') {
    return 'buy-canva';
  }
  return normalized;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function callSupabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase no configurado en variables de entorno.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error de Supabase');
  }

  return response.json();
}

function isMissingPurchaseColumns(error) {
  const message = String(error?.message || '').toLowerCase();
  const mentionsNewColumn =
    message.includes('hotmart_url') ||
    message.includes('price_yape_pe') ||
    message.includes('price_paypal_usd');

  return mentionsNewColumn &&
    (message.includes('does not exist') || message.includes('schema cache') || message.includes('column'));
}

function normalizeLegacyProduct(product) {
  return {
    id: product?.id,
    code: product?.code,
    title: product?.title,
    description: product?.description,
    price_yape_pe: Number(product?.price_canva_pe || 0),
    price_paypal_usd: Number(product?.price_canva_int || 0),
    hotmart_url: '',
    main_image_url: product?.main_image_url || '',
    preview_01_url: product?.preview_01_url || '',
    preview_02_url: product?.preview_02_url || '',
    preview_03_url: product?.preview_03_url || '',
    active: Boolean(product?.active),
    sort_order: Number(product?.sort_order || 0),
  };
}

async function fetchActiveProducts() {
  const order = '&active=eq.true&order=sort_order.asc,created_at.asc';

  try {
    return await callSupabase(
      `/rest/v1/paid_products?select=${STOREFRONT_COLUMNS}${order}`,
      { method: 'GET' }
    );
  } catch (error) {
    if (!isMissingPurchaseColumns(error)) throw error;

    const legacyProducts = await callSupabase(
      `/rest/v1/paid_products?select=${LEGACY_STOREFRONT_COLUMNS}${order}`,
      { method: 'GET' }
    );

    return Array.isArray(legacyProducts)
      ? legacyProducts.map(normalizeLegacyProduct)
      : legacyProducts;
  }
}

function toAbsolutePublicImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) {
    return raw;
  }

  if (!SUPABASE_URL) {
    return raw;
  }

  if (raw.startsWith('/storage/v1/object/public/')) {
    return `${SUPABASE_URL}${raw}`;
  }

  if (raw.startsWith('storage/v1/object/public/')) {
    return `${SUPABASE_URL}/${raw}`;
  }

  if (raw.startsWith('paid-previews/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/${raw}`;
  }

  return raw;
}

function normalizeHotmartUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const isHotmartHost =
      hostname === 'hotmart.com' ||
      hostname.endsWith('.hotmart.com') ||
      hostname === 'hotm.art' ||
      hostname.endsWith('.hotm.art');

    if (url.protocol !== 'https:' || !isHotmartHost) {
      return '';
    }

    return url.toString();
  } catch (_error) {
    return '';
  }
}

function normalizeStorefrontProduct(product) {
  return {
    ...product,
    slug: getProductSlug(product),
    price_yape_pe: Number(product?.price_yape_pe || 0),
    price_paypal_usd: Number(product?.price_paypal_usd || 0),
    hotmart_url: normalizeHotmartUrl(product?.hotmart_url),
    main_image_url: toAbsolutePublicImageUrl(product?.main_image_url),
    preview_01_url: toAbsolutePublicImageUrl(product?.preview_01_url),
    preview_02_url: toAbsolutePublicImageUrl(product?.preview_02_url),
    preview_03_url: toAbsolutePublicImageUrl(product?.preview_03_url),
  };
}

async function handleStorefront(req, res) {
  try {
    const products = await fetchActiveProducts();

    let daily = null;
    try {
      daily = await callSupabase('/rest/v1/rpc/get_daily_free_product_public', {
        method: 'POST',
        body: '{}',
      });
    } catch (error) {
      daily = FALLBACK_DAILY;
    }

    return json(res, 200, {
      products:
        Array.isArray(products) && products.length
          ? products.map(normalizeStorefrontProduct)
          : FALLBACK_PRODUCTS,
      daily_free: daily || FALLBACK_DAILY,
      source: 'secure-backend',
    });
  } catch (error) {
    return json(res, 200, {
      products: FALLBACK_PRODUCTS,
      daily_free: FALLBACK_DAILY,
      source: 'fallback',
      warning: 'No se pudo conectar con Supabase, se devolvió fallback visual.',
    });
  }
}

function normalizeAgendaSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (slug.length < 2 || slug.length > 100 || !AGENDA_SLUG_PATTERN.test(slug)) return '';
  return slug;
}

function safeHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch (_error) {
    return null;
  }
}

function encodeStoragePath(value) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function createAgendaSignedUrl(storagePath) {
  const encodedPath = encodeStoragePath(storagePath);
  if (!encodedPath) throw new Error('Ruta de Storage inválida.');

  const result = await callSupabase(
    `/storage/v1/object/sign/${AGENDA_PREVIEW_BUCKET}/${encodedPath}`,
    {
      method: 'POST',
      body: JSON.stringify({ expiresIn: AGENDA_SIGNED_URL_SECONDS }),
    }
  );

  const signedPath = String(result?.signedURL || result?.signedUrl || '').trim();
  if (!signedPath) throw new Error('No se pudo generar la URL firmada.');
  if (/^https:\/\//i.test(signedPath)) return signedPath;
  if (signedPath.startsWith('/storage/v1/')) return `${SUPABASE_URL}${signedPath}`;
  const relativePath = signedPath.startsWith('/') ? signedPath : `/${signedPath}`;
  return `${SUPABASE_URL}/storage/v1${relativePath}`;
}

function agendaUnavailable(res) {
  res.setHeader('Cache-Control', 'no-store');
  return json(res, 404, { error: 'Muestra no disponible.' });
}

async function handleAgendaPreview(req, res) {
  const slug = normalizeAgendaSlug(req.query?.agenda);
  if (!slug) return agendaUnavailable(res);

  try {
    const previews = await callSupabase(
      `/rest/v1/agenda_previews?select=${encodeURIComponent(AGENDA_PREVIEW_COLUMNS)}` +
        `&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`,
      { method: 'GET' }
    );
    const preview = Array.isArray(previews) ? previews[0] : null;
    if (!preview) return agendaUnavailable(res);

    const pages = await callSupabase(
      `/rest/v1/agenda_preview_pages?select=${encodeURIComponent(AGENDA_PAGE_COLUMNS)}` +
        `&preview_id=eq.${encodeURIComponent(preview.id)}&order=position.asc`,
      { method: 'GET' }
    );
    if (!Array.isArray(pages) || !pages.length) return agendaUnavailable(res);

    const publicPages = await Promise.all(
      pages.map(async (page) => {
        const base = {
          position: Number(page.position),
          page_type: page.page_type === 'blank' ? 'blank' : 'image',
        };
        if (base.page_type === 'blank') return base;
        return {
          ...base,
          signed_url: await createAgendaSignedUrl(page.storage_path),
        };
      })
    );

    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, {
      preview: {
        title: String(preview.title || ''),
        slug: String(preview.slug || ''),
        format: String(preview.format || ''),
        width_mm: Number(preview.width_mm),
        height_mm: Number(preview.height_mm),
        orientation: String(preview.orientation || ''),
        total_product_pages: Number(preview.total_product_pages),
        buy_button_text: preview.buy_button_text ? String(preview.buy_button_text) : null,
        buy_url: safeHttpsUrl(preview.buy_url),
      },
      pages: publicPages,
    });
  } catch (error) {
    console.error('Public agenda preview error:', {
      name: error?.name,
      message: error?.message,
    });
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 503, { error: 'Muestra no disponible.' });
  }
}

async function handleAccessAction(req, res, payload) {
  const action = normalizeAction(payload?.action);
  const productId = payload?.productId ?? null;

  if (!action) {
    return json(res, 400, { error: 'Falta action.' });
  }

  try {
    const result = await callSupabase('/rest/v1/rpc/create_pdf_access_link', {
      method: 'POST',
      body: JSON.stringify({ p_action: action, p_product_id: productId }),
    });

    if (!result?.url) {
      return json(res, 403, { error: 'No autorizado para esta descarga.' });
    }

    return json(res, 200, {
      url: result.url,
      expires_at: result.expires_at,
    });
  } catch (error) {
    return json(res, 403, {
      error: 'No fue posible validar la compra o gratis diario en este momento.',
    });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'storefront') {
      return handleStorefront(req, res);
    }
    if (action === 'agenda-preview') {
      return handleAgendaPreview(req, res);
    }
    return json(res, 400, { error: 'Acción GET no soportada.' });
  }

  if (req.method === 'POST') {
    return handleAccessAction(req, res, req.body || {});
  }

  return json(res, 405, { error: 'Method Not Allowed' });
};
