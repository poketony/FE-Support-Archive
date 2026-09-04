import { GameRenderer, createState } from "./game-renderer.js";
import { splitConversationFrames } from "./renderer-format.js";
import { visibleText } from "./display.js";

const PATCH_FLAG = Symbol.for("fe-support.renderer-accelerator");
const MAX_CACHED_FRAMES = 20;
const MAX_TIMELINES = 4;
const rendererStates = new WeakMap();
const warmedGames = new Set();
const warmingGames = new Map();
const COMMON_BINARY_ASSETS = ["bin/chars.bin", "bin/faces.bin", "txt/FID.txt"];
const COMMON_IMAGE_ASSETS = [
  "img/Awakening_0.png",
  "img/Awakening_1.png",
  "img/SupportBG.png",
  "img/TextBox.png",
  "img/NameBox.png",
  "img/KeyPress.png",
];

function stateFor(renderer) {
  if (!rendererStates.has(renderer)) {
    rendererStates.set(renderer, {
      cache: new Map(),
      pending: new Map(),
      timelines: new Map(),
      lastScript: null,
      lastScriptToken: "",
      scheduled: new Set(),
    });
  }
  return rendererStates.get(renderer);
}

function hashScript(value) {
  let a = 2166136261;
  let b = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 16777619);
    b = ((b << 5) + b) ^ code;
  }
  return `${value.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

function scriptToken(cacheState, value) {
  if (cacheState.lastScript === value) return cacheState.lastScriptToken;
  cacheState.lastScript = value;
  cacheState.lastScriptToken = hashScript(value);
  return cacheState.lastScriptToken;
}

function profileKey(options) {
  return `${options.playerName || ""}\u001f${options.playerGender || ""}`;
}

function frameKey(cacheState, value, options, width, height) {
  const frameIndex = Number.isFinite(options.frameIndex) ? options.frameIndex : 0;
  return `${scriptToken(cacheState, value)}\u001f${profileKey(options)}\u001f${width}x${height}\u001f${frameIndex}`;
}

function cloneRenderState(state) {
  return {
    ...state,
    charA: { ...state.charA },
    charB: { ...state.charB },
    unknownCodes: new Set(state.unknownCodes),
  };
}

function touch(cacheState, key, snapshot) {
  cacheState.cache.delete(key);
  cacheState.cache.set(key, snapshot);
}

function store(cacheState, key, snapshot) {
  touch(cacheState, key, snapshot);
  while (cacheState.cache.size > MAX_CACHED_FRAMES) {
    const oldestKey = cacheState.cache.keys().next().value;
    cacheState.cache.delete(oldestKey);
  }
}

function copySnapshot(snapshot, canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(snapshot.canvas, 0, 0);
}

function scheduleIdle(task) {
  if (document.visibilityState === "hidden") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => task(), { timeout: 500 });
  } else {
    window.setTimeout(task, 80);
  }
}

function currentGameId() {
  const value = document.body?.dataset.game || location.hash.replace(/^#\/?/u, "").split("/")[0] || "";
  return value === "awakening" || value === "fates" ? value : "";
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.decoding = "async";
    image.src = url.href;
  });
}

function warmCommonAssets(gameId) {
  if (!gameId || warmedGames.has(gameId)) return Promise.resolve();
  if (warmingGames.has(gameId)) return warmingGames.get(gameId);

  const base = new URL(`./assets/renderers/${gameId}/`, location.href);
  const promise = Promise.allSettled([
    ...COMMON_BINARY_ASSETS.map((relative) => fetch(new URL(relative, base)).then((response) => {
      if (!response.ok) throw new Error(`${relative}: ${response.status}`);
      return response.arrayBuffer();
    })),
    ...COMMON_IMAGE_ASSETS.map((relative) => preloadImage(new URL(relative, base))),
  ]).then(() => {
    warmedGames.add(gameId);
  }).finally(() => {
    warmingGames.delete(gameId);
  });

  warmingGames.set(gameId, promise);
  return promise;
}

let warmupScheduled = false;
function scheduleCommonWarmup() {
  if (warmupScheduled || document.visibilityState === "hidden") return;
  const gameId = currentGameId();
  if (!gameId || warmedGames.has(gameId) || !document.querySelector(".conversation-card")) return;
  warmupScheduled = true;
  scheduleIdle(() => {
    warmupScheduled = false;
    warmCommonAssets(gameId).catch(() => {});
  });
}

function timelineFor(renderer, cacheState, value, options) {
  const playerName = options.playerName || (renderer.gameId === "awakening" ? "러플레" : "카무이");
  const playerGender = options.playerGender === "male" ? "male" : "female";
  const key = `${scriptToken(cacheState, value)}\u001f${playerName}\u001f${playerGender}`;
  const cached = cacheState.timelines.get(key);
  if (cached?.value === value) {
    cacheState.timelines.delete(key);
    cacheState.timelines.set(key, cached);
    return cached;
  }

  const timeline = {
    value,
    frames: splitConversationFrames(value),
    states: [],
    messages: [],
    workingState: createState(playerName, playerGender),
    builtThrough: -1,
  };
  cacheState.timelines.set(key, timeline);
  while (cacheState.timelines.size > MAX_TIMELINES) {
    const oldestKey = cacheState.timelines.keys().next().value;
    cacheState.timelines.delete(oldestKey);
  }
  return timeline;
}

function prepareFrameState(renderer, cacheState, value, options) {
  const timeline = timelineFor(renderer, cacheState, value, options);
  const frameIndex = Math.max(0, Math.min(options.frameIndex ?? 0, timeline.frames.length - 1));

  for (let index = timeline.builtThrough + 1; index <= frameIndex; index += 1) {
    const visibleMessage = renderer.parseFrame(timeline.frames[index], timeline.workingState);
    if (timeline.workingState.type === 0) {
      if (timeline.workingState.active === "A") timeline.workingState.topMessage = visibleMessage;
      else timeline.workingState.bottomMessage = visibleMessage;
    }
    timeline.messages[index] = visibleMessage;
    timeline.states[index] = cloneRenderState(timeline.workingState);
    timeline.builtThrough = index;
  }

  return {
    frameCount: timeline.frames.length,
    frameIndex,
    state: cloneRenderState(timeline.states[frameIndex]),
    visibleMessage: timeline.messages[frameIndex] || "",
  };
}

if (!GameRenderer.prototype[PATCH_FLAG]) {
  const originalRender = GameRenderer.prototype.render;

  async function timelineRender(renderer, value, canvas, options = {}) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!renderer.ready || !value) return { frameCount: value ? 1 : 0, diagnostics: [] };

    const cacheState = stateFor(renderer);
    const prepared = prepareFrameState(renderer, cacheState, value, options);
    const { frameCount, frameIndex, state, visibleMessage } = prepared;
    const missing = new Set();
    const nameMap = options.nameMap ?? new Map();

    await renderer.drawBackground(context);
    if (state.type === 0) {
      await renderer.drawTypeZero(context, state, nameMap, missing, frameIndex < frameCount - 1);
    } else {
      await renderer.drawTypeOne(context, state, visibleMessage, nameMap, missing, frameIndex < frameCount - 1);
    }

    const diagnostics = [
      ...[...missing].map((item) => ({ type: "asset", message: `누락 에셋(투명 처리): ${item}` })),
      ...[...state.unknownCodes].map((item) => ({ type: "code", message: `알 수 없는 제어코드(무시): ${item}` })),
    ];
    return { frameCount, frameIndex, diagnostics, type: state.type, message: visibleText(visibleMessage) };
  }

  async function optimizedRender(renderer, value, canvas, options) {
    try {
      return await timelineRender(renderer, value, canvas, options);
    } catch {
      return originalRender.call(renderer, value, canvas, options);
    }
  }

  async function ensureSnapshot(renderer, value, options, width, height) {
    const cacheState = stateFor(renderer);
    const key = frameKey(cacheState, value, options, width, height);
    const cached = cacheState.cache.get(key);
    if (cached) {
      touch(cacheState, key, cached);
      return cached;
    }
    if (cacheState.pending.has(key)) return cacheState.pending.get(key);

    const promise = (async () => {
      const buffer = document.createElement("canvas");
      buffer.width = width;
      buffer.height = height;
      const result = await optimizedRender(renderer, value, buffer, options);
      const snapshot = { canvas: buffer, result };
      store(cacheState, key, snapshot);
      return snapshot;
    })();

    cacheState.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      cacheState.pending.delete(key);
    }
  }

  function prefetchNext(renderer, value, options, width, height, frameCount) {
    const current = Number.isFinite(options.frameIndex) ? options.frameIndex : 0;
    const next = current + 1;
    if (next >= frameCount) return;

    const cacheState = stateFor(renderer);
    const nextOptions = { ...options, frameIndex: next };
    const key = frameKey(cacheState, value, nextOptions, width, height);
    if (cacheState.cache.has(key) || cacheState.pending.has(key) || cacheState.scheduled.has(key)) return;

    cacheState.scheduled.add(key);
    scheduleIdle(() => {
      cacheState.scheduled.delete(key);
      ensureSnapshot(renderer, value, nextOptions, width, height).catch(() => {});
    });
  }

  GameRenderer.prototype.render = async function acceleratedRender(value, canvas, options = {}) {
    if (!value || !canvas) return originalRender.call(this, value, canvas, options);

    const snapshot = await ensureSnapshot(this, value, options, canvas.width, canvas.height);
    copySnapshot(snapshot, canvas);
    prefetchNext(this, value, options, canvas.width, canvas.height, snapshot.result?.frameCount || 0);
    return snapshot.result;
  };

  Object.defineProperty(GameRenderer.prototype, PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

document.addEventListener("pointerover", (event) => {
  if (!event.target.closest?.(".conversation-card")) return;
  warmCommonAssets(currentGameId()).catch(() => {});
}, { passive: true });

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.(".conversation-card")) return;
  warmCommonAssets(currentGameId()).catch(() => {});
}, { passive: true });

const warmupObserver = new MutationObserver(scheduleCommonWarmup);
warmupObserver.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", scheduleCommonWarmup);
scheduleCommonWarmup();
