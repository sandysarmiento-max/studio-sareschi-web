'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const adminRoot = path.join(root, 'public', 'admin', 'agenda-previews');
const read = (file) => fs.readFileSync(path.join(adminRoot, file), 'utf8');

test('el gestor carga los controles de publicar/despublicar después del sincronizador', () => {
  const html = read('index.html');
  const onlineIndex = html.indexOf('<script src="admin-online.js"></script>');
  const publishIndex = html.indexOf('<script src="publish-status.js"></script>');

  assert(onlineIndex >= 0, 'Falta admin-online.js');
  assert(publishIndex > onlineIndex, 'publish-status.js debe cargarse después del sincronizador');
});

test('publicar y despublicar reutilizan set-status con optimistic locking', () => {
  const script = read('publish-status.js');

  assert.match(script, /action: 'set-status'/);
  assert.match(script, /preview_id: project\.remotePreviewId/);
  assert.match(script, /expected_revision: project\.remoteRevision/);
  assert.match(script, /status: targetStatus/);
  assert.match(script, /'published'/);
  assert.match(script, /'draft'/);
  assert.match(script, /window\.confirm\(/);
});

test('la publicación exige que remoto y local coincidan antes de cambiar estado', () => {
  const script = read('publish-status.js');

  assert.match(script, /remoteMatchesLocal\(project, payload\)/);
  assert.match(script, /pendingRemoteDeletes/);
  assert.match(script, /localPage\.pendingUpload/);
  assert.match(script, /localPage\.pendingRemotePageId/);
  assert.match(script, /localPage\.needsUpload/);
  assert.match(script, /remotePage\.sha256/);
  assert.match(script, /remotePage\.id !== localPage\.remotePageId/);
  assert.match(script, /Pulsa Sincronizar antes de publicar/);
});

test('al publicarse muestra el enlace estable y permite copiarlo', () => {
  const script = read('publish-status.js');

  assert.match(script, /https:\/\/www\.studio-sareschi\.com\/hojear\/\?agenda=/);
  assert.match(script, /Copiar enlace/);
  assert.match(script, /navigator\.clipboard\.writeText/);
});

test('los controles administrativos no contienen secretos de Supabase', () => {
  const script = read('publish-status.js');

  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.match(script, /\/api\/auth-config/);
  assert.match(script, /auth\.getSession/);
  assert.match(script, /Authorization: `Bearer \$\{token\}`/);
});
