const { createClient } = require('@supabase/supabase-js');

const APP_CONFIG = {
  aral_calc: {
    appKey: 'aral_calc',
    name: 'Aral Calc',
  },
  folia: {
    appKey: 'folia',
    name: 'Folia',
  },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readAuthorization(req) {
  const rawHeader =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    req?.headers?.AUTHORIZATION ||
    '';

  const value = String(rawHeader || '').trim();
  if (!value) {
    return '';
  }

  if (/^Bearer\s+/i.test(value)) {
    return value.replace(/^Bearer\s+/i, '').trim();
  }

  return value;
}

async function readJsonBody(req) {
  const directBody = req?.body;

  if (directBody && typeof directBody === 'object' && !Buffer.isBuffer(directBody)) {
    return { data: directBody, error: null };
  }

  let raw = '';

  if (typeof directBody === 'string') {
    raw = directBody;
  } else if (Buffer.isBuffer(directBody)) {
    raw = directBody.toString('utf8');
  } else {
    raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req
        .on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        })
        .on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        })
        .on('error', reject);
    });
  }

  const normalized = String(raw || '').trim();
  if (!normalized) {
    return { data: {}, error: null };
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object') {
      return { data: {}, error: 'Formato JSON inválido' };
    }
    return { data: parsed, error: null };
  } catch {
    return { data: {}, error: 'No se pudo leer el JSON' };
  }
}

function normalizeAppKey(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return APP_CONFIG[value] ? value : '';
}

function resolveSiteUrl(req) {
  const explicit = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '').trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const host = String(req?.headers?.host || '').trim();
  if (!host) {
    return 'https://www.studio-sareschi.com';
  }

  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método no permitido' });
  }

  const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return json(res, 415, {
      error: 'Content-Type no soportado',
      step: 'content-type',
      expected: 'application/json',
    });
  }

  const expectedToken = String(process.env.INVITE_ADMIN_TOKEN || '').trim();
  const authHeaderRaw =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    req?.headers?.AUTHORIZATION ||
    '';
  const hasAuthHeader = Boolean(String(authHeaderRaw || '').trim());
  const hasExpectedToken = Boolean(expectedToken);
  const receivedToken = readAuthorization(req).trim();

  if (!hasAuthHeader) {
    return json(res, 401, { error: 'No autorizado', step: 'auth-header' });
  }

  if (!hasExpectedToken) {
    return json(res, 401, { error: 'No autorizado', step: 'env-missing' });
  }

  if (receivedToken !== expectedToken) {
    return json(res, 401, { error: 'No autorizado', step: 'token-mismatch' });
  }

  const { data: body, error: bodyError } = await readJsonBody(req);
  if (bodyError) {
    return json(res, 400, { error: bodyError, step: 'body' });
  }

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const appKey = normalizeAppKey(body?.app);

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Email inválido', step: 'email' });
  }

  if (!appKey) {
    return json(res, 400, {
      error: 'App inválida. Usa aral_calc o folia.',
      step: 'app',
      supportedApps: Object.keys(APP_CONFIG),
    });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, {
      error: 'Falta configuración de Supabase',
      step: 'supabase-env',
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const siteUrl = resolveSiteUrl(req);
    const redirectTo = `${siteUrl}/acceso/nueva-contrasena/?app=${encodeURIComponent(appKey)}`;

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      emailRedirectTo: redirectTo,
      data: {
        app: appKey,
      },
    });

    if (inviteError) {
      return json(res, 400, {
        error: 'Error de invitación',
        step: 'invite',
        details: String(inviteError.message || 'Error desconocido'),
      });
    }

    const invitedUserId = String(inviteData?.user?.id || '').trim();

    if (!invitedUserId) {
      return json(res, 500, {
        error: 'No se pudo resolver el usuario invitado para activar acceso.',
        step: 'invite-user-id',
      });
    }

    const { error: accessError } = await supabase.from('app_access').upsert(
      {
        user_id: invitedUserId,
        app_key: appKey,
        status: 'active',
      },
      {
        onConflict: 'user_id,app_key',
      }
    );

    if (accessError) {
      return json(res, 500, {
        error: 'La invitación se envió, pero no se pudo activar app_access.',
        step: 'app-access',
        details: String(accessError.message || 'Error desconocido'),
      });
    }

    return json(res, 200, {
      ok: true,
      email,
      app: appKey,
      appName: APP_CONFIG[appKey].name,
      redirectTo,
      appAccessActivated: true,
    });
  } catch (error) {
    return json(res, 500, {
      error: 'Error de invitación',
      step: 'invite',
      details: String(error?.message || 'Error desconocido'),
    });
  }
};
