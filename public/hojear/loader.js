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
  const generatedPageUrls = [];
  let zoomBaseWidth = 0;
  let zoomBaseHeight = 0;

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

  async function decodeImageUrl(url) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    if (typeof image.decode === 'function') {
      try {
        await image.decode();
        return;
      } catch (_error) {
        // Algunos navegadores rechazan decode() aunque onload funcione correctamente.
      }
    }
    await new Promise((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo preparar una página de la muestra.'));
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
    generatedPageUrls.push(url);
    await decodeImageUrl(url);
    return url;
  }

  async function createImagePageUrl(signedUrl) {
    const response = await fetch(signedUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar una página de la muestra.');
    const blob = await response.blob();
    if (!String(blob.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('La página recibida no es una imagen válida.');
    }
    const url = URL.createObjectURL(blob);
    generatedPageUrls.push(url);
    await decodeImageUrl(url);
    return url;
  }

  async function pageUrls(preview, pages) {
    const ordered = [...pages].sort((a, b) => Number(a.position) - Number(b.position));
    return Promise.all(ordered.map(async (page) => {
      if (page.page_type === 'blank') return createBlankPageUrl(preview);
      const signedUrl = safeHttpsUrl(page.signed_url);
      if (!signedUrl) throw new Error('Página sin URL firmada.');
      return createImagePageUrl(signedUrl);
    }));
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

  function installPublicHardCoverStyles() {
    const existing = document.querySelector('link[data-public-hard-cover-styles]');
    if (existing) {
      if (existing.sheet) return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar el acabado del visor.')), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/hojear/hard-covers.css';
      link.dataset.publicHardCoverStyles = '1';
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('No se pudo cargar el acabado del visor.'));
      document.head.appendChild(link);
    });
  }

  function installPublicHardCoverAdapter() {
    const OriginalPageFlip = window.St && window.St.PageFlip;
    if (!OriginalPageFlip || OriginalPageFlip.__studioPublicHardCoverAdapter) return;

    class PublicPageFlip extends OriginalPageFlip {
      constructor(...args) {
        super(...args);
        window.__studioPublicPageFlip = this;
      }

      loadFromImages(images) {
        const sources = Array.from(images || []);
        if (sources.length <= 1) return super.loadFromImages(images);

        const lastIndex = sources.length - 1;
        const pages = sources.map((source, index) => {
          const page = document.createElement('div');
          page.className = 'agenda-preview-page';
          page.dataset.density = index <= 1 || index >= lastIndex - 1 ? 'hard' : 'soft';
          page.style.background = '#fff';
          page.style.overflow = 'hidden';

          const image = document.createElement('img');
          image.src = source;
          image.alt = '';
          image.draggable = false;
          image.decoding = 'sync';
          image.style.display = 'block';
          image.style.width = '100%';
          image.style.height = '100%';
          image.style.objectFit = 'fill';
          image.style.userSelect = 'none';
          image.style.webkitUserDrag = 'none';
          image.setAttribute('aria-hidden', 'true');

          page.appendChild(image);
          return page;
        });

        const book = document.getElementById('book');
        if (book) {
          book.classList.add('public-hard-cover-book');
          book.replaceChildren(...pages);
        }
        return super.loadFromHTML(pages);
      }
    }

    PublicPageFlip.__studioPublicHardCoverAdapter = true;
    window.St.PageFlip = PublicPageFlip;
  }

  function clearPublicZoomLayout() {
    const viewport = document.getElementById('bookViewport');
    const position = document.getElementById('bookPosition');
    const scale = document.getElementById('bookScale');
    zoomBaseWidth = 0;
    zoomBaseHeight = 0;
    if (viewport) {
      viewport.style.display = '';
      viewport.style.alignItems = '';
      viewport.style.justifyContent = '';
    }
    if (position) {
      position.style.position = '';
      position.style.flex = '';
      position.style.margin = '';
      position.style.width = '';
      position.style.height = '';
      position.style.transform = '';
    }
    if (scale) {
      scale.style.position = '';
      scale.style.left = '';
      scale.style.top = '';
      scale.style.width = '';
      scale.style.height = '';
      scale.style.transformOrigin = '';
      scale.style.transform = '';
    }
  }

  function publicZoomLevel() {
    const output = document.getElementById('zoomValue');
    const value = Number.parseInt(String(output && output.textContent || '100'), 10);
    return Number.isFinite(value) ? Math.max(.8, Math.min(1.5, value / 100)) : 1;
  }

  function getPublicViewerState() {
    const instance = window.__studioPublicPageFlip;
    if (instance) {
      try {
        const render = typeof instance.getRender === 'function' ? instance.getRender() : null;
        const rect = render && typeof render.getRect === 'function' ? render.getRect() : null;
        const orientation = render && typeof render.getOrientation === 'function' ? render.getOrientation() : null;
        return {
          mode: orientation === 'landscape' ? 'landscape' : 'portrait',
          pageWidth: rect && Number(rect.pageWidth),
          currentPageIndex: typeof instance.getCurrentPageIndex === 'function' ? instance.getCurrentPageIndex() : 0,
        };
      } catch (_error) {}
    }

    try {
      return window.__viewerDebug && window.__viewerDebug.getState
        ? window.__viewerDebug.getState()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function syncPublicZoomLayout(centerViewport = false) {
    const viewport = document.getElementById('bookViewport');
    const position = document.getElementById('bookPosition');
    const scale = document.getElementById('bookScale');
    const book = document.getElementById('book');
    if (!viewport || !position || !scale || !book || !book.offsetWidth || !book.offsetHeight) return;

    if (!zoomBaseWidth) zoomBaseWidth = book.offsetWidth;
    if (!zoomBaseHeight) zoomBaseHeight = book.offsetHeight;

    const zoom = publicZoomLevel();
    const scaledWidth = Math.max(1, Math.ceil(zoomBaseWidth * zoom));
    const scaledHeight = Math.max(1, Math.ceil(zoomBaseHeight * zoom));

    viewport.style.display = 'flex';
    viewport.style.alignItems = 'flex-start';
    viewport.style.justifyContent = 'flex-start';

    position.style.position = 'relative';
    position.style.flex = '0 0 auto';
    position.style.margin = 'auto';
    position.style.width = `${scaledWidth}px`;
    position.style.height = `${scaledHeight}px`;

    scale.style.position = 'absolute';
    scale.style.left = '0';
    scale.style.top = '0';
    scale.style.width = `${zoomBaseWidth}px`;
    scale.style.height = `${zoomBaseHeight}px`;
    scale.style.transformOrigin = 'top left';
    scale.style.transform = `scale(${zoom})`;

    const viewerState = getPublicViewerState();
    let coverOffset = 0;
    if (viewerState && viewerState.mode === 'landscape' && viewerState.pageWidth) {
      if (viewerState.currentPageIndex === 0) coverOffset = -viewerState.pageWidth / 2;
      else if (viewerState.currentPageIndex === window.__AGENDA_PREVIEW_CONFIG__.previewPages.length - 1) {
        coverOffset = viewerState.pageWidth / 2;
      }
    }
    position.style.transform = `translateX(${coverOffset * zoom}px)`;

    if (centerViewport) {
      window.requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
      });
    }
  }

  function installPublicZoomSupport() {
    const zoomIn = document.getElementById('zoomInButton');
    const zoomOut = document.getElementById('zoomOutButton');
    const reset = document.getElementById('resetViewButton');
    const status = document.getElementById('pageStatus');

    const syncSoon = (center = false) => window.requestAnimationFrame(() => syncPublicZoomLayout(center));
    zoomIn?.addEventListener('click', () => syncSoon(true));
    zoomOut?.addEventListener('click', () => syncSoon(true));
    reset?.addEventListener('click', () => syncSoon(true));

    if (status && window.MutationObserver) {
      const observer = new MutationObserver(() => syncSoon(false));
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    }

    window.addEventListener('resize', () => {
      clearPublicZoomLayout();
      window.setTimeout(() => syncPublicZoomLayout(false), 240);
    });
    document.addEventListener('fullscreenchange', () => {
      clearPublicZoomLayout();
      window.setTimeout(() => syncPublicZoomLayout(false), 180);
    });

    syncSoon(false);
    window.setTimeout(() => syncPublicZoomLayout(false), 120);
  }

  async function loadApprovedViewer() {
    await installPublicHardCoverStyles();
    installPublicHardCoverAdapter();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/admin/agenda-previews/app.js';
      script.onload = () => {
        installPublicZoomSupport();
        resolve();
      };
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
      };

      configureBuyButton(preview);
      installPublicClose();
      await loadApprovedViewer();
      state.hidden = true;
      viewer.hidden = false;
    } catch (_error) {
      showUnavailable();
    }
  }

  window.addEventListener('pagehide', () => {
    generatedPageUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  start();
})();
