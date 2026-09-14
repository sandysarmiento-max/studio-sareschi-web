'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const handlerPath = require.resolve('../api/pdf-access');
const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(value = '') {
      this.body = String(value);
    },
  };
}

function loadHandler(fetchImpl) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  global.fetch = fetchImpl;
  delete require.cache[handlerPath];
  return require('../api/pdf-access');
}

function restoreEnvironment() {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  delete require.cache[handlerPath];
}

test.afterEach(restoreEnvironment);

test('slug inválido no consulta Supabase y devuelve muestra no disponible', async () => {
  let calls = 0;
  const handler = loadHandler(async () => {
    calls += 1;
    return response(500, {});
  });
  const res = createRes();

  await handler(
    { method: 'GET', query: { action: 'agenda-preview', agenda: '../privado' } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(res.body), { error: 'Muestra no disponible.' });
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('un draft es indistinguible de una muestra inexistente', async () => {
  const urls = [];
  const handler = loadHandler(async (url) => {
    urls.push(String(url));
    return response(200, []);
  });
  const res = createRes();

  await handler(
    { method: 'GET', query: { action: 'agenda-preview', agenda: 'cozy-reading' } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /agenda_previews/);
  assert.match(urls[0], /status=eq\.published/);
  assert.doesNotMatch(res.body, /draft|preview_id|created_by/i);
});

test('una muestra published devuelve solo datos públicos y URLs firmadas', async () => {
  const urls = [];
  const requests = [];
  const previewId = '550e8400-e29b-41d4-a716-446655440000';
  const pageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  const version = '8ad210ae-581f-4b31-a354-8826ec3a5517';

  const handler = loadHandler(async (url, options = {}) => {
    const text = String(url);
    urls.push(text);
    requests.push(options);
    if (text.includes('/rest/v1/agenda_previews')) {
      return response(200, [{
        id: previewId,
        title: 'Agenda Cozy Reading 2027',
        slug: 'cozy-reading',
        format: 'A5',
        width_mm: 148,
        height_mm: 210,
        orientation: 'portrait',
        total_product_pages: 180,
        buy_button_text: 'Comprar esta agenda',
        buy_url: 'https://www.studio-sareschi.com/pdfs/',
        created_by: 'no-debe-salir',
      }]);
    }
    if (text.includes('/rest/v1/agenda_preview_pages')) {
      return response(200, [
        {
          position: 1,
          page_type: 'image',
          storage_path: `${previewId}/${pageId}/${version}`,
          object_version: version,
        },
        { position: 2, page_type: 'blank', storage_path: null },
      ]);
    }
    if (text.includes('/storage/v1/object/sign/agenda-previews/')) {
      return response(200, { signedURL: '/object/sign/agenda-previews/file?token=abc' });
    }
    return response(500, { error: 'unexpected' });
  });

  const res = createRes();
  await handler(
    { method: 'GET', query: { action: 'agenda-preview', agenda: 'cozy-reading' } },
    res
  );

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.deepEqual(Object.keys(payload.preview).sort(), [
    'buy_button_text',
    'buy_url',
    'format',
    'height_mm',
    'orientation',
    'slug',
    'title',
    'total_product_pages',
    'width_mm',
  ]);
  assert.equal(payload.pages.length, 2);
  assert.equal(payload.pages[0].page_type, 'image');
  assert.equal(
    payload.pages[0].signed_url,
    'https://example.supabase.co/storage/v1/object/sign/agenda-previews/file?token=abc'
  );
  assert.equal(payload.pages[1].page_type, 'blank');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.pages[1], 'signed_url'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.pages[0], 'storage_path'), false);
  assert.match(urls.find((url) => url.includes('agenda_preview_pages')), /order=position\.asc/);
  const signIndex = urls.findIndex((url) => url.includes('/storage/v1/object/sign/agenda-previews/'));
  assert(signIndex >= 0);
  assert.deepEqual(JSON.parse(requests[signIndex].body), { expiresIn: 900 });
  assert.doesNotMatch(res.body, /created_by|object_version|storage_path|service-role-test/);
});

test('el endpoint público no acepta UUID administrativo como alternativa al slug', async () => {
  let calls = 0;
  const handler = loadHandler(async () => {
    calls += 1;
    return response(200, []);
  });
  const res = createRes();

  await handler(
    {
      method: 'GET',
      query: {
        action: 'agenda-preview',
        id: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(calls, 0);
});

test('/hojear/ reutiliza los assets aprobados sin duplicar el núcleo del visor', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'hojear', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public', 'hojear', 'loader.js'), 'utf8');

  assert.match(html, /\/admin\/agenda-previews\/styles\.css/);
  assert.match(html, /\/admin\/agenda-previews\/vendor\/page-flip\.browser\.js/);
  assert.match(loader, /\/admin\/agenda-previews\/app\.js/);
  assert.match(loader, /window\.__AGENDA_PREVIEW_CONFIG__/);
  assert.match(loader, /page_type === 'blank'/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(`${html}\n${loader}`, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});
