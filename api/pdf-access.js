const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FALLBACK_PRODUCTS = [
  {
    id: 'sample-1',
    slug: 'agenda-semanal-rosa',
    title: 'Agenda semanal Rosa',
    subtitle: 'Plan semanal elegante con foco en objetivos.',
    prices: { pdf_hq: 1, canva: 2 },
    is_featured: true,
    badge: 'Más vendido',
    preview: { from: '#fff1f7', to: '#f8dce9' },
  },
  {
    id: 'sample-2',
    slug: 'checklist-boutique',
    title: 'Checklist Boutique',
    subtitle: 'Control diario visual y minimalista.',
    prices: { pdf_hq: 1, canva: 2 },
    is_featured: false,
    badge: 'Nuevo',
    preview: { from: '#fff9f1', to: '#fbead8' },
  },
  {
    id: 'sample-3',
    slug: 'pack-contenido-social',
    title: 'Pack contenido social',
    subtitle: 'Bloques listos para planificación de posteos.',
    prices: { pdf_hq: 1, canva: 2 },
    is_featured: false,
    badge: '',
    preview: { from: '#f5f4ff', to: '#e7e3fb' },
  },
];

const FALLBACK_DAILY = {
  id: 'daily-sample',
  title: 'Mini planner diario',
  description: 'Hoja rápida para tareas clave, prioridades y seguimiento.',
};

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

async function handleStorefront(req, res) {
  try {
    const products = await callSupabase('/rest/v1/rpc/get_storefront_products_public', {
      method: 'POST',
      body: '{}',
    });

    const daily = await callSupabase('/rest/v1/rpc/get_daily_free_product_public', {
      method: 'POST',
      body: '{}',
    });

    return json(res, 200, {
      products: Array.isArray(products) && products.length ? products : FALLBACK_PRODUCTS,
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
  const action = payload?.action;
  const productId = payload?.productId ?? null;

  if (!action) {
    return json(res, 400, { error: 'Falta action.' });
  }

  // Punto único para entregar URLs firmadas.
  // Evita exponer download_url directo en lecturas anónimas.
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
