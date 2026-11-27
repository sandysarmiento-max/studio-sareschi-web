'use strict';
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'folia-studio-private';
const OBJECT_PATH = 'editor-v48-5.html';

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+([\w.\-]+)$/i);
  if (!bearer) return respond(res, 401, { error: 'login_required' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return respond(res, 503, { error: 'configuration_missing' });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer[1]);
    if (authError) {
      const status = Number(authError.status);
      if (status === 401 || status === 403) return respond(res, 401, { error: 'invalid_session' });
      return respond(res, 503, { error: 'auth_check_unavailable' });
    }
    if (!authData?.user?.id) return respond(res, 401, { error: 'invalid_session' });

    const { data: grant, error: grantError } = await supabase
      .from('app_access').select('id')
      .eq('user_id', authData.user.id)
      .eq('app_key', 'folia_studio')
      .eq('status', 'active')
      .limit(1).maybeSingle();

    if (grantError) return respond(res, 503, { error: 'access_check_unavailable' });
    if (!grant) return respond(res, 403, { error: 'no_folia_studio_access' });

    if (req.query?.check === '1') return respond(res, 200, { active: true });

    const { data: htmlFile, error: fileError } = await supabase.storage
      .from(BUCKET).download(OBJECT_PATH);
    if (fileError || !htmlFile) return respond(res, 503, { error: 'editor_not_uploaded' });

    const buffer = Buffer.from(await htmlFile.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  } catch {
    return respond(res, 503, { error: 'temporarily_unavailable' });
  }
};
