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
  authorizeCreate,
  authorizeUpload,
  confirmCreate,
  confirmUpload,
  legacyThumbnailUrl,
  signedThumbnail,
} = require('../lib/freebies-admin-handler')._test;

test('el administrador reutiliza la autorización estricta de agenda-previews', () => {
  const allowlist = parseAdminEmails('admin@example.com');
  assert.equal(isAuthorizedAdmin({ app_metadata: { role: 'admin' } }, new Set()), true);
  assert.equal(isAuthorizedAdmin({ email: 'admin@example.com' }, allowlist), true);
  assert.equal(isAuthorizedAdmin({ email: 'otra@example.com' }, new Set()), false);
  assert.equal(isAuthorizedAdmin({ user_metadata: { role: 'admin' } }, new Set()), false);
});

test('el acceso al administrador enlaza el flujo existente de recuperación', () => {
  const adminLogin = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'freebies', 'index.html'),
    'utf8'
  );
  assert.match(adminLogin, /href="\/acceso\/recuperar\/"[^>]*>¿Olvidaste tu contraseña\?<\/a>/);
  assert.doesNotMatch(adminLogin, /resetPasswordForEmail/);
});

test('el administrador no expone el diagnóstico temporal de autorización', () => {
  const handler = fs.readFileSync(path.join(__dirname, '..', 'lib', 'freebies-admin-handler.js'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'freebies', 'admin.js'), 'utf8');
  assert.doesNotMatch(handler, /authorization_diagnostic|buildAuthorizationDiagnostic|DIAGNOSTIC_ADMIN_EMAIL/);
  assert.doesNotMatch(client, /authorizationDiagnostic|authorization_diagnostic/);
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

function creationAdmin({ insertError = null } = {}) {
  let insertedRecord = null;
  let storedObject = null;
  let removeCalled = false;
  return {
    get insertedRecord() { return insertedRecord; },
    get insertCalled() { return Boolean(insertedRecord); },
    get removeCalled() { return removeCalled; },
    setStoredObject(value) { storedObject = value; },
    from(table) {
      assert.equal(table, 'free_products');
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } };
        },
        insert(record) {
          insertedRecord = record;
          return {
            select() {
              return { single: async () => ({ data: insertError ? null : record, error: insertError }) };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          createSignedUploadUrl: async (storagePath) => ({
            data: { token: 'token', signedUrl: `https://upload.test/${storagePath}` }, error: null,
          }),
          list: async () => ({ data: storedObject ? [storedObject] : [], error: null }),
          remove: async () => { removeCalled = true; return { error: null }; },
        };
      },
    },
  };
}

const newResourcePayload = {
  title: 'PDF de prueba', description: 'Descripción', category: 'Organización',
  sort_order: 19, is_active: true, mime_type: 'application/pdf', file_size: 321,
};

test('crea correctamente un recurso inactivo después de validar el PDF', async () => {
  const admin = creationAdmin();
  const authorization = await authorizeCreate(admin, 'freebies-private', newResourcePayload);
  const upload = authorization.upload;
  admin.setStoredObject({
    name: upload.storage_path.split('/').at(-1),
    metadata: { mimetype: 'application/pdf', size: 321 },
  });
  const result = await confirmCreate(admin, 'freebies-private', {
    ...newResourcePayload,
    resource_id: upload.resource_id,
    storage_path: upload.storage_path,
  });
  assert.equal(result.resource.id, upload.resource_id);
  assert.equal(result.resource.storage_path, upload.storage_path);
  assert.equal(result.resource.is_active, false);
  assert.equal(admin.insertedRecord.legacy_public_url, undefined);
});

test('rechaza el alta si no se proporciona un PDF válido', async () => {
  const admin = creationAdmin();
  await assert.rejects(
    authorizeCreate(admin, 'freebies-private', { ...newResourcePayload, mime_type: '', file_size: 0 }),
    (error) => error instanceof ApiError
  );
  assert.equal(admin.insertCalled, false);
});

test('un fallo o ausencia de subida no ejecuta ningún insert', async () => {
  const admin = creationAdmin();
  await authorizeCreate(admin, 'freebies-private', newResourcePayload);
  assert.equal(admin.insertCalled, false);
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'freebies', 'admin.js'), 'utf8');
  assert.ok(source.indexOf('.uploadToSignedUrl(') < source.indexOf("action: 'confirm-create'"));
  assert.match(source, /No se pudo subir el PDF\. No se creó ningún recurso\./);
});

test('un fallo de insert identifica el objeto huérfano y no lo borra', async () => {
  const admin = creationAdmin({ insertError: { code: '23505', message: 'conflict' } });
  const { upload } = await authorizeCreate(admin, 'freebies-private', newResourcePayload);
  admin.setStoredObject({
    name: upload.storage_path.split('/').at(-1),
    metadata: { mimetype: 'application/pdf', size: 321 },
  });
  await assert.rejects(
    confirmCreate(admin, 'freebies-private', {
      ...newResourcePayload, resource_id: upload.resource_id, storage_path: upload.storage_path,
    }),
    (error) => {
      assert.equal(error.code, 'resource_insert_failed');
      assert.equal(error.details.orphaned_storage_object.storage_path, upload.storage_path);
      return true;
    }
  );
  assert.equal(admin.removeCalled, false);
});

test('el contador excluye el formulario nuevo sin persistir', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'freebies', 'admin.js'), 'utf8');
  assert.match(source, /resources\.filter\(\(resource\) => Boolean\(resource\.id\)\)\.length/);
  assert.doesNotMatch(source, /count\.textContent = `\$\{resources\.length\}/);
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

test('el listado administrativo usa el fallback de miniatura para un recurso legacy', async () => {
  const previewUrl = await signedThumbnail({}, 'freebies-private', {
    thumbnail: null,
    storage_path: 'freebies/fb_001.pdf',
  });
  assert.equal(previewUrl, '/freebies/previews/fb_001_preview.jpg');
});

test('el listado administrativo firma una miniatura almacenada en Storage', async () => {
  let signedPath = null;
  const admin = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'freebies-private');
        return {
          async createSignedUrl(storagePath) {
            signedPath = storagePath;
            return { data: { signedUrl: 'https://storage.test/signed-preview' }, error: null };
          },
        };
      },
    },
  };
  const previewUrl = await signedThumbnail(admin, 'freebies-private', {
    thumbnail: 'previews/resource/version.webp',
    storage_path: 'freebies/fb_001.pdf',
  });
  assert.equal(signedPath, 'previews/resource/version.webp');
  assert.equal(previewUrl, 'https://storage.test/signed-preview');
});

test('el listado administrativo devuelve null sin thumbnail ni código legacy', async () => {
  const previewUrl = await signedThumbnail({}, 'freebies-private', {
    thumbnail: null,
    storage_path: 'freebies/550e8400-e29b-41d4-a716-446655440000/version.pdf',
  });
  assert.equal(previewUrl, null);
});

test('el fallback rechaza rutas fuera del rango legacy exacto fb_001 a fb_018', () => {
  const invalidPaths = [
    'freebies/fb_000.pdf',
    'freebies/fb_019.pdf',
    'freebies/fb_001_v2.pdf',
    'freebies/FB_001.pdf',
    '/freebies/fb_001.pdf',
    'freebies/archive/fb_001.pdf',
  ];
  for (const storagePath of invalidPaths) {
    assert.equal(legacyThumbnailUrl(storagePath), null, storagePath);
  }
  assert.equal(legacyThumbnailUrl('freebies/fb_018.pdf'), '/freebies/previews/fb_018_preview.jpg');
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
