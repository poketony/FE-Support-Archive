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

function syncNextButton() {
  const boundary = boundaryState();
  if (!boundary) return;
  const button = document.querySelector('.playback-controls [data-action="next-frame"]');
  if (!button) return;
  button.disabled = boundary.atLastFrame && !boundary.next;
  if (boundary.atLastFrame && boundary.next) {
    button.setAttribute("aria-label", `${boundary.next.textContent.trim()} 회화로 이동`);
  } else {
    button.removeAttribute("aria-label");
  }
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
    syncNextButton();
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
