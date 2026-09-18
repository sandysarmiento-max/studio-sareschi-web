(function () {
  'use strict';

  const manager = window.AgendaSampleManager;
  const template = document.getElementById('viewerTemplate');
  const directButton = document.getElementById('previewButton');
  const stepButton = document.querySelector('.step-button[data-step="preview"]');

  if (!manager || !template || !directButton || !stepButton) return;

  let previewWindow = null;
  let previewUrls = [];

  function configuration(project, fileNames) {
    return {
      slug: project.slug,
      title: project.title,
      format: project.format,
      width: project.width,
      height: project.height,
      orientation: project.orientation,
      totalProductPages: project.totalProductPages,
      buyButtonText: project.buyButtonText || '',
      purchaseUrl: project.purchaseUrl || '',
      previewPages: fileNames,
    };
  }

  async function createPreviewPageUrl(page, project) {
    if (!(page.generated || page.type === 'blank' || page.isBlank)) {
      if (!(page.blob instanceof Blob)) throw new Error(`No se pudo leer ${page.name || 'una página'}.`);
      return URL.createObjectURL(page.blob);
    }

    const pageRatio = Math.max(0.05, Number(project.width) / Math.max(1, Number(project.height)));
    const longEdge = 2000;
    const width = pageRatio <= 1 ? Math.max(1, Math.round(longEdge * pageRatio)) : longEdge;
    const height = pageRatio <= 1 ? longEdge : Math.max(1, Math.round(longEdge / pageRatio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No se pudo preparar una página blanca.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('No se pudo preparar la página blanca.')),
      'image/png'
    ));
    return URL.createObjectURL(blob);
  }

  function revokePreviewUrls() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  function setPreviewStep() {
    document.querySelectorAll('.step-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.step === 'preview');
    });
  }

  function viewerDocument(config) {
    const base = new URL('./', window.location.href).href;
    const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <base href="${base}">
  <title>Vista previa · Studio Sareschi</title>
  <link rel="stylesheet" href="/hojear/viewer.css">
  <link rel="stylesheet" href="/hojear/viewer-depth.css">
</head>
<body>
${template.innerHTML}
<script>window.__AGENDA_PREVIEW_CONFIG__=${safeConfig}<\/script>
<script src="https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js"><\/script>
<script src="app.js"><\/script>
<script>
(function(){
  function tellOpener(){
    try { if (window.opener && !window.opener.closed) window.opener.postMessage('close-agenda-preview-window', window.location.origin); } catch (_) {}
  }
  addEventListener('DOMContentLoaded', function(){
    var closeButton = document.getElementById('closeButton');
    if (closeButton) closeButton.addEventListener('click', function(event){
      event.preventDefault();
      event.stopImmediatePropagation();
      tellOpener();
      window.close();
    }, true);
  });
  addEventListener('pagehide', tellOpener, { once: true });
})();
<\/script>
</body>
</html>`;
  }

  async function cleanup(closeWindow) {
    if (closeWindow && previewWindow && !previewWindow.closed) {
      try {
        if (previewWindow.__viewerDebug?.destroy) await previewWindow.__viewerDebug.destroy();
      } catch (_) {}
      try { previewWindow.close(); } catch (_) {}
    }
    previewWindow = null;
    revokePreviewUrls();
  }

  async function openNormalPreview(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (!manager.validateProject()) return;

    const project = manager.getProject();
    if (!project || !Array.isArray(project.pages) || !project.pages.length) return;

    setPreviewStep();
    await cleanup(true);

    try {
      previewUrls = await Promise.all(project.pages.map((page) => createPreviewPageUrl(page, project)));
      const config = configuration(project, previewUrls);

      previewWindow = window.open('', 'studio-sareschi-agenda-preview');
      if (!previewWindow) {
        revokePreviewUrls();
        manager.addMessage('El navegador bloqueó la vista previa. Permite ventanas emergentes para este sitio e inténtalo otra vez.', 'warning');
        return;
      }

      previewWindow.document.open();
      previewWindow.document.write(viewerDocument(config));
      previewWindow.document.close();
      previewWindow.focus();
    } catch (error) {
      await cleanup(true);
      manager.addMessage(error.message || 'No se pudo abrir la vista previa.', 'error');
    }
  }

  function interceptPreviewClick(event) {
    const target = event.target.closest?.('#previewButton, .step-button[data-step="preview"]');
    if (!target) return;
    void openNormalPreview(event);
  }

  document.addEventListener('click', interceptPreviewClick, true);
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== previewWindow) return;
    if (event.data === 'close-agenda-preview-window') void cleanup(false);
  });
  window.addEventListener('beforeunload', () => {
    if (previewWindow && !previewWindow.closed) {
      try { previewWindow.close(); } catch (_) {}
    }
    revokePreviewUrls();
  });
})();
