const { createClient } = require('@supabase/supabase-js');

const INVITE_REDIRECT_BASE = 'https://www.studio-sareschi.com/acceso/aceptar-invitacion/';
const ALLOWED_APP_KEYS = new Set(['aral_calc', 'folia']);
const APP_NEXT_BY_KEY = {
  aral_calc: '/aral-calc/',
  folia: '/admin/folia-preview/',
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
  if (!value) return '';

  if (/^Bearer\s+/i.test(value)) {
    return value.replace(/^Bearer\s+/i, '').trim();
  }

  return value;
}

function buildInviteRedirect(appKey) {
  const redirectUrl = new URL(INVITE_REDIRECT_BASE);
  redirectUrl.searchParams.set('app', appKey);
  redirectUrl.searchParams.set('redirect_to', APP_NEXT_BY_KEY[appKey] || APP_NEXT_BY_KEY.aral_calc);
  return redirectUrl.toString();
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
    return json(res, 401, { error: 'Clave admin requerida', step: 'auth-header' });
  }

  if (!hasExpectedToken) {
    return json(res, 401, { error: 'Configuración admin incompleta', step: 'env-missing' });
  }

  if (receivedToken !== expectedToken) {
    return json(res, 401, { error: 'Clave admin incorrecta', step: 'token-mismatch' });
  }

  const { data: body, error: bodyError } = await readJsonBody(req);
  if (bodyError) {
    return json(res, 400, { error: bodyError, step: 'body' });
  }

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const appKey = String(body?.app_key || '')
    .trim()
    .toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Correo inválido', step: 'email' });
  }

  if (!ALLOWED_APP_KEYS.has(appKey)) {
    return json(res, 400, { error: 'App inválida', step: 'app_key' });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: buildInviteRedirect(appKey),
    });

    if (inviteError) {
      return json(res, 400, {
        error: 'No se pudo enviar invitación',
        step: 'invite',
        details: String(inviteError.message || 'Error desconocido'),
      });
    }

    const invitedUserId = String(inviteData?.user?.id || '').trim();

    if (!invitedUserId) {
      return json(res, 500, {
        error: 'Invitación enviada pero no se obtuvo user_id',
        step: 'invite-user-id',
      });
    }

    const nowIso = new Date().toISOString();
    const { error: accessError } = await supabase.from('app_access').upsert(
      {
        user_id: invitedUserId,
        app_key: appKey,
        status: 'active',
        granted_at: nowIso,
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,app_key',
      }
    );

    if (accessError) {
      return json(res, 500, {
        error: 'Invitación enviada pero falló activación de acceso',
        step: 'app-access',
        details: String(accessError.message || 'Error desconocido'),
      });
    }

    return json(res, 200, {
      ok: true,
      message: 'Invitación enviada y acceso activado.',
      email,
      app_key: appKey,
      user_id: invitedUserId,
    });
  } catch (error) {
    return json(res, 500, {
      error: 'Error interno al invitar',
      step: 'invite',
      details: String(error?.message || 'Error desconocido'),
    });
  }
};
