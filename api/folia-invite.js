const { createClient } = require('@supabase/supabase-js');

const INVITE_REDIRECT_TO = 'https://www.studio-sareschi.com/acceso/nueva-contrasena/?app=folia';
const FOLIA_APP_KEY = 'folia';
const ACTIVE_STATUS = 'active';

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

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Email inválido', step: 'email' });
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
      redirectTo: INVITE_REDIRECT_TO,
    });

    if (inviteError) {
      return json(res, 400, {
        error: 'Error de invitación',
        step: 'invite',
        details: String(inviteError.message || 'Error desconocido'),
      });
    }

    const userId = String(inviteData?.user?.id || '').trim();
    if (!userId) {
      return json(res, 500, {
        error: 'No se pudo activar acceso Folia',
        step: 'app-access-user',
        details: 'La invitación no devolvió user.id para completar app_access.',
      });
    }

    const { error: appAccessError } = await supabase.from('app_access').upsert(
      {
        user_id: userId,
        app_key: FOLIA_APP_KEY,
        status: ACTIVE_STATUS,
      },
      {
        onConflict: 'user_id,app_key',
      }
    );

    if (appAccessError) {
      return json(res, 500, {
        error: 'No se pudo activar acceso Folia',
        step: 'app-access-upsert',
        details: String(appAccessError.message || 'Error desconocido'),
      });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, {
      error: 'Error de invitación',
      step: 'invite',
      details: String(error?.message || 'Error desconocido'),
    });
  }
};
