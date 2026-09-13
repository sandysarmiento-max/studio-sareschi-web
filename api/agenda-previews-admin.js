'use strict';

const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  ALLOWED_MIME_TYPES,
  ApiError,
  BUCKET,
  MAX_FILE_SIZE,
  MAX_PAGES,
  getBearerToken,
  isAuthorizedAdmin,
  json,
  mapSupabaseError,
  parseAdminEmails,
  requireInteger,
  requireUuid,
  sanitizeImageMetadata,
  sanitizePreviewPayload,
  storagePath,
} = require('./_agenda-previews-admin-core');

const PREVIEW_COLUMNS =
  'id,slug,title,format,width_mm,height_mm,orientation,total_product_pages,buy_button_text,buy_url,status,revision,created_at,updated_at,published_at';
const PAGE_COLUMNS =
  'id,preview_id,position,page_type,storage_path,object_version,original_filename,mime_type,width_px,height_px,file_size_bytes,sha256,created_at,updated_at';
const SIGNED_READ_SECONDS = 15 * 60;

function createClients() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new ApiError(500, 'server_not_configured', 'El servicio administrativo no está configurado.');
  }

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    auth: createClient(supabaseUrl, anonKey, options),
    admin: createClient(supabaseUrl, serviceRoleKey, options),
  };
}

async function authenticate(req, authClient) {
  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, 'missing_token', 'Falta el token de acceso.');
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, 'invalid_token', 'El token es inválido o expiró.');
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (!isAuthorizedAdmin(data.user, adminEmails)) {
    throw new ApiError(403, 'admin_required', 'La cuenta no tiene acceso administrativo.');
  }

  return data.user;
}

function assertResult(error) {
  if (error) throw error;
}

async function getPreview(admin, previewId, { draftOnly = false } = {}) {
  let query = admin
    .from('agenda_previews')
    .select(PREVIEW_COLUMNS)
    .eq('id', requireUuid(previewId, 'preview_id'));
  if (draftOnly) query = query.eq('status', 'draft');
  const { data, error } = await query.maybeSingle();
  assertResult(error);
  if (!data) {
    throw new ApiError(404, 'preview_not_found', 'La muestra no existe o no está disponible.');
  }
  return data;
}

async function getPage(admin, previewId, pageId) {
  const { data, error } = await admin
    .from('agenda_preview_pages')
    .select(PAGE_COLUMNS)
    .eq('preview_id', requireUuid(previewId, 'preview_id'))
    .eq('id', requireUuid(pageId, 'page_id'))
    .maybeSingle();
  assertResult(error);
  if (!data) throw new ApiError(404, 'page_not_found', 'La página no existe.');
  return data;
}

async function getPages(admin, previewId) {
  const { data, error } = await admin
    .from('agenda_preview_pages')
    .select(PAGE_COLUMNS)
    .eq('preview_id', requireUuid(previewId, 'preview_id'))
    .order('position', { ascending: true });
  assertResult(error);
  return data || [];
}

async function listPreviews(admin) {
  const { data, error } = await admin
    .from('agenda_previews')
    .select(PREVIEW_COLUMNS)
    .order('updated_at', { ascending: false });
  assertResult(error);
  return { previews: data || [] };
}

async function loadPreview(admin, previewId) {
  const preview = await getPreview(admin, previewId);
  const pages = await getPages(admin, preview.id);
  const pagesWithUrls = await Promise.all(
    pages.map(async (page) => {
      if (page.page_type !== 'image') return { ...page, signed_url: null };
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(page.storage_path, SIGNED_READ_SECONDS);
      assertResult(error);
      return { ...page, signed_url: data?.signedUrl || null };
    })
  );
  return { preview, pages: pagesWithUrls, signed_url_expires_in: SIGNED_READ_SECONDS };
}

async function createPreview(admin, actorId, payload) {
  const record = {
    ...sanitizePreviewPayload(payload),
    status: 'draft',
    created_by: actorId,
  };
  const { data, error } = await admin
    .from('agenda_previews')
    .insert(record)
    .select(PREVIEW_COLUMNS)
    .single();
  assertResult(error);
  return { preview: data };
}

async function updatePreview(admin, previewId, payload) {
  const id = requireUuid(previewId, 'preview_id');
  const expectedRevision = requireInteger(payload?.expected_revision, 1, Number.MAX_SAFE_INTEGER, 'expected_revision');
  const record = sanitizePreviewPayload(payload, { partial: true });
  const { data, error } = await admin
    .from('agenda_previews')
    .update(record)
    .eq('id', id)
    .eq('status', 'draft')
    .eq('revision', expectedRevision)
    .select(PREVIEW_COLUMNS);
  assertResult(error);

  if (data?.length === 1) return { preview: data[0] };
  const current = await getPreview(admin, id);
  if (current.status !== 'draft') {
    throw new ApiError(409, 'preview_not_draft', 'Solo se puede editar una muestra en borrador.');
  }
  throw new ApiError(409, 'revision_conflict', 'La muestra fue modificada en otra sesión.', {
    current_revision: current.revision,
  });
}

function normalizeInsertPosition(value, pageCount) {
  if (value === undefined || value === null || value === '') return pageCount + 1;
  return requireInteger(value, 1, pageCount + 1, 'position');
}

async function reorder(admin, actorId, previewId, pageIds) {
  if (!Array.isArray(pageIds)) {
    throw new ApiError(400, 'invalid_page_ids', 'page_ids debe ser una lista.');
  }
  const ids = pageIds.map((id) => requireUuid(id, 'page_id'));
  const { data, error } = await admin.rpc('reorder_agenda_preview_pages', {
    p_preview_id: requireUuid(previewId, 'preview_id'),
    p_page_ids: ids,
    p_actor_id: actorId,
  });
  assertResult(error);
  return { result: data?.[0] || null };
}

async function insertAtPosition(admin, actorId, previewId, record, requestedPosition) {
  const pages = await getPages(admin, previewId);
  if (pages.length >= MAX_PAGES) {
    throw new ApiError(422, 'page_limit_exceeded', 'La muestra ya alcanzó el límite de páginas.');
  }
  const position = normalizeInsertPosition(requestedPosition, pages.length);
  const { data, error } = await admin
    .from('agenda_preview_pages')
    .insert({ ...record, preview_id: previewId, position: pages.length + 1 })
    .select(PAGE_COLUMNS)
    .single();
  assertResult(error);

  let warning = null;
  let persistedPage = data;
  if (position !== pages.length + 1) {
    const ids = pages.map((page) => page.id);
    ids.splice(position - 1, 0, data.id);
    try {
      await reorder(admin, actorId, previewId, ids);
      persistedPage = { ...data, position };
    } catch {
      warning = {
        code: 'page_created_reorder_failed',
        message: 'La página fue creada, pero quedó al final porque no pudo reordenarse.',
      };
    }
  }
  return { page: persistedPage, warning };
}

async function addBlankPage(admin, actorId, payload) {
  const preview = await getPreview(admin, payload?.preview_id, { draftOnly: true });
  const inserted = await insertAtPosition(
    admin,
    actorId,
    preview.id,
    { id: randomUUID(), page_type: 'blank' },
    payload?.position
  );
  return {
    page: inserted.page,
    preview: await getPreview(admin, preview.id),
    warning: inserted.warning,
  };
}

async function authorizeUpload(admin, payload) {
  const preview = await getPreview(admin, payload?.preview_id, { draftOnly: true });
  const mode = String(payload?.mode || 'create').trim().toLowerCase();
  if (!['create', 'replace'].includes(mode)) {
    throw new ApiError(400, 'invalid_upload_mode', 'El modo de subida no es válido.');
  }

  let pageId;
  if (mode === 'replace') {
    const page = await getPage(admin, preview.id, payload?.page_id);
    pageId = page.id;
  } else {
    pageId = randomUUID();
    const pages = await getPages(admin, preview.id);
    if (pages.length >= MAX_PAGES) {
      throw new ApiError(422, 'page_limit_exceeded', 'La muestra ya alcanzó el límite de páginas.');
    }
    normalizeInsertPosition(payload?.position, pages.length);
  }

  const objectVersion = randomUUID();
  const path = storagePath(preview.id, pageId, objectVersion);
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  assertResult(error);

  return {
    upload: {
      mode,
      preview_id: preview.id,
      page_id: pageId,
      object_version: objectVersion,
      storage_path: path,
      position: payload?.position ?? null,
      token: data?.token,
      signed_url: data?.signedUrl,
    },
  };
}

async function inspectStoredObject(admin, previewId, pageId, objectVersion) {
  const expectedPath = storagePath(previewId, pageId, objectVersion);
  const prefix = `${previewId}/${pageId}`;
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
    limit: 100,
    search: objectVersion,
  });
  assertResult(error);
  const object = (data || []).find((item) => item.name === objectVersion);
  if (!object) {
    throw new ApiError(422, 'storage_object_missing', 'El archivo subido no existe en Storage.');
  }

  const mimeType = String(object.metadata?.mimetype || '').toLowerCase();
  const size = Number(object.metadata?.size);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ApiError(422, 'stored_mime_invalid', 'El archivo almacenado tiene un MIME no permitido.');
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE) {
    throw new ApiError(422, 'stored_size_invalid', 'El archivo almacenado supera el tamaño permitido.');
  }
  return { path: expectedPath, mime_type: mimeType, file_size_bytes: size };
}

async function removeObjectWithWarning(admin, path) {
  if (!path) return null;
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (!error) return null;
  console.error('No se pudo limpiar un objeto huérfano de agenda-previews:', {
    path,
    code: error.code,
  });
  return { code: 'orphaned_storage_object', storage_path: path };
}

async function persistNewUploadedPage(insertPage, cleanupObject) {
  try {
    return await insertPage();
  } catch (originalError) {
    const cleanupWarning = await cleanupObject();
    if (!cleanupWarning) throw originalError;

    const mappedError = mapSupabaseError(originalError);
    mappedError.details = {
      ...(mappedError.details || {}),
      warning: cleanupWarning,
    };
    throw mappedError;
  }
}

async function confirmUpload(admin, actorId, payload) {
  const preview = await getPreview(admin, payload?.preview_id, { draftOnly: true });
  const pageId = requireUuid(payload?.page_id, 'page_id');
  const objectVersion = requireUuid(payload?.object_version, 'object_version');
  const expectedPath = storagePath(preview.id, pageId, objectVersion);
  if (String(payload?.storage_path || '') !== expectedPath) {
    throw new ApiError(422, 'storage_path_mismatch', 'La ruta de Storage no coincide con la autorización.');
  }

  const browserMetadata = sanitizeImageMetadata(payload);
  const stored = await inspectStoredObject(admin, preview.id, pageId, objectVersion);
  if (
    browserMetadata.mime_type !== stored.mime_type ||
    browserMetadata.file_size_bytes !== stored.file_size_bytes
  ) {
    throw new ApiError(422, 'storage_metadata_mismatch', 'Los metadatos no coinciden con el archivo almacenado.');
  }

  const record = {
    page_type: 'image',
    storage_path: stored.path,
    object_version: objectVersion,
    ...browserMetadata,
  };
  const mode = String(payload?.mode || 'create').trim().toLowerCase();
  let page;
  let warning = null;

  if (mode === 'replace') {
    const current = await getPage(admin, preview.id, pageId);
    const oldPath = current.storage_path;
    const { data, error } = await admin
      .from('agenda_preview_pages')
      .update(record)
      .eq('preview_id', preview.id)
      .eq('id', pageId)
      .select(PAGE_COLUMNS)
      .single();
    assertResult(error);
    page = data;
    if (oldPath && oldPath !== stored.path) warning = await removeObjectWithWarning(admin, oldPath);
  } else if (mode === 'create') {
    const inserted = await persistNewUploadedPage(
      () => insertAtPosition(
        admin,
        actorId,
        preview.id,
        { id: pageId, ...record },
        payload?.position
      ),
      () => removeObjectWithWarning(admin, stored.path)
    );
    page = inserted.page;
    warning = inserted.warning;
  } else {
    throw new ApiError(400, 'invalid_upload_mode', 'El modo de subida no es válido.');
  }

  return { page, preview: await getPreview(admin, preview.id), warning };
}

async function deletePage(admin, actorId, payload) {
  const preview = await getPreview(admin, payload?.preview_id, { draftOnly: true });
  const target = await getPage(admin, preview.id, payload?.page_id);
  const pages = await getPages(admin, preview.id);

  if (target.position !== pages.length) {
    const remainingIds = pages.filter((page) => page.id !== target.id).map((page) => page.id);
    await reorder(admin, actorId, preview.id, [...remainingIds, target.id]);
  }

  const { error } = await admin
    .from('agenda_preview_pages')
    .delete()
    .eq('preview_id', preview.id)
    .eq('id', target.id);
  assertResult(error);
  const warning = target.page_type === 'image'
    ? await removeObjectWithWarning(admin, target.storage_path)
    : null;
  return { deleted: true, page_id: target.id, preview: await getPreview(admin, preview.id), warning };
}

async function setStatus(admin, actorId, payload) {
  const { data, error } = await admin.rpc('set_agenda_preview_status', {
    p_preview_id: requireUuid(payload?.preview_id, 'preview_id'),
    p_status: String(payload?.status || '').trim().toLowerCase(),
    p_expected_revision: requireInteger(
      payload?.expected_revision,
      1,
      Number.MAX_SAFE_INTEGER,
      'expected_revision'
    ),
    p_actor_id: actorId,
  });
  assertResult(error);
  return { result: data?.[0] || null };
}

async function dispatch(req, admin, user) {
  const action = String(req.body?.action || req.query?.action || '').trim().toLowerCase();
  if (req.method === 'GET' && !req.query?.id) return listPreviews(admin);
  if (req.method === 'GET' && req.query?.id) return loadPreview(admin, req.query.id);
  if (req.method === 'POST' && action === 'create') return createPreview(admin, user.id, req.body);
  if (req.method === 'PATCH' && action === 'update') {
    return updatePreview(admin, req.body?.preview_id, req.body);
  }
  if (req.method === 'POST' && action === 'add-blank') return addBlankPage(admin, user.id, req.body);
  if (req.method === 'POST' && action === 'reorder') {
    return reorder(admin, user.id, req.body?.preview_id, req.body?.page_ids);
  }
  if (req.method === 'POST' && action === 'set-status') return setStatus(admin, user.id, req.body);
  if (req.method === 'POST' && action === 'authorize-upload') return authorizeUpload(admin, req.body);
  if (req.method === 'POST' && action === 'confirm-upload') return confirmUpload(admin, user.id, req.body);
  if (req.method === 'DELETE' && action === 'delete-page') return deletePage(admin, user.id, req.body);
  throw new ApiError(404, 'operation_not_found', 'La operación solicitada no existe.');
}

module.exports = async function handler(req, res) {
  try {
    const { auth, admin } = createClients();
    const user = await authenticate(req, auth);
    const response = await dispatch(req, admin, user);
    return json(res, 200, { ok: true, ...response });
  } catch (rawError) {
    const error = mapSupabaseError(rawError);
    if (error.status >= 500) {
      console.error('Agenda previews admin error:', {
        name: rawError?.name,
        code: rawError?.code,
        message: rawError?.message,
      });
    }
    return json(res, error.status, {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

module.exports._test = {
  authenticate,
  dispatch,
  inspectStoredObject,
  insertAtPosition,
  normalizeInsertPosition,
  persistNewUploadedPage,
};
