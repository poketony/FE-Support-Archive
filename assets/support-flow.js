const SUPPORT_RANK_ORDER = new Map([
  ["C", 0], ["Ｃ", 0],
  ["B", 1], ["Ｂ", 1],
  ["A", 2], ["Ａ", 2],
  ["S", 3], ["Ｓ", 3],
]);

let scheduled = false;

function supportRank(label) {
  return SUPPORT_RANK_ORDER.get(String(label || "").trim().toUpperCase());
}

function orderedRankTabs() {
  const tabs = [...document.querySelectorAll(".rank-tabs .rank-tab")];
  if (tabs.length < 2 || !tabs.every((tab) => supportRank(tab.textContent) !== undefined)) return [];
  return tabs.sort((left, right) => supportRank(left.textContent) - supportRank(right.textContent));
}

function framePosition() {
  const value = document.querySelector("#frame-position")?.textContent || "";
  const match = value.match(/(\d+)\s*\/\s*(\d+)/u);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) return null;
  return { current, total };
}

function boundaryState() {
  const tabs = orderedRankTabs();
  if (!tabs.length) return null;
  const active = tabs.find((tab) => tab.classList.contains("is-active"));
  const position = framePosition();
  if (!active || !position) return null;
  const index = tabs.indexOf(active);
  return {
    active,
    position,
    next: index >= 0 ? tabs[index + 1] || null : null,
    atLastFrame: position.current >= position.total,
  };
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setAriaLabel(element, value) {
  if (!element) return;
  if (value) {
    if (element.getAttribute("aria-label") !== value) element.setAttribute("aria-label", value);
  } else if (element.hasAttribute("aria-label")) {
    element.removeAttribute("aria-label");
  }
}

function normalizeLandingBoxArt() {
  const awakening = document.querySelector('.game-card[data-game="awakening"] .game-box-art');
  const fates = document.querySelector('.game-card[data-game="fates"] .game-box-art');
  if (!awakening || !fates) return;

  for (const attribute of ["width", "height", "loading", "decoding", "fetchpriority"]) {
    if (fates.hasAttribute(attribute)) awakening.setAttribute(attribute, fates.getAttribute(attribute));
    else awakening.removeAttribute(attribute);
  }

  if (awakening.dataset.renderSync !== "1") {
    const source = new URL(awakening.getAttribute("src"), location.href);
    source.searchParams.set("box-art-rev", "20260904-1");
    awakening.setAttribute("src", source.href);
    awakening.dataset.renderSync = "1";
  }
}

function syncPlaybackControls() {
  const boundary = boundaryState();
  if (!boundary) return;

  const nextButton = document.querySelector('.playback-controls [data-action="next-frame"]');
  const screenButton = document.querySelector('.game-screen[data-action="next-frame"]');
  if (!nextButton) return;

  if (boundary.atLastFrame && boundary.next) {
    const nextLabel = boundary.next.textContent.trim();
    nextButton.disabled = false;
    setText(nextButton, `${nextLabel} 회화로 →`);
    setAriaLabel(nextButton, `${nextLabel} 회화로 이동`);
    setAriaLabel(screenButton, `${nextLabel} 회화로 이동`);
    return;
  }

  nextButton.disabled = boundary.atLastFrame;
  setText(nextButton, "다음 →");
  setAriaLabel(nextButton, null);
  setAriaLabel(screenButton, "다음 대사 (좌우 방향키로 이동)");
}

function advanceRankIfNeeded(event) {
  const boundary = boundaryState();
  if (!boundary?.atLastFrame || !boundary.next) return false;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  boundary.next.click();
  return true;
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    normalizeLandingBoxArt();
    syncPlaybackControls();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target.closest?.('[data-action="next-frame"]');
  if (!target) return;
  advanceRankIfNeeded(event);
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowRight" || !event.target.closest?.(".game-player")) return;
  advanceRankIfNeeded(event);
}, true);

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("hashchange", scheduleSync);
scheduleSync();
