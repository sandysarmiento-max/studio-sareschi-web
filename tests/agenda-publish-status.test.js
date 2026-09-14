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

test('el formulario de login queda realmente oculto durante una sesión activa', () => {
  const html = read('index.html');

  assert.match(html, /\.online-login\[hidden\],#onlineSession\[hidden\]\{display:none!important\}/);
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

test('al publicarse usa el origen actual y permite copiar el enlace', () => {
  const script = read('publish-status.js');

  assert.match(script, /window\.location\.origin/);
  assert.match(script, /\/hojear\/\?agenda=/);
  assert.doesNotMatch(script, /https:\/\/www\.studio-sareschi\.com\/hojear\/\?agenda=/);
  assert.match(script, /Copiar enlace/);
  assert.match(script, /navigator\.clipboard\.writeText/);
});

test('el enlace publicado usa el slug remoto confirmado, no un slug local editado', () => {
  const script = read('publish-status.js');

  assert.match(script, /remoteSlugByPreviewId = new Map\(\)/);
  assert.match(script, /project\?\.remoteStatus === 'published'/);
  assert.match(script, /remoteSlugByPreviewId\.get\(project\.remotePreviewId\)/);
  assert.match(script, /remoteSlugByPreviewId\.set\(project\.remotePreviewId, remoteSlug\)/);
  assert.match(script, /rememberRemotePreview\(project, payload\.preview\)/);
  assert.match(script, /Publicada · comprobando enlace público/);
});

test('si el enlace publicado falló sin sesión se reintenta al pasar a Conectado', () => {
  const script = read('publish-status.js');

  assert.match(script, /const onlineStatus = document\.getElementById\('onlineStatus'\)/);
  assert.match(script, /function retryPublishedSlugAfterLogin\(\)/);
  assert.match(script, /remoteSlugLoading\.delete\(project\.remotePreviewId\)/);
  assert.match(script, /String\(onlineStatus\.textContent \|\| ''\)\.trim\(\) === 'Conectado'/);
  assert.match(script, /retryPublishedSlugAfterLogin\(\)/);
});

test('después de cambiar estado revalida el proyecto antes de marcarlo sincronizado', () => {
  const script = read('publish-status.js');

  assert.match(script, /const refreshedPayload = await refreshRemoteProject\(project\)/);
  assert.match(script, /await manager\.saveLocalCheckpoint\(\)/);
  assert.match(script, /if \(!remoteMatchesLocal\(project, refreshedPayload\)\)/);
  assert.match(script, /La muestra se publicó, pero hay cambios locales pendientes/);
  assert.match(script, /La muestra se despublicó y hay cambios locales pendientes/);
  assert.match(script, /manager\.setRemoteSaved\(\)/);
});

test('los errores de publicar o despublicar permanecen visibles tras refrescar controles', () => {
  const script = read('publish-status.js');

  assert.match(script, /let uiError = ''/);
  assert.match(script, /uiError = error\.message \|\| 'No se pudo cambiar el estado de la muestra\.'/);
  assert.match(script, /panel\.classList\.toggle\('is-error', Boolean\(uiError\)\)/);
  assert.match(script, /if \(uiError\) \{\s*message\.textContent = uiError;/);
  assert.match(script, /finally \{\s*busy = false;\s*updateUi\(\);/);
});

test('los controles administrativos no contienen secretos de Supabase', () => {
  const script = read('publish-status.js');

  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.match(script, /\/api\/auth-config/);
  assert.match(script, /auth\.getSession/);
  assert.match(script, /Authorization: `Bearer \$\{token\}`/);
});
