const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const FREEBIES_BUCKET = process.env.SUPABASE_FREEBIES_BUCKET || 'freebies-private';

const FALLBACK_FREE_PRODUCTS = [
  {
    id: 'fallback-agenda',
    slug: 'agenda-semanal-suave',
    title: 'Agenda semanal suave',
    description: 'Planifica tu semana con estructura limpia y foco en prioridades.',
    category: 'Organización',
    thumbnail: null,
    page_count: 1,
  },
  {
    id: 'fallback-habitos',
    slug: 'lista-habitos-minimal',
    title: 'Lista de hábitos minimal',
    description: 'Seguimiento diario con formato simple y estilo femenino.',
    category: 'Hábitos',
    thumbnail: null,
    page_count: 1,
  },
  {
    id: 'fallback-notas',
    slug: 'notas-creativas-a4',
    title: 'Notas creativas A4',
    description: 'Plantilla libre para ideas, bosquejos y notas rápidas.',
    category: 'Creatividad',
    thumbnail: null,
    page_count: 1,
  },
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getAuthToken(req, payload) {
  const header = req.headers?.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const customHeader = req.headers?.['x-supabase-auth'];
  if (customHeader) return String(customHeader).trim();
  const payloadToken = payload?.accessToken;
  if (payloadToken) return String(payloadToken).trim();
  return null;
}

function encodePathSegment(value) {
  return String(value)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function callSupabase(path, options = {}, useAnonKey = false) {
  const apiKey = useAnonKey ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !apiKey) {
    throw new Error('Supabase no configurado en variables de entorno.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: options.headers?.Authorization || `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error de Supabase');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return null;
}

async function getAuthenticatedUser(token) {
  if (!token) {
    return null;
  }

  try {
    const user = await callSupabase(
      '/auth/v1/user',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      true
    );
    return user || null;
  } catch (_) {
    return null;
  }
}

async function hasDownloadedToday(userId, today) {
  const rows = await callSupabase(
    `/rest/v1/free_downloads?select=id&user_id=eq.${userId}&download_date=eq.${today}&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function listFreeProducts() {
  try {
    const rows = await callSupabase(
      '/rest/v1/free_products?select=id,slug,title,description,category,thumbnail,page_count&is_active=eq.true&order=sort_order.asc,created_at.asc'
    );

    if (Array.isArray(rows) && rows.length) {
      return rows;
    }
  } catch (_) {
    // fallback visual intencional
  }

  return FALLBACK_FREE_PRODUCTS;
}

async function signStoragePath(storagePath) {
  const cleanedPath = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!cleanedPath) return null;

  const endpoint = `/storage/v1/object/sign/${encodePathSegment(FREEBIES_BUCKET)}/${encodePathSegment(cleanedPath)}`;

  const payload = await callSupabase(endpoint, {
    method: 'POST',
    body: JSON.stringify({ expiresIn: 90 }),
  });

  const signedRelativeUrl = payload?.signedURL || payload?.signedUrl || null;
  if (!signedRelativeUrl) return null;

  return `${SUPABASE_URL}/storage/v1${signedRelativeUrl}`;
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
      products: Array.isArray(products) && products.length ? products : [],
      daily_free: daily || null,
      source: 'secure-backend',
    });
  } catch (error) {
    return json(res, 200, {
      products: [],
      daily_free: null,
      source: 'fallback',
      warning: 'No se pudo conectar con Supabase, se devolvió fallback visual.',
    });
  }
}

async function handleFreeConfig(_req, res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(res, 500, { error: 'Falta SUPABASE_URL o SUPABASE_ANON_KEY.' });
  }

  return json(res, 200, {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    freebiesBucket: FREEBIES_BUCKET,
  });
}

async function handleFreeProducts(_req, res) {
  const products = await listFreeProducts();
  const safeProducts = products.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description || '',
    category: item.category || '',
    thumbnail: item.thumbnail || null,
    page_count: Number(item.page_count || 0),
  }));

  return json(res, 200, { products: safeProducts });
}

async function handleFreebieStatus(req, res, payload) {
  const token = getAuthToken(req, payload);
  const user = await getAuthenticatedUser(token);

  if (!user?.id) {
    return json(res, 200, {
      authenticated: false,
      canDownload: false,
      message: 'Inicia sesión para activar tu descarga gratuita diaria.',
    });
  }

  const today = getTodayUTC();
  const alreadyDownloaded = await hasDownloadedToday(user.id, today);

  return json(res, 200, {
    authenticated: true,
    canDownload: !alreadyDownloaded,
    today,
    message: alreadyDownloaded
      ? 'Ya usaste tu descarga gratuita de hoy. Vuelve mañana para elegir otro PDF.'
      : 'Tienes 1 descarga gratuita disponible hoy.',
  });
}

async function handleClaimFreebie(req, res, payload) {
  const freeProductId = payload?.freeProductId;
  if (!freeProductId) {
    return json(res, 400, { error: 'Falta freeProductId.' });
  }

  const token = getAuthToken(req, payload);
  const user = await getAuthenticatedUser(token);

  if (!user?.id) {
    return json(res, 401, { error: 'Debes iniciar sesión para descargar.' });
  }

  const today = getTodayUTC();
  const alreadyDownloaded = await hasDownloadedToday(user.id, today);

  if (alreadyDownloaded) {
    return json(res, 429, {
      error: 'Ya usaste tu descarga gratuita de hoy. Vuelve mañana para elegir otro PDF.',
    });
  }

  const rows = await callSupabase(
    `/rest/v1/free_products?select=id,title,storage_path,legacy_public_url,is_active&is_active=eq.true&id=eq.${freeProductId}&limit=1`
  );

  const selected = Array.isArray(rows) ? rows[0] : null;
  if (!selected) {
    return json(res, 404, { error: 'El PDF seleccionado no está disponible.' });
  }

  const insertRows = await callSupabase('/rest/v1/free_downloads?select=id,created_at', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation,resolution=ignore-duplicates',
    },
    body: JSON.stringify([
      {
        user_id: user.id,
        free_product_id: selected.id,
        download_date: today,
      },
    ]),
  });

  if (!Array.isArray(insertRows) || insertRows.length === 0) {
    return json(res, 429, {
      error: 'Ya usaste tu descarga gratuita de hoy. Vuelve mañana para elegir otro PDF.',
    });
  }

  let downloadUrl = null;
  if (selected.storage_path) {
    downloadUrl = await signStoragePath(selected.storage_path);
  }

  if (!downloadUrl && selected.legacy_public_url) {
    downloadUrl = selected.legacy_public_url;
  }

  if (!downloadUrl) {
    await callSupabase(`/rest/v1/free_downloads?id=eq.${insertRows[0].id}`, {
      method: 'DELETE',
    });

    return json(res, 500, {
      error: 'No fue posible generar el enlace de descarga. Intenta de nuevo.',
    });
  }

  return json(res, 200, {
    ok: true,
    downloadUrl,
    productTitle: selected.title,
    message: 'Descarga habilitada. El enlace expira pronto por seguridad.',
  });
}

async function handleAccessAction(req, res, payload) {
  const action = payload?.action;
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
    if (action === 'storefront') return handleStorefront(req, res);
    if (action === 'free-config') return handleFreeConfig(req, res);
    if (action === 'free-products') return handleFreeProducts(req, res);
    return json(res, 400, { error: 'Acción GET no soportada.' });
  }

  if (req.method === 'POST') {
    const action = req.body?.action;
    if (action === 'freebie-status') return handleFreebieStatus(req, res, req.body || {});
    if (action === 'claim-freebie') return handleClaimFreebie(req, res, req.body || {});
    return handleAccessAction(req, res, req.body || {});
  }

  return json(res, 405, { error: 'Method Not Allowed' });
};
