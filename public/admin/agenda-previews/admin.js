(function () {
  'use strict';

  const DB_NAME = 'studio-sareschi-agenda-samples';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const FORMAT_SIZES = { A5: [148, 210], A6: [105, 148], B5: [176, 250] };
  const RATIO_TOLERANCE = .025;
  const LOW_RES_MIN_WIDTH = 1000;
  const LOW_RES_MIN_HEIGHT = 1400;

  const $ = (id) => document.getElementById(id);
  const elements = {
    form: $('projectForm'), title: $('titleInput'), slug: $('slugInput'), format: $('formatInput'),
    width: $('widthInput'), height: $('heightInput'), orientation: $('orientationInput'), totalPages: $('totalPagesInput'),
    buyText: $('buyTextInput'), buyUrl: $('buyUrlInput'), images: $('imagesInput'), zip: $('zipInput'), drop: $('dropZone'),
    messages: $('messages'), pageGrid: $('pageGrid'), draftList: $('draftList'), draftCount: $('draftCount'), saveStatus: $('saveStatus'),
    samplePages: $('samplePages'), sampleFormat: $('sampleFormat'), sampleDimensions: $('sampleDimensions'), sampleRatio: $('sampleRatio'),
    sampleWeight: $('sampleWeight'), productPages: $('productPages'), blank: $('blankPageButton'),
    duplicate: $('duplicateButton'), replace: $('replaceButton'), replaceInput: $('replaceInput'), deletePage: $('deletePageButton'),
    preview: $('previewButton'), save: $('saveDraftButton'), deleteDraft: $('deleteDraftButton'), exportJson: $('exportJsonButton'),
    exportZip: $('exportZipButton'), newProject: $('newProjectButton'), modal: $('previewModal'), frame: $('previewFrame'),
    closePreview: $('closePreviewButton'), reorderHelp: $('reorderHelp'), viewerTemplate: $('viewerTemplate'),
    dataSection: $('dataSection'), pagesSection: $('pagesSection'), organizerSection: $('organizerSection'),
    steps: [...document.querySelectorAll('.step-button')]
  };

  let db;
  let project;
  let selectedPageId = null;
  let dragPageId = null;
  let dragJustEnded = false;
  let thumbnailUrls = [];
  let previewUrls = [];

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const slugify = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const extensionFor = (page) => page.type === 'image/jpeg' ? 'jpg' : page.type === 'image/webp' ? 'webp' : 'png';
  const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const pageNumber = (index, count) => String(index + 1).padStart(Math.max(2, String(count).length), '0');

  function emptyProject() {
    return { id: uid(), title: '', slug: '', format: 'A5', width: 148, height: 210, orientation: 'vertical', totalProductPages: 180, buyButtonText: 'Comprar esta agenda', purchaseUrl: '', pages: [], updatedAt: Date.now() };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function storeRequest(mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function listDrafts() {
    const drafts = await storeRequest('readonly', (store) => store.getAll());
    drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    elements.draftCount.textContent = drafts.length;
    elements.draftList.innerHTML = drafts.length ? '' : '<p class="empty-copy">Todavía no hay borradores.</p>';
    drafts.forEach((draft) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `draft-item${draft.id === project.id ? ' is-active' : ''}`;
      button.innerHTML = `<strong>${escapeHtml(draft.title || 'Muestra sin título')}</strong><span>${draft.pages.length} páginas · ${draft.format}</span>`;
      button.addEventListener('click', () => loadProject(draft));
      elements.draftList.appendChild(button);
    });
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
  }

  function setDirty() {
    elements.saveStatus.textContent = project?.remotePreviewId ? 'Cambios locales sin sincronizar' : 'Sin guardar';
    elements.saveStatus.classList.remove('is-saved');
  }

  function syncProjectFromForm() {
    project.title = elements.title.value.trim();
    project.slug = slugify(elements.slug.value);
    project.format = elements.format.value;
    project.width = Number(elements.width.value);
    project.height = Number(elements.height.value);
    project.orientation = elements.orientation.value;
    project.totalProductPages = Number(elements.totalPages.value);
    project.buyButtonText = elements.buyText.value.trim();
    project.purchaseUrl = elements.buyUrl.value.trim();
  }

  function loadProject(nextProject, saved = true) {
    project = nextProject;
    project.pages = Array.isArray(project.pages) ? project.pages : [];
    project.pendingRemoteDeletes = Array.isArray(project.pendingRemoteDeletes) ? project.pendingRemoteDeletes : [];
    selectedPageId = null;
    elements.title.value = project.title || '';
    elements.slug.value = project.slug || '';
    elements.slug.dataset.edited = project.slug ? 'true' : '';
    elements.format.value = project.format || 'A5';
    elements.width.value = project.width || 148;
    elements.height.value = project.height || 210;
    elements.orientation.value = project.orientation || 'vertical';
    elements.totalPages.value = project.totalProductPages || 180;
    elements.buyText.value = project.buyButtonText || 'Comprar esta agenda';
    elements.buyUrl.value = project.purchaseUrl || '';
    setDimensionAccess();
    if (saved) setSaved(); else setDirty();
    renderAll();
    listDrafts();
  }

  function setSaved() {
    elements.saveStatus.textContent = project?.remotePreviewId ? 'Borrador local guardado' : 'Borrador guardado';
    elements.saveStatus.classList.add('is-saved');
  }

  function setRemoteSaved() {
    elements.saveStatus.textContent = 'Sincronizado con Supabase';
    elements.saveStatus.classList.add('is-saved');
  }

  function setDimensionAccess() {
    const custom = elements.format.value === 'Personalizado';
    elements.width.disabled = !custom;
    elements.height.disabled = !custom;
  }

  function applyKnownSize() {
    const size = FORMAT_SIZES[elements.format.value];
    if (size) {
      const horizontal = elements.orientation.value === 'horizontal';
      elements.width.value = horizontal ? size[1] : size[0];
      elements.height.value = horizontal ? size[0] : size[1];
    }
    setDimensionAccess();
    syncProjectFromForm();
    renderAll();
    setDirty();
  }

  function addMessage(text, type = 'info') {
    const node = document.createElement('div');
    node.className = `message${type === 'info' ? '' : ` message--${type}`}`;
    node.textContent = text;
    elements.messages.appendChild(node);
  }

  function clearMessages() { elements.messages.innerHTML = ''; }

  async function decodeImage(blob) {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }

  async function inspectImage(blob, name) {
    if (!IMAGE_TYPES.has(blob.type)) throw new Error(`${name}: formato no admitido.`);
    try {
      const dimensions = await decodeImage(blob);
      if (!dimensions.width || !dimensions.height) throw new Error('sin dimensiones');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return { id: uid(), name, blob, type: blob.type, size: blob.size, width: dimensions.width, height: dimensions.height, ratio: dimensions.width / dimensions.height, hash, warnings: [], isBlank: false };
    } catch (_) {
      throw new Error(`${name}: la imagen está dañada o no puede leerse.`);
    }
  }

  function refreshWarnings() {
    if (!project.pages.length) return;
    const ratios = project.pages.map((page) => page.ratio).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    const expected = project.width > 0 && project.height > 0 ? project.width / project.height : median;
    const hashes = new Map();
    project.pages.forEach((page) => {
      page.warnings = [];
      if (Math.abs(page.ratio - median) / median > RATIO_TOLERANCE) page.warnings.push(`Proporción distinta al resto (${page.width} × ${page.height} px).`);
      if (Math.abs(page.ratio - expected) / expected > RATIO_TOLERANCE) page.warnings.push(`No coincide con la proporción ${project.width}:${project.height}.`);
      if (page.width < LOW_RES_MIN_WIDTH || page.height < LOW_RES_MIN_HEIGHT) page.warnings.push(`Resolución baja: ${page.width} × ${page.height} px.`);
      const validateDuplicate = !page.generated && !page.intentionalDuplicate && !page.isBlank && page.type !== 'blank';
      if (validateDuplicate && hashes.has(page.hash)) {
        page.warnings.push(`Archivo duplicado de ${hashes.get(page.hash)}.`);
      } else if (validateDuplicate) hashes.set(page.hash, page.name);
    });
  }

  async function addImageFiles(files) {
    clearMessages();
    const sorted = [...files].filter((file) => IMAGE_TYPES.has(file.type) || typeFromName(file.name)).sort(naturalSort);
    if (!sorted.length) return addMessage('No se encontraron imágenes PNG, JPG/JPEG o WebP.', 'error');
    let accepted = 0;
    for (const file of sorted) {
      try {
        const type = IMAGE_TYPES.has(file.type) ? file.type : typeFromName(file.name);
        const blob = file.type === type ? file : file.slice(0, file.size, type);
        project.pages.push(await inspectImage(blob, file.name)); accepted++;
      }
      catch (error) { addMessage(error.message, 'error'); }
    }
    refreshWarnings();
    renderAll();
    setDirty();
    addMessage(`${accepted} imagen${accepted === 1 ? '' : 'es'} añadida${accepted === 1 ? '' : 's'} en orden numérico.`);
  }

  function validZipPath(path) {
    const parts = path.replace(/\\/g, '/').split('/');
    const name = parts.at(-1);
    return name && !parts.some((part) => part.startsWith('.') || part === '__MACOSX') && !['thumbs.db', 'desktop.ini'].includes(name.toLowerCase());
  }

  function typeFromName(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ext === 'png' ? 'image/png' : ['jpg', 'jpeg'].includes(ext) ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : '';
  }

  async function importZip(file) {
    clearMessages();
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && validZipPath(entry.name) && typeFromName(entry.name)).map((entry) => ({ entry, name: entry.name.split('/').pop() })).sort(naturalSort);
      if (!entries.length) return addMessage('El ZIP no contiene imágenes admitidas.', 'error');
      let accepted = 0;
      for (const { entry, name } of entries) {
        try {
          const type = typeFromName(name);
          const blob = await entry.async('blob');
          project.pages.push(await inspectImage(blob.slice(0, blob.size, type), name));
          accepted++;
        } catch (error) { addMessage(error.message, 'error'); }
      }
      refreshWarnings();
      renderAll();
      setDirty();
      addMessage(`ZIP importado: ${accepted} imágenes detectadas y ordenadas.`);
    } catch (_) { addMessage('No se pudo abrir el ZIP. Comprueba que el archivo sea válido.', 'error'); }
  }

  function renderSummary() {
    syncProjectFromForm();
    const pages = project.pages;
    const totalSize = pages.reduce((sum, page) => sum + page.size, 0);
    const avgWidth = pages.length ? Math.round(pages.reduce((sum, page) => sum + page.width, 0) / pages.length) : 0;
    const avgHeight = pages.length ? Math.round(pages.reduce((sum, page) => sum + page.height, 0) / pages.length) : 0;
    elements.samplePages.textContent = `${pages.length} página${pages.length === 1 ? '' : 's'}`;
    elements.sampleFormat.textContent = project.format;
    elements.sampleDimensions.textContent = pages.length ? `${avgWidth} × ${avgHeight} px` : '—';
    elements.sampleRatio.textContent = pages.length ? (avgWidth / avgHeight).toFixed(3) : '—';
    elements.sampleWeight.textContent = pages.length ? formatBytes(totalSize) : '0 MB';
    elements.productPages.textContent = `${project.totalProductPages || 0} páginas`;
    elements.pageGrid.style.setProperty('--page-ratio', `${project.width || 148}/${project.height || 210}`);
  }

  function renderPages() {
    thumbnailUrls.forEach(URL.revokeObjectURL);
    thumbnailUrls = [];
    elements.pageGrid.innerHTML = project.pages.length ? '' : '<p class="empty-pages">Las miniaturas aparecerán aquí respetando el orden numérico.</p>';
    project.pages.forEach((page, index) => {
      const url = URL.createObjectURL(page.blob);
      thumbnailUrls.push(url);
      const card = document.createElement('article');
      card.className = `page-card${page.id === selectedPageId ? ' is-selected' : ''}`;
      card.dataset.id = page.id;
      card.draggable = true;
      const displayName = page.generated || page.type === 'blank' || page.isBlank ? 'Página blanca' : page.name;
      card.innerHTML = `<img src="${url}" alt="Página ${index + 1}"><span class="page-number">${pageNumber(index, project.pages.length)}</span>${page.warnings.length ? `<span class="page-warning" title="${escapeHtml(page.warnings.join(' '))}">!</span>` : ''}<div class="page-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>`;
      card.addEventListener('click', () => { if (dragJustEnded) return; selectedPageId = page.id; renderPages(); updatePageButtons(); });
      card.addEventListener('dragstart', (event) => { dragPageId = page.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', page.id); requestAnimationFrame(() => card.classList.add('is-dragging')); });
      card.addEventListener('dragend', () => { dragPageId = null; dragJustEnded = true; clearDropIndicators(); card.classList.remove('is-dragging'); setTimeout(() => { dragJustEnded = false; }, 0); });
      card.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; showDropIndicator(card, event.clientX); });
      card.addEventListener('dragleave', (event) => { if (!card.contains(event.relatedTarget)) card.classList.remove('is-drop-before', 'is-drop-after'); });
      card.addEventListener('drop', (event) => { event.preventDefault(); const after = card.classList.contains('is-drop-after'); reorderPage(dragPageId || event.dataTransfer.getData('text/plain'), page.id, after); clearDropIndicators(); });
      elements.pageGrid.appendChild(card);
    });
    updatePageButtons();
  }

  function updatePageButtons() {
    const selected = project.pages.some((page) => page.id === selectedPageId);
    elements.duplicate.disabled = !selected;
    elements.replace.disabled = !selected;
    elements.deletePage.disabled = !selected;
    elements.reorderHelp.textContent = 'Arrastra las páginas para cambiar su orden o selecciónalas para duplicar, reemplazar o eliminar.';
  }

  function renderWarnings() {
    const warningPages = project.pages.filter((page) => page.warnings.length);
    const previousInfo = [...elements.messages.querySelectorAll('.message:not(.message--warning)')].map((node) => ({ text: node.textContent, error: node.classList.contains('message--error') }));
    elements.messages.innerHTML = '';
    previousInfo.forEach((item) => addMessage(item.text, item.error ? 'error' : 'info'));
    warningPages.forEach((page, index) => addMessage(`Página ${project.pages.indexOf(page) + 1} (${page.name}): ${page.warnings.join(' ')}`, 'warning'));
  }

  function renderAll() { refreshWarnings(); renderSummary(); renderPages(); renderWarnings(); }

  function clearDropIndicators() {
    elements.pageGrid.querySelectorAll('.is-drop-before, .is-drop-after').forEach((card) => card.classList.remove('is-drop-before', 'is-drop-after'));
  }

  function showDropIndicator(card, pointerX) {
    clearDropIndicators();
    const bounds = card.getBoundingClientRect();
    card.classList.add(pointerX >= bounds.left + bounds.width / 2 ? 'is-drop-after' : 'is-drop-before');
  }

  function reorderPage(sourceId, targetId, after = false) {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = project.pages.findIndex((page) => page.id === sourceId);
    const targetIndex = project.pages.findIndex((page) => page.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [page] = project.pages.splice(sourceIndex, 1);
    const adjustedTarget = project.pages.findIndex((item) => item.id === targetId);
    project.pages.splice(adjustedTarget + (after ? 1 : 0), 0, page);
    renderAll();
    setDirty();
  }

  async function addBlankPage() {
    syncProjectFromForm();
    const avgHeight = project.pages.length ? Math.round(project.pages.reduce((sum, page) => sum + page.height, 0) / project.pages.length) : 2000;
    const height = Math.max(1, avgHeight);
    const width = Math.max(1, Math.round(height * project.width / project.height));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const page = { id: uid(), name: 'Página blanca', blob, type: 'blank', mimeType: 'image/png', size: blob.size, width, height, ratio: width / height, hash: null, warnings: [], isBlank: true, generated: true };
    const selectedIndex = project.pages.findIndex((item) => item.id === selectedPageId);
    project.pages.splice(selectedIndex >= 0 ? selectedIndex + 1 : project.pages.length, 0, page);
    selectedPageId = page.id;
    renderAll(); setDirty();
  }

  function duplicateSelected() {
    const index = project.pages.findIndex((page) => page.id === selectedPageId);
    if (index < 0) return;
    const source = project.pages[index];
    const isBlank = source.generated || source.type === 'blank' || source.isBlank;
    if (!isBlank && !(source.blob instanceof Blob)) {
      addMessage('Para duplicar esta imagen debes volver a cargar el archivo original.', 'warning');
      return;
    }
    const copy = { ...source, id: uid(), name: isBlank ? 'Página blanca' : `${source.name.replace(/(\.[^.]+)$/, '')}-copia.${extensionFor(source)}`, warnings: [], intentionalDuplicate: !isBlank || source.intentionalDuplicate };
    delete copy.remotePageId;
    delete copy.remoteStoragePath;
    delete copy.remoteObjectVersion;
    delete copy.remoteHash;
    delete copy.pendingUpload;
    project.pages.splice(index + 1, 0, copy);
    selectedPageId = copy.id;
    renderAll(); setDirty();
  }

  function deleteSelected() {
    const index = project.pages.findIndex((page) => page.id === selectedPageId);
    if (index < 0) return;
    const [removed] = project.pages.splice(index, 1);
    if (removed.remotePageId && !project.pendingRemoteDeletes.includes(removed.remotePageId)) {
      project.pendingRemoteDeletes.push(removed.remotePageId);
    }
    selectedPageId = null;
    renderAll(); setDirty();
  }

  async function replaceSelected(file) {
    const index = project.pages.findIndex((page) => page.id === selectedPageId);
    if (index < 0 || !file) return;
    clearMessages();
    try {
      const replacement = await inspectImage(file, file.name);
      replacement.id = selectedPageId;
      const previous = project.pages[index];
      replacement.remotePageId = previous.remotePageId;
      replacement.remoteStoragePath = previous.remoteStoragePath;
      replacement.remoteObjectVersion = previous.remoteObjectVersion;
      replacement.remoteHash = previous.remoteHash;
      replacement.needsUpload = Boolean(previous.remotePageId);
      project.pages[index] = replacement;
      renderAll(); setDirty();
    } catch (error) { addMessage(error.message, 'error'); }
  }

  function validateProject() {
    syncProjectFromForm();
    if (!elements.form.reportValidity()) return false;
    if (!project.slug) { addMessage('Escribe un slug válido.', 'error'); return false; }
    if (!project.pages.length) { addMessage('Añade al menos una página para continuar.', 'error'); return false; }
    return true;
  }

  function configuration(fileNames) {
    return { slug: project.slug, title: project.title, format: project.format, width: project.width, height: project.height, orientation: project.orientation, totalProductPages: project.totalProductPages, buyButtonText: project.buyButtonText || '', purchaseUrl: project.purchaseUrl || '', previewPages: fileNames };
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    if (!validateProject()) return;
    const files = project.pages.map((page, index) => `previews/${project.slug}/${pageNumber(index, project.pages.length)}.${extensionFor(page)}`);
    downloadBlob(new Blob([JSON.stringify(configuration(files), null, 2)], { type: 'application/json' }), `${project.slug}-config.json`);
  }

  async function exportZip() {
    if (!validateProject()) return;
    const zip = new JSZip();
    const folder = zip.folder(`previews/${project.slug}`);
    const files = [];
    project.pages.forEach((page, index) => {
      const fileName = `${pageNumber(index, project.pages.length)}.${extensionFor(page)}`;
      files.push(`previews/${project.slug}/${fileName}`);
      folder.file(fileName, page.blob, { binary: true });
    });
    zip.file('config.json', JSON.stringify(configuration(files), null, 2));
    downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), `${project.slug}-preview.zip`);
  }

  async function saveDraft(event) {
    if (event) event.preventDefault();
    if (!validateProject()) return false;
    project.updatedAt = Date.now();
    await storeRequest('readwrite', (store) => store.put(project));
    setSaved();
    setActiveStep('save');
    await listDrafts();
    return true;
  }

  async function saveLocalCheckpoint() {
    project.updatedAt = Date.now();
    await storeRequest('readwrite', (store) => store.put(project));
    setSaved();
    await listDrafts();
    return project;
  }

  async function deleteDraft() {
    if (!project) return;
    if (!confirm('¿Eliminar este borrador del navegador?')) return;
    await storeRequest('readwrite', (store) => store.delete(project.id));
    loadProject(emptyProject(), false);
  }

  function viewerDocument(config) {
    const base = new URL('./', window.location.href).href;
    const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="${base}"><title>Vista previa · Studio Sareschi</title><link rel="stylesheet" href="styles.css"></head><body>${elements.viewerTemplate.innerHTML}<script>window.__AGENDA_PREVIEW_CONFIG__=${safeConfig}<\/script><script src="vendor/page-flip.browser.js"><\/script><script src="app.js"><\/script><script>addEventListener('DOMContentLoaded',()=>document.getElementById('closeButton').addEventListener('click',event=>{event.stopImmediatePropagation();parent.postMessage('close-agenda-preview','*')},true))<\/script></body></html>`;
  }

  async function createPreviewPageUrl(page) {
    if (!(page.generated || page.type === 'blank' || page.isBlank)) return URL.createObjectURL(page.blob);

    const pageRatio = Math.max(0.05, Number(project.width) / Math.max(1, Number(project.height)));
    const longEdge = 2000;
    const width = pageRatio <= 1 ? Math.max(1, Math.round(longEdge * pageRatio)) : longEdge;
    const height = pageRatio <= 1 ? longEdge : Math.max(1, Math.round(longEdge / pageRatio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('No se pudo preparar la página blanca.')),
      'image/png'
    ));
    return URL.createObjectURL(blob);
  }

  async function openPreview() {
    if (!validateProject()) return;
    setActiveStep('preview');
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = await Promise.all(project.pages.map(createPreviewPageUrl));
    const previewConfig = configuration(previewUrls);
    elements.frame.srcdoc = viewerDocument(previewConfig);
    elements.modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  async function closePreview() {
    const previewWindow = elements.frame.contentWindow;
    if (previewWindow && previewWindow.__viewerDebug && previewWindow.__viewerDebug.destroy) await previewWindow.__viewerDebug.destroy();
    elements.modal.hidden = true;
    elements.frame.src = 'about:blank';
    elements.frame.removeAttribute('srcdoc');
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    document.body.style.overflow = '';
    updateActiveFromViewport();
  }

  function setActiveStep(step) {
    elements.steps.forEach((button) => button.classList.toggle('is-active', button.dataset.step === step));
  }

  function focusSection(section) {
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateActiveFromViewport() {
    const candidates = [
      { step: 'data', distance: Math.abs(elements.dataSection.getBoundingClientRect().top - 116) },
      { step: 'pages', distance: Math.min(Math.abs(elements.pagesSection.getBoundingClientRect().top - 116), Math.abs(elements.organizerSection.getBoundingClientRect().top - 116)) }
    ];
    candidates.sort((a, b) => a.distance - b.distance);
    setActiveStep(candidates[0].step);
  }

  function activateStep(step) {
    if (step === 'data') focusSection(elements.dataSection);
    if (step === 'pages') focusSection(elements.pagesSection);
    if (step === 'preview') openPreview();
    if (step === 'save') saveDraft();
    if (step === 'data' || step === 'pages') setActiveStep(step);
  }

  function handleDrop(event) {
    event.preventDefault(); elements.drop.classList.remove('is-over');
    const files = [...event.dataTransfer.files];
    const zip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
    if (zip) importZip(zip); else addImageFiles(files);
  }

  elements.title.addEventListener('input', () => { if (!elements.slug.dataset.edited) elements.slug.value = slugify(elements.title.value); syncProjectFromForm(); setDirty(); });
  elements.slug.addEventListener('input', () => { elements.slug.dataset.edited = 'true'; elements.slug.value = slugify(elements.slug.value); syncProjectFromForm(); setDirty(); });
  [elements.width, elements.height].forEach((input) => input.addEventListener('input', () => { syncProjectFromForm(); renderAll(); setDirty(); }));
  [elements.totalPages, elements.buyText, elements.buyUrl].forEach((input) => input.addEventListener('input', () => { syncProjectFromForm(); renderSummary(); setDirty(); }));
  elements.format.addEventListener('change', applyKnownSize);
  elements.orientation.addEventListener('change', applyKnownSize);
  elements.images.addEventListener('change', () => { addImageFiles(elements.images.files); elements.images.value = ''; });
  elements.zip.addEventListener('change', () => { if (elements.zip.files[0]) importZip(elements.zip.files[0]); elements.zip.value = ''; });
  elements.drop.addEventListener('dragover', (event) => { event.preventDefault(); elements.drop.classList.add('is-over'); });
  elements.drop.addEventListener('dragleave', () => elements.drop.classList.remove('is-over'));
  elements.drop.addEventListener('drop', handleDrop);
  elements.blank.addEventListener('click', addBlankPage);
  elements.duplicate.addEventListener('click', duplicateSelected);
  elements.deletePage.addEventListener('click', deleteSelected);
  elements.replace.addEventListener('click', () => elements.replaceInput.click());
  elements.replaceInput.addEventListener('change', () => { replaceSelected(elements.replaceInput.files[0]); elements.replaceInput.value = ''; });
  elements.form.addEventListener('submit', saveDraft);
  elements.deleteDraft.addEventListener('click', deleteDraft);
  elements.exportJson.addEventListener('click', exportJson);
  elements.exportZip.addEventListener('click', exportZip);
  elements.preview.addEventListener('click', openPreview);
  elements.closePreview.addEventListener('click', closePreview);
  elements.newProject.addEventListener('click', () => loadProject(emptyProject(), false));
  elements.steps.forEach((button) => button.addEventListener('click', () => activateStep(button.dataset.step)));
  window.addEventListener('message', (event) => { if (event.source === elements.frame.contentWindow && event.data === 'close-agenda-preview') closePreview(); });
  window.addEventListener('scroll', () => { if (elements.modal.hidden) updateActiveFromViewport(); }, { passive: true });
  window.addEventListener('beforeunload', () => { thumbnailUrls.forEach(URL.revokeObjectURL); previewUrls.forEach(URL.revokeObjectURL); });

  window.AgendaSampleManager = {
    getProject() {
      syncProjectFromForm();
      return project;
    },
    loadProject,
    inspectImage,
    renderAll,
    setDirty,
    setSaved,
    setRemoteSaved,
    addMessage,
    clearMessages,
    saveLocalCheckpoint,
    validateProject,
    uid,
  };

  (async function init() {
    try {
      db = await openDatabase();
      const drafts = await storeRequest('readonly', (store) => store.getAll());
      const latest = drafts.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      loadProject(latest || emptyProject(), Boolean(latest));
      window.dispatchEvent(new CustomEvent('agenda-manager-ready'));
    } catch (_) {
      project = emptyProject(); loadProject(project);
      addMessage('IndexedDB no está disponible en este navegador; el borrador no podrá persistir.', 'error');
      elements.save.disabled = true;
      window.dispatchEvent(new CustomEvent('agenda-manager-ready'));
    }
  })();
})();
