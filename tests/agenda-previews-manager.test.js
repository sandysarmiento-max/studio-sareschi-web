'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const managerRoot = path.join(root, 'public', 'admin', 'agenda-previews');
const read = (file) => fs.readFileSync(path.join(managerRoot, file), 'utf8');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(managerRoot, file))).digest('hex');

function loadOnlineManager(fetchImpl, uploadImpl) {
  const elements = new Map();
  const element = () => ({
    hidden: false, disabled: false, textContent: '', innerHTML: '', value: '',
    classList: { toggle() {}, remove() {} },
  });
  const checkpoints = [];
  const manager = {
    addMessage() {},
    clearMessages() {},
    saveLocalCheckpoint: async () => { checkpoints.push(true); },
    uid: () => crypto.randomUUID(),
    validateProject: () => true,
  };
  const context = {
    Blob,
    Error,
    Set,
    console,
    fetch: fetchImpl,
    window: { AgendaSampleManager: manager, __AGENDA_PREVIEW_ONLINE_TEST__: true, crypto },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
  };
  vm.runInNewContext(read('admin-online.js'), context);
  context.window.AgendaPreviewOnlineTest.setSupabaseClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
    storage: { from: () => ({ uploadToSignedUrl: uploadImpl }) },
  });
  return { api: context.window.AgendaPreviewOnlineTest, checkpoints };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

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
  assert.match(online, /pendingRemotePageId = window\.crypto\.randomUUID\(\)/);
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

test('upload ambiguo se confirma sin volver a subir cuando el objeto existe', async () => {
  let uploads = 0;
  let confirmations = 0;
  const pageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  const storagePath = `550e8400-e29b-41d4-a716-446655440000/${pageId}/8ad210ae-581f-4b31-a354-8826ec3a5517`;
  const { api } = loadOnlineManager(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.action, 'confirm-upload');
    confirmations += 1;
    return jsonResponse(200, { ok: true, page: { id: pageId, storage_path: storagePath }, preview: { revision: 2 } });
  }, async () => {
    uploads += 1;
    return { error: new Error('respuesta perdida') };
  });
  const project = { remotePreviewId: '550e8400-e29b-41d4-a716-446655440000' };
  const page = {
    blob: new Blob(['png'], { type: 'image/png' }), name: '01.png', width: 10, height: 20,
    hash: 'a'.repeat(64), pendingUpload: {
      mode: 'create', page_id: pageId, object_version: '8ad210ae-581f-4b31-a354-8826ec3a5517',
      storage_path: storagePath, token: 'signed', uploaded: false,
    },
  };
  await api.syncImagePage(project, page, 1, 1);
  assert.equal(uploads, 1);
  assert.equal(confirmations, 1);
  assert.equal(page.remotePageId, pageId);
  assert.equal(page.pendingUpload, undefined);
});

test('storage_object_missing descarta la autorización y el siguiente intento pide otra', async () => {
  let authorizations = 0;
  let phase = 1;
  const pageId = '3fb761e9-8c77-4933-a172-0bfa12d05484';
  const project = { remotePreviewId: '550e8400-e29b-41d4-a716-446655440000' };
  const page = {
    blob: new Blob(['png'], { type: 'image/png' }), name: '01.png', width: 10, height: 20,
    hash: 'a'.repeat(64), pendingUpload: {
      mode: 'create', page_id: pageId, object_version: '8ad210ae-581f-4b31-a354-8826ec3a5517',
      storage_path: `${project.remotePreviewId}/${pageId}/8ad210ae-581f-4b31-a354-8826ec3a5517`,
      token: 'expired', uploaded: false,
    },
  };
  const { api } = loadOnlineManager(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'confirm-upload') {
      return jsonResponse(422, { code: 'storage_object_missing', error: 'No existe.' });
    }
    assert.equal(body.action, 'authorize-upload');
    authorizations += 1;
    return jsonResponse(200, { upload: {
      mode: 'create', page_id: crypto.randomUUID(), object_version: crypto.randomUUID(),
      storage_path: `${project.remotePreviewId}/${crypto.randomUUID()}/${crypto.randomUUID()}`, token: 'new',
    } });
  }, async () => ({ error: phase === 1 ? new Error('token expirado') : null }));
  await assert.rejects(api.syncImagePage(project, page, 1, 1), /autorización nueva/);
  assert.equal(page.pendingUpload, undefined);
  phase = 2;
  await assert.rejects(api.syncImagePage(project, page, 1, 1), /No existe/);
  assert.equal(authorizations, 1);
});

test('DELETE 404 pendiente se considera completado y guarda checkpoint', async () => {
  const { api, checkpoints } = loadOnlineManager(
    async () => jsonResponse(404, { code: 'page_not_found', error: 'No existe.' }),
    async () => ({ error: null })
  );
  const project = {
    remotePreviewId: '550e8400-e29b-41d4-a716-446655440000',
    pendingRemoteDeletes: ['3fb761e9-8c77-4933-a172-0bfa12d05484'],
  };
  await api.deletePendingRemotePages(project);
  assert.deepEqual(project.pendingRemoteDeletes, []);
  assert.equal(checkpoints.length, 1);
});
