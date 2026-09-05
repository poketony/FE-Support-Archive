const app = document.querySelector("#app");
let archive = null;
let scheduled = false;
let pendingScrollConversation = "";

boot();

async function boot() {
  try {
    const response = await fetch("./data/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`목록 요청 실패 (${response.status})`);
    archive = await response.json();
  } catch (error) {
    console.warn("DLC 회화 목록을 불러오지 못했습니다.", error);
    return;
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(app, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleApply);
  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "player-gender") scheduleApply();
  });
  document.addEventListener("click", handleClick);
  scheduleApply();
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-dlc-view]");
  if (viewButton) {
    const context = routeContext();
    if (!context) return;
    const view = viewButton.dataset.dlcView === "pair" ? "pair" : "list";
    sessionStorage.setItem(viewKey(context.gameId, context.contentId), view);
    applyDlcView();
    return;
  }

  const conversationButton = event.target.closest("[data-dlc-conversation]");
  if (!conversationButton) return;
  const context = routeContext();
  if (!context) return;
  const conversation = context.conversations.find((item) => item.id === conversationButton.dataset.dlcConversation);
  if (!conversation || conversation.characters.length < 2) return;
  const [firstId, secondId] = conversation.characters;
  pendingScrollConversation = conversation.id;
  navigate([context.gameId, "dlc", context.contentId, firstId, secondId, conversation.id]);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyDlcView();
  });
}

function applyDlcView() {
  const context = routeContext();
  if (!context) return;
  const intro = document.querySelector(".archive-intro");
  if (!intro) return;

  const view = currentView(context);
  let switcher = document.querySelector(".dlc-view-switch-wrap");
  if (!switcher) {
    switcher = document.createElement("div");
    switcher.className = "dlc-view-switch-wrap";
    intro.insertAdjacentElement("afterend", switcher);
  }
  if (switcher.dataset.view !== view) {
    switcher.dataset.view = view;
    switcher.innerHTML = viewSwitcherMarkup(view);
  }

  const picker = document.querySelector(".picker");
  const results = document.querySelector(".results-panel");
  if (view === "pair") {
    if (picker) picker.hidden = false;
    if (results) results.hidden = false;
    document.querySelector(".dlc-sequential-panel")?.remove();
    return;
  }

  if (picker) picker.hidden = true;
  if (results) results.hidden = true;

  let panel = document.querySelector(".dlc-sequential-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "dlc-sequential-panel";
    switcher.insertAdjacentElement("afterend", panel);
  }

  const signature = [selectedGender(), context.conversationId, ...context.conversations.map((item) => item.id)].join(":");
  if (panel.dataset.signature !== signature) {
    panel.dataset.signature = signature;
    panel.innerHTML = sequentialListMarkup(context);
  }

  if (pendingScrollConversation && pendingScrollConversation === context.conversationId) {
    const reader = document.querySelector("#conversation-reader");
    if (reader) {
      pendingScrollConversation = "";
      requestAnimationFrame(() => reader.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }
}

function viewSwitcherMarkup(view) {
  return `
    <nav class="dlc-view-switch" aria-label="DLC 회화 찾기 방식">
      <button type="button" class="${view === "list" ? "is-active" : ""}" data-dlc-view="list" aria-pressed="${view === "list"}">
        <span aria-hidden="true">☷</span> 회화 목록
      </button>
      <button type="button" class="${view === "pair" ? "is-active" : ""}" data-dlc-view="pair" aria-pressed="${view === "pair"}">
        <span aria-hidden="true">×</span> 조합 검색
      </button>
    </nav>`;
}

function sequentialListMarkup(context) {
  if (!context.conversations.length) {
    return '<p class="dlc-sequential-empty">현재 주인공 성별로 볼 수 있는 회화가 없습니다.</p>';
  }

  const characterMap = new Map(context.mode.characters.map((character) => [character.id, character]));
  const cards = context.conversations.map((conversation, index) => {
    const [firstId, secondId] = conversation.characters;
    const first = characterMap.get(firstId);
    const second = characterMap.get(secondId);
    if (!first || !second) return "";
    const active = conversation.id === context.conversationId;
    const detail = conversation.entryLabels?.length ? conversation.entryLabels.join(" · ") : conversation.relationship || "특별 회화";
    const relationshipTag = conciseRelationship(conversation.relationship);
    const relationship = relationshipTag
      ? `<small class="dlc-sequential-relationship">[${escapeHtml(relationshipTag)}]</small>`
      : "";
    return `
      <button type="button" class="dlc-sequential-card ${active ? "is-active" : ""}" data-dlc-conversation="${escapeHtml(conversation.id)}">
        <span class="dlc-sequential-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="dlc-sequential-person dlc-sequential-person--first">
          ${portraitMarkup(first)}
          <strong>${escapeHtml(first.name)}</strong>
        </span>
        <span class="dlc-sequential-relation">
          <span class="dlc-sequential-cross" aria-hidden="true">×</span>
          ${relationship}
        </span>
        <span class="dlc-sequential-person dlc-sequential-person--second">
          ${portraitMarkup(second)}
          <strong>${escapeHtml(second.name)}</strong>
        </span>
        <small>${escapeHtml(detail)}</small>
        <span class="dlc-sequential-arrow" aria-hidden="true">${active ? "↓" : "→"}</span>
      </button>`;
  }).join("");

  return `
    <div class="dlc-sequential-heading">
      <div><p class="eyebrow">순차형 감상</p><h2>회화 목록</h2></div>
      <p>${context.conversations.length.toLocaleString("ko-KR")}개 회화</p>
    </div>
    <div class="dlc-sequential-list">${cards}</div>`;
}

function conciseRelationship(relationship) {
  const value = String(relationship || "").trim();
  if (!value || value === "일반") return "";
  return value.split("·", 1)[0].trim();
}

function portraitMarkup(character) {
  const portrait = character.id === "プレイヤー"
    ? character.portraits?.[selectedGender()] || character.portrait
    : character.portrait;
  return `<span class="portrait ${portrait ? "" : "portrait--empty"}" aria-hidden="true">${portrait ? `<img class="portrait-image" src="${escapeHtml(portrait)}" alt="" loading="lazy" />` : ""}</span>`;
}

function routeContext() {
  if (!archive) return null;
  const parts = location.hash.replace(/^#\/?/u, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [gameId = "", modeId = "", contentId = "", firstId = "", secondId = "", conversationId = ""] = parts;
  if (modeId !== "dlc" || !contentId) return null;
  const game = archive.games.find((item) => item.id === gameId);
  const mode = game?.modes?.dlc;
  const content = mode?.collections?.find((item) => item.id === contentId);
  if (!game || !mode || !content) return null;
  const gender = selectedGender();
  const conversations = mode.conversations.filter((conversation) => conversation.sourceLabel === content.label
    && (!conversation.playerGender || conversation.playerGender === gender));
  return { gameId, contentId, firstId, secondId, conversationId, game, mode, content, conversations };
}

function currentView(context) {
  return sessionStorage.getItem(viewKey(context.gameId, context.contentId)) === "pair" ? "pair" : "list";
}

function viewKey(gameId, contentId) {
  return `fe-support:dlc-view:${gameId}:${contentId}`;
}

function selectedGender() {
  return localStorage.getItem("fe-support:playerGender") === "male" ? "male" : "female";
}

function navigate(parts) {
  const next = parts.filter(Boolean).map(encodeURIComponent).join("/");
  location.hash = next ? `#/${next}` : "#/";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
