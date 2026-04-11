const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INVITE_ADMIN_TOKEN = process.env.INVITE_ADMIN_TOKEN || '';
const INVITE_REDIRECT_TO = 'https://studio-sareschi.com/acceso/nueva-contrasena/';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isAuthorized(req) {
  const bearer = String(req.headers.authorization || '');
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  return Boolean(INVITE_ADMIN_TOKEN && token && token === INVITE_ADMIN_TOKEN);
}

async function inviteUserByEmail(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      options: {
        redirectTo: INVITE_REDIRECT_TO,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.error || 'No se pudo enviar invitación.');
  }

  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INVITE_ADMIN_TOKEN) {
    return json(res, 500, {
      error: 'Faltan variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o INVITE_ADMIN_TOKEN.',
    });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { error: 'No autorizado.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Email inválido.' });
  }

  try {
    const invited = await inviteUserByEmail(email);
    return json(res, 200, {
      ok: true,
      email,
      redirectTo: INVITE_REDIRECT_TO,
      invited,
    });
  } catch (error) {
    return json(res, 400, { error: String(error.message || 'No se pudo enviar la invitación.') });
  }
};
