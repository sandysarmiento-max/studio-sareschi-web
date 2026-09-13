(function () {
  'use strict';

  const API_URL = '/api/agenda-previews-admin';
  const STORAGE_BUCKET = 'agenda-previews';
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const manager = window.AgendaSampleManager;
  const elements = {
    form: document.getElementById('onlineLoginForm'),
    email: document.getElementById('onlineEmail'),
    password: document.getElementById('onlinePassword'),
    session: document.getElementById('onlineSession'),
    logout: document.getElementById('onlineLogoutButton'),
    refresh: document.getElementById('refreshRemoteButton'),
    list: document.getElementById('remoteList'),
    count: document.getElementById('remoteCount'),
    status: document.getElementById('onlineStatus'),
    sync: document.getElementById('syncDraftButton'),
    progress: document.getElementById('syncProgress'),
    progressText: document.getElementById('syncProgressText'),
    reload: document.getElementById('reloadRemoteButton'),
  };

  let supabaseClient = null;
  let currentSession = null;
  let syncing = false;

  function setProgress(message, { error = false, showReload = false } = {}) {
    elements.progress.hidden = false;
    elements.progress.classList.toggle('is-error', error);
    elements.progressText.textContent = message;
    elements.reload.hidden = !showReload;
  }

  function clearProgress() {
    elements.progress.hidden = true;
    elements.reload.hidden = true;
    elements.progress.classList.remove('is-error');
  }

  function setSessionUi(session) {
    currentSession = session || null;
    const active = Boolean(currentSession?.access_token);
    elements.form.hidden = active;
    elements.session.hidden = !active;
    elements.sync.disabled = !active;
    elements.status.textContent = active ? 'Conectado' : 'Local';
    if (!active) {
      elements.count.textContent = '0';
      elements.list.innerHTML = '<p class="empty-copy">Inicia sesión para verlas.</p>';
    }
  }

  async function accessToken() {
    if (!supabaseClient) throw new Error('Supabase Auth no está disponible.');
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('La sesión administrativa terminó. Vuelve a iniciar sesión.');
    currentSession = data.session;
    return data.session.access_token;
  }

  async function apiRequest(method, body, query = '') {
    const token = await accessToken();
    const response = await fetch(`${API_URL}${query}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'No se pudo completar la operación remota.');
      error.code = payload.code || '';
      error.status = response.status;
      error.details = payload.details;
      throw error;
    }
    return payload;
  }

  function remotePayload(project) {
    return {
      slug: project.slug,
      title: project.title,
      format: project.format,
      width_mm: Number(project.width),
      height_mm: Number(project.height),
      orientation: project.orientation === 'horizontal' ? 'landscape' : 'portrait',
      total_product_pages: Number(project.totalProductPages),
      buy_button_text: project.buyButtonText || null,
      buy_url: project.purchaseUrl || null,
    };
  }

  function applyRemotePreview(project, preview) {
    if (!preview) return;
    project.remotePreviewId = preview.id;
    project.remoteRevision = preview.revision;
    project.remoteStatus = preview.status;
    project.remoteSyncedAt = Date.now();
  }

  function applyRemotePage(localPage, remotePage) {
    localPage.remotePageId = remotePage.id;
    localPage.remoteStoragePath = remotePage.storage_path || null;
    localPage.remoteObjectVersion = remotePage.object_version || null;
    localPage.remoteHash = remotePage.sha256 || localPage.hash || null;
    localPage.needsUpload = false;
    delete localPage.pendingUpload;
  }

  function showWarning(warning) {
    if (!warning) return;
    const message = warning.message || warning.code || 'La operación terminó con una advertencia.';
    manager.addMessage(message, 'warning');
  }

  async function listRemotePreviews() {
    if (!currentSession?.access_token) return;
    const payload = await apiRequest('GET');
    const previews = Array.isArray(payload.previews) ? payload.previews : [];
    elements.count.textContent = previews.length;
    elements.list.innerHTML = previews.length ? '' : '<p class="empty-copy">Todavía no hay muestras remotas.</p>';
    previews.forEach((preview) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'draft-item';
      button.innerHTML = `<strong>${escapeHtml(preview.title || 'Muestra sin título')}</strong><span>${escapeHtml(preview.format)} · ${escapeHtml(preview.status)}</span>`;
      button.addEventListener('click', () => openRemotePreview(preview.id));
      elements.list.appendChild(button);
    });
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = String(value == null ? '' : value);
    return node.innerHTML;
  }

  async function blankPageFromRemote(project, remotePage) {
    const ratio = Math.max(0.05, Number(project.width) / Math.max(1, Number(project.height)));
    const longEdge = 2000;
    const width = ratio <= 1 ? Math.max(1, Math.round(longEdge * ratio)) : longEdge;
    const height = ratio <= 1 ? longEdge : Math.max(1, Math.round(longEdge / ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('No se pudo reconstruir la página blanca.')),
      'image/png'
    ));
    return {
      id: manager.uid(), name: 'Página blanca', blob, type: 'blank', mimeType: 'image/png',
      size: blob.size, width, height, ratio: width / height, hash: null, warnings: [],
      isBlank: true, generated: true, remotePageId: remotePage.id,
    };
  }

  async function imagePageFromRemote(remotePage) {
    if (!remotePage.signed_url) throw new Error(`La página ${remotePage.position} no tiene URL firmada.`);
    const response = await fetch(remotePage.signed_url);
    if (!response.ok) throw new Error(`No se pudo descargar la página ${remotePage.position}.`);
    const rawBlob = await response.blob();
    const mimeType = remotePage.mime_type || rawBlob.type;
    const blob = rawBlob.type === mimeType ? rawBlob : rawBlob.slice(0, rawBlob.size, mimeType);
    const page = await manager.inspectImage(blob, remotePage.original_filename || `Página ${remotePage.position}`);
    applyRemotePage(page, remotePage);
    return page;
  }

  async function openRemotePreview(previewId) {
    if (syncing) return;
    clearProgress();
    setProgress('Cargando muestra remota…');
    try {
      const payload = await apiRequest('GET', null, `?id=${encodeURIComponent(previewId)}`);
      const preview = payload.preview;
      const nextProject = {
        id: manager.uid(),
        title: preview.title,
        slug: preview.slug,
        format: preview.format,
        width: Number(preview.width_mm),
        height: Number(preview.height_mm),
        orientation: preview.orientation === 'landscape' ? 'horizontal' : 'vertical',
        totalProductPages: Number(preview.total_product_pages),
        buyButtonText: preview.buy_button_text || '',
        purchaseUrl: preview.buy_url || '',
        pages: [],
        pendingRemoteDeletes: [],
        updatedAt: Date.now(),
      };
      applyRemotePreview(nextProject, preview);
      for (const remotePage of payload.pages || []) {
        nextProject.pages.push(remotePage.page_type === 'blank'
          ? await blankPageFromRemote(nextProject, remotePage)
          : await imagePageFromRemote(remotePage));
      }
      manager.loadProject(nextProject, false);
      await manager.saveLocalCheckpoint();
      setProgress('Borrador remoto abierto y guardado también en este navegador.');
    } catch (error) {
      setProgress(error.message, { error: true });
    }
  }

  async function checkpoint() {
    await manager.saveLocalCheckpoint();
  }

  async function createOrUpdateRemote(project) {
    if (!project.remotePreviewId) {
      setProgress('Creando muestra remota en borrador…');
      try {
        const result = await apiRequest('POST', { action: 'create', ...remotePayload(project) });
        applyRemotePreview(project, result.preview);
      } catch (error) {
        if (error.status !== 409) throw error;
        const list = await apiRequest('GET');
        const existing = (list.previews || []).filter((preview) =>
          preview.slug === project.slug && preview.status === 'draft'
        );
        if (existing.length !== 1) throw error;
        applyRemotePreview(project, existing[0]);
      }
      await checkpoint();
      return;
    }

    setProgress('Actualizando datos de la muestra…');
    const result = await apiRequest('PATCH', {
      action: 'update', preview_id: project.remotePreviewId,
      expected_revision: project.remoteRevision, ...remotePayload(project),
    });
    applyRemotePreview(project, result.preview);
    await checkpoint();
  }

  async function deletePendingRemotePages(project) {
    while (project.pendingRemoteDeletes.length) {
      const pageId = project.pendingRemoteDeletes[0];
      setProgress('Eliminando páginas pendientes…');
      let result;
      try {
        result = await apiRequest('DELETE', {
          action: 'delete-page', preview_id: project.remotePreviewId, page_id: pageId,
        });
      } catch (error) {
        if (error.status !== 404) throw error;
        project.pendingRemoteDeletes.shift();
        await checkpoint();
        continue;
      }
      applyRemotePreview(project, result.preview);
      showWarning(result.warning);
      project.pendingRemoteDeletes.shift();
      await checkpoint();
    }
  }

  async function recoverConfirmedUpload(project, page, pending) {
    if (!pending?.uploaded) return false;
    const payload = await apiRequest('GET', null, `?id=${encodeURIComponent(project.remotePreviewId)}`);
    const existing = (payload.pages || []).find((item) =>
      item.id === pending.page_id && item.storage_path === pending.storage_path
    );
    if (!existing) return false;
    applyRemotePage(page, existing);
    applyRemotePreview(project, payload.preview);
    await checkpoint();
    return true;
  }

  function uploadConfirmationPayload(project, page, pending, position) {
    return {
      action: 'confirm-upload', mode: pending.mode, preview_id: project.remotePreviewId,
      page_id: pending.page_id, object_version: pending.object_version,
      storage_path: pending.storage_path, position,
      original_filename: page.name, mime_type: page.blob.type,
      width_px: page.width, height_px: page.height,
      file_size_bytes: page.blob.size, sha256: page.hash,
    };
  }

  async function confirmPendingUpload(project, page, pending, position) {
    const result = await apiRequest('POST', uploadConfirmationPayload(project, page, pending, position));
    applyRemotePage(page, result.page);
    applyRemotePreview(project, result.preview);
    showWarning(result.warning);
    await checkpoint();
  }

  async function syncImagePage(project, page, position, total) {
    if (!(page.blob instanceof Blob)) {
      throw new Error(`Página ${position}: vuelve a cargar la imagen original para sincronizarla.`);
    }
    if (!ALLOWED_IMAGE_TYPES.has(page.blob.type) || page.blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`Página ${position}: el formato o tamaño no está permitido.`);
    }

    const mode = page.remotePageId ? 'replace' : 'create';
    if (mode === 'replace' && !page.needsUpload && page.remoteHash === page.hash) return;
    let pending = page.pendingUpload;
    if (pending && pending.mode === mode && await recoverConfirmedUpload(project, page, pending)) return;

    if (pending?.confirmationPending && pending.mode === mode) {
      setProgress(`Confirmando imagen ${position}/${total}…`);
      try {
        await confirmPendingUpload(project, page, pending, position);
        return;
      } catch (error) {
        if (error.code !== 'storage_object_missing') throw error;
        delete page.pendingUpload;
        pending = null;
        await checkpoint();
      }
    }

    if (!pending || pending.mode !== mode || pending.page_id !== (page.remotePageId || pending.page_id)) {
      setProgress(`Autorizando imagen ${position}/${total}…`);
      const authorization = await apiRequest('POST', {
        action: 'authorize-upload', mode, preview_id: project.remotePreviewId,
        page_id: mode === 'replace' ? page.remotePageId : undefined, position,
      });
      pending = { ...authorization.upload, uploaded: false };
      page.pendingUpload = pending;
      await checkpoint();
    }

    if (!pending.uploaded) {
      setProgress(`Subiendo imagen ${position}/${total}…`);
      const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(pending.storage_path, pending.token, page.blob, {
          contentType: page.blob.type,
          upsert: false,
        });
      if (error) {
        pending.confirmationPending = true;
        await checkpoint();
        try {
          await confirmPendingUpload(project, page, pending, position);
          return;
        } catch (confirmError) {
          if (confirmError.code === 'storage_object_missing') {
            delete page.pendingUpload;
            await checkpoint();
            throw new Error(`Página ${position}: la subida no se completó. Vuelve a sincronizar para obtener una autorización nueva.`);
          }
          throw confirmError;
        }
      }
      pending.uploaded = true;
      pending.confirmationPending = true;
      await checkpoint();
    }

    setProgress(`Confirmando imagen ${position}/${total}…`);
    await confirmPendingUpload(project, page, pending, position);
  }

  async function syncPages(project) {
    const total = project.pages.length;
    for (let index = 0; index < total; index += 1) {
      const page = project.pages[index];
      const position = index + 1;
      const blank = page.generated || page.type === 'blank' || page.isBlank;
      if (blank && !page.remotePageId) {
        if (!page.pendingRemotePageId) {
          page.pendingRemotePageId = window.crypto.randomUUID();
          await checkpoint();
        }
        setProgress(`Creando página blanca ${position}/${total}…`);
        const result = await apiRequest('POST', {
          action: 'add-blank', preview_id: project.remotePreviewId,
          page_id: page.pendingRemotePageId, position,
        });
        applyRemotePage(page, result.page);
        delete page.pendingRemotePageId;
        applyRemotePreview(project, result.preview);
        showWarning(result.warning);
        await checkpoint();
      } else if (!blank) {
        await syncImagePage(project, page, position, total);
      }
    }

    setProgress('Aplicando orden final…');
    await apiRequest('POST', {
      action: 'reorder', preview_id: project.remotePreviewId,
      page_ids: project.pages.map((page) => page.remotePageId),
    });
    const refreshed = await apiRequest('GET', null, `?id=${encodeURIComponent(project.remotePreviewId)}`);
    applyRemotePreview(project, refreshed.preview);
    await checkpoint();
  }

  async function synchronize() {
    if (syncing || !manager.validateProject()) return;
    syncing = true;
    elements.sync.disabled = true;
    manager.clearMessages();
    try {
      const project = manager.getProject();
      await checkpoint();
      await createOrUpdateRemote(project);
      await deletePendingRemotePages(project);
      await syncPages(project);
      setProgress('Borrador sincronizado correctamente.');
      elements.status.textContent = 'Sincronizado';
      manager.setRemoteSaved();
      await listRemotePreviews();
    } catch (error) {
      const conflict = error.status === 409 && error.code === 'revision_conflict';
      setProgress(conflict
        ? 'La muestra cambió en otra sesión. Tu borrador local se conserva sin sobrescribir.'
        : error.message,
      { error: true, showReload: conflict });
    } finally {
      syncing = false;
      elements.sync.disabled = !currentSession?.access_token;
    }
  }

  async function initializeAuth() {
    elements.sync.disabled = true;
    try {
      const response = await fetch('/api/auth-config', { headers: { Accept: 'application/json' } });
      const config = await response.json();
      if (!response.ok || !config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('La autenticación administrativa no está configurada.');
      }
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      setSessionUi(data.session);
      if (data.session) await listRemotePreviews();
      supabaseClient.auth.onAuthStateChange((_event, session) => setSessionUi(session));
    } catch (error) {
      setProgress(error.message, { error: true });
    }
  }

  if (window.__AGENDA_PREVIEW_ONLINE_TEST__) {
    window.AgendaPreviewOnlineTest = {
      deletePendingRemotePages,
      syncImagePage,
      syncPages,
      setSupabaseClient(client, session = { access_token: 'test-token' }) {
        supabaseClient = client;
        currentSession = session;
      },
    };
    return;
  }

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearProgress();
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: elements.email.value.trim(), password: elements.password.value,
      });
      elements.password.value = '';
      if (error || !data?.session) throw error || new Error('No se pudo iniciar sesión.');
      setSessionUi(data.session);
      await listRemotePreviews();
    } catch (error) {
      setProgress(error.message || 'No se pudo iniciar sesión.', { error: true });
    }
  });

  elements.logout.addEventListener('click', async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    setSessionUi(null);
  });
  elements.refresh.addEventListener('click', () => listRemotePreviews().catch((error) => setProgress(error.message, { error: true })));
  elements.sync.addEventListener('click', synchronize);
  elements.reload.addEventListener('click', () => {
    const project = manager.getProject();
    if (project.remotePreviewId) openRemotePreview(project.remotePreviewId);
  });

  setSessionUi(null);
  initializeAuth();
})();
