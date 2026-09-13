'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const managerRoot = path.join(root, 'public', 'admin', 'agenda-previews');
const read = (file) => fs.readFileSync(path.join(managerRoot, file), 'utf8');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(managerRoot, file))).digest('hex');

test('el gestor conserva IndexedDB y la preview aprobada', () => {
  const html = read('index.html');
  const manager = read('admin.js');
  assert.match(manager, /indexedDB\.open\(DB_NAME/);
  assert.doesNotMatch(manager, /localStorage/);
  assert.match(manager, /elements\.frame\.srcdoc = viewerDocument/);
  assert.match(html, /id="previewButton"/);
  assert.match(html, /id="syncDraftButton"/);
});

test('login reutiliza auth-config y Supabase Auth', () => {
  const online = read('admin-online.js');
  assert.match(online, /fetch\('\/api\/auth-config'/);
  assert.match(online, /auth\.signInWithPassword/);
  assert.match(online, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(online, /SERVICE_ROLE/);
  assert.doesNotMatch(read('index.html'), /SERVICE_ROLE/);
});

test('las imágenes se suben directamente con URL firmada', () => {
  const online = read('admin-online.js');
  assert.match(online, /uploadToSignedUrl\(/);
  assert.match(online, /action: 'authorize-upload'/);
  assert.match(online, /action: 'confirm-upload'/);
  assert.doesNotMatch(online, /dataBase64|readAsDataURL/);
});

test('sincronización usa operaciones remotas existentes y optimistic locking', () => {
  const online = read('admin-online.js');
  for (const action of ['create', 'update', 'add-blank', 'reorder', 'delete-page']) {
    assert(online.includes(`action: '${action}'`), `Falta operación ${action}`);
  }
  assert.match(online, /expected_revision: project\.remoteRevision/);
  assert.match(online, /error\.code === 'revision_conflict'/);
  assert.match(online, /pendingRemoteDeletes/);
  assert.match(online, /page\.pendingUpload/);
});

test('duplicar una imagen no comparte identidad ni Storage remoto', () => {
  const manager = read('admin.js');
  for (const field of ['remotePageId', 'remoteStoragePath', 'remoteObjectVersion', 'remoteHash', 'pendingUpload']) {
    assert(manager.includes(`delete copy.${field}`), `No se limpia ${field}`);
  }
  assert.match(manager, /volver a cargar el archivo original/);
});

test('los archivos del visor aprobado conservan sus hashes', () => {
  assert.equal(hash('app.js'), 'b1201bf1e62832baa34afb4628e8f98ef90ac06530883cb482bcf1811c04d18f');
  assert.equal(hash('styles.css'), 'cb7ff20b746e33f04e1faea6171f54035f7a6f8e51710f5ca77a5c200b7a1476');
  assert.equal(hash('vendor/page-flip.browser.js'), '845a881a54b06ea78cdacabd62b77a1c3c98b7abf7f0ad58a6ca6aaec3130407');
  assert.equal(hash('audio/page-turn-short.ogg'), '0b00b9e6b6f6747cde606a72a7846fc0277b0b26e337d2f02e241a94b4d9e211');
});

test('la estructura mantiene exactamente doce funciones Vercel', () => {
  function javascriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? javascriptFiles(full) : entry.name.endsWith('.js') ? [full] : [];
    });
  }
  assert.equal(javascriptFiles(path.join(root, 'api')).length, 12);
});
