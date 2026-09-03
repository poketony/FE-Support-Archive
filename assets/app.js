import { GameRenderer } from "./game-renderer.js";
import { splitConversationFrames } from "./renderer-format.js";
import { characterName, transcriptCharacterId, visibleText } from "./display.js";
import { selectDlcContent } from "./archive-navigation.js";

const app = document.querySelector("#app");
const renderers = new Map();
let paintVersion = 0;

const state = {
  archive: null,
  gameId: "",
  modeId: "",
  contentId: "",
  selectedMode: null,
  firstId: "",
  secondId: "",
  conversationId: "",
  entryIndex: 0,
  frameIndex: 0,
  firstQuery: "",
  secondQuery: "",
  conversation: null,
  loadingConversation: false,
  error: "",
  playerName: localStorage.getItem("fe-support:playerName") || "",
  playerGender: localStorage.getItem("fe-support:playerGender") === "male" ? "male" : "female",
};

boot();

async function boot() {
  try {
    const response = await fetch("./data/index.json");
    if (!response.ok) throw new Error(`목록 요청 실패 (${response.status})`);
    state.archive = await response.json();
    readRoute();
    await loadSelectedConversation();
    render();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    render();
  }
}

window.addEventListener("hashchange", async () => {
  readRoute();
  await loadSelectedConversation();
  render();
});

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "home") navigate([]);
  if (action === "choose-game") navigate([target.dataset.game]);
  if (action === "choose-mode") navigate([state.gameId, target.dataset.mode]);
  if (action === "choose-content") navigate([state.gameId, "dlc", target.dataset.content]);
  if (action === "back-content") navigate([state.gameId, "dlc"]);
  if (action === "back-game") navigate([state.gameId]);
  if (action === "choose-first") navigate(explorerPath(target.dataset.character));
  if (action === "choose-second") navigate(explorerPath(state.firstId, target.dataset.character));
  if (action === "clear-first") navigate(explorerPath());
  if (action === "clear-second") navigate(explorerPath(state.firstId));
  if (action === "open-conversation") {
    navigate(explorerPath(state.firstId, state.secondId, target.dataset.conversation));
  }
  if (action === "choose-entry") {
    state.entryIndex = Number(target.dataset.entry || 0);
    state.frameIndex = 0;
    render();
    document.querySelector("#conversation-reader")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

app.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "next-frame") changeFrame(1);
  if (action === "previous-frame") changeFrame(-1);
});

app.addEventListener("keydown", (event) => {
  if (!event.target.closest(".game-player") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  changeFrame(event.key === "ArrowLeft" ? -1 : 1);
});

app.addEventListener("input", (event) => {
  if (event.target.id === "first-search") {
    state.firstQuery = event.target.value;
    renderCharacterLists("first");
  }
  if (event.target.id === "second-search") {
    state.secondQuery = event.target.value;
    renderCharacterLists("second");
  }
  if (event.target.id === "player-name") {
    state.playerName = event.target.value;
    localStorage.setItem("fe-support:playerName", state.playerName);
    renderReaderOnly();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.name !== "player-gender") return;
  state.playerGender = event.target.value;
  localStorage.setItem("fe-support:playerGender", state.playerGender);
  renderReaderOnly();
});

app.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains("portrait-image")) {
    event.target.hidden = true;
    event.target.closest(".portrait")?.classList.add("portrait--empty");
  }
}, true);

function readRoute() {
  const parts = location.hash.replace(/^#\/?/u, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [gameId = "", modeId = "", ...tail] = parts;
  const game = state.archive?.games.find((item) => item.id === gameId);
  state.gameId = game?.id || "";
  state.modeId = game?.modes?.[modeId] ? modeId : "";
  const baseMode = state.modeId ? game.modes[state.modeId] : null;
  state.selectedMode = state.modeId === "dlc" ? selectDlcContent(baseMode, tail[0]) : baseMode;
  state.contentId = state.modeId === "dlc" && state.selectedMode ? tail[0] : "";
  const mode = state.selectedMode;
  const [firstId = "", secondId = "", conversationId = ""] = state.modeId === "dlc" ? tail.slice(1) : tail;
  const ids = new Set(mode?.characters.map((character) => character.id) || []);
  state.firstId = ids.has(firstId) ? firstId : "";
  state.secondId = state.firstId && ids.has(secondId) && secondId !== state.firstId ? secondId : "";
  const validConversation = mode?.conversations.find((conversation) => conversation.id === conversationId);
  state.conversationId = validConversation && validConversation.characters.includes(state.firstId)
    && validConversation.characters.includes(state.secondId) ? conversationId : "";
  if (!state.firstId) state.firstQuery = "";
  if (!state.secondId) state.secondQuery = "";
  if (!state.conversationId) {
    state.conversation = null;
    state.entryIndex = 0;
  }
}

function navigate(parts) {
  const next = parts.filter(Boolean).map(encodeURIComponent).join("/");
  location.hash = next ? `#/${next}` : "#/";
}

function explorerPath(...tail) {
  return [state.gameId, state.modeId, ...(state.modeId === "dlc" ? [state.contentId] : []), ...tail];
}

async function loadSelectedConversation() {
  if (!state.conversationId) return;
  const metadata = currentMode().conversations.find((item) => item.id === state.conversationId);
  if (!metadata || state.conversation?.id === metadata.id) return;
  state.loadingConversation = true;
  state.error = "";
  render();
  try {
    const response = await fetch(metadata.path);
    if (!response.ok) throw new Error(`회화 요청 실패 (${response.status})`);
    const conversation = await response.json();
    if (state.conversationId !== metadata.id) return;
    state.conversation = conversation;
    state.entryIndex = 0;
    state.frameIndex = 0;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingConversation = false;
  }
}

function render() {
  document.body.dataset.game = state.gameId || "landing";
  if (state.error && !state.archive) {
    app.innerHTML = errorScreen();
    return;
  }
  if (!state.archive) return;
  if (!state.gameId) app.innerHTML = landingScreen();
  else if (!state.modeId) app.innerHTML = modeScreen();
  else if (state.modeId === "dlc" && !state.contentId) app.innerHTML = contentScreen();
  else app.innerHTML = explorerScreen();
  paintFrame();
  if (state.conversationId && !state.conversation && !state.loadingConversation) loadSelectedConversation();
}

function landingScreen() {
  const awakening = state.archive.games.find((game) => game.id === "awakening");
  const fates = state.archive.games.find((game) => game.id === "fates");
  const awakeningStats = gameStats(awakening);
  const fatesStats = gameStats(fates);
  return `
    <main class="landing">
      <div class="brand-plaque">
        <img class="brand-logo" src="./assets/logo.png" alt="파이어 엠블렘 지원회화" />
        <p class="eyebrow">한국어 지원회화 아카이브</p>
      </div>
      <h1>기록을 펼칠 세계를 선택하세요</h1>
      <div class="game-grid">
        <button class="game-card game-box-card" data-action="choose-game" data-game="awakening">
          <img class="game-box-art" src="./assets/awakening-box.png" alt="파이어 엠블렘 각성 박스 아트" width="500" height="505" />
          <span class="game-card-copy">
            <strong>각성</strong>
            <em>${awakeningStats}</em>
          </span>
          <span class="card-arrow" aria-hidden="true">→</span>
        </button>
        <button class="game-card game-box-card" data-action="choose-game" data-game="fates">
          <img class="game-box-art" src="./assets/fates-box.jpg" alt="파이어 엠블렘 if 박스 아트" width="500" height="459" />
          <span class="game-card-copy game-card-copy--fates">
            <strong>if</strong>
            <em>${fatesStats}</em>
          </span>
          <span class="card-arrow" aria-hidden="true">→</span>
        </button>
      </div>
      <p class="source-note">팬 번역 데이터를 바탕으로 만든 비공식 감상용 아카이브입니다.</p>
    </main>`;
}

function gameStats(game) {
  const conversationCount = Object.values(game.modes).reduce((sum, mode) => sum + mode.conversations.length, 0);
  const characterCount = new Set(Object.values(game.modes).flatMap((mode) => mode.characters.map((character) => character.id))).size;
  return `${characterCount.toLocaleString("ko-KR")}명 · ${conversationCount.toLocaleString("ko-KR")}개 회화`;
}

function modeScreen() {
  const game = currentGame();
  const cards = Object.values(game.modes).map((mode) => `
    <button class="mode-card" data-action="choose-mode" data-mode="${mode.id}">
      <span class="mode-ornament" aria-hidden="true">${mode.id === "main" ? "◆" : "✦"}</span>
      <span>
        <strong>${escapeHtml(mode.label)}</strong>
        <small>${escapeHtml(mode.description)}</small>
        <em>${mode.characters.length.toLocaleString("ko-KR")}명 · ${mode.conversations.length.toLocaleString("ko-KR")}개 회화</em>
      </span>
      <span class="card-arrow" aria-hidden="true">→</span>
    </button>`).join("");
  return `
    <main class="choice-page">
      ${compactHeader()}
      <section class="choice-panel">
        <button class="text-button" data-action="home">← 게임 다시 선택</button>
        <p class="eyebrow">${escapeHtml(game.label)}</p>
        <h1>회화 종류를 선택하세요</h1>
        <div class="mode-grid">${cards}</div>
      </section>
    </main>`;
}

function contentScreen() {
  const game = currentGame();
  return `<main class="choice-page">
    ${compactHeader()}
    <section class="choice-panel">
      <button class="text-button" data-action="back-game">← ${escapeHtml(game.shortLabel)} 메뉴</button>
      <p class="eyebrow">DLC 지원회화</p>
      <h1>콘텐츠를 선택하세요</h1>
      <div class="dlc-grid">${game.modes.dlc.collections.map((content) => {
        const count = game.modes.dlc.conversations.filter((item) => item.sourceLabel === content.label).length;
        return `<button class="dlc-card" data-action="choose-content" data-content="${content.id}">
          ${content.image ? `<img src="${content.image}" alt="${escapeHtml(content.label)} 게임 화면" width="386" height="232" />` : '<div class="dlc-card-placeholder" aria-hidden="true">DLC</div>'}
          <span><strong>${escapeHtml(content.label)}</strong><small>${count}개 회화</small></span>
        </button>`;
      }).join("")}</div>
    </section>
  </main>`;
}

function explorerScreen() {
  const game = currentGame();
  const mode = currentMode();
  const first = findCharacter(state.firstId);
  const second = findCharacter(state.secondId);
  return `
    <main class="archive-shell">
      ${compactHeader(true)}
      <section class="archive-intro">
        <div>
          <button class="text-button" data-action="${state.modeId === "dlc" ? "back-content" : "back-game"}">← ${state.modeId === "dlc" ? "DLC 다시 선택" : escapeHtml(game.shortLabel) + " 메뉴"}</button>
          <p class="eyebrow">${escapeHtml(game.label)}</p>
          <h1>${escapeHtml(mode.label)}</h1>
        </div>
        <div class="profile-controls" aria-label="주인공 표시 설정">
          <label>주인공 이름<input id="player-name" type="text" maxlength="12" value="${escapeHtml(state.playerName || defaultPlayerName())}" /></label>
          <fieldset>
            <legend>성별 문구</legend>
            <label><input type="radio" name="player-gender" value="male" ${state.playerGender === "male" ? "checked" : ""} /> 남성</label>
            <label><input type="radio" name="player-gender" value="female" ${state.playerGender === "female" ? "checked" : ""} /> 여성</label>
          </fieldset>
        </div>
      </section>
      <section class="picker" aria-label="캐릭터 조합 선택">
        <article class="picker-column">
          <div class="picker-heading">
            <span class="step-number">1</span>
            <div><small>첫 번째 캐릭터</small><h2>${first ? escapeHtml(first.name) : "캐릭터 선택"}</h2></div>
            ${first ? '<button class="reset-button" data-action="clear-first">바꾸기</button>' : ""}
          </div>
          ${first ? selectedCharacter(first) : characterSearch("first", mode.characters, state.firstQuery)}
        </article>
        <div class="picker-link" aria-hidden="true">×</div>
        <article class="picker-column ${first ? "" : "is-disabled"}">
          <div class="picker-heading">
            <span class="step-number">2</span>
            <div><small>회화 상대</small><h2>${second ? escapeHtml(second.name) : first ? "상대 선택" : "먼저 캐릭터를 고르세요"}</h2></div>
            ${second ? '<button class="reset-button" data-action="clear-second">바꾸기</button>' : ""}
          </div>
          ${second ? selectedCharacter(second) : first ? characterSearch("second", partnerCharacters(first), state.secondQuery) : disabledPicker()}
        </article>
      </section>
      ${first && second ? conversationResults(first, second) : ""}
      ${state.error ? `<p class="inline-error">${escapeHtml(state.error)}</p>` : ""}
      ${state.loadingConversation ? '<div class="reader-loading">회화를 펼치는 중…</div>' : ""}
      ${state.conversation ? readerMarkup() : ""}
      <footer>번역: poketony/FE-Awakening · 렌더러: Awakening Live Renderer / SciresM FEITS · <a href="./LICENSE.txt">GPL-3.0 · 무보증</a></footer>
    </main>`;
}

function compactHeader(withMode = false) {
  const game = currentGame();
  return `
    <header class="site-header">
      <button class="header-brand" data-action="home" aria-label="처음으로">
        <img src="./assets/logo.png" alt="" />
        <span>지원회화 아카이브</span>
      </button>
      ${withMode ? `<span class="header-context">${escapeHtml(game.shortLabel)} · ${escapeHtml(currentMode().label)}</span>` : ""}
    </header>`;
}

function characterSearch(slot, characters, query) {
  const normalized = query.trim().toLocaleLowerCase("ko");
  const filtered = characters.filter((character) => `${character.name} ${character.id}`.toLocaleLowerCase("ko").includes(normalized));
  return `
    <label class="search-box">
      <span aria-hidden="true">⌕</span>
      <input id="${slot}-search" type="search" autocomplete="off" placeholder="이름 검색" value="${escapeHtml(query)}" />
    </label>
    <div id="${slot}-character-list" class="character-grid">${characterCards(slot, filtered)}</div>`;
}

function characterCards(slot, characters) {
  if (!characters.length) return '<p class="empty-state">일치하는 캐릭터가 없습니다.</p>';
  return characters.map((character) => `
    <button class="character-card" data-action="choose-${slot}" data-character="${escapeHtml(character.id)}">
      ${portraitMarkup(character)}
      <span>${escapeHtml(character.name)}</span>
      <small>${character.partners.length}명과 회화</small>
    </button>`).join("");
}

function selectedCharacter(character) {
  return `<div class="selected-character">${portraitMarkup(character, true)}<div><strong>${escapeHtml(character.name)}</strong></div></div>`;
}

function disabledPicker() {
  return '<div class="disabled-state"><span aria-hidden="true">◇</span><p>첫 캐릭터를 고르면<br />회화가 존재하는 상대만 표시됩니다.</p></div>';
}

function conversationResults(first, second) {
  const cards = pairConversations(first.id, second.id).map((conversation) => `
    <button class="conversation-card ${conversation.id === state.conversationId ? "is-active" : ""}" data-action="open-conversation" data-conversation="${conversation.id}">
      <span>${conversation.sourceLabel ? `<small>${escapeHtml(conversation.sourceLabel)}</small>` : ""}<strong>${escapeHtml(conversation.title)}</strong></span>
      <em>${conversation.entryLabels.map(escapeHtml).join(" · ")}</em>
      <span class="card-arrow" aria-hidden="true">${conversation.id === state.conversationId ? "↓" : "→"}</span>
    </button>`).join("");
  return `
    <section class="results-panel">
      <div class="section-heading"><p class="eyebrow">선택한 조합</p><h2>${escapeHtml(first.name)} × ${escapeHtml(second.name)}</h2></div>
      <div class="conversation-list">${cards}</div>
    </section>`;
}

function readerMarkup() {
  const conversation = state.conversation;
  const entry = conversation.entries[Math.min(state.entryIndex, conversation.entries.length - 1)];
  const tabs = conversation.entries.map((item, index) => `
    <button class="rank-tab ${index === state.entryIndex ? "is-active" : ""}" data-action="choose-entry" data-entry="${index}" aria-pressed="${index === state.entryIndex}">${escapeHtml(item.label)}</button>`).join("");
  return `
    <section id="conversation-reader" class="reader">
      <div class="reader-header">
        <div><p class="eyebrow">${escapeHtml(conversation.sourceLabel || currentMode().label)}</p><h2>${escapeHtml(conversation.title)}</h2></div>
        <div class="rank-tabs" aria-label="회화 구간">${tabs}</div>
      </div>
      <div class="game-player">
        <button class="game-screen" data-action="next-frame" aria-label="다음 대사 (좌우 방향키로 이동)">
          <canvas id="game-canvas" width="400" height="240">게임 회화 화면</canvas>
        </button>
        <div class="playback-controls">
          <button data-action="previous-frame" ${state.frameIndex === 0 ? "disabled" : ""}>← 이전</button>
          <output id="frame-position">${state.frameIndex + 1} / ${splitConversationFrames(entry.script).length}</output>
          <button data-action="next-frame" ${state.frameIndex >= splitConversationFrames(entry.script).length - 1 ? "disabled" : ""}>다음 →</button>
        </div>
        <p class="playback-hint">화면을 누르거나 ← → 키로 대사를 넘기세요.</p>
        <p id="render-status" role="status">게임 화면을 불러오는 중…</p>
        <p id="frame-text" class="screen-reader-only" aria-live="polite"></p>
      </div>
      <details class="transcript-details"><summary>전체 대사 텍스트</summary><div class="transcript">${segmentMarkup(entry)}</div></details>
      ${entry.unknownCommands.length ? `<details class="parser-note"><summary>표시에서 생략한 연출 명령 ${entry.unknownCommands.length}종</summary><code>${escapeHtml(entry.unknownCommands.join(", "))}</code></details>` : ""}
    </section>`;
}

function segmentMarkup(entry) {
  const mode = currentMode();
  return entry.segments.map((segment) => {
    const character = mode.characters.find((item) => item.id === transcriptCharacterId(segment.speaker, state.gameId));
    const name = characterName(segment.speaker, currentGame().names, state.playerName || defaultPlayerName());
    return `
      <article class="speech ${character ? "" : "speech--narration"}">
        <div class="speaker-portrait">${character ? portraitMarkup(character) : '<span class="portrait portrait--empty" aria-hidden="true"></span>'}</div>
        <div class="speech-body">
          <div class="speaker-line"><strong>${escapeHtml(name)}</strong></div>
          <p>${escapeHtml(visibleText(personalize(segment.text))).replaceAll("\n", "<br />")}</p>
        </div>
      </article>`;
  }).join("");
}

function renderReaderOnly() {
  const reader = document.querySelector("#conversation-reader");
  if (reader && state.conversation) reader.outerHTML = readerMarkup();
  paintFrame();
}

function changeFrame(delta) {
  const entry = state.conversation?.entries[state.entryIndex];
  if (!entry) return;
  const count = splitConversationFrames(entry.script).length;
  state.frameIndex = Math.max(0, Math.min(count - 1, state.frameIndex + delta));
  const player = document.querySelector(".game-player");
  if (!player) return;
  player.querySelector('[data-action="previous-frame"]').disabled = state.frameIndex === 0;
  player.querySelector('.playback-controls [data-action="next-frame"]').disabled = state.frameIndex === count - 1;
  player.querySelector("#frame-position").textContent = `${state.frameIndex + 1} / ${count}`;
  paintFrame();
}

async function paintFrame() {
  const version = ++paintVersion;
  const canvas = document.querySelector("#game-canvas");
  const entry = state.conversation?.entries[state.entryIndex];
  if (!canvas || !entry) return;
  const gameId = state.gameId;
  const options = {
    frameIndex: state.frameIndex,
    playerName: state.playerName || defaultPlayerName(),
    playerGender: state.playerGender,
    nameMap: new Map(Object.entries(currentGame().names)),
  };
  try {
    if (!renderers.has(gameId)) {
      const renderer = new GameRenderer(gameId);
      renderers.set(gameId, renderer.initialize().then(() => renderer).catch((error) => {
        renderers.delete(gameId);
        throw error;
      }));
    }
    const renderer = await renderers.get(gameId);
    const buffer = document.createElement("canvas");
    buffer.width = 400;
    buffer.height = 240;
    const result = await renderer.render(entry.script, buffer, options);
    if (version !== paintVersion || !canvas.isConnected) return;
    canvas.getContext("2d").drawImage(buffer, 0, 0);
    document.querySelector("#frame-text").textContent = result.message;
    document.querySelector("#render-status").textContent = result.diagnostics.length
      ? "일부 원본 표정·연출 리소스가 없습니다. 전체 대사 텍스트에서도 확인할 수 있습니다."
      : "";
  } catch (error) {
    if (version !== paintVersion) return;
    document.querySelector("#render-status").textContent = `게임 화면을 불러오지 못했습니다: ${error.message}`;
  }
}

function renderCharacterLists(slot) {
  const first = findCharacter(state.firstId);
  const characters = slot === "first" ? currentMode().characters : first ? partnerCharacters(first) : [];
  const query = slot === "first" ? state.firstQuery : state.secondQuery;
  const normalized = query.trim().toLocaleLowerCase("ko");
  const filtered = characters.filter((character) => `${character.name} ${character.id}`.toLocaleLowerCase("ko").includes(normalized));
  const container = document.querySelector(`#${slot}-character-list`);
  if (container) container.innerHTML = characterCards(slot, filtered);
}

function portraitMarkup(character, large = false) {
  return `<span class="portrait ${large ? "portrait--large" : ""} ${character.portrait ? "" : "portrait--empty"}" aria-hidden="true">${character.portrait ? `<img class="portrait-image" src="${escapeHtml(character.portrait)}" alt="" loading="lazy" />` : ""}</span>`;
}

function personalize(text) {
  const playerName = state.playerName || defaultPlayerName();
  return text
    .replaceAll("{{PLAYER_NAME}}", playerName)
    .replace(/\{\{G:([^:]*):([^}]*)\}\}/gu, (_, male, female) => decodeURIComponent(state.playerGender === "male" ? male : female));
}

function currentGame() { return state.archive.games.find((game) => game.id === state.gameId); }
function currentMode() { return state.selectedMode || currentGame().modes[state.modeId]; }
function findCharacter(id) { return currentMode().characters.find((character) => character.id === id); }
function partnerCharacters(character) {
  const allowed = new Set(character.partners);
  return currentMode().characters.filter((item) => allowed.has(item.id));
}
function pairConversations(firstId, secondId) {
  return currentMode().conversations.filter((conversation) => conversation.characters.includes(firstId) && conversation.characters.includes(secondId));
}
function defaultPlayerName() { return state.gameId === "awakening" ? "러플레" : "카무이"; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
function errorScreen() {
  return `<main class="loading-shell error-shell"><img class="loading-logo" src="./assets/logo.png" alt="파이어 엠블렘 지원회화" /><h1>아카이브를 열지 못했습니다</h1><p>${escapeHtml(state.error)}</p><button onclick="location.reload()">다시 시도</button></main>`;
}
