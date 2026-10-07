'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ApiError, isAuthorizedAdmin, parseAdminEmails } = require('../lib/agenda-previews-admin-core');
const {
  buildStoragePath,
  createSlug,
  sanitizeFreebiePayload,
  sanitizeUploadRequest,
} = require('../lib/freebies-admin-core');
const { createAdminDispatcher } = require('../api/admin/[handler]')._test;
const {
  authorizeUpload,
  confirmUpload,
} = require('../lib/freebies-admin-handler')._test;

test('el administrador reutiliza la autorización estricta de agenda-previews', () => {
  const allowlist = parseAdminEmails('admin@example.com');
  assert.equal(isAuthorizedAdmin({ app_metadata: { role: 'admin' } }, new Set()), true);
  assert.equal(isAuthorizedAdmin({ email: 'admin@example.com' }, allowlist), true);
  assert.equal(isAuthorizedAdmin({ email: 'otra@example.com' }, new Set()), false);
  assert.equal(isAuthorizedAdmin({ user_metadata: { role: 'admin' } }, new Set()), false);
});

test('los recursos nuevos siempre se crean inactivos', () => {
  const result = sanitizeFreebiePayload({
    title: 'Recurso de prueba', description: 'Descripción', category: 'Notas',
    sort_order: 50, is_active: true,
  });
  assert.equal(result.is_active, false);
  assert.equal(createSlug(result.title), 'recurso-de-prueba');
});

test('la edición solo admite los campos previstos', () => {
  const result = sanitizeFreebiePayload({
    title: 'Título editado', description: 'Texto', category: 'Organización',
    sort_order: 2, is_active: true, storage_path: 'no-permitido.pdf', thumbnail: 'no-permitido.jpg',
  }, { partial: true });
  assert.deepEqual(Object.keys(result).sort(), ['category', 'description', 'is_active', 'sort_order', 'title']);
});

test('las rutas nuevas separan PDFs y miniaturas por recurso y versión', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const version = '8ad210ae-581f-4b31-a354-8826ec3a5517';
  assert.equal(buildStoragePath(id, 'pdf', 'application/pdf', version), `freebies/${id}/${version}.pdf`);
  assert.equal(buildStoragePath(id, 'thumbnail', 'image/webp', version), `previews/${id}/${version}.webp`);
});

test('las subidas validan MIME y límites antes de firmar', () => {
  const resource_id = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(sanitizeUploadRequest({ resource_id, kind: 'pdf', mime_type: 'application/pdf', file_size: 100 }).kind, 'pdf');
  assert.equal(sanitizeUploadRequest({ resource_id, kind: 'thumbnail', mime_type: 'image/png', file_size: 100 }).kind, 'thumbnail');
  assert.throws(() => sanitizeUploadRequest({ resource_id, kind: 'pdf', mime_type: 'image/png', file_size: 100 }), ApiError);
  assert.throws(() => sanitizeUploadRequest({ resource_id, kind: 'thumbnail', mime_type: 'image/gif', file_size: 100 }), ApiError);
});

function uploadAdmin(resource, storedObject) {
  let updatedRecord = null;
  return {
    get updatedRecord() { return updatedRecord; },
    from(table) {
      assert.equal(table, 'free_products');
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: resource, error: null }) }; } };
        },
        update(record) {
          updatedRecord = record;
          return { eq() { return { select() { return { single: async () => ({ data: { ...resource, ...record }, error: null }) }; } }; } };
        },
      };
    },
    storage: {
      from() {
        return {
          createSignedUploadUrl: async (storagePath) => ({ data: { token: 'token', signedUrl: `https://upload.test/${storagePath}` }, error: null }),
          list: async () => ({ data: [storedObject], error: null }),
        };
      },
    },
  };
}

test('autoriza PDF y confirma su reemplazo en storage_path', async () => {
  const resource = { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'recurso-prueba' };
  const admin = uploadAdmin(resource, { name: '', metadata: {} });
  const authorization = await authorizeUpload(admin, 'freebies-private', {
    resource_id: resource.id, kind: 'pdf', mime_type: 'application/pdf', file_size: 321,
  });
  const fileName = authorization.upload.storage_path.split('/').at(-1);
  admin.storage.from = () => ({
    list: async () => ({ data: [{ name: fileName, metadata: { mimetype: 'application/pdf', size: 321 } }], error: null }),
  });
  await confirmUpload(admin, 'freebies-private', {
    resource_id: resource.id, kind: 'pdf', mime_type: 'application/pdf', file_size: 321,
    storage_path: authorization.upload.storage_path,
  });
  assert.equal(admin.updatedRecord.storage_path, authorization.upload.storage_path);
});

test('autoriza miniatura y confirma su reemplazo en thumbnail', async () => {
  const resource = { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'recurso-prueba' };
  const admin = uploadAdmin(resource, { name: '', metadata: {} });
  const authorization = await authorizeUpload(admin, 'freebies-private', {
    resource_id: resource.id, kind: 'thumbnail', mime_type: 'image/png', file_size: 456,
  });
  const fileName = authorization.upload.storage_path.split('/').at(-1);
  admin.storage.from = () => ({
    list: async () => ({ data: [{ name: fileName, metadata: { mimetype: 'image/png', size: 456 } }], error: null }),
  });
  await confirmUpload(admin, 'freebies-private', {
    resource_id: resource.id, kind: 'thumbnail', mime_type: 'image/png', file_size: 456,
    storage_path: authorization.upload.storage_path,
  });
  assert.equal(admin.updatedRecord.thumbnail, authorization.upload.storage_path);
});

test('el dispatcher administrativo reconoce freebies', async () => {
  let called = false;
  const dispatcher = createAdminDispatcher({ freebies: async (_req, res) => { called = true; res.statusCode = 204; res.end(); } });
  const req = { query: { handler: 'freebies' } };
  const res = { statusCode: 0, end() {} };
  await dispatcher(req, res);
  assert.equal(called, true);
  assert.equal(res.statusCode, 204);
});

test('la web pública conserva fallback antiguo y admite thumbnail de Storage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'freebies.js'), 'utf8');
  assert.match(source, /row\.thumbnail/);
  assert.match(source, /createSignedUrl\(thumbnail\)/);
  assert.match(source, /buildPreviewImageUrlFromCode/);
  const home = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const store = fs.readFileSync(path.join(__dirname, '..', 'public', 'pdfs', 'index.html'), 'utf8');
  assert.match(home, /studio_sareschi_free_zone_last_download/);
  assert.match(store, /studio_sareschi_free_zone_last_download/);
});

test('el panel exige confirmación textual para eliminar y no borra objetos de Storage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'freebies-admin-handler.js'), 'utf8');
  assert.match(source, /confirmation !== resource\.slug/);
  assert.match(source, /storage_files_preserved: true/);
  assert.doesNotMatch(source, /storage\.from\(bucket\)\.remove/);
});
