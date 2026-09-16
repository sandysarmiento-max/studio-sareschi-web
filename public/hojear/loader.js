(function () {
  'use strict';

  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const state = document.getElementById('publicState');
  const stateTitle = document.getElementById('publicStateTitle');
  const stateText = document.getElementById('publicStateText');
  const stateLink = document.getElementById('publicStateLink');
  const viewer = document.getElementById('viewerShell');
  const buyButton = document.getElementById('publicBuyButton');
  const closeButton = document.getElementById('closeButton');
  const generatedBlankUrls = [];

  function showUnavailable() {
    viewer.hidden = true;
    state.hidden = false;
    stateTitle.textContent = 'Muestra no disponible';
    stateText.textContent = 'Esta muestra todavía no está disponible para hojear.';
    stateLink.hidden = false;
    document.title = 'Muestra no disponible · Studio Sareschi';
  }

  function normalizeSlug(value) {
    const slug = String(value || '').trim().toLowerCase();
    if (slug.length < 2 || slug.length > 100 || !SLUG_PATTERN.test(slug)) return '';
    return slug;
  }

  function safeHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (_error) {
      return '';
    }
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('No se pudo generar la página blanca.')),
        'image/png'
      );
    });
  }

  async function createBlankPageUrl(preview) {
    const widthMm = Math.max(1, Number(preview.width_mm) || 1);
    const heightMm = Math.max(1, Number(preview.height_mm) || 1);
    const ratio = Math.max(0.05, widthMm / heightMm);
    const longEdge = 2000;
    const width = ratio <= 1 ? Math.max(1, Math.round(longEdge * ratio)) : longEdge;
    const height = ratio <= 1 ? longEdge : Math.max(1, Math.round(longEdge / ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas no disponible.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const url = URL.createObjectURL(await canvasToBlob(canvas));
    generatedBlankUrls.push(url);
    return url;
  }

  async function pageUrls(preview, pages) {
    const ordered = [...pages].sort((a, b) => Number(a.position) - Number(b.position));
    const urls = [];
    for (const page of ordered) {
      if (page.page_type === 'blank') {
        urls.push(await createBlankPageUrl(preview));
        continue;
      }
      const signedUrl = safeHttpsUrl(page.signed_url);
      if (!signedUrl) throw new Error('Página sin URL firmada.');
      urls.push(signedUrl);
    }
    return urls;
  }

  function configureBuyButton(preview) {
    const buyUrl = safeHttpsUrl(preview.buy_url);
    if (!buyUrl) {
      buyButton.hidden = true;
      buyButton.removeAttribute('href');
      return;
    }
    buyButton.href = buyUrl;
    buyButton.textContent = String(preview.buy_button_text || 'Comprar esta agenda');
    buyButton.hidden = false;
  }

  function loadApprovedViewer() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/admin/agenda-previews/app.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar el visor.'));
      document.body.appendChild(script);
    });
  }

  function installPublicClose() {
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.history.length > 1) window.history.back();
      else window.location.href = '/pdfs/';
    }, true);
  }

  async function start() {
    const params = new URLSearchParams(window.location.search);
    const slug = normalizeSlug(params.get('agenda'));
    if (!slug) {
      showUnavailable();
      return;
    }

    try {
      const response = await fetch(
        `/api/pdf-access?action=agenda-preview&agenda=${encodeURIComponent(slug)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        showUnavailable();
        return;
      }

      const payload = await response.json();
      const preview = payload?.preview;
      const pages = Array.isArray(payload?.pages) ? payload.pages : [];
      if (!preview || !pages.length) {
        showUnavailable();
        return;
      }

      const previewPages = await pageUrls(preview, pages);
      if (!previewPages.length) {
        showUnavailable();
        return;
      }

      window.__AGENDA_PREVIEW_CONFIG__ = {
        slug: String(preview.slug || slug),
        title: String(preview.title || 'Vista previa'),
        format: String(preview.format || ''),
        width: Number(preview.width_mm),
        height: Number(preview.height_mm),
        orientation: preview.orientation === 'landscape' ? 'horizontal' : 'vertical',
        totalProductPages: Number(preview.total_product_pages),
        previewPages,
        // Rama experimental: activa páginas HTML con portada y contraportada HARD.
        // El gestor local no recibe esta bandera y conserva el render Canvas aprobado.
        hardCovers: true,
      };

      configureBuyButton(preview);
      installPublicClose();
      state.hidden = true;
      viewer.hidden = false;
      await loadApprovedViewer();
    } catch (_error) {
      showUnavailable();
    }
  }

  window.addEventListener('pagehide', () => {
    generatedBlankUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  start();
})();
