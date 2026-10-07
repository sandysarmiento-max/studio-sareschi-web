'use strict';

const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  ApiError,
  getBearerToken,
  isAuthorizedAdmin,
  json,
  mapSupabaseError,
  parseAdminEmails,
  requireUuid,
} = require('./agenda-previews-admin-core');
const {
  MAX_PDF_SIZE,
  MAX_PREVIEW_SIZE,
  PDF_MIME_TYPE,
  PREVIEW_MIME_TYPES,
  buildStoragePath,
  createSlug,
  sanitizeFreebiePayload,
  sanitizeUploadRequest,
} = require('./freebies-admin-core');

const COLUMNS =
  'id,slug,title,description,category,thumbnail,storage_path,legacy_public_url,page_count,is_active,sort_order,created_at';
const SIGNED_READ_SECONDS = 15 * 60;
const DIAGNOSTIC_ADMIN_EMAIL = 'sandy.sarmiento@gmail.com';

function buildAuthorizationDiagnostic(user, rawAdminEmails = process.env.ADMIN_EMAILS) {
  const adminEmails = parseAdminEmails(rawAdminEmails);
  return {
    admin_emails_exists: typeof rawAdminEmails === 'string',
    recognized_email_count: adminEmails.size,
    contains_expected_email: adminEmails.has(DIAGNOSTIC_ADMIN_EMAIL),
    authenticated_email: String(user?.email || '').trim().toLowerCase(),
  };
}

function createClients() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_FREEBIES_BUCKET || '').trim();
  if (!url || !anonKey || !serviceRoleKey || !bucket) {
    throw new ApiError(500, 'server_not_configured', 'El administrador de PDFs gratuitos no está configurado.');
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    auth: createClient(url, anonKey, options),
    admin: createClient(url, serviceRoleKey, options),
    bucket,
  };
}

async function authenticate(req, authClient) {
  const token = getBearerToken(req);
  if (!token) throw new ApiError(401, 'missing_token', 'Falta el token de acceso.');
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) throw new ApiError(401, 'invalid_token', 'El token es inválido o expiró.');
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (!isAuthorizedAdmin(data.user, adminEmails)) {
    const details = process.env.VERCEL_ENV === 'preview'
      ? { authorization_diagnostic: buildAuthorizationDiagnostic(data.user) }
      : undefined;
    throw new ApiError(403, 'admin_required', 'La cuenta no tiene acceso administrativo.', details);
  }
  return data.user;
}

function assertResult(error) {
  if (error) throw error;
}

async function getResource(admin, id) {
  const { data, error } = await admin
    .from('free_products')
    .select(COLUMNS)
    .eq('id', requireUuid(id, 'resource_id'))
    .maybeSingle();
  assertResult(error);
  if (!data) throw new ApiError(404, 'resource_not_found', 'El recurso no existe.');
  return data;
}

function legacyThumbnailUrl(storagePath) {
  const match = String(storagePath || '').match(/^freebies\/(fb_0(?:0[1-9]|1[0-8]))\.pdf$/);
  return match ? `/freebies/previews/${match[1]}_preview.jpg` : null;
}

async function signedThumbnail(admin, bucket, resource) {
  if (!resource.thumbnail) return legacyThumbnailUrl(resource.storage_path);
  if (/^https?:\/\//i.test(resource.thumbnail) || resource.thumbnail.startsWith('/')) {
    return resource.thumbnail;
  }
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(resource.thumbnail, SIGNED_READ_SECONDS);
  assertResult(error);
  return data?.signedUrl || null;
}

async function listResources(admin, bucket) {
  const { data, error } = await admin
    .from('free_products')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  assertResult(error);
  const resources = await Promise.all(
    (data || []).map(async (resource) => ({
      ...resource,
      preview_url: await signedThumbnail(admin, bucket, resource),
    }))
  );
  return { resources, signed_url_expires_in: SIGNED_READ_SECONDS };
}

async function ensureSlugAvailable(admin, slug) {
  const { data: collision, error } = await admin
    .from('free_products')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  assertResult(error);
  if (collision) throw new ApiError(409, 'slug_conflict', 'Ya existe un recurso con un título equivalente.');
}

async function authorizeCreate(admin, bucket, payload) {
  const record = sanitizeFreebiePayload(payload);
  record.slug = createSlug(record.title);
  await ensureSlugAvailable(admin, record.slug);

  const resourceId = randomUUID();
  const request = sanitizeUploadRequest({
    resource_id: resourceId,
    kind: 'pdf',
    mime_type: payload?.mime_type,
    file_size: payload?.file_size,
  });
  const path = buildStoragePath(resourceId, 'pdf', request.mimeType);
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  assertResult(error);
  return {
    upload: {
      resource_id: resourceId,
      kind: 'pdf',
      mime_type: request.mimeType,
      file_size: request.size,
      storage_path: path,
      token: data?.token,
      signed_url: data?.signedUrl,
      bucket,
    },
  };
}

async function confirmCreate(admin, bucket, payload) {
  const request = sanitizeUploadRequest({ ...payload, kind: 'pdf' });
  const record = sanitizeFreebiePayload(payload);
  record.id = request.resourceId;
  record.slug = createSlug(record.title);
  record.storage_path = String(payload?.storage_path || '').trim();

  const expectedPath = new RegExp(
    `^freebies/${request.resourceId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`,
    'i'
  );
  if (!expectedPath.test(record.storage_path)) {
    throw new ApiError(422, 'storage_path_mismatch', 'La ruta del PDF no coincide con el nuevo recurso.');
  }

  const stored = await inspectObject(admin, bucket, record.storage_path, 'pdf');
  if (stored.mime !== request.mimeType || stored.size !== request.size) {
    throw new ApiError(422, 'storage_metadata_mismatch', 'Los metadatos no coinciden con el PDF subido.');
  }
  await ensureSlugAvailable(admin, record.slug);

  const { data, error } = await admin
    .from('free_products')
    .insert(record)
    .select(COLUMNS)
    .single();
  if (error) {
    throw new ApiError(
      String(error.code || '') === '23505' ? 409 : 500,
      'resource_insert_failed',
      'El PDF se subió, pero no se pudo crear el recurso. El objeto quedó identificado para limpieza manual.',
      { orphaned_storage_object: { bucket, storage_path: record.storage_path } }
    );
  }
  return { resource: data };
}

async function updateResource(admin, payload) {
  const id = requireUuid(payload?.resource_id, 'resource_id');
  await getResource(admin, id);
  const record = sanitizeFreebiePayload(payload, { partial: true });
  const { data, error } = await admin
    .from('free_products')
    .update(record)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  assertResult(error);
  return { resource: data };
}

async function authorizeUpload(admin, bucket, payload) {
  const request = sanitizeUploadRequest(payload);
  await getResource(admin, request.resourceId);
  const path = buildStoragePath(request.resourceId, request.kind, request.mimeType);
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  assertResult(error);
  return {
    upload: {
      resource_id: request.resourceId,
      kind: request.kind,
      mime_type: request.mimeType,
      file_size: request.size,
      storage_path: path,
      token: data?.token,
      signed_url: data?.signedUrl,
      bucket,
    },
  };
}

async function inspectObject(admin, bucket, path, kind) {
  const slash = path.lastIndexOf('/');
  const prefix = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, search: name });
  assertResult(error);
  const object = (data || []).find((item) => item.name === name);
  if (!object) throw new ApiError(422, 'storage_object_missing', 'El archivo subido no existe en Storage.');
  const mime = String(object.metadata?.mimetype || '').toLowerCase();
  const size = Number(object.metadata?.size || 0);
  const mimeAllowed = kind === 'pdf' ? mime === PDF_MIME_TYPE : PREVIEW_MIME_TYPES.has(mime);
  const maxSize = kind === 'pdf' ? MAX_PDF_SIZE : MAX_PREVIEW_SIZE;
  if (!mimeAllowed || !Number.isInteger(size) || size < 1 || size > maxSize) {
    throw new ApiError(422, 'stored_file_invalid', 'El archivo almacenado no cumple los límites permitidos.');
  }
  return { mime, size };
}

async function confirmUpload(admin, bucket, payload) {
  const request = sanitizeUploadRequest(payload);
  const resource = await getResource(admin, request.resourceId);
  const path = String(payload?.storage_path || '').trim();
  const expectedPrefix = request.kind === 'thumbnail'
    ? `previews/${resource.id}/`
    : `freebies/${resource.id}/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new ApiError(422, 'storage_path_mismatch', 'La ruta del archivo no coincide con la autorización.');
  }
  const stored = await inspectObject(admin, bucket, path, request.kind);
  if (stored.mime !== request.mimeType || stored.size !== request.size) {
    throw new ApiError(422, 'storage_metadata_mismatch', 'Los metadatos no coinciden con el archivo almacenado.');
  }

  const field = request.kind === 'thumbnail' ? 'thumbnail' : 'storage_path';
  const { data, error } = await admin
    .from('free_products')
    .update({ [field]: path })
    .eq('id', resource.id)
    .select(COLUMNS)
    .single();
  assertResult(error);
  return { resource: data };
}

async function deleteResource(admin, payload) {
  const resource = await getResource(admin, payload?.resource_id);
  const confirmation = String(payload?.confirmation_text || '').trim();
  if (payload?.confirm_delete !== true || confirmation !== resource.slug) {
    throw new ApiError(422, 'delete_confirmation_required', `Escribe ${resource.slug} para confirmar la eliminación.`);
  }
  const { error } = await admin.from('free_products').delete().eq('id', resource.id);
  assertResult(error);
  return { deleted: true, resource_id: resource.id, storage_files_preserved: true };
}

async function dispatch(req, admin, bucket) {
  const action = String(req.body?.action || req.query?.action || '').trim().toLowerCase();
  if (req.method === 'GET') return listResources(admin, bucket);
  if (req.method === 'POST' && action === 'create') {
    throw new ApiError(422, 'pdf_required', 'Selecciona un PDF antes de crear el recurso.');
  }
  if (req.method === 'POST' && action === 'authorize-create') return authorizeCreate(admin, bucket, req.body);
  if (req.method === 'POST' && action === 'confirm-create') return confirmCreate(admin, bucket, req.body);
  if (req.method === 'PATCH' && action === 'update') return updateResource(admin, req.body);
  if (req.method === 'POST' && action === 'authorize-upload') return authorizeUpload(admin, bucket, req.body);
  if (req.method === 'POST' && action === 'confirm-upload') return confirmUpload(admin, bucket, req.body);
  if (req.method === 'DELETE' && action === 'delete') return deleteResource(admin, req.body);
  throw new ApiError(404, 'operation_not_found', 'La operación solicitada no existe.');
}

module.exports = async function handler(req, res) {
  try {
    const { auth, admin, bucket } = createClients();
    await authenticate(req, auth);
    const response = await dispatch(req, admin, bucket);
    return json(res, 200, { ok: true, ...response });
  } catch (rawError) {
    const error = mapSupabaseError(rawError);
    if (error.status >= 500) console.error('Freebies admin error:', rawError?.message || rawError);
    const diagnostic = process.env.VERCEL_ENV === 'preview'
      && error.code === 'admin_required'
      && error.details?.authorization_diagnostic
      ? { authorization_diagnostic: error.details.authorization_diagnostic }
      : {};
    const orphaned = error.details?.orphaned_storage_object
      ? { orphaned_storage_object: error.details.orphaned_storage_object }
      : {};
    return json(res, error.status, { ok: false, code: error.code, error: error.message, ...diagnostic, ...orphaned });
  }
};

module.exports._test = {
  authenticate,
  authorizeCreate,
  authorizeUpload,
  buildAuthorizationDiagnostic,
  confirmCreate,
  confirmUpload,
  deleteResource,
  dispatch,
  inspectObject,
  legacyThumbnailUrl,
  signedThumbnail,
  updateResource,
};
