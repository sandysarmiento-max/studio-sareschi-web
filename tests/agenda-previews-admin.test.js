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
} = require('../api/_agenda-previews-admin-core');
const {
  insertAtPosition,
  persistNewUploadedPage,
} = require('../api/agenda-previews-admin')._test;

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
    path.join(__dirname, '..', 'api', 'agenda-previews-admin.js'),
    'utf8'
  );
  const core = fs.readFileSync(
    path.join(__dirname, '..', 'api', '_agenda-previews-admin-core.js'),
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
