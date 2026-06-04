(() => {
  "use strict";

  const STORAGE_KEY = "studioSareschi.memoriaCreativa.v8";
  const LEGACY_STORAGE_KEY = "studioSareschi.memoriaCreativa.v1";
  const LEGACY_STORAGE_KEY_V2 = "studioSareschi.memoriaCreativa.v2";
  const REWARD_GOAL = 3000;
  const STARTING_COINS = 100;
  const ERROR_COST = 2;
  const PLAYER_MATCH_REWARD = 5;
  const PROGRESS_MATCH_REWARD = 10;
  const DAILY_BONUS = 50;
  const STREAK_PLAYER_BONUS = 10;
  const STREAK_PROGRESS_BONUS = 20;
  const TIME_BONUS_PLAYER = 50;
  const TIME_BONUS_PROGRESS = 50;

  const LEVELS = [
    { level: 1, pairs: 4, mode: "normal", label: "Normal", playerBonus: 40, progressBonus: 80 },
    { level: 2, pairs: 6, mode: "normal", label: "Normal", playerBonus: 60, progressBonus: 120 },
    { level: 3, pairs: 6, mode: "quick", label: "Vista rápida", playerBonus: 80, progressBonus: 160, previewSeconds: 2 },
    { level: 4, pairs: 8, mode: "normal", label: "Normal", playerBonus: 100, progressBonus: 200 },
    { level: 5, pairs: 8, mode: "streak", label: "Racha creativa", playerBonus: 120, progressBonus: 240 },
    { level: 6, pairs: 8, mode: "moves", label: "Movimientos limitados", playerBonus: 150, progressBonus: 300, moves: 22 },
    { level: 7, pairs: 10, mode: "normal", label: "Normal", playerBonus: 150, progressBonus: 300 },
    { level: 8, pairs: 10, mode: "timer", label: "Tiempo bonus", playerBonus: 150, progressBonus: 300, bonusSeconds: 75 },
    { level: 9, pairs: 10, mode: "restless", label: "Cartas inquietas", playerBonus: 150, progressBonus: 300, restlessEvery: 3 },
    { level: 10, pairs: 12, mode: "normal", label: "Normal", playerBonus: 150, progressBonus: 300 },
    { level: 11, pairs: 12, mode: "moves", label: "Movimientos limitados", playerBonus: 150, progressBonus: 300, moves: 32 },
    { level: 12, pairs: 12, mode: "special", label: "Reto especial", playerBonus: 150, progressBonus: 300, previewSeconds: 2 }
  ];

  const CARD_ICONS = {
    cuaderno: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Cuaderno espiral">
        <rect x="32" y="20" width="66" height="82" rx="13" fill="#ffd9ec" stroke="#fff" stroke-width="6"/>
        <rect x="43" y="34" width="42" height="52" rx="8" fill="#fffdf8" opacity=".95"/>
        <path d="M31 34h-10M31 48h-10M31 62h-10M31 76h-10M31 90h-10" stroke="#7f74d8" stroke-width="6" stroke-linecap="round"/>
        <path d="M51 50h27M51 63h27M51 76h20" stroke="#ff7fbd" stroke-width="4" stroke-linecap="round"/>
      </svg>`,
    planner: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Planner mensual">
        <rect x="24" y="29" width="72" height="62" rx="12" fill="#fffdf8" stroke="#fff" stroke-width="6"/>
        <rect x="24" y="29" width="72" height="18" rx="10" fill="#ff8fc7"/>
        <path d="M42 22v14M78 22v14" stroke="#6f5f7c" stroke-width="6" stroke-linecap="round"/>
        <path d="M38 59h11M55 59h11M72 59h11M38 74h11M55 74h11M72 74h11" stroke="#8adfc5" stroke-width="5" stroke-linecap="round"/>
      </svg>`,
    impresora: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Impresora">
        <rect x="35" y="19" width="50" height="29" rx="5" fill="#ffffff" stroke="#b9d7ec" stroke-width="4"/>
        <rect x="24" y="45" width="72" height="39" rx="11" fill="#cdefff" stroke="#fff" stroke-width="6"/>
        <rect x="35" y="68" width="50" height="31" rx="6" fill="#ffffff" stroke="#fff" stroke-width="5"/>
        <path d="M44 79h32M44 89h24" stroke="#ff8fc7" stroke-width="4" stroke-linecap="round"/>
        <circle cx="83" cy="58" r="4" fill="#7f74d8"/>
      </svg>`,
    lapiz: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Lápiz">
        <g transform="rotate(-32 60 60)">
          <rect x="33" y="50" width="56" height="18" rx="8" fill="#ffd56d" stroke="#fff" stroke-width="6"/>
          <rect x="33" y="50" width="16" height="18" rx="7" fill="#ff8fc7"/>
          <path d="M89 50l18 9-18 9z" fill="#fff4d7" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
          <path d="M103 59l-7 4v-8z" fill="#6f5f7c"/>
          <path d="M54 54h25" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
        </g>
      </svg>`,
    regla: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Regla">
        <g transform="rotate(-8 60 60)">
          <rect x="16" y="46" width="88" height="28" rx="8" fill="#aef0d5" stroke="#fff" stroke-width="6"/>
          <path d="M28 50v19M38 50v12M48 50v19M58 50v12M68 50v19M78 50v12M88 50v19" stroke="#6f5f7c" stroke-width="4" stroke-linecap="round"/>
        </g>
      </svg>`,
    cutter: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Cutter">
        <g transform="rotate(-28 60 60)">
          <rect x="28" y="46" width="66" height="26" rx="10" fill="#ff8fc7" stroke="#fff" stroke-width="6"/>
          <rect x="31" y="50" width="22" height="18" rx="7" fill="#b7d5ff"/>
          <rect x="57" y="51" width="18" height="16" rx="5" fill="#fff" opacity=".85"/>
          <path d="M94 52l12 7-12 7z" fill="#fffdf8" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
          <path d="M103 59l-7 4v-8z" fill="#6f5f7c"/>
        </g>
      </svg>`,
    clip: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Clip">
        <g transform="rotate(14 60 60)">
          <path d="M79 35c9 0 16 7 16 16v31c0 17-14 31-31 31S33 99 33 82V45c0-12 10-22 22-22s22 10 22 22v32c0 8-6 14-14 14s-14-6-14-14V50" fill="none" stroke="#6f5f7c" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M74 35c9 0 16 7 16 16v28c0 14-11 25-25 25s-25-11-25-25V46c0-9 7-16 16-16" fill="none" stroke="#ff8fc7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>`,
    pegamento: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Pegamento">
        <rect x="43" y="18" width="34" height="18" rx="6" fill="#8ee8ff" stroke="#fff" stroke-width="5"/>
        <rect x="36" y="34" width="48" height="66" rx="14" fill="#fffdf8" stroke="#fff" stroke-width="6"/>
        <rect x="42" y="55" width="36" height="23" rx="8" fill="#ffb7dd"/>
        <path d="M50 66h20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      </svg>`,
    sobre: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Sobre">
        <rect x="21" y="38" width="78" height="46" rx="10" fill="#fffdf8" stroke="#fff" stroke-width="6"/>
        <path d="M28 47l32 23 32-23" fill="none" stroke="#ff8fc7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M29 78l22-17M91 78L69 61" fill="none" stroke="#ffd19d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    sello: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Sello">
        <path d="M46 29c0-10 28-10 28 0v16H46z" fill="#c9b6ff" stroke="#fff" stroke-width="6"/>
        <rect x="34" y="43" width="52" height="22" rx="8" fill="#ffcf7c" stroke="#fff" stroke-width="5"/>
        <rect x="26" y="67" width="68" height="24" rx="8" fill="#ff8fc7" stroke="#fff" stroke-width="5"/>
        <path d="M39 79h42" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      </svg>`,
    washi: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Washi tape">
        <circle cx="58" cy="58" r="32" fill="#ffcf7c" stroke="#fff" stroke-width="7"/>
        <circle cx="58" cy="58" r="14" fill="#fff8ec"/>
        <path d="M29 55c16-10 43-10 58 0" stroke="#ff78b7" stroke-width="8" stroke-linecap="round" opacity=".82"/>
        <path d="M34 76c14-9 35-9 49 0" stroke="#8ee8ff" stroke-width="7" stroke-linecap="round" opacity=".9"/>
      </svg>`,
    stickers: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Stickers">
        <path d="M56 18l9 21 23 2-18 15 6 23-20-12-20 12 6-23-18-15 23-2z" fill="#ffd75f" stroke="#fff" stroke-width="6"/>
        <circle cx="84" cy="80" r="16" fill="#a8f4d3" stroke="#fff" stroke-width="5"/>
        <path d="M31 78c8-11 20-11 28 0-8 12-20 12-28 0z" fill="#ff8fc7" stroke="#fff" stroke-width="5"/>
      </svg>`
  };

  const TROPHY_BADGE_IMAGE = "assets/ui/trophy-badge.png";

  const CARDS = [
    { id: "cuaderno", name: "Cuaderno espiral", image: "assets/cards/cuaderno.png" },
    { id: "planner", name: "Planner", image: "assets/cards/planner.png" },
    { id: "impresora", name: "Impresora", image: "assets/cards/impresora.png" },
    { id: "lapiz", name: "Lápiz", image: "assets/cards/lapiz.png" },
    { id: "regla", name: "Regla", image: "assets/cards/regla.png" },
    { id: "cutter", name: "Cutter", image: "assets/cards/cutter.png" },
    { id: "clip", name: "Clip", image: "assets/cards/clip.png" },
    { id: "pegamento", name: "Pegamento", image: "assets/cards/pegamento.png" },
    { id: "sobre", name: "Sobre", image: "assets/cards/sobre.png" },
    { id: "sello", name: "Sello", image: "assets/cards/sello.png" },
    { id: "washi", name: "Washi tape", image: "assets/cards/washi-tape.png" },
    { id: "stickers", name: "Stickers", image: "assets/cards/stickers.png" }
  ];

  const els = {
    homeScreen: document.querySelector("#home-screen"),
    gameScreen: document.querySelector("#game-screen"),
    homeCoins: document.querySelector("#home-coins"),
    homeLevel: document.querySelector("#home-level"),
    homeRound: document.querySelector("#home-round"),
    homeProgressText: document.querySelector("#home-progress-text"),
    homeProgressFill: document.querySelector("#home-progress-fill"),
    homeRewardStatus: document.querySelector("#home-reward-status"),
    homeDailyMessage: document.querySelector("#home-daily-message"),
    playButton: document.querySelector("#play-button"),
    shareButton: document.querySelector("#share-button"),
    homeSoundButton: document.querySelector("#home-sound-button"),
    gameSoundButton: document.querySelector("#game-sound-button"),
    backHomeButton: document.querySelector("#back-home-button"),
    gameLevel: document.querySelector("#game-level"),
    gameRound: document.querySelector("#game-round"),
    gameMode: document.querySelector("#game-mode"),
    gameCoins: document.querySelector("#game-coins"),
    gameProgressText: document.querySelector("#game-progress-text"),
    gameProgressFill: document.querySelector("#game-progress-fill"),
    gameRewardStatus: document.querySelector("#game-reward-status"),
    matchedPairs: document.querySelector("#matched-pairs"),
    totalPairs: document.querySelector("#total-pairs"),
    movesPanel: document.querySelector("#moves-panel"),
    movesLeft: document.querySelector("#moves-left"),
    timerPanel: document.querySelector("#timer-panel"),
    timerLeft: document.querySelector("#timer-left"),
    gameMessage: document.querySelector("#game-message"),
    board: document.querySelector("#memory-board"),
    restartLevelButton: document.querySelector("#restart-level-button"),
    resetProgressButton: document.querySelector("#reset-progress-button"),
    modal: document.querySelector("#modal"),
    modalBadge: document.querySelector("#modal-badge"),
    modalTitle: document.querySelector("#modal-title"),
    modalMessage: document.querySelector("#modal-message"),
    modalActions: document.querySelector("#modal-actions"),
    levelIntro: document.querySelector("#level-intro"),
    levelIntroTitle: document.querySelector("#level-intro-title"),
    levelIntroText: document.querySelector("#level-intro-text"),
    levelIntroKicker: document.querySelector("#level-intro-kicker"),
    levelIntroOk: document.querySelector("#level-intro-ok")
  };

  let state = loadState();
  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let matchedCount = 0;
  let mismatchStreak = 0;
  let matchStreak = 0;
  let movesLeft = null;
  let timerId = null;
  let introTimerId = null;
  let celebrationTimerId = null;
  let timerLeft = 0;
  let timerBonusAvailable = false;
  let audioUnlocked = false;
  let audioContext = null;

  function defaultState() {
    return {
      playerCoins: STARTING_COINS,
      rewardProgress: 0,
      currentLevel: 1,
      roundNumber: 1,
      currentRewardMonth: monthKey(),
      monthlyRewardUnlocked: false,
      monthlyRewardClaimed: false,
      unlockedReward: false,
      soundEnabled: true,
      lastDailyResetDate: todayKey(),
      lastDailyBonusDate: "",
      bestProgress: 0,
      completedCycles: 0
    };
  }

  function loadState() {
    try {
      const storedV4 = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const storedV2 = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY_V2));
      const storedV1 = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
      const stored = storedV4 || storedV2 || storedV1 || {};
      return normalizeState({ ...defaultState(), ...stored });
    } catch (error) {
      return defaultState();
    }
  }

  function normalizeState(nextState) {
    nextState.playerCoins = Math.max(0, Number(nextState.playerCoins) || 0);
    nextState.rewardProgress = clamp(Number(nextState.rewardProgress) || 0, 0, REWARD_GOAL);
    nextState.currentLevel = clamp(Number(nextState.currentLevel) || 1, 1, LEVELS.length);
    nextState.roundNumber = Math.max(1, Number(nextState.roundNumber) || Number(nextState.completedCycles || 0) + 1 || 1);
    nextState.currentRewardMonth = nextState.currentRewardMonth || monthKey();
    nextState.monthlyRewardClaimed = Boolean(nextState.monthlyRewardClaimed);
    if (nextState.monthlyRewardClaimed) {
      nextState.rewardProgress = 0;
      nextState.monthlyRewardUnlocked = false;
      nextState.unlockedReward = false;
    } else {
      nextState.monthlyRewardUnlocked = Boolean(nextState.monthlyRewardUnlocked || nextState.unlockedReward || nextState.rewardProgress >= REWARD_GOAL);
      nextState.unlockedReward = nextState.monthlyRewardUnlocked;
    }
    nextState.soundEnabled = nextState.soundEnabled !== false;
    nextState.lastDailyResetDate = nextState.lastDailyResetDate || todayKey();
    nextState.lastDailyBonusDate = nextState.lastDailyBonusDate || nextState.lastShareBonusDate || "";
    delete nextState.lastShareBonusDate;
    nextState.bestProgress = Math.max(Number(nextState.bestProgress) || 0, nextState.rewardProgress);
    nextState.completedCycles = Math.max(0, Number(nextState.completedCycles) || 0);
    return applyMonthlyRewardReset(nextState);
  }

  function saveState() {
    state.bestProgress = Math.max(state.bestProgress, state.rewardProgress);
    state.unlockedReward = state.monthlyRewardUnlocked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function todayKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function monthKey() {
    return todayKey().slice(0, 7);
  }

  function applyMonthlyRewardReset(nextState = state) {
    const currentMonth = monthKey();
    if (nextState.currentRewardMonth !== currentMonth) {
      nextState.currentRewardMonth = currentMonth;
      nextState.rewardProgress = 0;
      nextState.monthlyRewardUnlocked = false;
      nextState.monthlyRewardClaimed = false;
      nextState.unlockedReward = false;
    }
    return nextState;
  }

  function applyDailyRecharge() {
    const today = todayKey();
    applyMonthlyRewardReset(state);

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
    applyMonthlyRewardReset(state);
    const progressPercent = Math.min(100, (state.rewardProgress / REWARD_GOAL) * 100);
    const level = currentLevelConfig();

    setText(els.homeCoins, state.playerCoins);
    setText(els.homeLevel, state.currentLevel);
    setText(els.homeRound, state.roundNumber);
    setText(els.homeProgressText, state.rewardProgress);
    setText(els.gameCoins, state.playerCoins);
    setText(els.gameLevel, state.currentLevel);
    setText(els.gameRound, state.roundNumber);
    setText(els.gameMode, level.label);
    setText(els.gameProgressText, state.rewardProgress);

    if (els.homeProgressFill) els.homeProgressFill.style.width = `${progressPercent}%`;
    if (els.gameProgressFill) els.gameProgressFill.style.width = `${progressPercent}%`;

    const rewardStatus = getRewardStatusText();
    setText(els.homeRewardStatus, rewardStatus);
    setText(els.gameRewardStatus, rewardStatus);

    els.playButton.disabled = isDailyLocked();
    els.restartLevelButton.disabled = isDailyLocked();
    renderShareButton();
    renderSoundButtons();
    renderChallengePanels();

    if (isDailyLocked()) {
      setMessage(els.homeDailyMessage, "Te quedaste sin monedas por hoy. Vuelve mañana para seguir jugando.", "warning");
      setMessage(els.gameMessage, "Te quedaste sin monedas por hoy. Vuelve mañana para seguir jugando.", "warning");
    } else if (!els.homeDailyMessage.textContent) {
      setMessage(els.homeDailyMessage, "", "");
    }
  }

  function getRewardStatusText() {
    if (state.monthlyRewardClaimed) {
      return "Ya recibiste tu recurso creativo de este mes. La barra vuelve a cero hasta la próxima recompensa mensual.";
    }
    if (state.monthlyRewardUnlocked) {
      return "¡Tu recurso creativo del mes ya está disponible!";
    }
    return "Junta 3000 monedas acumuladas para desbloquear 1 recurso gratis este mes.";
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function renderShareButton() {
    if (!els.shareButton) return;
    const usedToday = state.lastDailyBonusDate === todayKey();
    els.shareButton.textContent = usedToday ? "Regalo diario recibido" : "Regalo diario +50";
    els.shareButton.disabled = usedToday;
  }

  function renderChallengePanels() {
    const level = currentLevelConfig();
    if (els.movesPanel) {
      const showMoves = level.mode === "moves" && movesLeft !== null;
      els.movesPanel.hidden = !showMoves;
      setText(els.movesLeft, showMoves ? movesLeft : "—");
    }
    if (els.timerPanel) {
      const showTimer = level.mode === "timer" && timerLeft > 0;
      els.timerPanel.hidden = !showTimer;
      setText(els.timerLeft, showTimer ? `${timerLeft}s` : "—");
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
    if (screenName !== "game") hideLevelIntro();
  }

  function buildLevel() {
    clearTimer();
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    matchedCount = 0;
    mismatchStreak = 0;
    matchStreak = 0;

    const level = currentLevelConfig();
    movesLeft = level.mode === "moves" ? level.moves : null;
    timerLeft = level.mode === "timer" ? level.bonusSeconds : 0;
    timerBonusAvailable = level.mode === "timer";

    const selectedCards = CARDS.slice(0, level.pairs);
    const deck = shuffle([...selectedCards, ...selectedCards].map((card, index) => ({
      ...card,
      instanceId: `${card.id}-${index}`
    })));

    els.board.innerHTML = "";
    els.board.style.setProperty("--columns", String(getColumnCount(level.pairs)));
    els.totalPairs.textContent = level.pairs;
    els.matchedPairs.textContent = "0";
    setMessage(els.gameMessage, getStartMessage(level), "");

    deck.forEach((card) => {
      els.board.appendChild(createCardButton(card));
    });

    renderAll();
    showLevelIntro(level, () => {
      if (level.mode === "quick" || level.mode === "special") {
        revealPreview(level.previewSeconds || 2);
      } else {
        lockBoard = false;
      }

      if (level.mode === "timer") {
        startTimer();
      }
    });
  }

  function getStartMessage(level) {
    if (level.mode === "quick" || level.mode === "special") {
      return "Mira las cartas unos segundos y memoriza su lugar.";
    }
    if (level.mode === "moves") {
      return `Tienes ${level.moves} movimientos para completar el nivel.`;
    }
    if (level.mode === "timer") {
      return "Completa el nivel antes de que acabe el tiempo para ganar bonus extra.";
    }
    if (level.mode === "restless") {
      return "Cuidado: después de varios errores, algunas cartas se reordenan.";
    }
    if (level.mode === "streak") {
      return "Encuentra pares seguidos para activar una racha creativa.";
    }
    return "Elige dos cartas para encontrar un par.";
  }


  function getModeIntro(level) {
    const map = {
      normal: { kicker: `Nivel ${level.level}`, title: "¡A jugar!", text: "Encuentra todos los pares para avanzar al siguiente reto." },
      quick: { kicker: `Nivel ${level.level}`, title: "¡Vista rápida!", text: "Mira las cartas unos segundos y memoriza su lugar." },
      streak: { kicker: `Nivel ${level.level}`, title: "¡Racha creativa!", text: "Haz dos aciertos seguidos para ganar un pequeño impulso extra." },
      moves: { kicker: `Nivel ${level.level}`, title: "¡Movimientos limitados!", text: `Tienes ${level.moves} movimientos. Juega con calma y piensa cada toque.` },
      timer: { kicker: `Nivel ${level.level}`, title: "¡Tiempo bonus!", text: "Si completas rápido, ganas un bonus extra. Si no, igual puedes terminar el nivel." },
      restless: { kicker: `Nivel ${level.level}`, title: "¡Cartas inquietas!", text: "Después de varios errores, las cartas ocultas se reordenan. ¡Atenta!" },
      special: { kicker: `Nivel ${level.level}`, title: "¡Reto especial!", text: "Combina memoria rápida y atención para superar este nivel." }
    };
    return map[level.mode] || map.normal;
  }

  function showLevelIntro(level, onContinue) {
    if (!els.levelIntro) {
      if (typeof onContinue === "function") onContinue();
      return;
    }
    const intro = getModeIntro(level);
    lockBoard = true;
    if (els.levelIntroKicker) els.levelIntroKicker.textContent = `Ronda ${state.roundNumber} · ${intro.kicker}`;
    els.levelIntroTitle.textContent = intro.title;
    els.levelIntroText.textContent = intro.text;
    els.levelIntro.hidden = false;
    els.levelIntro.classList.remove('is-hiding');
    els.levelIntro.classList.add('is-visible');
    window.clearTimeout(introTimerId);

    if (els.levelIntroOk) {
      els.levelIntroOk.onclick = () => {
        hideLevelIntro(onContinue);
      };
      window.setTimeout(() => els.levelIntroOk.focus(), 80);
    }
  }

  function hideLevelIntro(onHidden) {
    if (!els.levelIntro || els.levelIntro.hidden) {
      if (typeof onHidden === "function") onHidden();
      return;
    }
    els.levelIntro.classList.remove('is-visible');
    els.levelIntro.classList.add('is-hiding');
    window.clearTimeout(introTimerId);
    introTimerId = window.setTimeout(() => {
      els.levelIntro.hidden = true;
      els.levelIntro.classList.remove('is-hiding');
      if (typeof onHidden === "function") onHidden();
    }, 260);
  }

  function revealPreview(seconds) {
    lockBoard = true;
    const cards = [...els.board.querySelectorAll(".memory-card:not(.is-matched)")];
    cards.forEach((card) => card.classList.add("is-flipped", "is-preview"));
    window.setTimeout(() => {
      cards.forEach((card) => card.classList.remove("is-flipped", "is-preview"));
      lockBoard = false;
      setMessage(els.gameMessage, "Ahora sí: encuentra los pares creativos.", "success");
    }, Math.max(1, seconds) * 1000);
  }

  function startTimer() {
    clearTimer();
    timerId = window.setInterval(() => {
      timerLeft = Math.max(0, timerLeft - 1);
      renderChallengePanels();
      if (timerLeft <= 0) {
        timerBonusAvailable = false;
        clearTimer();
        setMessage(els.gameMessage, "Se acabó el tiempo bonus, pero puedes seguir jugando el nivel.", "warning");
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function getColumnCount(pairCount) {
    if (window.matchMedia("(max-width: 520px)").matches) {
      if (pairCount >= 12) return 6;
      if (pairCount >= 10) return 5;
      return 4;
    }
    if (pairCount >= 10) return 6;
    return 4;
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

    const question = document.createElement("span");
    question.className = "card-question";
    question.setAttribute("aria-hidden", "true");
    question.textContent = "?";

    const front = document.createElement("span");
    front.className = "card-face card-front";

    const image = document.createElement("img");
    image.src = card.image;
    image.alt = "";
    image.loading = "lazy";

    const placeholder = document.createElement("span");
    placeholder.className = "card-placeholder";
    placeholder.innerHTML = CARD_ICONS[card.id] || CARD_ICONS.stickers;
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.hidden = true;

    image.addEventListener("error", () => {
      image.hidden = true;
      placeholder.hidden = false;
    }, { once: true });

    front.append(image, placeholder);
    back.append(question);
    inner.append(back, front);
    button.append(inner);
    button.addEventListener("click", () => handleCardClick(button));
    return button;
  }

  function handleCardClick(cardButton) {
    unlockAudio();

    if (lockBoard || isDailyLocked() || cardButton === firstCard || cardButton.classList.contains("is-matched") || cardButton.classList.contains("is-preview")) {
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
    countMoveIfNeeded();

    if (firstCard.dataset.cardId === secondCard.dataset.cardId) {
      handleMatch();
    } else {
      handleMismatch();
    }
  }

  function countMoveIfNeeded() {
    const level = currentLevelConfig();
    if (level.mode !== "moves" || movesLeft === null) return;
    movesLeft = Math.max(0, movesLeft - 1);
    renderChallengePanels();
  }

  function handleMatch() {
    firstCard.classList.add("is-matched");
    secondCard.classList.add("is-matched");
    firstCard.disabled = true;
    secondCard.disabled = true;
    matchedCount += 1;
    matchStreak += 1;
    mismatchStreak = 0;
    els.matchedPairs.textContent = matchedCount;

    addRewards(PLAYER_MATCH_REWARD, PROGRESS_MATCH_REWARD);
    let message = `¡Buen match! +${PLAYER_MATCH_REWARD} monedas para jugar y +${PROGRESS_MATCH_REWARD} monedas acumuladas.`;

    if ((currentLevelConfig().mode === "streak" || currentLevelConfig().mode === "special") && matchStreak >= 2) {
      addRewards(STREAK_PLAYER_BONUS, STREAK_PROGRESS_BONUS);
      message = `¡Racha creativa x${matchStreak}! +${PLAYER_MATCH_REWARD + STREAK_PLAYER_BONUS} monedas.`;
    }

    setMessage(els.gameMessage, message, "success");
    playSound("match");
    playSound("coins");
    resetTurn();

    if (matchedCount === currentLevelConfig().pairs) {
      window.setTimeout(completeLevel, 520);
      return;
    }

    maybeStopForMovesLimit();
  }

  function handleMismatch() {
    const level = currentLevelConfig();
    matchStreak = 0;
    mismatchStreak += 1;
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

    setMessage(els.gameMessage, `Inténtalo otra vez. -${ERROR_COST} monedas.`, "warning");
    window.setTimeout(() => {
      firstCard.classList.remove("is-flipped");
      secondCard.classList.remove("is-flipped");
      firstCard.setAttribute("aria-label", "Carta oculta");
      secondCard.setAttribute("aria-label", "Carta oculta");
      resetTurn();

      if (level.mode === "restless" && mismatchStreak > 0 && mismatchStreak % (level.restlessEvery || 3) === 0) {
        shuffleHiddenCards();
        setMessage(els.gameMessage, "Las cartas inquietas se mezclaron. Respira y sigue intentando.", "warning");
      }

      maybeStopForMovesLimit();
    }, 760);
  }

  function maybeStopForMovesLimit() {
    const level = currentLevelConfig();
    if (level.mode !== "moves" || movesLeft === null || matchedCount === level.pairs) return;
    if (movesLeft <= 0) {
      lockBoard = true;
      lockRemainingCards();
      showInfoModal({
        badge: "🎲",
        title: "Se acabaron los movimientos",
        message: "Puedes reordenar el mismo nivel y volver a intentarlo. No perderás tu nivel actual.",
        primaryText: "Reintentar nivel",
        onPrimary: () => {
          closeModal();
          buildLevel();
        },
        secondaryText: "Ir al inicio",
        onSecondary: () => {
          closeModal();
          showScreen("home");
          renderAll();
        }
      });
    }
  }

  function shuffleHiddenCards() {
    const hiddenCards = [...els.board.querySelectorAll(".memory-card:not(.is-matched):not(.is-flipped)")];
    shuffle(hiddenCards).forEach((card) => els.board.appendChild(card));
  }

  function addRewards(playerAmount, progressAmount) {
    state.playerCoins += Math.max(0, Number(playerAmount) || 0);
    if (!state.monthlyRewardClaimed && progressAmount > 0) {
      const wasUnlocked = state.monthlyRewardUnlocked;
      state.rewardProgress = clamp(state.rewardProgress + progressAmount, 0, REWARD_GOAL);
      if (state.rewardProgress >= REWARD_GOAL) {
        state.monthlyRewardUnlocked = true;
        state.unlockedReward = true;
      }
      if (!wasUnlocked && state.monthlyRewardUnlocked) {
        window.setTimeout(showRewardModal, 420);
        playSound("win");
      }
    }
    saveState();
    renderAll();
  }

  function completeLevel() {
    clearTimer();
    const level = currentLevelConfig();
    addRewards(level.playerBonus, level.progressBonus);

    let extraMessage = `Ganaste +${level.playerBonus} monedas para jugar y +${level.progressBonus} monedas acumuladas.`;
    if (level.mode === "timer" && timerBonusAvailable) {
      addRewards(TIME_BONUS_PLAYER, TIME_BONUS_PROGRESS);
      extraMessage += ` También lograste el bonus de tiempo: +${TIME_BONUS_PLAYER} monedas.`;
    }

    const finishedAllLevels = state.currentLevel === LEVELS.length;
    if (finishedAllLevels) {
      state.completedCycles += 1;
      state.roundNumber += 1;
      state.currentLevel = 1;
      saveState();
      renderAll();
      launchCelebration("round");
      playSound("fanfare");
      showInfoModal({
        badge: "🏆",
        title: "¡Ronda completada!",
        message: `${extraMessage} Desbloqueaste la Ronda ${state.roundNumber}. Tu progreso mensual se mantiene.`,
        primaryText: "Jugar ronda nueva",
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
    launchCelebration("level");
    playSound("celebrate");
    showInfoModal({
      badge: "✨",
      title: `¡Nivel ${level.level} completo!`,
      message: `${extraMessage} El siguiente nivel trae otro reto creativo.`,
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
      title: "¡Ganaste el recurso creativo de este mes!",
      message: "Juntaste 3000 monedas acumuladas. Puedes descargar el recurso mensual cuando esté disponible.",
      primaryText: "Descargar recurso",
      onPrimary: tryDownloadReward,
      secondaryText: "Seguir jugando",
      onSecondary: closeModal
    });
  }

  function showInfoModal({ badge, title, message, primaryText, onPrimary, secondaryText, onSecondary }) {
    const modalCard = els.modal.querySelector(".modal-card");
    renderModalBadge(badge);
    els.modalTitle.textContent = title;
    els.modalMessage.textContent = message;
    els.modalActions.innerHTML = "";
    if (modalCard) {
      modalCard.classList.toggle("is-trophy", badge === "🏆");
      modalCard.classList.toggle("is-level-win", badge === "✨");
      modalCard.classList.toggle("is-gift", badge === "🎁");
    }

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

  function renderModalBadge(badge) {
    els.modalBadge.innerHTML = "";
    if (badge === "🏆") {
      const img = document.createElement("img");
      img.src = TROPHY_BADGE_IMAGE;
      img.alt = "";
      img.className = "modal-badge-image";
      img.draggable = false;
      els.modalBadge.appendChild(img);
      return;
    }
    els.modalBadge.textContent = badge;
  }

  function closeModal() {
    const modalCard = els.modal.querySelector(".modal-card");
    if (modalCard) modalCard.classList.remove("is-trophy", "is-level-win", "is-gift");
    els.modal.hidden = true;
  }

  async function tryDownloadReward() {
    const rewardPath = "assets/rewards/recompensa-demo.pdf";

    // La recompensa mensual se considera recibida al presionar el botón.
    // Esto corrige estados anteriores donde la barra quedaba visualmente en 3000/3000
    // aunque la usuaria ya hubiera reclamado el recurso.
    state.monthlyRewardClaimed = true;
    state.monthlyRewardUnlocked = false;
    state.unlockedReward = false;
    state.rewardProgress = 0;
    saveState();
    renderAll();

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
      els.modalMessage.textContent = "Tu recurso quedó registrado y la barra volvió a cero. Si el archivo aún no está cargado, podrás enviarlo manualmente.";
      const primaryButton = els.modalActions.querySelector(".btn-primary");
      if (primaryButton) {
        primaryButton.textContent = "Entendido";
        primaryButton.onclick = closeModal;
      }
    }
  }

  function launchCelebration(type = "level") {
    window.clearTimeout(celebrationTimerId);
    document.querySelectorAll(".celebration-layer").forEach((node) => node.remove());

    const layer = document.createElement("div");
    layer.className = `celebration-layer celebration-${type}`;
    layer.setAttribute("aria-hidden", "true");

    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    layer.appendChild(burst);

    const pieces = type === "round" ? 56 : 34;
    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--delay", `${(Math.random() * 0.45).toFixed(2)}s`);
      piece.style.setProperty("--duration", `${(1.2 + Math.random() * 1.25).toFixed(2)}s`);
      piece.style.setProperty("--rotate", `${Math.round(Math.random() * 360)}deg`);
      piece.style.setProperty("--drift", `${(-120 + Math.random() * 240).toFixed(0)}px`);
      piece.style.setProperty("--size", `${8 + Math.random() * 10}px`);
      piece.style.setProperty("--hue", `${Math.round(Math.random() * 360)}deg`);
      layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    celebrationTimerId = window.setTimeout(() => layer.remove(), 2400);
  }

  function claimDailyBonus() {
    unlockAudio();
    applyDailyRecharge();

    if (state.lastDailyBonusDate === todayKey()) {
      setMessage(els.homeDailyMessage, "Ya recibiste tu regalo diario. Vuelve mañana para ganar más monedas.", "warning");
      renderShareButton();
      return;
    }

    state.playerCoins += DAILY_BONUS;
    state.lastDailyBonusDate = todayKey();
    saveState();
    renderAll();
    setMessage(els.homeDailyMessage, `Regalo creativo recibido: +${DAILY_BONUS} monedas para seguir jugando.`, "success");
    playSound("coins");
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
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch (error) {
      // El audio es opcional; si el navegador no lo permite, el juego sigue funcionando.
    }
  }

  function playSound(name) {
    if (!state.soundEnabled || !audioUnlocked) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();

      const presets = {
        flip: { frequencies: [520], duration: 0.055, type: "triangle", volume: 0.035 },
        match: { frequencies: [660, 880], duration: 0.09, type: "sine", volume: 0.045 },
        error: { frequencies: [190, 150], duration: 0.11, type: "sawtooth", volume: 0.025 },
        coins: { frequencies: [880, 1180, 1440], duration: 0.065, type: "triangle", volume: 0.04 },
        win: { frequencies: [660, 880, 1040, 1320], duration: 0.11, type: "sine", volume: 0.05 },
        celebrate: { frequencies: [784, 1046, 1318, 1568], duration: 0.12, type: "triangle", volume: 0.06 },
        fanfare: { frequencies: [523, 659, 784, 1046, 1318], duration: 0.14, type: "triangle", volume: 0.07 }
      };

      const preset = presets[name] || presets.flip;
      const now = audioContext.currentTime;

      preset.frequencies.forEach((frequency, index) => {
        const start = now + index * preset.duration * 0.85;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = preset.type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(preset.volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + preset.duration);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + preset.duration + 0.02);
      });
    } catch (error) {
      // Sonidos generados con Web Audio. Si el navegador los bloquea, no interrumpimos el juego.
    }
  }

  function resetProgress() {
    const confirmed = window.confirm("¿Reiniciar monedas, niveles, rondas y progreso mensual? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    clearTimer();
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
      navigator.serviceWorker.register("/memoria-creativa/service-worker.js", { scope: "/memoria-creativa/" }).catch(() => {});
    });
  }

  els.playButton.addEventListener("click", startGame);
  els.shareButton.addEventListener("click", claimDailyBonus);
  els.homeSoundButton.addEventListener("click", toggleSound);
  els.gameSoundButton.addEventListener("click", toggleSound);
  els.backHomeButton.addEventListener("click", () => {
    clearTimer();
    showScreen("home");
    renderAll();
  });
  els.restartLevelButton.addEventListener("click", () => {
    if (!isDailyLocked()) {
      buildLevel();
      setMessage(els.gameMessage, "Nivel reordenado sin perder tu progreso.", "success");
    }
  });
  els.resetProgressButton.addEventListener("click", resetProgress);
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });
  if (els.levelIntro) {
    els.levelIntro.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  applyDailyRecharge();
  saveState();
  renderAll();
  registerServiceWorker();
})();
