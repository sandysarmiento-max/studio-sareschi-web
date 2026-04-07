const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_FREEBIES_BUCKET = process.env.SUPABASE_FREEBIES_BUCKET;

const DAILY_LIMIT = 1;
const SIGNED_URL_TTL_SECONDS = 300;
const FREEBIE_CODE_FIELDS = [
  'slug',
  'download_path',
  'storage_path',
  'file_path',
  'object_path',
  'asset_path',
  'path',
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_FREEBIES_BUCKET) {
    throw new Error('Faltan variables de entorno de Supabase para freebies.');
  }

  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function callSupabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error al consultar Supabase.');
  }

  return response.json();
}


function normalizeFreebieCode(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.toLowerCase().match(/fb[\W_]*(\d{3})/);
  if (!match) {
    return null;
  }

  const code = `fb_${match[1]}`;
  if (!/^fb_(00[1-9]|01[0-8])$/.test(code)) {
    return null;
  }

  return code;
}

function extractFreebieCode(row) {
  for (const field of FREEBIE_CODE_FIELDS) {
    const value = row?.[field];
    const code = normalizeFreebieCode(value);
    if (code) {
      return code;
    }
  }

  const storagePath = extractStoragePath(row);
  return normalizeFreebieCode(storagePath);
}

function buildPreviewImageUrlFromCode(code) {
  if (!code) {
    return null;
  }

  return `/freebies/previews/${code}_preview.jpg`;
}

function normalizeFreebie(row, index) {
  const slug = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : '';
  const inferredCode = extractFreebieCode(row);
  const id = row.id || slug || inferredCode || `freebie-${index + 1}`;
  const title = row.title || row.name || `PDF gratuito ${index + 1}`;
  const description = row.description || row.subtitle || 'Plantilla PDF gratuita de Studio Sareschi.';
  const category = row.category || 'Zona Gratuita';
  const accent = row.accent_color || row.color || row.preview_color || '#f2e6ef';
  const previewImageUrl = buildPreviewImageUrlFromCode(inferredCode);

  return {
    id,
    slug: slug || inferredCode || '',
    title,
    description,
    category,
    accent,
    preview_image_url: previewImageUrl,
  };
}

function extractStoragePath(row) {
  const direct = [
    row.download_path,
    row.storage_path,
    row.file_path,
    row.object_path,
    row.asset_path,
    row.path,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (direct) {
    return direct;
  }

  if (typeof row.slug === 'string' && /^fb_\d{3}$/.test(row.slug)) {
    return `freebies/${row.slug}.pdf`;
  }

  return null;
}

async function listFreeProducts() {
  const rows = await callSupabase('/rest/v1/free_products?select=*&order=sort_order.asc.nullslast,created_at.asc');
  const activeRows = rows.filter((row) => row.is_active !== false);

  return {
    normalized: activeRows.map(normalizeFreebie),
    raw: activeRows,
  };
}

async function getProductById(productId) {
  const encodedId = encodeURIComponent(`eq.${productId}`);
  const rows = await callSupabase(`/rest/v1/free_products?select=*&id=${encodedId}&limit=1`);
  if (!rows.length || rows[0].is_active === false) {
    return null;
  }
  return rows[0];
}

async function createSignedUrl(objectPath) {
  const normalizedPath = objectPath
    .replace(/^\/+/, '')
    .replace(new RegExp(`^${SUPABASE_FREEBIES_BUCKET}/`), '');
  const signed = await callSupabase(
    `/storage/v1/object/sign/${SUPABASE_FREEBIES_BUCKET}/${normalizedPath}`,
    {
      method: 'POST',
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
    }
  );

  const signedPath = signed?.signedURL || signed?.signedUrl;

  if (!signedPath) {
    throw new Error('No se pudo crear la signed URL.');
  }

  if (/^https?:\/\//.test(signedPath)) {
    return signedPath;
  }

  return `${SUPABASE_URL}/storage/v1${signedPath}`;
}

async function handleGet(req, res) {
  try {
    const { normalized } = await listFreeProducts();
    return json(res, 200, {
      freebies: normalized,
      rule: {
        daily_limit: DAILY_LIMIT,
        scope: 'browser',
      },
    });
  } catch (error) {
    return json(res, 500, {
      error: 'No se pudo cargar la Zona Gratuita.',
    });
  }
}

async function handleClaim(req, res, body) {
  const productId = body?.productId;

  if (!productId) {
    return json(res, 400, { error: 'Falta productId.' });
  }

  try {
    const row = await getProductById(productId);
    if (!row) {
      return json(res, 404, { error: 'El archivo no está disponible.' });
    }

    const path = extractStoragePath(row);
    if (!path) {
      return json(res, 500, { error: 'El archivo no tiene ruta de storage configurada.' });
    }

    const url = await createSignedUrl(path);
    return json(res, 200, { url });
  } catch (error) {
    return json(res, 500, { error: 'No se pudo preparar la descarga en este momento.' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handleClaim(req, res, req.body || {});
  }

  return json(res, 405, { error: 'Method Not Allowed' });
};
