'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  ApiError,
  isAuthorizedAdmin,
  parseAdminEmails,
  sanitizeImageMetadata,
  sanitizePreviewPayload,
  storagePath,
} = require('../lib/agenda-previews-admin-core');
const {
  addBlankPage,
  insertAtPosition,
  persistNewUploadedPage,
} = require('../lib/agenda-previews-admin-handler')._test;

function blankAdmin({ previewId, existingPage = null }) {
  const preview = { id: previewId, status: 'draft', revision: 1 };
  return {
    from(table) {
      if (table === 'agenda_previews') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() { return { maybeSingle: async () => ({ data: preview, error: null }) }; },
                  maybeSingle: async () => ({ data: preview, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'agenda_preview_pages') {
        return {
          select() {
            return {
              eq(field) {
                if (field === 'id') return { maybeSingle: async () => ({ data: existingPage, error: null }) };
                return { order: async () => ({ data: [], error: null }) };
              },
            };
          },
          insert(record) {
            return {
              select() {
                return { single: async () => ({ data: { ...record, preview_id: previewId }, error: null }) };
              },
            };
          },
        };
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
}
const {
  createAdminDispatcher,
  getHandlerName,
} = require('../api/admin/[handler]')._test;

test('ADMIN_EMAILS se normaliza y la comparación es exacta', () => {
  const allowlist = parseAdminEmails(' Admin@Example.com, otra@example.com ');
  assert.equal(isAuthorizedAdmin({ email: 'admin@example.com', app_metadata: {} }, allowlist), true);
  assert.equal(isAuthorizedAdmin({ email: 'admin@example.com.pe', app_metadata: {} }, allowlist), false);
});

test('ADMIN_EMAILS vacío no habilita a cualquier usuario autenticado', () => {
  assert.equal(
    isAuthorizedAdmin({ email: 'persona@example.com', app_metadata: {}, user_metadata: { role: 'admin' } }, new Set()),
    false
  );
});

test('app_metadata admin autoriza y user_metadata admin no autoriza', () => {
  assert.equal(isAuthorizedAdmin({ app_metadata: { role: 'admin' } }, new Set()), true);
  assert.equal(isAuthorizedAdmin({ user_metadata: { role: 'admin' } }, new Set()), false);
});

test('storage_path contiene exactamente tres UUID', () => {
  const preview = '550e8400-e29b-41d4-a716-446655440000';
  const page = '8ad210ae-581f-4b31-a354-8826ec3a5517';
  const version = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  assert.equal(storagePath(preview, page, version), `${preview}/${page}/${version}`);
  assert.throws(() => storagePath(preview, page, 'no-es-uuid'), ApiError);
});

test('la configuración nunca acepta status ni created_by desde el cliente', () => {
  const clean = sanitizePreviewPayload({
    slug: 'cozy-reading',
    title: 'Agenda Cozy Reading 2027',
    format: 'A5',
    width_mm: 148,
    height_mm: 210,
    orientation: 'portrait',
    total_product_pages: 180,
    status: 'published',
    created_by: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(Object.hasOwn(clean, 'status'), false);
  assert.equal(Object.hasOwn(clean, 'created_by'), false);
});

test('metadatos de imagen respetan MIME y máximo de 15 MB', () => {
  const clean = sanitizeImageMetadata({
    mime_type: 'image/png',
    file_size_bytes: 1024,
    width_px: 1409,
    height_px: 2000,
    sha256: 'a'.repeat(64),
    original_filename: '01.png',
  });
  assert.equal(clean.mime_type, 'image/png');
  assert.throws(
    () => sanitizeImageMetadata({ ...clean, file_size_bytes: 15 * 1024 * 1024 + 1 }),
    ApiError
  );
});

test('el endpoint no contiene fallback abierto ni autorización por user_metadata', () => {
  const endpoint = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'agenda-previews-admin-handler.js'),
    'utf8'
  );
  const core = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'agenda-previews-admin-core.js'),
    'utf8'
  );
  assert.equal(endpoint.includes('SUPABASE_SERVICE_ROLE_KEY'), true);
  assert.equal(endpoint.includes('user_metadata'), false);
  assert.equal(core.includes("user?.app_metadata?.role === 'admin'"), true);
  assert.equal(core.includes('user?.user_metadata?.role'), false);
  assert.equal(core.includes('adminEmails.size > 0'), true);
});

test('INSERT correcto y reorder fallido devuelve la página persistida con warning', async () => {
  const previewId = '550e8400-e29b-41d4-a716-446655440000';
  const existingPageId = '8ad210ae-581f-4b31-a354-8826ec3a5517';
  const newPageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  const pages = [{ id: existingPageId, position: 1 }];
  const insertedPage = {
    id: newPageId,
    preview_id: previewId,
    page_type: 'blank',
    position: 2,
  };
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { order: async () => ({ data: pages, error: null }) };
            },
          };
        },
        insert() {
          return {
            select() {
              return { single: async () => ({ data: insertedPage, error: null }) };
            },
          };
        },
      };
    },
    async rpc() {
      return { data: null, error: new Error('reorder fallido') };
    },
  };

  const result = await insertAtPosition(
    admin,
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    previewId,
    { id: newPageId, page_type: 'blank' },
    1
  );

  assert.equal(result.page.id, newPageId);
  assert.equal(result.page.position, 2);
  assert.equal(result.warning.code, 'page_created_reorder_failed');
});

test('confirm-upload create intenta limpiar el objeto cuando falla el INSERT', async () => {
  const originalError = new Error('insert fallido');
  let cleanupCalls = 0;

  await assert.rejects(
    persistNewUploadedPage(
      async () => { throw originalError; },
      async () => {
        cleanupCalls += 1;
        return null;
      }
    ),
    (error) => error === originalError
  );

  assert.equal(cleanupCalls, 1);
});

test('nunca limpia el objeto cuando la página ya quedó persistida', async () => {
  let cleanupCalls = 0;
  const persisted = {
    page: { id: '3fb761e9-8c77-4933-a172-0bfa12d05484', position: 2 },
    warning: { code: 'page_created_reorder_failed' },
  };

  const result = await persistNewUploadedPage(
    async () => persisted,
    async () => {
      cleanupCalls += 1;
      return null;
    }
  );

  assert.equal(result, persisted);
  assert.equal(cleanupCalls, 0);
});

test('add-blank repetido con el mismo UUID devuelve una sola página idempotente', async () => {
  const previewId = '550e8400-e29b-41d4-a716-446655440000';
  const pageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  const existing = { id: pageId, preview_id: previewId, page_type: 'blank', position: 1 };
  const result = await addBlankPage(blankAdmin({ previewId, existingPage: existing }), 'actor', {
    preview_id: previewId,
    page_id: pageId,
    position: 1,
  });
  assert.equal(result.page, existing);
});

test('add-blank rechaza el mismo UUID usado en otra preview o tipo', async () => {
  const previewId = '550e8400-e29b-41d4-a716-446655440000';
  const pageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  for (const existing of [
    { id: pageId, preview_id: '8ad210ae-581f-4b31-a354-8826ec3a5517', page_type: 'blank' },
    { id: pageId, preview_id: previewId, page_type: 'image' },
  ]) {
    await assert.rejects(
      addBlankPage(blankAdmin({ previewId, existingPage: existing }), 'actor', {
        preview_id: previewId,
        page_id: pageId,
      }),
      (error) => error instanceof ApiError && error.code === 'page_id_conflict'
    );
  }
});

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
      return body;
    },
  };
}

test('dispatcher dirige paid-products al handler de productos', async () => {
  const calls = [];
  const dispatcher = createAdminDispatcher({
    'paid-products': async () => calls.push('paid-products'),
    'agenda-previews': async () => calls.push('agenda-previews'),
  });

  await dispatcher({ query: { handler: 'paid-products' }, body: {} }, responseRecorder());
  assert.deepEqual(calls, ['paid-products']);
});

test('dispatcher dirige agenda-previews a su handler aislado', async () => {
  const calls = [];
  const dispatcher = createAdminDispatcher({
    'paid-products': async () => calls.push('paid-products'),
    'agenda-previews': async () => calls.push('agenda-previews'),
  });

  await dispatcher({ query: { handler: 'agenda-previews' }, body: {} }, responseRecorder());
  assert.deepEqual(calls, ['agenda-previews']);
});

test('dispatcher rechaza de forma segura un handler desconocido', async () => {
  const res = responseRecorder();
  const dispatcher = createAdminDispatcher({});

  await dispatcher({ query: { handler: 'desconocido' }, body: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, 'Ruta administrativa no encontrada.');
});

test('el payload no puede seleccionar ni cambiar el handler', async () => {
  const calls = [];
  const dispatcher = createAdminDispatcher({
    'paid-products': async () => calls.push('paid-products'),
    'agenda-previews': async () => calls.push('agenda-previews'),
  });
  const req = {
    query: { handler: 'agenda-previews' },
    body: { handler: 'paid-products', route: 'paid-products', action: 'paid-products' },
  };

  assert.equal(getHandlerName(req), 'agenda-previews');
  await dispatcher(req, responseRecorder());
  assert.deepEqual(calls, ['agenda-previews']);
});
