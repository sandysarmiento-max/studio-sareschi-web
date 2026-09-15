const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadAdminHelpers() {
  const filename = path.join(ROOT, 'lib/paid-products-admin-handler.js');
  const source = fs.readFileSync(filename, 'utf8') +
    '\nmodule.exports.__test = { sanitizeFlipbookUrl, isMissingFlipbookColumn };\n';
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    process,
    Buffer,
    URL,
    console,
  };
  vm.runInNewContext(source, sandbox, { filename });
  return sandbox.module.exports.__test;
}

test('admin valida enlaces internos /hojear y HTTPS externos', () => {
  const { sanitizeFlipbookUrl } = loadAdminHelpers();
  assert.equal(sanitizeFlipbookUrl(''), '');
  assert.equal(
    sanitizeFlipbookUrl('/hojear/?agenda=agenda-cozy-reading-2027'),
    '/hojear/?agenda=agenda-cozy-reading-2027'
  );
  assert.equal(sanitizeFlipbookUrl('https://example.com/demo'), 'https://example.com/demo');

  for (const value of [
    'http://example.com/demo',
    '//example.com/demo',
    'javascript:alert(1)',
    'data:text/html,hello',
    '/otra-ruta/',
    '/hojear/?agenda=Slug Invalido',
  ]) {
    assert.throws(() => sanitizeFlipbookUrl(value));
  }
});

test('backend distingue la migración flipbook y conserva fallback de lectura', () => {
  const { isMissingFlipbookColumn } = loadAdminHelpers();
  assert.equal(
    isMissingFlipbookColumn(new Error('column paid_products.flipbook_url does not exist')),
    true
  );
  assert.equal(isMissingFlipbookColumn(new Error('price_yape_pe does not exist')), false);

  const admin = read('lib/paid-products-admin-handler.js');
  assert.match(admin, /PRODUCT_COLUMNS_WITHOUT_FLIPBOOK/);
  assert.match(admin, /flipbookMigrationPending: true/);
  assert.match(admin, /missing_flipbook_column/);

  const storefront = read('api/pdf-access.js');
  assert.match(storefront, /STOREFRONT_COLUMNS_WITHOUT_FLIPBOOK/);
  assert.match(storefront, /flipbook_url: ''/);
});

test('panel de productos incluye el campo Enlace para hojear / Flipbook', () => {
  const adminUi = read('public/admin/paid-products/index.html');
  assert.match(adminUi, /Enlace para hojear \/ Flipbook/);
  assert.match(adminUi, /\/hojear\/\?agenda=agenda-cozy-reading-2027/);
  assert.match(adminUi, /missing_flipbook_column/);
});

test('catálogo muestra Hojear muestra solo a través del enlace validado', () => {
  const catalog = read('public/pdfs/index.html');
  assert.match(catalog, /function normalizeFlipbookUrl/);
  assert.match(catalog, /function getFlipbookButton/);
  assert.match(catalog, /if \(!product\.flipbook_url\) return ''/);
  assert.match(catalog, /Hojear muestra/);
  assert.match(catalog, /data-action="open-flipbook"/);
});

test('página individual usa fallback de columna y botón condicional', () => {
  const productPage = read('api/plantilla.js');
  assert.match(productPage, /columnsWithoutFlipbook/);
  assert.match(productPage, /isMissingFlipbookColumn/);
  assert.match(productPage, /const flipbookUrl = validFlipbookUrl/);
  assert.match(productPage, /Hojear muestra/);
});
