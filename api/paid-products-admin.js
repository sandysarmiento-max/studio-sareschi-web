const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const BUCKET = 'paid-previews';
const PRODUCT_COLUMNS =
  'id,code,title,description,price_pdf_pe,price_pdf_int,price_canva_pe,price_canva_int,main_image_url,preview_01_url,preview_02_url,preview_03_url,active,sort_order,created_at,updated_at';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function callSupabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function getUserFromToken(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Falta configurar SUPABASE_URL o SUPABASE_ANON_KEY');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Token inválido o expirado');
  }

  return response.json();
}

function getAccessToken(req) {
  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) {
    return '';
  }
  return token;
}

function canManageProducts(user) {
  const email = String(user?.email || '').toLowerCase();
  const isAdminFromMetadata =
    user?.app_metadata?.role === 'admin' || user?.user_metadata?.role === 'admin';

  if (isAdminFromMetadata) {
    return true;
  }

  if (email && ADMIN_EMAILS.includes(email)) {
    return true;
  }

  // Modo estable por defecto: si ADMIN_EMAILS no está definido,
  // habilita el panel para cualquier usuario autenticado (mismo login de Aral Calc).
  if (!ADMIN_EMAILS.length && email) {
    return true;
  }

  return false;
}

function sanitizePayload(payload) {
  const record = {
    code: String(payload.code || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''),
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    price_pdf_pe: Number(payload.price_pdf_pe || 0),
    price_pdf_int: Number(payload.price_pdf_int || 0),
    price_canva_pe: Number(payload.price_canva_pe || 0),
    price_canva_int: Number(payload.price_canva_int || 0),
    main_image_url: String(payload.main_image_url || '').trim(),
    preview_01_url: String(payload.preview_01_url || '').trim(),
    preview_02_url: String(payload.preview_02_url || '').trim(),
    preview_03_url: String(payload.preview_03_url || '').trim(),
    active: Boolean(payload.active),
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
  };

  if (!record.code) {
    throw new Error('El campo code es obligatorio.');
  }

  if (!record.title) {
    throw new Error('El campo title es obligatorio.');
  }

  return record;
}

function inferExtension(contentType, fileName) {
  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  if (byMime[contentType]) {
    return byMime[contentType];
  }
  const fallback = String(fileName || '').split('.').pop();
  return fallback || 'jpg';
}

async function listProducts(res) {
  const products = await callSupabase(
    `/rest/v1/paid_products?select=${encodeURIComponent(PRODUCT_COLUMNS)}&order=sort_order.asc,created_at.asc`
  );
  return json(res, 200, { products });
}

async function createProduct(res, payload) {
  const record = sanitizePayload(payload || {});
  const products = await callSupabase(`/rest/v1/paid_products?select=${encodeURIComponent(PRODUCT_COLUMNS)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(record),
  });

  return json(res, 200, { product: products?.[0] || null });
}

async function updateProduct(res, payload) {
  const id = String(payload?.id || '').trim();
  if (!id) {
    return json(res, 400, { error: 'Falta id para actualizar.' });
  }

  const record = sanitizePayload(payload || {});
  const products = await callSupabase(
    `/rest/v1/paid_products?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(PRODUCT_COLUMNS)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(record),
    }
  );

  return json(res, 200, { product: products?.[0] || null });
}

async function uploadImage(res, payload) {
  const productId = String(payload?.productId || '').trim();
  const slot = String(payload?.slot || '').trim();
  const dataBase64 = String(payload?.dataBase64 || '').trim();
  const contentType = String(payload?.contentType || 'image/jpeg').trim();

  if (!productId || !slot || !dataBase64) {
    return json(res, 400, { error: 'Faltan productId, slot o dataBase64 para subir imagen.' });
  }

  const extension = inferExtension(contentType, payload?.fileName);
  const objectPath = `${productId}/${slot}-${Date.now()}.${extension}`;
  const binary = Buffer.from(dataBase64, 'base64');

  await callSupabase(`/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: binary,
  });

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  return json(res, 200, { publicUrl, path: objectPath });
}

module.exports = async function handler(req, res) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return json(res, 401, { error: 'No autorizado.' });
    }

    const user = await getUserFromToken(accessToken);
    if (!canManageProducts(user)) {
      return json(res, 403, {
        error:
          'Tu usuario no está habilitado para este panel. Si deseas restringir acceso, configura ADMIN_EMAILS o role=admin.',
      });
    }

    if (req.method === 'GET') {
      return await listProducts(res);
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || '').trim().toLowerCase();
      if (action === 'upload') {
        return await uploadImage(res, req.body || {});
      }
      return await createProduct(res, req.body || {});
    }

    if (req.method === 'PATCH') {
      return await updateProduct(res, req.body || {});
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Error interno.' });
  }
};
