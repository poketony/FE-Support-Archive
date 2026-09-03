const SEARCH_CACHE = new Map();
const GAME_LABELS = { awakening: "각성", fates: "if" };
const MAX_RESULTS = 200;

let activeGame = "";
let searchTimer = 0;

function currentGameId() {
  const first = location.hash.replace(/^#\/?/u, "").split("/").filter(Boolean)[0] || "";
  return first === "awakening" || first === "fates" ? first : "";
}

function ensureSearchButton() {
  const gameId = currentGameId();
  const header = document.querySelector(".site-header");
  document.querySelectorAll(".global-search-open").forEach((button) => {
    if (!header || !gameId || !header.contains(button)) button.remove();
  });
  if (!header || !gameId || header.querySelector(".global-search-open")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "global-search-open";
  button.textContent = "전체 대사 검색";
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", () => openSearch(gameId));

  const context = header.querySelector(".header-context");
  if (context) header.insertBefore(button, context);
  else header.appendChild(button);
}

function ensureDialog() {
  if (document.querySelector("#global-search-dialog")) return;
  const shell = document.createElement("div");
  shell.id = "global-search-dialog";
  shell.className = "global-search-shell";
  shell.hidden = true;
  shell.innerHTML = `
    <div class="global-search-backdrop" data-search-close></div>
    <section class="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
      <header class="global-search-header">
        <div>
          <p class="global-search-eyebrow">게임 전체 검색</p>
          <h2 id="global-search-title">전체 대사 검색</h2>
        </div>
        <button type="button" class="global-search-close" data-search-close aria-label="검색 닫기">×</button>
      </header>
      <div class="global-search-controls">
        <label class="global-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input id="global-search-input" type="search" autocomplete="off" placeholder="대사, 캐릭터명, 조합 검색" />
        </label>
        <label class="global-search-filter">범위
          <select id="global-search-mode">
            <option value="all">본편 + DLC</option>
            <option value="main">본편만</option>
            <option value="dlc">DLC만</option>
          </select>
        </label>
      </div>
      <p id="global-search-status" class="global-search-status">검색어를 입력하세요.</p>
      <div id="global-search-results" class="global-search-results"></div>
    </section>`;
  document.body.appendChild(shell);

  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-search-close]")) closeSearch();
    const result = event.target.closest("[data-search-result]");
    if (result) openResult(Number(result.dataset.searchResult));
  });
  shell.querySelector("#global-search-input").addEventListener("input", scheduleSearch);
  shell.querySelector("#global-search-mode").addEventListener("change", scheduleSearch);
}

async function loadIndex(gameId) {
  if (SEARCH_CACHE.has(gameId)) return SEARCH_CACHE.get(gameId);
  const promise = fetch(`./data/search/${gameId}.json`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`검색 목록 요청 실패 (${response.status})`);
      return response.json();
    });
  SEARCH_CACHE.set(gameId, promise);
  return promise;
}

async function openSearch(gameId) {
  ensureDialog();
  activeGame = gameId;
  const shell = document.querySelector("#global-search-dialog");
  shell.hidden = false;
  document.body.classList.add("global-search-active");
  shell.querySelector("#global-search-title").textContent = `${GAME_LABELS[gameId]} 전체 대사 검색`;
  shell.querySelector("#global-search-status").textContent = "검색 목록을 불러오는 중…";
  const input = shell.querySelector("#global-search-input");
  input.value = "";
  shell.querySelector("#global-search-results").replaceChildren();
  requestAnimationFrame(() => input.focus());
  try {
    const data = await loadIndex(gameId);
    if (activeGame !== gameId) return;
    shell.querySelector("#global-search-status").textContent = `${data.count.toLocaleString("ko-KR")}개 회화 구간에서 검색합니다.`;
  } catch (error) {
    shell.querySelector("#global-search-status").textContent = `검색 목록을 불러오지 못했습니다: ${error.message}`;
  }
}

function closeSearch() {
  const shell = document.querySelector("#global-search-dialog");
  if (shell) shell.hidden = true;
  document.body.classList.remove("global-search-active");
  activeGame = "";
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, " ").trim();
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(runSearch, 90);
}

async function runSearch() {
  const shell = document.querySelector("#global-search-dialog");
  if (!shell || shell.hidden || !activeGame) return;
  const query = normalize(shell.querySelector("#global-search-input").value);
  const mode = shell.querySelector("#global-search-mode").value;
  const status = shell.querySelector("#global-search-status");
  const container = shell.querySelector("#global-search-results");
  container.replaceChildren();

  if (!query) {
    const data = await loadIndex(activeGame);
    status.textContent = `${data.count.toLocaleString("ko-KR")}개 회화 구간에서 검색합니다.`;
    return;
  }

  const terms = query.split(" ").filter(Boolean);
  try {
    const data = await loadIndex(activeGame);
    const matches = data.records.filter((record) => {
      if (mode !== "all" && record.mode !== mode) return false;
      return terms.every((term) => record.searchText.includes(term));
    });

    const shown = matches.slice(0, MAX_RESULTS);
    status.textContent = matches.length > MAX_RESULTS
      ? `${matches.length.toLocaleString("ko-KR")}건 중 ${MAX_RESULTS}건을 표시합니다.`
      : `${matches.length.toLocaleString("ko-KR")}건을 찾았습니다.`;

    if (!shown.length) {
      container.innerHTML = '<p class="global-search-empty">일치하는 대사가 없습니다.</p>';
      return;
    }

    container.innerHTML = shown.map((record, index) => resultMarkup(record, index, query)).join("");
    container._records = shown;
  } catch (error) {
    status.textContent = `검색 중 오류가 발생했습니다: ${error.message}`;
  }
}

function resultMarkup(record, index, query) {
  const pair = record.characterNames.join(" × ");
  const mode = record.mode === "main" ? "본편" : record.sourceLabel || "DLC";
  const label = [mode, record.entryLabel, record.relationship !== "일반" ? record.relationship : ""].filter(Boolean).join(" · ");
  return `
    <button type="button" class="global-search-result" data-search-result="${index}">
      <span class="global-search-result-meta">${escapeHtml(label)}</span>
      <strong>${escapeHtml(pair)}</strong>
      <span class="global-search-result-title">${escapeHtml(record.title)}</span>
      <p>${highlightSnippet(record.text, query)}</p>
    </button>`;
}

function highlightSnippet(text, query) {
  const source = String(text || "").replace(/\s+/gu, " ").trim();
  if (!source) return "대사 텍스트 없음";
  const normalizedSource = normalize(source);
  const firstTerm = normalize(query).split(" ").filter(Boolean)[0] || "";
  const found = firstTerm ? normalizedSource.indexOf(firstTerm) : -1;
  const start = Math.max(0, found >= 0 ? found - 55 : 0);
  const end = Math.min(source.length, start + 150);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < source.length ? "…" : "";
  return escapeHtml(`${prefix}${source.slice(start, end)}${suffix}`);
}

function openResult(index) {
  const shell = document.querySelector("#global-search-dialog");
  const record = shell?.querySelector("#global-search-results")?._records?.[index];
  if (!record) return;
  const parts = [record.game, record.mode];
  if (record.mode === "dlc" && record.contentId) parts.push(record.contentId);
  parts.push(...record.characters, record.conversationId);
  const nextHash = `#/${parts.map(encodeURIComponent).join("/")}`;
  sessionStorage.setItem("fe-support:searchTarget", JSON.stringify({
    conversationId: record.conversationId,
    entryIndex: record.entryIndex,
  }));
  closeSearch();
  if (location.hash !== nextHash) location.hash = nextHash;
  else applyPendingTarget();
}

function applyPendingTarget() {
  const raw = sessionStorage.getItem("fe-support:searchTarget");
  if (!raw) return;
  let target;
  try { target = JSON.parse(raw); } catch { sessionStorage.removeItem("fe-support:searchTarget"); return; }
  if (!location.hash.includes(encodeURIComponent(target.conversationId)) && !location.hash.includes(target.conversationId)) return;
  const button = document.querySelector(`.rank-tab[data-entry="${target.entryIndex}"]`);
  if (!button) return;
  sessionStorage.removeItem("fe-support:searchTarget");
  if (!button.classList.contains("is-active")) button.click();
  window.setTimeout(() => document.querySelector("#conversation-reader")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#global-search-dialog")?.hidden) closeSearch();
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k" && currentGameId()) {
    event.preventDefault();
    openSearch(currentGameId());
  }
});

const observer = new MutationObserver(() => {
  ensureSearchButton();
  applyPendingTarget();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", () => window.setTimeout(() => {
  ensureSearchButton();
  applyPendingTarget();
}, 0));

ensureDialog();
ensureSearchButton();
applyPendingTarget();
