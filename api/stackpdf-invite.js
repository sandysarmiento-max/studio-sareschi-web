const { createClient } = require('@supabase/supabase-js');

const INVITE_REDIRECT_PATH = '/acceso/nueva-contrasena/?app=stackpdf';
const STACKPDF_APP_KEY = 'stackpdf';
const ACTIVE_STATUS = 'active';

function getInviteRedirectTo(req) {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();

  const allowedHost =
    rawHost === 'www.studio-sareschi.com' ||
    rawHost === 'studio-sareschi.com' ||
    rawHost.endsWith('.vercel.app');

  const host = allowedHost ? rawHost : 'www.studio-sareschi.com';
  return `https://${host}${INVITE_REDIRECT_PATH}`;
}

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
        .on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        .on('error', reject);
    });
  }

  const normalized = String(raw || '').trim();
  if (!normalized) return { data: {}, error: null };

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

function isAlreadyRegisteredError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('already been registered') ||
    text.includes('already registered') ||
    text.includes('email address has already been registered')
  );
}

async function findUserIdByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;

  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return { userId: '', error: `No se pudo listar usuarios: ${String(error.message || error)}` };
    }

    const users = data?.users || [];
    if (!users.length) break;

    const found = users.find((user) => {
      const userEmail = String(user?.email || '').trim().toLowerCase();
      return userEmail === email;
    });

    if (found?.id) {
      return { userId: String(found.id), error: null };
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return { userId: '', error: 'No se encontró user_id para el email indicado.' };
}

async function upsertAppAccess(supabase, userId) {
  const { error } = await supabase.from('app_access').upsert(
    {
      user_id: userId,
      app_key: STACKPDF_APP_KEY,
      status: ACTIVE_STATUS,
      granted_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,app_key',
    }
  );

  if (error) {
    return String(error.message || error);
  }

  return null;
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

  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Email inválido', step: 'email' });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, {
      error: 'Faltan variables de entorno de Supabase',
      step: 'env-supabase',
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let userId = '';
    let invited = false;
    let existingUser = false;

    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: getInviteRedirectTo(req),
      });

    if (inviteError) {
      if (isAlreadyRegisteredError(inviteError.message)) {
        existingUser = true;
      } else {
        return json(res, 400, {
          error: 'Error de invitación',
          step: 'invite',
          details: String(inviteError.message || 'Error desconocido'),
        });
      }
    } else {
      invited = true;
      userId = String(inviteData?.user?.id || '').trim();
    }

    if (!userId) {
      const found = await findUserIdByEmail(supabase, email);
      if (found.error || !found.userId) {
        return json(res, 500, {
          error: 'No se pudo resolver el usuario para activar acceso',
          step: 'resolve-user',
          details: found.error || 'user_id vacío',
        });
      }
      userId = found.userId;
    }

    const upsertError = await upsertAppAccess(supabase, userId);
    if (upsertError) {
      return json(res, 500, {
        error: 'No se pudo activar acceso StackPDF',
        step: 'app-access-upsert',
        details: upsertError,
      });
    }

    return json(res, 200, {
      ok: true,
      invited,
      existingUser,
      user_id: userId,
    });
  } catch (error) {
    return json(res, 500, {
      error: 'Error de invitación',
      step: 'invite',
      details: String(error?.message || 'Error desconocido'),
    });
  }
};
