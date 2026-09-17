(function () {
  'use strict';

  const imageList = (folder, count) => Array.from({ length: count }, (_, index) =>
    `previews/${folder}/${String(index + 1).padStart(2, '0')}.png`
  );

  const agendas = {
    'cozy-reading': {
      slug: 'cozy-reading',
      title: 'Agenda Cozy Reading 2027',
      format: 'A5',
      width: 148,
      height: 210,
      orientation: 'vertical',
      totalProductPages: 180,
      previewPages: imageList('cozy-reading', 16)
    },
    'proportion-test': {
      slug: 'proportion-test',
      title: 'Prueba de libreta angosta',
      format: 'Personalizado',
      width: 90,
      height: 210,
      orientation: 'vertical',
      totalProductPages: 64,
      previewPages: imageList('cozy-reading', 10)
    },
    'dynamic-30-test': {
      slug: 'dynamic-30-test',
      title: 'Prueba dinámica de 30 páginas',
      format: 'B5',
      width: 176,
      height: 250,
      orientation: 'vertical',
      totalProductPages: 220,
      previewPages: Array.from({ length: 30 }, (_, index) =>
        `previews/cozy-reading/${String((index % 16) + 1).padStart(2, '0')}.png`
      )
    }
  };

  const params = new URLSearchParams(window.location.search);
  const config = window.__AGENDA_PREVIEW_CONFIG__ || agendas[params.get('agenda')] || agendas['cozy-reading'];
  const AUDIO_SOURCE = '/admin/agenda-previews/audio/page-turn-short.ogg';
  const MOBILE_MIN_SPREAD_WIDTH = 620;
  const generatedPageUrls = [];

  const elements = {
    viewport: document.getElementById('bookViewport'),
    position: document.getElementById('bookPosition'),
    scale: document.getElementById('bookScale'),
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
    close: document.getElementById('closeButton')
  };

  let pageFlip = null;
  let bookElement = document.getElementById('book');
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

  function loadStylesheet(href, id) {
    const existing = document.getElementById(id);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`No se pudo cargar ${href}`));
      document.head.appendChild(link);
    });
  }

  function installOpaqueBackingStyles() {
    if (document.getElementById('managerOpaqueBackingStyles')) return;
    const style = document.createElement('style');
    style.id = 'managerOpaqueBackingStyles';
    style.textContent = `
      .public-flip-page,
      .stf__item.public-flip-page {
        background: #fff !important;
        background-color: #fff !important;
        opacity: 1 !important;
      }
      .public-flip-page > .manager-opaque-backing {
        position: absolute;
        inset: 0;
        z-index: 0;
        display: block;
        background: #fff !important;
        opacity: 1 !important;
        pointer-events: none;
      }
      .public-flip-page > img {
        position: relative;
        z-index: 1;
        background: #fff !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function installApprovedViewerStyles() {
    await loadStylesheet('/hojear/viewer.css', 'managerPublicViewerStyles');
    await loadStylesheet('/hojear/viewer-depth.css', 'managerPublicViewerDepthStyles');
    installOpaqueBackingStyles();
  }

  function decodeImageUrl(url) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    if (typeof image.decode === 'function') {
      return image.decode().catch(() => new Promise((resolve, reject) => {
        if (image.complete && image.naturalWidth > 0) return resolve();
        image.onload = resolve;
        image.onerror = reject;
      }));
    }
    return new Promise((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) return resolve();
      image.onload = resolve;
      image.onerror = reject;
    });
  }

  async function createLocalPageUrl(source) {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo preparar una página de la muestra.');
    const blob = await response.blob();
    if (!String(blob.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('La página recibida no es una imagen válida.');
    }
    const url = URL.createObjectURL(blob);
    generatedPageUrls.push(url);
    await decodeImageUrl(url);
    return url;
  }

  async function preparePages() {
    config.previewPages = await Promise.all(config.previewPages.map((source) => createLocalPageUrl(source)));
  }

  function setProductText() {
    document.getElementById('productTitle').textContent = config.title;
    document.getElementById('formatLine').textContent = config.format;
    document.getElementById('previewCount').textContent = `Vista previa de ${config.previewPages.length} páginas`;
    document.getElementById('productCount').textContent = `Archivo completo: ${config.totalProductPages} páginas`;
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
      height: Math.max(220, pageHeight)
    };
  }

  function createHtmlPages() {
    const lastIndex = config.previewPages.length - 1;
    return config.previewPages.map((source, index) => {
      const page = document.createElement('div');
      page.className = 'public-flip-page';
      page.dataset.density = index <= 1 || index >= lastIndex - 1 ? 'hard' : 'soft';

      const backing = document.createElement('span');
      backing.className = 'manager-opaque-backing';
      backing.setAttribute('aria-hidden', 'true');

      const image = document.createElement('img');
      image.src = source;
      image.alt = '';
      image.draggable = false;
      image.decoding = 'sync';
      image.setAttribute('aria-hidden', 'true');

      page.append(backing, image);
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
  }

  function initialize(startPage = 0) {
    if (!window.St || !window.St.PageFlip) {
      elements.loading.textContent = 'No se pudo iniciar el visor.';
      return;
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
      startPage: Math.max(0, Math.min(startPage, config.previewPages.length - 1))
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
      const state = event.data;
      if (state === 'read') {
        soundGestureLocked = false;
        return;
      }
      if (instanceReady && !soundGestureLocked && (state === 'flipping' || state === 'user_fold')) {
        soundGestureLocked = true;
        playPageSound();
      }
    });

    pageFlip.loadFromHTML(pages);
  }

  function rebuildForViewport() {
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
      else window.location.href = './';
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
    try {
      elements.loading.hidden = false;
      elements.loading.textContent = 'Preparando la vista previa…';
      await installApprovedViewerStyles();
      await preparePages();
      setProductText();
      installControls();
      prepareAudio();
      zoom = 1;
      elements.zoomValue.value = '100%';
      elements.zoomValue.textContent = '100%';
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      initialize();
    } catch (_error) {
      elements.loading.hidden = false;
      elements.loading.textContent = 'No se pudo preparar la vista previa.';
    }
  }

  window.addEventListener('pagehide', () => {
    generatedPageUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  window.__viewerDebug = {
    destroy: async () => {
      window.clearTimeout(resizeTimer);
      if (pageSound) {
        pageSound.pause();
        pageSound.currentTime = 0;
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_error) {}
      }
      instanceReady = false;
      if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
      }
      generatedPageUrls.forEach((url) => URL.revokeObjectURL(url));
      generatedPageUrls.length = 0;
    },
    getState: () => ({
      mode: currentMode,
      renderMode: 'html-hard-covers',
      pageWidth: currentSize && currentSize.width,
      pageHeight: currentSize && currentSize.height,
      currentPageIndex: lastPageIndex,
      previewPages: [...config.previewPages],
      instanceCount: pageFlip ? 1 : 0,
      audioReady
    })
  };

  start();
})();
