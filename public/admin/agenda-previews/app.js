(function () {
  'use strict';

  const imageList = (folder, count) => Array.from({ length: count }, (_, index) =>
    `previews/${folder}/${String(index + 1).padStart(2, '0')}.png`
  );

  // Catálogo independiente: añadir productos aquí, sin tocar la lógica del visor.
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
    // Configuración técnica para comprobar proporciones personalizadas.
    // Se abre con ?agenda=proportion-test y reutiliza imágenes solo para la prueba local.
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
    // Comprueba que el total dinámico supera 16: ?agenda=dynamic-30-test
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
  // El administrador puede inyectar una configuración temporal sin alterar el catálogo público.
  const config = window.__AGENDA_PREVIEW_CONFIG__ || agendas[params.get('agenda')] || agendas['cozy-reading'];
  const AUDIO_SOURCE = 'audio/page-turn-short.ogg';
  const MOBILE_MIN_SPREAD_WIDTH = 620;
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
    soundIcon: document.getElementById('soundIcon'),
    zoomIn: document.getElementById('zoomInButton'),
    zoomOut: document.getElementById('zoomOutButton'),
    zoomValue: document.getElementById('zoomValue'),
    resetView: document.getElementById('resetViewButton'),
    fullscreen: document.getElementById('fullscreenButton'),
    close: document.getElementById('closeButton')
  };

  let pageFlip;
  let bookElement = document.getElementById('book');
  let zoom = 1;
  let soundEnabled = false;
  let pageSound = null;
  let audioReady = false;
  let lastPageIndex = 0;
  let currentMode = null;
  let currentSize = null;
  let resizeTimer = null;
  let renderDensityTimer = null;
  let instanceReady = false;
  let soundGestureLocked = false;

  function setProductText() {
    document.getElementById('productTitle').textContent = config.title;
    document.getElementById('formatLine').textContent = config.format;
    document.getElementById('previewCount').textContent = `Vista previa de ${config.previewPages.length} páginas`;
    document.getElementById('productCount').textContent = `Archivo completo: ${config.totalProductPages} páginas`;
    document.title = `${config.title} · Studio Sareschi`;
  }

  function playPageSound() {
    if (!soundEnabled || !pageSound || !audioReady) return;
    pageSound.currentTime = 0;
    pageSound.play().catch(() => {});
  }

  function applyBookPosition() {
    let coverOffset = 0;
    if (currentMode === 'landscape' && currentSize) {
      if (lastPageIndex === 0) coverOffset = -currentSize.width / 2;
      else if (lastPageIndex === config.previewPages.length - 1) coverOffset = currentSize.width / 2;
    }
    elements.position.style.transform = `translateX(${coverOffset}px)`;
  }

  function visibleLabel(index) {
    if (currentMode === 'portrait' || index === 0 || index === config.previewPages.length - 1) return `Página ${index + 1}`;
    const left = index % 2 === 0 ? index : index + 1;
    const right = Math.min(left + 1, config.previewPages.length);
    return left === right ? `Página ${left}` : `Páginas ${left}–${right}`;
  }

  function updateStatus(index) {
    const bounded = Math.max(0, Math.min(index, config.previewPages.length - 1));
    elements.status.textContent = `${visibleLabel(bounded)} / ${config.previewPages.length}`;
    const atStart = bounded === 0;
    const atEnd = bounded >= config.previewPages.length - 1;
    elements.previous.disabled = atStart;
    elements.mobilePrevious.disabled = atStart;
    elements.next.disabled = atEnd;
    elements.mobileNext.disabled = atEnd;
    applyBookPosition();
  }

  function applyZoom(nextZoom) {
    zoom = Math.max(.8, Math.min(1.5, nextZoom));
    elements.scale.style.transform = `scale(${zoom})`;
    elements.zoomValue.value = `${Math.round(zoom * 100)}%`;
    elements.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    elements.zoomOut.disabled = zoom <= .8;
    elements.zoomIn.disabled = zoom >= 1.5;
    window.clearTimeout(renderDensityTimer);
    renderDensityTimer = window.setTimeout(() => {
      if (pageFlip && instanceReady) pageFlip.getUI().update();
    }, 220);
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

  function replaceBookElement() {
    const replacement = document.createElement('div');
    replacement.id = 'book';
    replacement.setAttribute('aria-live', 'polite');
    if (bookElement.isConnected) bookElement.replaceWith(replacement);
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
    elements.loading.hidden = false;

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
      lastPageIndex = event.data.page;
      instanceReady = true;
      updateStatus(lastPageIndex);
      elements.loading.hidden = true;
    });
    pageFlip.on('flip', (event) => {
      const nextPageIndex = event.data;
      lastPageIndex = nextPageIndex;
      updateStatus(lastPageIndex);
    });
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
    pageFlip.on('changeOrientation', () => updateStatus(lastPageIndex));
    // Una URL inmutable por cara. Evita la clonación de nodos HTML y cambios de src durante el giro.
    pageFlip.loadFromImages(Object.freeze([...config.previewPages]));
  }

  function rebuildForViewport() {
    const nextLayout = getLayout();
    const changedMode = nextLayout.mode !== currentMode;
    const changedSize = !currentSize || Math.abs(nextLayout.width - currentSize.width) > 3 || Math.abs(nextLayout.height - currentSize.height) > 3;
    if (!changedMode && !changedSize) return;
    const pageToRestore = pageFlip ? pageFlip.getCurrentPageIndex() : lastPageIndex;
    if (pageFlip) pageFlip.destroy();
    replaceBookElement();
    initialize(pageToRestore);
  }

  const previous = () => pageFlip && pageFlip.flipPrev();
  const next = () => pageFlip && pageFlip.flipNext();
  const resetView = () => {
    if (!pageFlip || !instanceReady) return;
    soundGestureLocked = true;
    if (pageSound) {
      pageSound.pause();
      pageSound.currentTime = 0;
    }
    pageFlip.getRender().finishAnimation();
    pageFlip.turnToPage(0);
    lastPageIndex = 0;
    applyZoom(1);
    updateStatus(0);
    soundGestureLocked = false;
  };
  elements.previous.addEventListener('click', previous);
  elements.mobilePrevious.addEventListener('click', previous);
  elements.next.addEventListener('click', next);
  elements.mobileNext.addEventListener('click', next);
  elements.resetView.addEventListener('click', resetView);
  elements.sound.addEventListener('click', () => {
    if (!audioReady) return;
    soundEnabled = !soundEnabled;
    elements.sound.setAttribute('aria-pressed', String(soundEnabled));
    elements.sound.setAttribute('aria-label', soundEnabled ? 'Silenciar sonido' : 'Activar sonido');
  });
  elements.zoomIn.addEventListener('click', () => applyZoom(zoom + .1));
  elements.zoomOut.addEventListener('click', () => applyZoom(zoom - .1));
  elements.fullscreen.addEventListener('click', async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => document.body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement)));
  document.addEventListener('fullscreenchange', () => window.setTimeout(rebuildForViewport, 100));
  elements.close.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = './';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') previous();
    if (event.key === 'ArrowRight') next();
    if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen?.();
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuildForViewport, 180);
  });

  setProductText();
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
  applyZoom(1);
  initialize();
  window.__viewerDebug = {
    destroy: async () => {
      window.clearTimeout(resizeTimer);
      window.clearTimeout(renderDensityTimer);
      if (pageSound) {
        pageSound.pause();
        pageSound.currentTime = 0;
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_) {}
      }
      instanceReady = false;
      if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
      }
    },
    getState: () => ({
      mode: currentMode,
      pageWidth: currentSize && currentSize.width,
      pageHeight: currentSize && currentSize.height,
      currentPageIndex: lastPageIndex,
      previewPages: [...config.previewPages],
      instanceCount: pageFlip ? 1 : 0,
      audioReady,
      pageSources: pageFlip ? Array.from({ length: pageFlip.getPageCount() }, (_, index) => pageFlip.getPage(index).image.src) : []
    })
  };
})();
