(function () {
  'use strict';

  const API_URL = '/api/agenda-previews-admin';
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const manager = window.AgendaSampleManager;
  const progress = document.getElementById('syncProgress');
  const saveStatus = document.getElementById('saveStatus');
  const remoteList = document.getElementById('remoteList');
  const syncButton = document.getElementById('syncDraftButton');
  const onlineStatus = document.getElementById('onlineStatus');

  if (!manager || !progress) return;

  let supabaseClient = null;
  let busy = false;
  let uiError = '';
  const remoteSlugByPreviewId = new Map();
  const remoteSlugLoading = new Set();

  const panel = document.createElement('div');
  panel.className = 'sync-progress';
  panel.hidden = true;
  panel.style.flexWrap = 'wrap';

  const message = document.createElement('span');
  message.style.minWidth = '220px';
  message.style.flex = '1';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.flexWrap = 'wrap';

  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = 'button button--secondary';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'button button--secondary';
  copyButton.textContent = 'Copiar enlace';
  copyButton.hidden = true;

  actions.append(statusButton, copyButton);
  panel.append(message, actions);
  progress.insertAdjacentElement('afterend', panel);

  function getProject() {
    try {
      return manager.getProject();
    } catch (_error) {
      return null;
    }
  }

  function publicSlug(project) {
    if (project?.remoteStatus === 'published') {
      return remoteSlugByPreviewId.get(project.remotePreviewId) || '';
    }
    return String(project?.slug || '').trim().toLowerCase();
  }

  function publicUrl(project) {
    const slug = publicSlug(project);
    if (!SLUG_PATTERN.test(slug)) return '';
    const origin = String(window.location.origin || '').replace(/\/+$/, '');
    if (!origin) return '';
    return `${origin}/hojear/?agenda=${encodeURIComponent(slug)}`;
  }

  function rememberRemotePreview(project, preview) {
    if (!preview) return;
    project.remoteRevision = preview.revision;
    project.remoteStatus = preview.status;
    project.remoteSyncedAt = Date.now();
    const remoteSlug = String(preview.slug || '').trim().toLowerCase();
    if (project.remotePreviewId && SLUG_PATTERN.test(remoteSlug)) {
      remoteSlugByPreviewId.set(project.remotePreviewId, remoteSlug);
    }
  }

  async function ensurePublishedSlug(project) {
    if (
      !project?.remotePreviewId ||
      project.remoteStatus !== 'published' ||
      remoteSlugByPreviewId.has(project.remotePreviewId) ||
      remoteSlugLoading.has(project.remotePreviewId)
    ) return;

    remoteSlugLoading.add(project.remotePreviewId);
    try {
      const payload = await apiRequest('GET', null, `?id=${encodeURIComponent(project.remotePreviewId)}`);
      rememberRemotePreview(project, payload.preview);
      updateUi();
    } catch (_error) {
      // La acción administrativa principal mostrará sus propios errores cuando corresponda.
    } finally {
      remoteSlugLoading.delete(project.remotePreviewId);
    }
  }

  function retryPublishedSlugAfterLogin() {
    const project = getProject();
    if (!project?.remotePreviewId || project.remoteStatus !== 'published') return;
    remoteSlugLoading.delete(project.remotePreviewId);
    window.setTimeout(updateUi, 0);
  }

  function updateUi() {
    const project = getProject();
    if (!project?.remotePreviewId) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const published = project.remoteStatus === 'published';
    if (published) void ensurePublishedSlug(project);
    const url = publicUrl(project);
    statusButton.textContent = published ? 'Despublicar muestra' : 'Publicar muestra';
    statusButton.disabled = busy || !project.remoteRevision;
    copyButton.hidden = !published || !url;
    copyButton.disabled = busy;
    panel.classList.toggle('is-error', Boolean(uiError));

    if (uiError) {
      message.textContent = uiError;
    } else if (published && url) {
      message.innerHTML = `Publicada · <code style="word-break:break-all">${escapeHtml(url)}</code>`;
    } else if (published) {
      message.textContent = 'Publicada · comprobando enlace público…';
    } else {
      message.textContent = 'Borrador remoto. Antes de publicar se comprobará que todo esté sincronizado.';
    }
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = String(value == null ? '' : value);
    return node.innerHTML;
  }

  async function client() {
    if (supabaseClient) return supabaseClient;
    const response = await fetch('/api/auth-config', { headers: { Accept: 'application/json' } });
    const config = await response.json();
    if (!response.ok || !config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('La autenticación administrativa no está configurada.');
    }
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabaseClient;
  }

  async function accessToken() {
    const authClient = await client();
    const { data, error } = await authClient.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error('La sesión administrativa terminó. Vuelve a iniciar sesión.');
    }
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
      const error = new Error(payload.error || 'No se pudo completar la operación.');
      error.code = payload.code || '';
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function sameText(left, right) {
    return String(left || '').trim() === String(right || '').trim();
  }

  function remoteMatchesLocal(project, payload) {
    const preview = payload?.preview;
    const pages = Array.isArray(payload?.pages) ? payload.pages : [];
    if (!preview || !Array.isArray(project.pages) || !project.pages.length) return false;
    if ((project.pendingRemoteDeletes || []).length) return false;
    if (pages.length !== project.pages.length) return false;

    const metadataMatches =
      sameText(preview.title, project.title) &&
      sameText(preview.slug, project.slug) &&
      sameText(preview.format, project.format) &&
      Number(preview.width_mm) === Number(project.width) &&
      Number(preview.height_mm) === Number(project.height) &&
      sameText(preview.orientation, project.orientation === 'horizontal' ? 'landscape' : 'portrait') &&
      Number(preview.total_product_pages) === Number(project.totalProductPages) &&
      sameText(preview.buy_button_text, project.buyButtonText) &&
      sameText(preview.buy_url, project.purchaseUrl);

    if (!metadataMatches) return false;

    return pages.every((remotePage, index) => {
      const localPage = project.pages[index];
      if (!localPage?.remotePageId || remotePage.id !== localPage.remotePageId) return false;
      if (localPage.pendingUpload || localPage.pendingRemotePageId || localPage.needsUpload) return false;
      const localBlank = localPage.generated || localPage.type === 'blank' || localPage.isBlank;
      if (remotePage.page_type === 'blank') return Boolean(localBlank);
      if (localBlank || remotePage.page_type !== 'image') return false;
      return sameText(remotePage.sha256, localPage.hash || localPage.remoteHash);
    });
  }

  async function refreshRemoteProject(project) {
    const payload = await apiRequest('GET', null, `?id=${encodeURIComponent(project.remotePreviewId)}`);
    rememberRemotePreview(project, payload.preview);
    return payload;
  }

  async function publishOrUnpublish() {
    if (busy) return;
    const project = getProject();
    if (!project?.remotePreviewId) return;

    uiError = '';
    busy = true;
    updateUi();
    try {
      let targetStatus = project.remoteStatus === 'published' ? 'draft' : 'published';

      if (targetStatus === 'published') {
        message.textContent = 'Comprobando que el borrador remoto esté completamente sincronizado…';
        const payload = await refreshRemoteProject(project);
        targetStatus = project.remoteStatus === 'published' ? 'draft' : 'published';
        if (targetStatus !== 'published') {
          throw new Error('La muestra cambió de estado. Actualiza el gestor e inténtalo de nuevo.');
        }
        if (!remoteMatchesLocal(project, payload)) {
          throw new Error('Hay cambios locales o páginas pendientes. Pulsa Sincronizar antes de publicar.');
        }
      }

      const confirmation = targetStatus === 'published'
        ? '¿Publicar esta muestra? El enlace público empezará a funcionar inmediatamente.'
        : '¿Despublicar esta muestra? El enlace público dejará de mostrarla inmediatamente.';
      if (!window.confirm(confirmation)) return;

      message.textContent = targetStatus === 'published' ? 'Publicando muestra…' : 'Despublicando muestra…';
      await apiRequest('POST', {
        action: 'set-status',
        preview_id: project.remotePreviewId,
        status: targetStatus,
        expected_revision: project.remoteRevision,
      });

      const refreshedPayload = await refreshRemoteProject(project);
      await manager.saveLocalCheckpoint();
      if (!remoteMatchesLocal(project, refreshedPayload)) {
        uiError = targetStatus === 'published'
          ? 'La muestra se publicó, pero hay cambios locales pendientes. Despublícala antes de sincronizarlos.'
          : 'La muestra se despublicó y hay cambios locales pendientes. Pulsa Sincronizar antes de volver a publicar.';
        return;
      }
      manager.setRemoteSaved();
    } catch (error) {
      uiError = error.message || 'No se pudo cambiar el estado de la muestra.';
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function copyPublicLink() {
    uiError = '';
    const url = publicUrl(getProject());
    if (!url) {
      updateUi();
      return;
    }
    panel.classList.remove('is-error');
    try {
      await navigator.clipboard.writeText(url);
      message.textContent = 'Enlace público copiado.';
    } catch (_error) {
      window.prompt('Copia este enlace:', url);
    }
  }

  statusButton.addEventListener('click', publishOrUnpublish);
  copyButton.addEventListener('click', copyPublicLink);

  if (saveStatus && 'MutationObserver' in window) {
    new MutationObserver(updateUi).observe(saveStatus, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
  }

  if (onlineStatus && 'MutationObserver' in window) {
    new MutationObserver(() => {
      if (String(onlineStatus.textContent || '').trim() === 'Conectado') {
        retryPublishedSlugAfterLogin();
      }
    }).observe(onlineStatus, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (remoteList) remoteList.addEventListener('click', () => window.setTimeout(() => {
    uiError = '';
    updateUi();
  }, 900));
  if (syncButton) syncButton.addEventListener('click', () => window.setTimeout(() => {
    uiError = '';
    updateUi();
  }, 1200));
  window.addEventListener('agenda-manager-ready', updateUi);
  window.addEventListener('focus', updateUi);
  updateUi();
})();
