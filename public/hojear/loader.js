(function () {
  'use strict';

  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const MOBILE_MIN_SPREAD_WIDTH = 620;
  const AUDIO_SOURCE = '/admin/agenda-previews/audio/page-turn-short.ogg';
  const generatedPageUrls = [];

  const state = document.getElementById('publicState');
  const stateTitle = document.getElementById('publicStateTitle');
  const stateText = document.getElementById('publicStateText');
  const stateLink = document.getElementById('publicStateLink');
  const viewer = document.getElementById('viewerShell');
  const buyButton = document.getElementById('publicBuyButton');

  const elements = {
    viewport: document.getElementById('bookViewport'),
    position: document.getElementById('bookPosition'),
    scale: document.getElementById('bookScale'),
    book: document.getElementById('book'),
    loading: document.getElementById('loadingState'),
    previous: document.getElementById('previousButton'),
    next: document.getElementById('nextButton'),
    mobilePrevious: document.getElementById('mobilePreviousButton'),
    mobileNext: document.getElementById('mobileNextButton'),
    status: document.getElementById('pageStatus'),
    sound: document.getElementById('soundButton'),
    zoomIn: document.getElementById('zoomInButton'),
    zoomOut: document.getElementById('zoomOutButton'),
    zoomValue: document.getElementById('zoomValue'),
    resetView: document.getElementById('resetViewButton'),
    fullscreen: document.getElementById('fullscreenButton'),
    close: document.getElementById('closeButton'),
    title: document.getElementById('productTitle'),
    format: document.getElementById('formatLine'),
    previewCount: document.getElementById('previewCount'),
    productCount: document.getElementById('productCount'),
  };

  let config = null;
  let pageFlip = null;
  let bookElement = elements.book;
  let currentMode = null;
  let currentSize = null;
  let lastPageIndex = 0;
  let zoom = 1;
  let zoomBaseWidth = 0;
  let zoomBaseHeight = 0;
  let resizeTimer = null;
  let instanceReady = false;
  let soundEnabled = false;
  let soundGestureLocked = false;
  let pageSound = null;
  let audioReady = false;

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
        // Fallback a load para navegadores que rechazan decode().
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

  async function preparePageUrls(preview, pages) {
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

  function setProductText() {
    elements.title.textContent = config.title;
    elements.format.textContent = config.format;
    elements.previewCount.textContent = `Vista previa de ${config.previewPages.length} páginas`;
    elements.productCount.textContent = `Archivo completo: ${config.totalProductPages} páginas`;
    document.title = `${config.title} · Studio Sareschi`;
  }

  function getLayout() {
    const viewportWidth = Math.max(260, elements.viewport.clientWidth - 12);
    const viewportHeight = Math.max(280, elements.viewport.clientHeight - 70);
    const ratio = config.width / config.height;
    const showSpread = viewportWidth >= MOBILE_MIN_SPREAD_WIDTH;
    const pagesAcross = showSpread ? 2 : 1;
    const widthFromHeight = viewportHeight * ratio;
    const widthFromAvailableSpace = viewportWidth / pagesAcross;
    const pageWidth = Math.floor(Math.min(widthFromHeight, widthFromAvailableSpace));
    const pageHeight = Math.floor(pageWidth / ratio);
    return {
      mode: showSpread ? 'landscape' : 'portrait',
      width: Math.max(160, pageWidth),
      height: Math.max(220, pageHeight),
    };
  }

  function createHtmlPages() {
    const lastIndex = config.previewPages.length - 1;
    return config.previewPages.map((source, index) => {
      const page = document.createElement('div');
      page.className = 'public-flip-page';
      page.dataset.density = index <= 1 || index >= lastIndex - 1 ? 'hard' : 'soft';

      const image = document.createElement('img');
      image.src = source;
      image.alt = '';
      image.draggable = false;
      image.decoding = 'sync';
      image.setAttribute('aria-hidden', 'true');
      page.appendChild(image);
      return page;
    });
  }

  function visibleLabel(index) {
    if (currentMode === 'portrait' || index === 0 || index === config.previewPages.length - 1) {
      return `Página ${index + 1}`;
    }
    const left = index % 2 === 0 ? index : index + 1;
    const right = Math.min(left + 1, config.previewPages.length);
    return left === right ? `Página ${left}` : `Páginas ${left}–${right}`;
  }

  function isSpreadOpen(index) {
    return currentMode === 'landscape' && index > 0 && index < config.previewPages.length - 1;
  }

  function applyBookPosition() {
    let coverOffset = 0;
    if (currentMode === 'landscape' && currentSize) {
      if (lastPageIndex === 0) coverOffset = -currentSize.width / 2;
      else if (lastPageIndex === config.previewPages.length - 1) coverOffset = currentSize.width / 2;
    }
    elements.position.style.transform = `translateX(${coverOffset * zoom}px)`;
  }

  function updateStatus(index) {
    const bounded = Math.max(0, Math.min(index, config.previewPages.length - 1));
    lastPageIndex = bounded;
    elements.status.textContent = `${visibleLabel(bounded)} / ${config.previewPages.length}`;
    const atStart = bounded === 0;
    const atEnd = bounded >= config.previewPages.length - 1;
    elements.previous.disabled = atStart;
    elements.mobilePrevious.disabled = atStart;
    elements.next.disabled = atEnd;
    elements.mobileNext.disabled = atEnd;
    document.body.classList.toggle('is-spread-open', isSpreadOpen(bounded));
    applyBookPosition();
  }

  function captureZoomBase() {
    if (!bookElement || !bookElement.offsetWidth || !bookElement.offsetHeight) return false;
    zoomBaseWidth = bookElement.offsetWidth;
    zoomBaseHeight = bookElement.offsetHeight;
    return true;
  }

  function syncZoomLayout(centerViewport = false) {
    if (!zoomBaseWidth || !zoomBaseHeight) {
      if (!captureZoomBase()) return;
    }
    const scaledWidth = Math.max(1, Math.ceil(zoomBaseWidth * zoom));
    const scaledHeight = Math.max(1, Math.ceil(zoomBaseHeight * zoom));

    elements.viewport.classList.add('is-zoom-layout');
    elements.position.style.width = `${scaledWidth}px`;
    elements.position.style.height = `${scaledHeight}px`;
    elements.scale.style.width = `${zoomBaseWidth}px`;
    elements.scale.style.height = `${zoomBaseHeight}px`;
    elements.scale.style.transform = `scale(${zoom})`;
    applyBookPosition();

    if (centerViewport) {
      window.requestAnimationFrame(() => {
        elements.viewport.scrollLeft = Math.max(0, (elements.viewport.scrollWidth - elements.viewport.clientWidth) / 2);
        elements.viewport.scrollTop = Math.max(0, (elements.viewport.scrollHeight - elements.viewport.clientHeight) / 2);
      });
    }
  }

  function resetZoomLayout() {
    zoomBaseWidth = 0;
    zoomBaseHeight = 0;
    elements.viewport.classList.remove('is-zoom-layout');
    elements.position.style.width = '';
    elements.position.style.height = '';
    elements.position.style.transform = '';
    elements.scale.style.width = '';
    elements.scale.style.height = '';
    elements.scale.style.transform = '';
  }

  function applyZoom(nextZoom, centerViewport = true) {
    zoom = Math.max(.8, Math.min(1.5, nextZoom));
    elements.zoomValue.value = `${Math.round(zoom * 100)}%`;
    elements.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    elements.zoomOut.disabled = zoom <= .8;
    elements.zoomIn.disabled = zoom >= 1.5;
    syncZoomLayout(centerViewport);
  }

  function playPageSound() {
    if (!soundEnabled || !pageSound || !audioReady) return;
    pageSound.currentTime = 0;
    pageSound.play().catch(() => {});
  }

  function replaceBookElement() {
    const replacement = document.createElement('div');
    replacement.id = 'book';
    replacement.setAttribute('aria-live', 'polite');
    if (bookElement && bookElement.isConnected) bookElement.replaceWith(replacement);
    else elements.scale.appendChild(replacement);
    bookElement = replacement;
    elements.book = replacement;
  }

  function initialize(startPage = 0) {
    if (!window.St || !window.St.PageFlip) {
      throw new Error('StPageFlip no está disponible.');
    }

    const layout = getLayout();
    currentMode = layout.mode;
    currentSize = layout;
    instanceReady = false;
    soundGestureLocked = false;
    resetZoomLayout();
    elements.loading.hidden = false;

    const pages = createHtmlPages();
    bookElement.replaceChildren(...pages);

    pageFlip = new window.St.PageFlip(bookElement, {
      width: layout.width,
      height: layout.height,
      size: 'fixed',
      showCover: true,
      usePortrait: layout.mode === 'portrait',
      autoSize: false,
      maxShadowOpacity: .28,
      mobileScrollSupport: false,
      swipeDistance: 24,
      clickEventForward: true,
      useMouseEvents: true,
      drawShadow: true,
      flippingTime: 720,
      startPage: Math.max(0, Math.min(startPage, config.previewPages.length - 1)),
    });

    pageFlip.on('init', (event) => {
      instanceReady = true;
      lastPageIndex = event.data.page;
      updateStatus(lastPageIndex);
      elements.loading.hidden = true;
      window.requestAnimationFrame(() => {
        captureZoomBase();
        applyZoom(zoom, false);
      });
    });

    pageFlip.on('flip', (event) => updateStatus(event.data));
    pageFlip.on('changeOrientation', () => updateStatus(lastPageIndex));
    pageFlip.on('changeState', (event) => {
      const stateName = event.data;
      if (stateName === 'read') {
        soundGestureLocked = false;
        return;
      }
      if (instanceReady && !soundGestureLocked && (stateName === 'flipping' || stateName === 'user_fold')) {
        soundGestureLocked = true;
        playPageSound();
      }
    });

    pageFlip.loadFromHTML(pages);
  }

  function rebuildForViewport() {
    if (!config || !viewer || viewer.hidden) return;
    const nextLayout = getLayout();
    const changedMode = nextLayout.mode !== currentMode;
    const changedSize = !currentSize || Math.abs(nextLayout.width - currentSize.width) > 3 || Math.abs(nextLayout.height - currentSize.height) > 3;
    if (!changedMode && !changedSize) return;

    const pageToRestore = pageFlip ? pageFlip.getCurrentPageIndex() : lastPageIndex;
    if (pageFlip) pageFlip.destroy();
    pageFlip = null;
    resetZoomLayout();
    replaceBookElement();
    initialize(pageToRestore);
  }

  const previous = () => pageFlip && instanceReady && pageFlip.flipPrev();
  const next = () => pageFlip && instanceReady && pageFlip.flipNext();

  function resetView() {
    if (!pageFlip || !instanceReady) return;
    soundGestureLocked = true;
    if (pageSound) {
      pageSound.pause();
      pageSound.currentTime = 0;
    }
    try { pageFlip.getRender().finishAnimation(); } catch (_error) {}
    pageFlip.turnToPage(0);
    lastPageIndex = 0;
    zoom = 1;
    applyZoom(1, true);
    updateStatus(0);
    soundGestureLocked = false;
  }

  function installControls() {
    elements.previous.addEventListener('click', previous);
    elements.mobilePrevious.addEventListener('click', previous);
    elements.next.addEventListener('click', next);
    elements.mobileNext.addEventListener('click', next);
    elements.resetView.addEventListener('click', resetView);
    elements.zoomIn.addEventListener('click', () => applyZoom(zoom + .1));
    elements.zoomOut.addEventListener('click', () => applyZoom(zoom - .1));

    elements.sound.addEventListener('click', () => {
      if (!audioReady) return;
      soundEnabled = !soundEnabled;
      elements.sound.setAttribute('aria-pressed', String(soundEnabled));
      elements.sound.setAttribute('aria-label', soundEnabled ? 'Silenciar sonido' : 'Activar sonido');
    });

    elements.fullscreen.addEventListener('click', async () => {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    });

    elements.close.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = '/pdfs/';
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen?.();
    });

    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
      window.setTimeout(rebuildForViewport, 120);
    });

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuildForViewport, 180);
    });
  }

  function prepareAudio() {
    pageSound = new Audio(AUDIO_SOURCE);
    pageSound.preload = 'auto';
    pageSound.volume = .22;
    elements.sound.disabled = true;
    elements.sound.title = 'Cargando sonido…';
    elements.sound.setAttribute('aria-label', 'Cargando sonido');

    const markAudioReady = () => {
      if (audioReady) return;
      audioReady = true;
      elements.sound.disabled = false;
      elements.sound.title = 'Sonido';
      elements.sound.setAttribute('aria-label', 'Activar sonido');
    };

    pageSound.addEventListener('loadeddata', markAudioReady, { once: true });
    pageSound.addEventListener('canplaythrough', markAudioReady, { once: true });
    pageSound.addEventListener('error', () => {
      audioReady = false;
      soundEnabled = false;
      elements.sound.disabled = true;
      elements.sound.title = 'Sonido no disponible';
      elements.sound.setAttribute('aria-label', 'Sonido no disponible');
      elements.sound.setAttribute('aria-pressed', 'false');
    });
    pageSound.load();
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

      const previewPages = await preparePageUrls(preview, pages);
      if (!previewPages.length) {
        showUnavailable();
        return;
      }

      config = {
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
      setProductText();
      installControls();
      prepareAudio();
      zoom = 1;
      elements.zoomValue.value = '100%';
      elements.zoomValue.textContent = '100%';

      state.hidden = true;
      viewer.hidden = false;
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      initialize();
    } catch (_error) {
      showUnavailable();
    }
  }

  window.addEventListener('pagehide', () => {
    generatedPageUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  start();
})();
