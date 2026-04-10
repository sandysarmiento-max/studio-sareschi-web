const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FALLBACK_PRODUCTS = [
  {
    id: 'seed-paid-product',
    code: 'agenda-semanal-rosa',
    title: 'Agenda semanal Rosa (Demo)',
    description: 'Producto de prueba para validar catálogo y flujo de compra por WhatsApp.',
    price_pdf_pe: 4,
    price_pdf_int: 1.5,
    price_canva_pe: 8,
    price_canva_int: 3,
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

function normalizeStorefrontProduct(product) {
  return {
    ...product,
    main_image_url: toAbsolutePublicImageUrl(product?.main_image_url),
    preview_01_url: toAbsolutePublicImageUrl(product?.preview_01_url),
    preview_02_url: toAbsolutePublicImageUrl(product?.preview_02_url),
    preview_03_url: toAbsolutePublicImageUrl(product?.preview_03_url),
  };
}

async function handleStorefront(req, res) {
  try {
    const products = await callSupabase(
      '/rest/v1/paid_products?select=id,code,title,description,price_pdf_pe,price_pdf_int,price_canva_pe,price_canva_int,main_image_url,preview_01_url,preview_02_url,preview_03_url,active,sort_order&active=eq.true&order=sort_order.asc,created_at.asc',
      {
        method: 'GET',
      }
    );

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
    return json(res, 400, { error: 'Acción GET no soportada.' });
  }

  if (req.method === 'POST') {
    return handleAccessAction(req, res, req.body || {});
  }

  return json(res, 405, { error: 'Method Not Allowed' });
};
