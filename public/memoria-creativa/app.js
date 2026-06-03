(() => {
  "use strict";

  const STORAGE_KEY = "studioSareschi.memoriaCreativa.v1";
  const REWARD_GOAL = 3000;
  const STARTING_COINS = 100;
  const ERROR_COST = 10;
  const MATCH_REWARD = 5;
  const LEVELS = [
    { level: 1, pairs: 4, bonus: 40 },
    { level: 2, pairs: 6, bonus: 60 },
    { level: 3, pairs: 8, bonus: 80 },
    { level: 4, pairs: 10, bonus: 100 },
    { level: 5, pairs: 12, bonus: 150 }
  ];

  const CARDS = [
    { id: "espiral", name: "Cuaderno espiral", image: "assets/cards/espiral-cuaderno.png", placeholder: "📒" },
    { id: "papel", name: "Papel bond", image: "assets/cards/papel-bond.png", placeholder: "📄" },
    { id: "carton", name: "Cartón kappa", image: "assets/cards/carton-kappa.png", placeholder: "🟫" },
    { id: "tijeras", name: "Tijeras", image: "assets/cards/tijeras.png", placeholder: "✂️" },
    { id: "washi", name: "Washi tape", image: "assets/cards/washi-tape.png", placeholder: "🎀" },
    { id: "stickers", name: "Stickers", image: "assets/cards/stickers.png", placeholder: "⭐" },
    { id: "agenda", name: "Agenda", image: "assets/cards/agenda.png", placeholder: "🗓️" },
    { id: "planner", name: "Planner", image: "assets/cards/planner.png", placeholder: "📔" },
    { id: "pegamento", name: "Pegamento", image: "assets/cards/pegamento.png", placeholder: "🧴" },
    { id: "sello", name: "Sello", image: "assets/cards/sello.png", placeholder: "🔖" },
    { id: "sobre", name: "Sobre", image: "assets/cards/sobre.png", placeholder: "✉️" },
    { id: "clip", name: "Clip dorado", image: "assets/cards/clip-dorado.png", placeholder: "📎" }
  ];

  const SOUND_FILES = {
    flip: "assets/sounds/flip.mp3",
    match: "assets/sounds/match.mp3",
    error: "assets/sounds/error.mp3",
    coins: "assets/sounds/coins.mp3",
    win: "assets/sounds/win.mp3"
  };

  const els = {
    homeScreen: document.querySelector("#home-screen"),
    gameScreen: document.querySelector("#game-screen"),
    homeCoins: document.querySelector("#home-coins"),
    homeLevel: document.querySelector("#home-level"),
    homeProgressText: document.querySelector("#home-progress-text"),
    homeProgressFill: document.querySelector("#home-progress-fill"),
    homeRewardStatus: document.querySelector("#home-reward-status"),
    homeDailyMessage: document.querySelector("#home-daily-message"),
    playButton: document.querySelector("#play-button"),
    homeSoundButton: document.querySelector("#home-sound-button"),
    gameSoundButton: document.querySelector("#game-sound-button"),
    backHomeButton: document.querySelector("#back-home-button"),
    gameLevel: document.querySelector("#game-level"),
    gameCoins: document.querySelector("#game-coins"),
    gameProgressText: document.querySelector("#game-progress-text"),
    gameProgressFill: document.querySelector("#game-progress-fill"),
    matchedPairs: document.querySelector("#matched-pairs"),
    totalPairs: document.querySelector("#total-pairs"),
    gameMessage: document.querySelector("#game-message"),
    board: document.querySelector("#memory-board"),
    restartLevelButton: document.querySelector("#restart-level-button"),
    resetProgressButton: document.querySelector("#reset-progress-button"),
    modal: document.querySelector("#modal"),
    modalBadge: document.querySelector("#modal-badge"),
    modalTitle: document.querySelector("#modal-title"),
    modalMessage: document.querySelector("#modal-message"),
    modalActions: document.querySelector("#modal-actions")
  };

  let state = loadState();
  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let matchedCount = 0;
  let audioUnlocked = false;
  const audioCache = new Map();

  function defaultState() {
    return {
      playerCoins: STARTING_COINS,
      rewardProgress: 0,
      currentLevel: 1,
      unlockedReward: false,
      soundEnabled: true,
      lastDailyResetDate: todayKey(),
      bestProgress: 0,
      completedCycles: 0
    };
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeState({ ...defaultState(), ...(stored || {}) });
    } catch (error) {
      return defaultState();
    }
  }

  function normalizeState(nextState) {
    nextState.playerCoins = Math.max(0, Number(nextState.playerCoins) || 0);
    nextState.rewardProgress = clamp(Number(nextState.rewardProgress) || 0, 0, REWARD_GOAL);
    nextState.currentLevel = clamp(Number(nextState.currentLevel) || 1, 1, LEVELS.length);
    nextState.unlockedReward = Boolean(nextState.unlockedReward || nextState.rewardProgress >= REWARD_GOAL);
    nextState.soundEnabled = nextState.soundEnabled !== false;
    nextState.lastDailyResetDate = nextState.lastDailyResetDate || todayKey();
    nextState.bestProgress = Math.max(Number(nextState.bestProgress) || 0, nextState.rewardProgress);
    nextState.completedCycles = Math.max(0, Number(nextState.completedCycles) || 0);
    return nextState;
  }

  function saveState() {
    state.bestProgress = Math.max(state.bestProgress, state.rewardProgress);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function applyDailyRecharge() {
    const today = todayKey();
    if (state.playerCoins <= 0 && state.lastDailyResetDate !== today) {
      state.playerCoins = STARTING_COINS;
      state.lastDailyResetDate = today;
      saveState();
      setMessage(els.homeDailyMessage, "Recargamos 100 monedas para que sigas jugando hoy.", "success");
      return;
    }

    if (!state.lastDailyResetDate) {
      state.lastDailyResetDate = today;
      saveState();
    }
  }

  function isDailyLocked() {
    return state.playerCoins <= 0 && state.lastDailyResetDate === todayKey();
  }

  function currentLevelConfig() {
    return LEVELS[state.currentLevel - 1] || LEVELS[0];
  }

  function renderAll() {
    const progressPercent = Math.min(100, (state.rewardProgress / REWARD_GOAL) * 100);
    els.homeCoins.textContent = state.playerCoins;
    els.homeLevel.textContent = state.currentLevel;
    els.homeProgressText.textContent = state.rewardProgress;
    els.homeProgressFill.style.width = `${progressPercent}%`;
    els.gameCoins.textContent = state.playerCoins;
    els.gameLevel.textContent = state.currentLevel;
    els.gameProgressText.textContent = state.rewardProgress;
    els.gameProgressFill.style.width = `${progressPercent}%`;
    els.homeRewardStatus.textContent = state.unlockedReward
      ? "Tu recompensa ya está disponible."
      : "Sigue juntando estrellitas creativas.";
    els.playButton.disabled = isDailyLocked();
    els.restartLevelButton.disabled = isDailyLocked();
    renderSoundButtons();

    if (isDailyLocked()) {
      setMessage(els.homeDailyMessage, "Te quedaste sin monedas por hoy. Vuelve mañana para seguir jugando.", "warning");
      setMessage(els.gameMessage, "Te quedaste sin monedas por hoy. Vuelve mañana para seguir jugando.", "warning");
    } else if (!els.homeDailyMessage.textContent) {
      setMessage(els.homeDailyMessage, "", "");
    }
  }

  function renderSoundButtons() {
    const label = state.soundEnabled ? "Sonido: activado" : "Sonido: desactivado";
    els.homeSoundButton.textContent = label;
    els.homeSoundButton.setAttribute("aria-pressed", String(state.soundEnabled));
    els.gameSoundButton.textContent = state.soundEnabled ? "🔊" : "🔇";
    els.gameSoundButton.setAttribute("aria-label", label);
    els.gameSoundButton.setAttribute("aria-pressed", String(state.soundEnabled));
  }

  function startGame() {
    unlockAudio();
    applyDailyRecharge();
    renderAll();

    if (isDailyLocked()) {
      return;
    }

    showScreen("game");
    buildLevel();
  }

  function showScreen(screenName) {
    els.homeScreen.classList.toggle("is-active", screenName === "home");
    els.gameScreen.classList.toggle("is-active", screenName === "game");
  }

  function buildLevel() {
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    matchedCount = 0;

    const level = currentLevelConfig();
    const selectedCards = CARDS.slice(0, level.pairs);
    const deck = shuffle([...selectedCards, ...selectedCards].map((card, index) => ({
      ...card,
      instanceId: `${card.id}-${index}`
    })));

    els.board.innerHTML = "";
    els.board.style.setProperty("--columns", String(getColumnCount(level.pairs)));
    els.totalPairs.textContent = level.pairs;
    els.matchedPairs.textContent = "0";
    setMessage(els.gameMessage, "Elige dos cartas para encontrar un par.", "");

    deck.forEach((card) => {
      els.board.appendChild(createCardButton(card));
    });

    renderAll();
  }

  function getColumnCount(pairCount) {
    if (pairCount <= 4) return 4;
    if (pairCount <= 8) return 4;
    return window.matchMedia("(min-width: 700px)").matches ? 6 : 4;
  }

  function createCardButton(card) {
    const button = document.createElement("button");
    button.className = "memory-card";
    button.type = "button";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-label", "Carta oculta");

    const inner = document.createElement("span");
    inner.className = "card-inner";

    const back = document.createElement("span");
    back.className = "card-face card-back";

    const front = document.createElement("span");
    front.className = "card-face card-front";

    const image = document.createElement("img");
    image.src = card.image;
    image.alt = "";
    image.loading = "lazy";

    const placeholder = document.createElement("span");
    placeholder.className = "card-placeholder";
    placeholder.textContent = card.placeholder;
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.hidden = true;

    image.addEventListener("error", () => {
      image.hidden = true;
      placeholder.hidden = false;
    }, { once: true });

    front.append(image, placeholder);
    inner.append(back, front);
    button.append(inner);
    button.addEventListener("click", () => handleCardClick(button));
    return button;
  }

  function handleCardClick(cardButton) {
    unlockAudio();

    if (lockBoard || isDailyLocked() || cardButton === firstCard || cardButton.classList.contains("is-matched")) {
      return;
    }

    cardButton.classList.add("is-flipped");
    cardButton.setAttribute("aria-label", "Carta descubierta");
    playSound("flip");

    if (!firstCard) {
      firstCard = cardButton;
      return;
    }

    secondCard = cardButton;
    lockBoard = true;

    if (firstCard.dataset.cardId === secondCard.dataset.cardId) {
      handleMatch();
    } else {
      handleMismatch();
    }
  }

  function handleMatch() {
    firstCard.classList.add("is-matched");
    secondCard.classList.add("is-matched");
    firstCard.disabled = true;
    secondCard.disabled = true;
    matchedCount += 1;
    els.matchedPairs.textContent = matchedCount;

    addCoins(MATCH_REWARD, true);
    setMessage(els.gameMessage, `¡Par encontrado! +${MATCH_REWARD} monedas.`, "success");
    playSound("match");
    playSound("coins");
    resetTurn();

    if (matchedCount === currentLevelConfig().pairs) {
      window.setTimeout(completeLevel, 520);
    }
  }

  function handleMismatch() {
    state.playerCoins = Math.max(0, state.playerCoins - ERROR_COST);
    state.lastDailyResetDate = todayKey();
    saveState();
    renderAll();
    playSound("error");

    if (isDailyLocked()) {
      setMessage(els.gameMessage, "Te quedaste sin monedas por hoy. Vuelve mañana para seguir jugando.", "warning");
      lockRemainingCards();
      resetTurn(false);
      return;
    }

    setMessage(els.gameMessage, `No era par. -${ERROR_COST} monedas.`, "warning");
    window.setTimeout(() => {
      firstCard.classList.remove("is-flipped");
      secondCard.classList.remove("is-flipped");
      firstCard.setAttribute("aria-label", "Carta oculta");
      secondCard.setAttribute("aria-label", "Carta oculta");
      resetTurn();
    }, 760);
  }

  function addCoins(amount, countForReward) {
    state.playerCoins += amount;
    if (countForReward) {
      const wasUnlocked = state.unlockedReward;
      state.rewardProgress = clamp(state.rewardProgress + amount, 0, REWARD_GOAL);
      if (state.rewardProgress >= REWARD_GOAL) {
        state.unlockedReward = true;
      }
      if (!wasUnlocked && state.unlockedReward) {
        window.setTimeout(showRewardModal, 420);
        playSound("win");
      }
    }
    saveState();
    renderAll();
  }

  function completeLevel() {
    const level = currentLevelConfig();
    addCoins(level.bonus, true);
    playSound("win");

    const finishedAllLevels = state.currentLevel === LEVELS.length;
    if (finishedAllLevels) {
      state.completedCycles += 1;
      state.currentLevel = 1;
      saveState();
      renderAll();
      showInfoModal({
        badge: "🏆",
        title: "¡Completaste todos los niveles!",
        message: `Ganaste un bonus de ${level.bonus} monedas. Puedes volver a jugar desde el nivel 1 sin perder tu progreso acumulado.`,
        primaryText: "Jugar otra vez",
        onPrimary: () => {
          closeModal();
          buildLevel();
        },
        secondaryText: "Ir al inicio",
        onSecondary: () => {
          closeModal();
          showScreen("home");
        }
      });
      return;
    }

    state.currentLevel += 1;
    saveState();
    renderAll();
    showInfoModal({
      badge: "✨",
      title: `¡Nivel ${level.level} completo!`,
      message: `Ganaste un bonus de ${level.bonus} monedas. El siguiente nivel tendrá más pares creativos.`,
      primaryText: "Siguiente nivel",
      onPrimary: () => {
        closeModal();
        buildLevel();
      },
      secondaryText: "Ir al inicio",
      onSecondary: () => {
        closeModal();
        showScreen("home");
      }
    });
  }

  function showRewardModal() {
    showInfoModal({
      badge: "🎁",
      title: "¡Ganaste un recurso creativo!",
      message: "Tu recompensa quedó desbloqueada. Si el archivo final aún no está publicado, te avisaremos con un mensaje suave.",
      primaryText: "Descargar recompensa",
      onPrimary: tryDownloadReward,
      secondaryText: "Seguir jugando",
      onSecondary: closeModal
    });
  }

  function showInfoModal({ badge, title, message, primaryText, onPrimary, secondaryText, onSecondary }) {
    els.modalBadge.textContent = badge;
    els.modalTitle.textContent = title;
    els.modalMessage.textContent = message;
    els.modalActions.innerHTML = "";

    const primary = document.createElement("button");
    primary.className = "btn btn-primary";
    primary.type = "button";
    primary.textContent = primaryText;
    primary.addEventListener("click", onPrimary);
    els.modalActions.appendChild(primary);

    if (secondaryText) {
      const secondary = document.createElement("button");
      secondary.className = "btn btn-soft";
      secondary.type = "button";
      secondary.textContent = secondaryText;
      secondary.addEventListener("click", onSecondary || closeModal);
      els.modalActions.appendChild(secondary);
    }

    els.modal.hidden = false;
  }

  function closeModal() {
    els.modal.hidden = true;
  }

  async function tryDownloadReward() {
    const rewardPath = "assets/rewards/recompensa-demo.pdf";
    try {
      const response = await fetch(rewardPath, { method: "HEAD", cache: "no-store" });
      if (!response.ok) {
        throw new Error("Reward not available yet");
      }
      const link = document.createElement("a");
      link.href = rewardPath;
      link.download = "recompensa-demo.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      closeModal();
    } catch (error) {
      els.modalMessage.textContent = "La recompensa estará disponible pronto.";
    }
  }

  function resetTurn(allowPlay = true) {
    firstCard = null;
    secondCard = null;
    lockBoard = !allowPlay;
  }

  function lockRemainingCards() {
    els.board.querySelectorAll(".memory-card:not(.is-matched)").forEach((card) => {
      card.disabled = true;
    });
  }

  function setMessage(element, text, type) {
    element.textContent = text;
    element.classList.toggle("is-warning", type === "warning");
    element.classList.toggle("is-success", type === "success");
  }

  function toggleSound() {
    unlockAudio();
    state.soundEnabled = !state.soundEnabled;
    saveState();
    renderSoundButtons();
  }

  function unlockAudio() {
    audioUnlocked = true;
  }

  function playSound(name) {
    if (!state.soundEnabled || !audioUnlocked || !SOUND_FILES[name]) {
      return;
    }

    try {
      let audio = audioCache.get(name);
      if (!audio) {
        audio = new Audio(SOUND_FILES[name]);
        audio.preload = "auto";
        audioCache.set(name, audio);
      }
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (error) {
      // Los sonidos son opcionales: si falta el archivo o el navegador bloquea audio, no interrumpimos el juego.
    }
  }

  function resetProgress() {
    const confirmed = window.confirm("¿Reiniciar monedas, niveles y progreso de recompensa? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    state = defaultState();
    saveState();
    renderAll();
    buildLevel();
    setMessage(els.gameMessage, "Progreso reiniciado. Empiezas con 100 monedas.", "success");
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => {});
    });
  }

  els.playButton.addEventListener("click", startGame);
  els.homeSoundButton.addEventListener("click", toggleSound);
  els.gameSoundButton.addEventListener("click", toggleSound);
  els.backHomeButton.addEventListener("click", () => {
    showScreen("home");
    renderAll();
  });
  els.restartLevelButton.addEventListener("click", () => {
    if (!isDailyLocked()) {
      buildLevel();
      setMessage(els.gameMessage, "Nivel reordenado con cartas nuevas.", "success");
    }
  });
  els.resetProgressButton.addEventListener("click", resetProgress);
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });

  applyDailyRecharge();
  renderAll();
  registerServiceWorker();
})();
