import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composePortraitSvg } from "./lib/portrait.mjs";
import {
  canonicalCharacterId,
  extractDlcSupportKey,
  extractMainSupportKey,
  parseMessageDocument,
  parseNameMap,
  parseScript,
} from "./lib/parser.mjs";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(args.source ?? path.join(projectRoot, "..", "FE13-Messages"));
const outputRoot = path.resolve(args.output ?? projectRoot);
const feitsRoot = args.feits ? path.resolve(args.feits) : null;
if (!feitsRoot) throw new Error("실제 if 렌더링 리소스를 위해 --feits 경로가 필요합니다.");
const awakeningAssets = path.join(sourceRoot, "Awakening", "Awakening-Live-Renderer", "assets", "awakening");

const GAME_CONFIGS = [
  {
    id: "awakening",
    label: "파이어 엠블렘 각성",
    shortLabel: "각성",
    mainDir: path.join(sourceRoot, "Awakening", "Messages (K)"),
    gameData: path.join(sourceRoot, "Awakening", "Messages (K)", "GameData.txt"),
    portraitDir: path.join(sourceRoot, "Awakening", "Awakening-Live-Renderer", "assets", "awakening", "img", "face"),
    dlc: [
      ["인연의 여름", path.join(sourceRoot, "Awakening", "DLC Message (K)", "22. 인연의 여름.txt")],
      ["인연의 비밀 온천", path.join(sourceRoot, "Awakening", "DLC Message (K)", "23. 인연의 비밀 온천.txt")],
      ["인연의 수확제", path.join(sourceRoot, "Awakening", "DLC Message (K)", "24. 인연의 수확제.txt")],
    ],
  },
  {
    id: "fates",
    label: "파이어 엠블렘 if",
    shortLabel: "if",
    mainDir: path.join(sourceRoot, "if", "파이어 엠블렘 if 대사집 (K)"),
    gameData: path.join(sourceRoot, "if", "파이어 엠블렘 if 대사집 (K)", "GameData.txt"),
    portraitDir: feitsRoot ? path.join(feitsRoot, "FEFTS", "Resources", "img", "face") : null,
    dlc: [
      ["인연의 백야제", path.join(sourceRoot, "if", "인연의 백야제.txt")],
      ["인연의 암야제", path.join(sourceRoot, "if", "인연의 암야제.txt")],
    ],
  },
];

const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "poketony/FE-Awakening",
  games: [],
};

await copySiteShell();
await mkdir(path.join(outputRoot, "data", "conversations"), { recursive: true });
await mkdir(path.join(outputRoot, "assets", "portraits"), { recursive: true });

for (const config of GAME_CONFIGS) {
  const names = parseNameMap(await readFile(config.gameData, "utf8"));
  if (!names.has("プレイヤー")) names.set("プレイヤー", config.id === "awakening" ? "러플레" : "카무이");
  const main = await buildMainMode(config, names);
  const dlc = await buildDlcMode(config, names);
  await copyRendererAssets(config);
  index.games.push({
    id: config.id,
    label: config.label,
    shortLabel: config.shortLabel,
    names: Object.fromEntries(names),
    modes: { main, dlc },
  });
}

await writeJson(path.join(outputRoot, "data", "index.json"), index);
const totals = index.games.flatMap((game) => Object.values(game.modes));
const conversationTotal = totals.reduce((sum, mode) => sum + mode.conversations.length, 0);
const characterTotal = totals.reduce((sum, mode) => sum + mode.characters.length, 0);
console.log(`Generated ${conversationTotal} conversations and ${characterTotal} character-mode entries.`);

async function copySiteShell() {
  if (outputRoot === projectRoot) return;
  const files = [
    "index.html",
    "assets/app.js",
    "assets/game-renderer.js",
    "assets/renderer-format.js",
    "LICENSE.txt",
    "assets/styles.css",
    "assets/logo.png",
    "assets/awakening-keyart.png",
    "assets/fates-birthright-logo.webp",
    "assets/fates-conquest-logo.webp",
  ];
  for (const relativePath of files) {
    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(projectRoot, relativePath), destination);
  }
}

async function buildMainMode(config, names) {
  const files = (await readdir(config.mainDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const conversations = [];

  for (const fileName of files) {
    const filePath = path.join(config.mainDir, fileName);
    const entries = parseMessageDocument(await readFile(filePath, "utf8"));
    const supportEntries = [];
    let pair = null;
    for (const entry of entries) {
      const parsedKey = extractMainSupportKey(entry.key, names);
      if (!parsedKey || !entry.value.trim()) continue;
      pair ??= parsedKey.characters;
      if (pair.join("\0") !== parsedKey.characters.join("\0")) continue;
      supportEntries.push(toArchiveEntry(entry, parsedKey.rank, config.id));
    }
    if (!pair || !supportEntries.length) continue;
    conversations.push(await saveConversation(config, "main", names, pair, fileName, fileName, supportEntries));
  }

  return finalizeMode(config, "main", "본편 지원회화", names, conversations);
}

async function buildDlcMode(config, names) {
  const conversations = [];
  for (const [sourceLabel, filePath] of config.dlc) {
    const groups = new Map();
    for (const entry of parseMessageDocument(await readFile(filePath, "utf8"))) {
      const parsedKey = extractDlcSupportKey(entry.key, names);
      if (!parsedKey || !entry.value.trim()) continue;
      const groupKey = parsedKey.characters.join("\0");
      if (!groups.has(groupKey)) groups.set(groupKey, { pair: parsedKey.characters, entries: [] });
      groups.get(groupKey).entries.push(toArchiveEntry(entry, parsedKey.variant, config.id));
    }
    for (const group of groups.values()) {
      group.entries.sort((a, b) => naturalCompare(a.key, b.key));
      const pairLabel = group.pair.map((id) => displayName(id, names, config.id)).join(" × ");
      const title = `${sourceLabel} · ${pairLabel}`;
      conversations.push(await saveConversation(config, "dlc", names, group.pair, title, path.basename(filePath), group.entries, sourceLabel));
    }
  }
  conversations.sort((a, b) => naturalCompare(a.title, b.title));
  return finalizeMode(config, "dlc", "DLC 지원회화", names, conversations);
}

function toArchiveEntry(entry, label, gameId) {
  const parsed = parseScript(entry.value, { playerId: "プレイヤー" });
  return {
    key: entry.key,
    script: entry.value,
    label,
    segments: parsed.segments,
    unknownCommands: parsed.unknownCommands,
    defaultPlayerName: gameId === "awakening" ? "러플레" : "카무이",
  };
}

async function saveConversation(config, modeId, names, pair, title, sourceFile, entries, sourceLabel = "") {
  const identity = `${config.id}:${modeId}:${sourceFile}:${pair.join(":")}:${title}`;
  const id = createHash("sha1").update(identity).digest("hex").slice(0, 14);
  const relativePath = `./data/conversations/${config.id}/${modeId}/${id}.json`;
  const payload = {
    id,
    game: config.id,
    mode: modeId,
    title: title.replace(/\.txt$/u, ""),
    sourceFile,
    sourceLabel,
    characters: pair,
    entries,
  };
  await writeJson(path.join(outputRoot, relativePath.slice(2)), payload);
  return {
    id,
    title: payload.title,
    sourceLabel,
    characters: pair,
    entryLabels: entries.map((entry) => entry.label),
    path: relativePath,
  };
}

async function finalizeMode(config, modeId, label, names, conversations) {
  const ids = new Set(conversations.flatMap((conversation) => conversation.characters));
  const partnerMap = new Map([...ids].map((id) => [id, new Set()]));
  for (const conversation of conversations) {
    const [first, second] = conversation.characters;
    partnerMap.get(first)?.add(second);
    partnerMap.get(second)?.add(first);
  }
  const characters = [];
  for (const id of [...ids].sort((a, b) => naturalCompare(displayName(a, names, config.id), displayName(b, names, config.id)))) {
    characters.push({
      id,
      name: displayName(id, names, config.id),
      portrait: await copyPortrait(config, id),
      partners: [...partnerMap.get(id)].sort((a, b) => naturalCompare(displayName(a, names, config.id), displayName(b, names, config.id))),
    });
  }
  return {
    id: modeId,
    label,
    description: modeId === "main" ? "C·B·A·S 등 본편에서 이어지는 지원회화" : "인연 DLC에서만 볼 수 있는 특별 회화",
    characters,
    conversations,
  };
}

async function copyPortrait(config, rawId) {
  if (!config.portraitDir) return null;
  const id = canonicalCharacterId(rawId);
  const candidates = [
    `${id}_bu_通常.png`,
    rawId !== id ? `${rawId}_bu_通常.png` : "",
    id === "プレイヤー" ? "プレイヤー男_bu_通常.png" : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const source = path.join(config.portraitDir, candidate);
    if (!(await exists(source))) continue;
    const hairPath = path.join(config.portraitDir, "..", "hair", candidate.replace("_bu_通常.png", "_bu_髪0.png"));
    const hasHair = await exists(hairPath);
    const fileName = `${config.id}-${createHash("sha1").update(id).digest("hex").slice(0, 12)}.${hasHair ? "svg" : "png"}`;
    const destination = path.join(outputRoot, "assets", "portraits", fileName);
    if (hasHair) {
      await writeFile(destination, composePortraitSvg(await readFile(source), await readFile(hairPath)), "utf8");
    } else {
      await copyFile(source, destination);
    }
    return `./assets/portraits/${fileName}`;
  }
  return null;
}

async function copyRendererAssets(config) {
  const source = config.id === "awakening" ? awakeningAssets : path.join(feitsRoot, "FEFTS", "Resources");
  const destination = path.join(outputRoot, "assets", "renderers", config.id);
  for (const relative of ["bin/faces.bin", "txt/FID.txt", "img/SupportBG.png", "img/TextBox.png", "img/NameBox.png", "img/KeyPress.png"]) {
    await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
    await copyFile(path.join(source, relative), path.join(destination, relative));
  }
  // The live renderer contains the Korean release's glyph metrics and atlases.
  for (const relative of ["bin/chars.bin", "img/Awakening_0.png", "img/Awakening_1.png"]) {
    await copyFile(path.join(awakeningAssets, relative), path.join(destination, relative));
  }
  await cp(path.join(source, "img", "face"), path.join(destination, "img", "face"), { recursive: true });
  await cp(path.join(source, "img", "hair"), path.join(destination, "img", "hair"), { recursive: true });
}

function displayName(id, names, gameId) {
  if (id === "プレイヤー") return gameId === "awakening" ? "러플레" : "카무이";
  return names.get(id)?.trim() || id;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function naturalCompare(a, b) {
  return a.localeCompare(b, "ko", { numeric: true });
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    result[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}
