import { GameRenderer } from "./game-renderer.js";

const PATCH_FLAG = Symbol.for("fe-support.renderer-accelerator");
const MAX_CACHED_FRAMES = 20;
const rendererStates = new WeakMap();

function stateFor(renderer) {
  if (!rendererStates.has(renderer)) {
    rendererStates.set(renderer, {
      cache: new Map(),
      pending: new Map(),
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

function frameKey(cacheState, value, options, width, height) {
  const profile = `${options.playerName || ""}\u001f${options.playerGender || ""}`;
  const frameIndex = Number.isFinite(options.frameIndex) ? options.frameIndex : 0;
  return `${scriptToken(cacheState, value)}\u001f${profile}\u001f${width}x${height}\u001f${frameIndex}`;
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

if (!GameRenderer.prototype[PATCH_FLAG]) {
  const originalRender = GameRenderer.prototype.render;

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
      const result = await originalRender.call(renderer, value, buffer, options);
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
