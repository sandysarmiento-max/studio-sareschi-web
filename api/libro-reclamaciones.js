const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sanitizeString(value) {
  return String(value || '').trim();
}

function sanitizeOptionalString(value) {
  const normalized = sanitizeString(value);
  return normalized || null;
}

function sanitizeAmount(value) {
  const normalized = sanitizeString(value);
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

async function callSupabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
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
    throw new Error(await response.text());
  }

  return response.json();
}

function normalizePayload(rawBody) {
  const body = rawBody || {};

  const payload = {
    consumer_full_name: sanitizeString(body.consumer_full_name),
    consumer_address: sanitizeString(body.consumer_address),
    consumer_document: sanitizeString(body.consumer_document),
    consumer_phone: sanitizeString(body.consumer_phone),
    consumer_email: sanitizeString(body.consumer_email),
    guardian_full_name: sanitizeOptionalString(body.guardian_full_name),
    guardian_address: sanitizeOptionalString(body.guardian_address),
    guardian_document: sanitizeOptionalString(body.guardian_document),
    guardian_phone: sanitizeOptionalString(body.guardian_phone),
    item_type: sanitizeString(body.item_type),
    item_description: sanitizeString(body.item_description),
    claimed_amount: sanitizeAmount(body.claimed_amount),
    claim_type: sanitizeString(body.claim_type),
    claim_detail: sanitizeString(body.claim_detail),
    consumer_request: sanitizeString(body.consumer_request),
    provider_actions: sanitizeOptionalString(body.provider_actions),
    signature_full_name: sanitizeString(body.signature_full_name),
    acceptance: Boolean(body.acceptance),
  };

  const required = [
    'consumer_full_name',
    'consumer_address',
    'consumer_document',
    'consumer_phone',
    'consumer_email',
    'item_type',
    'item_description',
    'claim_type',
    'claim_detail',
    'consumer_request',
    'signature_full_name',
  ];

  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`Falta el campo obligatorio: ${field}.`);
    }
  }

  if (!payload.acceptance) {
    throw new Error('Debes aceptar la conformidad antes de enviar.');
  }

  if (payload.signature_full_name.toLowerCase() !== payload.consumer_full_name.toLowerCase()) {
    throw new Error('La firma de conformidad no coincide con el nombre del consumidor.');
  }

  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  let payload;

  try {
    payload = normalizePayload(req.body);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  try {
    const rows = await callSupabase('/rest/v1/complaint_book_entries?select=*', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const record = rows?.[0];

    if (!record) {
      return json(res, 500, { error: 'No se pudo confirmar el registro del reclamo.' });
    }

    return json(res, 200, { record });
  } catch (error) {
    const message = String(error.message || '');

    if (message.includes("Could not find the table 'public.complaint_book_entries'")) {
      return json(res, 503, {
        code: 'missing_complaint_table',
        error: 'Falta crear la tabla complaint_book_entries en Supabase.',
      });
    }

    return json(res, 500, { error: 'No se pudo registrar el reclamo en este momento.' });
  }
};
