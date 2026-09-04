let archive = null;
let scheduled = false;
let initializedConversationId = "";

const SUPPORT_RANK_ORDER = new Map([
  ["C", 0], ["Ｃ", 0],
  ["B", 1], ["Ｂ", 1],
  ["A", 2], ["Ａ", 2],
  ["S", 3], ["Ｓ", 3],
]);

boot();

async function boot() {
  try {
    const response = await fetch("./data/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`목록 요청 실패 (${response.status})`);
    archive = await response.json();
  } catch (error) {
    console.warn("주인공 성별별 목록을 불러오지 못했습니다.", error);
    return;
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleApply);
  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "player-gender") {
      window.setTimeout(() => {
        if (!repairRouteForGender()) scheduleApply();
      }, 0);
    }
  });
  scheduleApply();
}

function selectedGender() {
  return localStorage.getItem("fe-support:playerGender") === "male" ? "male" : "female";
}

function routeContext() {
  if (!archive) return null;
  const parts = location.hash.replace(/^#\/?/u, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [gameId = "", modeId = ""] = parts;
  const game = archive.games.find((item) => item.id === gameId);
  const mode = game?.modes?.[modeId];
  if (!game || !mode) return null;

  let contentId = "";
  let contentLabel = "";
  let offset = 2;
  if (modeId === "dlc") {
    contentId = parts[2] || "";
    const content = mode.collections?.find((item) => item.id === contentId);
    if (!content) return { game, mode, parts, gameId, modeId, contentId, contentLabel, offset: 3, conversations: [] };
    contentLabel = content.label;
    offset = 3;
  }

  const conversations = mode.conversations.filter((conversation) => {
    if (contentLabel && conversation.sourceLabel !== contentLabel) return false;
    return !conversation.playerGender || conversation.playerGender === selectedGender();
  });
  return { game, mode, parts, gameId, modeId, contentId, contentLabel, offset, conversations };
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyGenderUi();
  });
}

function applyGenderUi() {
  const context = routeContext();
  if (!context) return;
  const { mode, conversations, offset, parts } = context;
  const validIds = new Set(conversations.flatMap((conversation) => conversation.characters));
  const firstId = parts[offset] || "";
  const secondId = parts[offset + 1] || "";

  document.querySelectorAll('.character-card[data-action="choose-first"]').forEach((card) => {
    const id = card.dataset.character || "";
    const allowed = validIds.has(id);
    card.hidden = !allowed;
    card.toggleAttribute("aria-hidden", !allowed);
    updatePartnerCount(card, id, conversations);
  });

  const firstPartners = firstId ? partnersFor(firstId, conversations) : new Set();
  document.querySelectorAll('.character-card[data-action="choose-second"]').forEach((card) => {
    const id = card.dataset.character || "";
    const allowed = firstPartners.has(id);
    card.hidden = !allowed;
    card.toggleAttribute("aria-hidden", !allowed);
    updatePartnerCount(card, id, conversations);
  });

  const validConversationIds = new Set(conversations.map((conversation) => conversation.id));
  document.querySelectorAll(".conversation-card[data-conversation]").forEach((card) => {
    const allowed = validConversationIds.has(card.dataset.conversation || "");
    card.hidden = !allowed;
    card.toggleAttribute("aria-hidden", !allowed);
  });

  applyPlayerPortraits(mode, parts, offset);
  filterGlobalSearchResults();
  applySupportRankOrder();
  ensureInitialSupportRank(context);

  // A gender switch can invalidate an already-open conversation. Keep the pair when possible.
  if (firstId || secondId) repairRouteForGender();
}

function updatePartnerCount(card, id, conversations) {
  const label = card.querySelector("small");
  if (!label) return;
  const count = partnersFor(id, conversations).size;
  const next = `${count}명과 회화`;
  if (label.textContent !== next) label.textContent = next;
}

function partnersFor(id, conversations) {
  const result = new Set();
  for (const conversation of conversations) {
    if (!conversation.characters.includes(id)) continue;
    for (const other of conversation.characters) if (other !== id) result.add(other);
  }
  return result;
}

function repairRouteForGender() {
  const context = routeContext();
  if (!context) return false;
  const { parts, offset, conversations } = context;
  const firstId = parts[offset] || "";
  const secondId = parts[offset + 1] || "";
  const conversationId = parts[offset + 2] || "";
  if (!firstId) return false;

  const validIds = new Set(conversations.flatMap((conversation) => conversation.characters));
  let keep = parts.slice(0, offset);
  if (!validIds.has(firstId)) return replaceRoute(keep);
  keep.push(firstId);

  const partners = partnersFor(firstId, conversations);
  if (!secondId || !partners.has(secondId)) {
    return secondId ? replaceRoute(keep) : false;
  }
  keep.push(secondId);

  if (conversationId) {
    const valid = conversations.some((conversation) => conversation.id === conversationId
      && conversation.characters.includes(firstId)
      && conversation.characters.includes(secondId));
    if (!valid) return replaceRoute(keep);
  }
  return false;
}

function replaceRoute(parts) {
  const next = parts.filter(Boolean).map(encodeURIComponent).join("/");
  const hash = next ? `#/${next}` : "#/";
  if (location.hash === hash) return false;
  location.hash = hash;
  return true;
}

function applyPlayerPortraits(mode, parts, offset) {
  const player = mode.characters.find((character) => character.id === "プレイヤー");
  const portraits = player?.portraits;
  const target = portraits?.[selectedGender()];
  if (!player || !target) return;
  const known = new Set([player.portrait, portraits.male, portraits.female].filter(Boolean));

  document.querySelectorAll("img.portrait-image").forEach((image) => {
    if (known.has(image.getAttribute("src")) && image.getAttribute("src") !== target) image.setAttribute("src", target);
  });

  document.querySelectorAll('.character-card[data-character="プレイヤー"] .portrait').forEach((portrait) => {
    ensurePortraitImage(portrait, target);
  });

  const firstId = parts[offset] || "";
  const secondId = parts[offset + 1] || "";
  const columns = document.querySelectorAll(".picker-column");
  if (firstId === "プレイヤー" && columns[0]) ensurePortraitImage(columns[0].querySelector(".selected-character .portrait"), target);
  if (secondId === "プレイヤー" && columns[1]) ensurePortraitImage(columns[1].querySelector(".selected-character .portrait"), target);
}

function ensurePortraitImage(portrait, target) {
  if (!portrait) return;
  portrait.classList.remove("portrait--empty");
  let image = portrait.querySelector("img.portrait-image");
  if (!image) {
    image = document.createElement("img");
    image.className = "portrait-image";
    image.alt = "";
    image.loading = "lazy";
    portrait.appendChild(image);
  }
  if (image.getAttribute("src") !== target) image.setAttribute("src", target);
  image.hidden = false;
}

function filterGlobalSearchResults() {
  const container = document.querySelector("#global-search-results");
  const records = container?._records;
  if (!container || !Array.isArray(records)) return;
  const gender = selectedGender();
  let visible = 0;
  [...container.querySelectorAll(".global-search-result[data-search-result]")].forEach((button) => {
    const record = records[Number(button.dataset.searchResult)];
    const allowed = !record?.playerGender || record.playerGender === gender;
    button.hidden = !allowed;
    if (allowed) visible += 1;
  });
  const status = document.querySelector("#global-search-status");
  const next = `${visible.toLocaleString("ko-KR")}건을 표시합니다. · ${gender === "male" ? "남성" : "여성"} 주인공 기준`;
  if (status && records.length && status.textContent !== next) status.textContent = next;
}

function supportRank(label) {
  return SUPPORT_RANK_ORDER.get(String(label || "").trim().toUpperCase());
}

function applySupportRankOrder() {
  document.querySelectorAll(".rank-tabs").forEach((container) => {
    const tabs = [...container.querySelectorAll(".rank-tab")];
    if (tabs.length < 2 || !tabs.every((tab) => supportRank(tab.textContent) !== undefined)) return;
    const ordered = [...tabs].sort((left, right) => supportRank(left.textContent) - supportRank(right.textContent));
    const alreadyOrdered = tabs.every((tab, index) => tab === ordered[index]);
    if (!alreadyOrdered) ordered.forEach((tab) => container.appendChild(tab));
  });

  document.querySelectorAll(".conversation-card em").forEach((label) => {
    const parts = label.textContent.split("·").map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2 || !parts.every((item) => supportRank(item) !== undefined)) return;
    const ordered = [...parts].sort((left, right) => supportRank(left) - supportRank(right));
    const next = ordered.join(" · ");
    if (label.textContent !== next) label.textContent = next;
  });
}

function ensureInitialSupportRank(context) {
  const conversationId = context.parts[context.offset + 2] || "";
  if (!conversationId) {
    initializedConversationId = "";
    return;
  }
  if (initializedConversationId === conversationId) return;

  const tabs = [...document.querySelectorAll(".rank-tabs .rank-tab")];
  if (!tabs.length || !tabs.every((tab) => supportRank(tab.textContent) !== undefined)) return;
  const cTab = tabs.find((tab) => supportRank(tab.textContent) === 0);
  if (!cTab) {
    initializedConversationId = conversationId;
    return;
  }

  initializedConversationId = conversationId;
  if (!cTab.classList.contains("is-active")) cTab.click();
}
