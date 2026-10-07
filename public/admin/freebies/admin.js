'use strict';

(() => {
  const loginForm = document.getElementById('login-form');
  const sessionBox = document.getElementById('session-box');
  const panel = document.getElementById('panel');
  const status = document.getElementById('status');
  const grid = document.getElementById('resources-grid');
  const template = document.getElementById('resource-template');
  const count = document.getElementById('resource-count');
  const refreshButton = document.getElementById('refresh-btn');
  const logoutButton = document.getElementById('logout-btn');
  const newButton = document.getElementById('new-resource-btn');

  let client;
  let accessToken = '';
  let resources = [];

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#8f1d4f' : '#6f6471';
  }

  async function request(method = 'GET', body) {
    const response = await fetch('/api/freebies-admin', {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error || 'No se pudo completar la operación.');
      error.code = payload?.code;
      error.orphanedStorageObject = payload?.orphaned_storage_object || null;
      throw error;
    }
    return payload;
  }

  function setBusy(card, busy) {
    card.querySelectorAll('button,input,textarea').forEach((element) => { element.disabled = busy; });
  }

  function fileSummary(resource) {
    const pdf = resource.storage_path ? 'PDF cargado' : 'PDF pendiente';
    const preview = resource.thumbnail
      ? 'miniatura en Storage'
      : resource.preview_url
        ? 'miniatura antigua'
        : 'sin miniatura';
    return `${pdf} · ${preview}`;
  }

  function render() {
    grid.innerHTML = '';
    const persistedCount = resources.filter((resource) => Boolean(resource.id)).length;
    count.textContent = `${persistedCount} recurso${persistedCount === 1 ? '' : 's'}`;
    for (const resource of resources) {
      const card = template.content.firstElementChild.cloneNode(true);
      const form = card.querySelector('.resource-form');
      const image = card.querySelector('img');
      const state = card.querySelector('.state-pill');
      const assetStatus = card.querySelector('.asset-status');
      form.elements.title.value = resource.title || '';
      form.elements.description.value = resource.description || '';
      form.elements.category.value = resource.category || '';
      form.elements.sort_order.value = Number(resource.sort_order || 0);
      form.elements.is_active.checked = Boolean(resource.is_active);
      card.querySelector('.slug-label').textContent = resource.slug || 'Se generará al guardar';
      state.textContent = resource.is_active ? 'Activo' : 'Inactivo';
      state.classList.toggle('active', Boolean(resource.is_active));
      form.elements.pdf_file.required = !resource.id;
      card.querySelector('.upload-pdf-btn').hidden = !resource.id;
      card.querySelector('.upload-thumbnail-btn').hidden = !resource.id;
      assetStatus.textContent = resource.id
        ? fileSummary(resource)
        : 'Selecciona el PDF obligatorio y guarda el recurso. La miniatura puede añadirse después.';
      if (resource.preview_url) {
        image.src = resource.preview_url;
        image.classList.add('is-visible');
      }

      const save = async () => {
        const body = {
          resource_id: resource.id,
          title: form.elements.title.value,
          description: form.elements.description.value,
          category: form.elements.category.value,
          sort_order: Number(form.elements.sort_order.value),
          is_active: form.elements.is_active.checked,
        };
        if (!resource.id) {
          const file = form.elements.pdf_file.files?.[0];
          if (!file) throw new Error('Selecciona un PDF antes de crear el recurso.');
          const authorization = await request('POST', {
            ...body,
            action: 'authorize-create',
            mime_type: file.type,
            file_size: file.size,
          });
          const upload = authorization.upload;
          const { error: uploadError } = await client.storage
            .from(upload.bucket)
            .uploadToSignedUrl(upload.storage_path, upload.token, file, { contentType: file.type });
          if (uploadError) {
            throw new Error(`No se pudo subir el PDF. No se creó ningún recurso. ${uploadError.message || ''}`.trim());
          }
          const payload = await request('POST', {
            ...body,
            action: 'confirm-create',
            resource_id: upload.resource_id,
            mime_type: file.type,
            file_size: file.size,
            storage_path: upload.storage_path,
          });
          Object.assign(resource, payload.resource);
          form.elements.pdf_file.value = '';
          setStatus('Recurso inactivo creado con su PDF.');
          await loadResources();
          return;
        }
        const payload = await request('PATCH', { ...body, action: 'update' });
        Object.assign(resource, payload.resource);
        setStatus('Recurso guardado correctamente.');
        await loadResources();
      };

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setBusy(card, true);
        try {
          await save();
        } catch (error) {
          const orphan = error.orphanedStorageObject;
          const suffix = orphan?.storage_path ? ` Objeto huérfano: ${orphan.storage_path}` : '';
          setStatus(`${error.message}${suffix}`, true);
        } finally { setBusy(card, false); }
      });

      async function upload(kind, input) {
        if (!resource.id) throw new Error('Guarda primero el recurso.');
        const file = input.files?.[0];
        if (!file) throw new Error(kind === 'pdf' ? 'Selecciona un PDF.' : 'Selecciona una miniatura.');
        const auth = await request('POST', {
          action: 'authorize-upload', resource_id: resource.id, kind,
          mime_type: file.type, file_size: file.size,
        });
        const upload = auth.upload;
        const { error } = await client.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.storage_path, upload.token, file, { contentType: file.type });
        if (error) throw error;
        await request('POST', {
          action: 'confirm-upload', resource_id: resource.id, kind,
          mime_type: file.type, file_size: file.size, storage_path: upload.storage_path,
        });
        input.value = '';
        setStatus(kind === 'pdf' ? 'PDF subido correctamente.' : 'Miniatura subida correctamente.');
        await loadResources();
      }

      card.querySelector('.upload-pdf-btn').addEventListener('click', async () => {
        setBusy(card, true);
        try { await upload('pdf', form.elements.pdf_file); } catch (error) { setStatus(error.message, true); } finally { setBusy(card, false); }
      });
      card.querySelector('.upload-thumbnail-btn').addEventListener('click', async () => {
        setBusy(card, true);
        try { await upload('thumbnail', form.elements.thumbnail_file); } catch (error) { setStatus(error.message, true); } finally { setBusy(card, false); }
      });
      card.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!resource.id) { resources = resources.filter((item) => item !== resource); render(); return; }
        const confirmation = window.prompt(`Para eliminar este registro, escribe exactamente: ${resource.slug}`);
        if (confirmation === null) return;
        setBusy(card, true);
        try {
          await request('DELETE', {
            action: 'delete', resource_id: resource.id,
            confirm_delete: true, confirmation_text: confirmation,
          });
          setStatus('Registro eliminado. Los archivos de Storage se conservaron por seguridad.');
          await loadResources();
        } catch (error) { setStatus(error.message, true); } finally { setBusy(card, false); }
      });
      grid.appendChild(card);
    }
  }

  async function loadResources() {
    const payload = await request();
    resources = payload.resources || [];
    render();
  }

  async function activateSession(session) {
    accessToken = session?.access_token || '';
    const authenticated = Boolean(accessToken);
    loginForm.classList.toggle('hidden', authenticated);
    sessionBox.classList.toggle('hidden', !authenticated);
    panel.classList.toggle('hidden', !authenticated);
    if (authenticated) {
      try { await loadResources(); setStatus('Panel listo.'); }
      catch (error) {
        panel.classList.add('hidden');
        setStatus(error.message, true);
      }
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Validando acceso…');
    const { data, error } = await client.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    if (error) return setStatus(error.message, true);
    await activateSession(data.session);
  });
  refreshButton.addEventListener('click', () => loadResources().catch((error) => setStatus(error.message, true)));
  logoutButton.addEventListener('click', async () => { await client.auth.signOut(); resources = []; render(); await activateSession(null); });
  newButton.addEventListener('click', () => {
    const persistedCount = resources.filter((resource) => Boolean(resource.id)).length;
    resources.unshift({ id: '', slug: '', title: '', description: '', category: '', sort_order: persistedCount + 1, is_active: false });
    render();
    grid.querySelector('input[name="title"]')?.focus();
  });

  (async () => {
    try {
      const config = await fetch('/api/auth-config').then((response) => response.json());
      if (!config.enabled) throw new Error('Supabase Auth no está configurado.');
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data } = await client.auth.getSession();
      await activateSession(data.session);
    } catch (error) { setStatus(error.message, true); }
  })();
})();
