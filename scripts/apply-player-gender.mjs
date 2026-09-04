import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { composePortraitSvg } from "./lib/portrait.mjs";
import {
  canonicalCharacterId,
  isAllowedArchivePair,
  isAllowedArchiveSource,
  isAllowedPlayerVariant,
  parseMessageDocument,
  parseScript,
  relationshipLabel,
} from "./lib/parser.mjs";
import { characterName } from "../assets/display.js";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root ?? ".");
const sourceRoot = path.resolve(args.source ?? path.join(root, "..", "FE-Awakening"));
const indexPath = path.join(root, "data", "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));

const MAIN_DIRS = {
  awakening: path.join(sourceRoot, "Awakening", "Messages (K)"),
  fates: path.join(sourceRoot, "if", "파이어 엠블렘 if 대사집 (K)"),
};

for (const game of index.games) {
  await injectMainPlayerSupports(game);
  for (const mode of Object.values(game.modes)) {
    mode.conversations = await splitGenderedConversations(game, mode);
    await rebuildCharacters(game, mode);
  }
}

await writeJson(indexPath, index);
console.log("Applied Avatar gender-aware supports and portraits.");

async function injectMainPlayerSupports(game) {
  const mode = game.modes.main;
  if (!mode) return;
  const names = new Map(Object.entries(game.names || {}));
  const sourceDir = MAIN_DIRS[game.id];
  const fileNames = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => entry.name)
    .sort(naturalCompare);

  // The original main-support parser intentionally ignored keys ending in PCM/PCF,
  // which removed every Avatar support. Rebuild only those missing conversations here.
  mode.conversations = mode.conversations.filter((item) => !item.characters.includes("プレイヤー"));

  const additions = [];
  for (const fileName of fileNames) {
    if (!isAllowedArchiveSource(fileName, game.id)) continue;
    const groups = new Map();
    const entries = parseMessageDocument(await readFile(path.join(sourceDir, fileName), "utf8"));
    for (const entry of entries) {
      const parsed = parsePlayerMainKey(entry.key, names);
      if (!parsed || !entry.value.trim() || !isAllowedPlayerVariant(entry.key, game.id)) continue;
      if (!isAllowedArchivePair(parsed.characters, game.id)) continue;
      const groupKey = [...parsed.characters, parsed.relationship, parsed.playerGender].join("\0");
      if (!groups.has(groupKey)) groups.set(groupKey, { ...parsed, entries: [] });
      const script = parseScript(entry.value, { playerId: "プレイヤー" });
      groups.get(groupKey).entries.push({
        key: entry.key,
        script: entry.value,
        label: parsed.rank,
        segments: script.segments,
        unknownCommands: script.unknownCommands,
        defaultPlayerName: game.id === "awakening" ? "러플레" : "카무이",
      });
    }

    for (const group of groups.values()) {
      group.entries.sort((a, b) => naturalCompare(a.key, b.key));
      additions.push(await saveInjectedConversation(game, fileName, group));
    }
  }
  mode.conversations.push(...additions);
  mode.conversations.sort((a, b) => naturalCompare(a.title, b.title));
  console.log(`${game.id}: injected ${additions.length} Avatar main conversations.`);
}

function parsePlayerMainKey(key, names) {
  const match = key.match(/^MID_支援_(.+)_([ＣＢＡＳ])(?:_00)?_(PC[MF]\d+)$/u);
  if (!match) return null;
  const ids = match[1]
    .split("_")
    .filter((part) => part && !["親子", "恋人", "兄弟", "姉妹", "夫婦", "家族", "通常", "一般"].includes(part))
    .map((part) => canonicalCharacterId(part, names));
  if (ids.length < 2 || ids[0] === ids[1] || !ids.includes("プレイヤー")) return null;
  return {
    characters: ids.slice(0, 2),
    rank: match[2],
    relationship: relationshipLabel(key),
    playerGender: match[3].startsWith("PCM") ? "male" : "female",
  };
}

async function saveInjectedConversation(game, sourceFile, group) {
  const pairLabel = group.characters.map((id) => displayName(game, id)).join(" × ");
  const title = `${pairLabel} · ${group.relationship}`;
  const identity = `${game.id}:main:${sourceFile}:${group.characters.join(":")}:${group.relationship}:${group.playerGender}`;
  const id = createHash("sha1").update(identity).digest("hex").slice(0, 14);
  const relativePath = `./data/conversations/${game.id}/main/${id}.json`;
  const payload = {
    id,
    game: game.id,
    mode: "main",
    title,
    relationship: group.relationship,
    playerGender: group.playerGender,
    sourceFile,
    sourceLabel: "",
    characters: group.characters,
    entries: group.entries,
  };
  await writeJson(path.join(root, relativePath.slice(2)), payload);
  return {
    id,
    title,
    sourceLabel: "",
    characters: group.characters,
    entryLabels: group.entries.map((entry) => entry.label),
    relationship: group.relationship,
    playerGender: group.playerGender,
    path: relativePath,
  };
}

async function splitGenderedConversations(game, mode) {
  const result = [];
  for (const metadata of mode.conversations) {
    if (!metadata.characters.includes("プレイヤー") || metadata.playerGender) {
      result.push(metadata);
      continue;
    }
    const filePath = path.join(root, metadata.path.replace(/^\.\//u, ""));
    const conversation = JSON.parse(await readFile(filePath, "utf8"));
    const genders = new Set(conversation.entries.map((entry) => genderFromKey(entry.key)).filter(Boolean));
    if (!genders.size) {
      result.push(metadata);
      continue;
    }

    const neutral = conversation.entries.filter((entry) => !genderFromKey(entry.key));
    for (const gender of ["male", "female"]) {
      if (!genders.has(gender)) continue;
      const entries = conversation.entries.filter((entry) => genderFromKey(entry.key) === gender || neutral.includes(entry));
      const id = createHash("sha1").update(`${conversation.id}:${gender}`).digest("hex").slice(0, 14);
      const relativePath = `./data/conversations/${game.id}/${mode.id}/${id}.json`;
      const payload = { ...conversation, id, playerGender: gender, entries };
      await writeJson(path.join(root, relativePath.slice(2)), payload);
      result.push({
        ...metadata,
        id,
        path: relativePath,
        playerGender: gender,
        entryLabels: entries.map((entry) => entry.label),
      });
    }
  }
  return result.sort((a, b) => naturalCompare(a.title, b.title));
}

async function rebuildCharacters(game, mode) {
  const ids = new Set(mode.conversations.flatMap((conversation) => conversation.characters));
  const byId = new Map(mode.characters.map((character) => [character.id, character]));
  const partnerSets = new Map([...ids].map((id) => [id, new Set()]));
  const genderSets = new Map([...ids].map((id) => [id, { male: new Set(), female: new Set() }]));

  for (const conversation of mode.conversations) {
    const [first, second] = conversation.characters;
    partnerSets.get(first)?.add(second);
    partnerSets.get(second)?.add(first);
    const genders = conversation.playerGender ? [conversation.playerGender] : ["male", "female"];
    for (const gender of genders) {
      genderSets.get(first)?.[gender].add(second);
      genderSets.get(second)?.[gender].add(first);
    }
  }

  const playerPortraits = await buildPlayerPortraits(game.id);
  const characters = [];
  for (const id of [...ids].sort((a, b) => naturalCompare(displayName(game, a), displayName(game, b)))) {
    const previous = byId.get(id) || { id, name: displayName(game, id), portrait: null };
    const genderPartners = genderSets.get(id);
    const next = {
      ...previous,
      partners: [...partnerSets.get(id)].sort((a, b) => naturalCompare(displayName(game, a), displayName(game, b))),
      partnersByGender: {
        male: [...genderPartners.male].sort((a, b) => naturalCompare(displayName(game, a), displayName(game, b))),
        female: [...genderPartners.female].sort((a, b) => naturalCompare(displayName(game, a), displayName(game, b))),
      },
    };
    if (id === "プレイヤー") {
      next.portraits = playerPortraits;
      next.portrait = playerPortraits.male || playerPortraits.female || previous.portrait || null;
    }
    characters.push(next);
  }
  mode.characters = characters;
}

async function buildPlayerPortraits(gameId) {
  const specs = gameId === "awakening"
    ? {
        male: "マイユニ_青年_顔立ちA",
        female: "マイユニ_少女_顔立ちA",
      }
    : {
        male: "PlayerAvatar",
        female: "PlayerAvatar_f",
      };
  const result = {};
  for (const [gender, assetId] of Object.entries(specs)) {
    const face = path.join(root, "assets", "renderers", gameId, "img", "face", `${assetId}_bu_通常.png`);
    const hair = path.join(root, "assets", "renderers", gameId, "img", "hair", `${assetId}_bu_髪0.png`);
    if (!(await isFile(face))) continue;
    const outputBase = path.join(root, "assets", "portraits", `${gameId}-player-${gender}`);
    await mkdir(path.dirname(outputBase), { recursive: true });
    if (await isFile(hair)) {
      const output = `${outputBase}.svg`;
      await writeFile(output, composePortraitSvg(await readFile(face), await readFile(hair)), "utf8");
      result[gender] = `./assets/portraits/${path.basename(output)}`;
    } else {
      const output = `${outputBase}.png`;
      await copyFile(face, output);
      result[gender] = `./assets/portraits/${path.basename(output)}`;
    }
  }
  return result;
}

function genderFromKey(key) {
  const variant = String(key).match(/_(PC[MF]\d+)(?:_|$)/u)?.[1] || "";
  if (variant.startsWith("PCM")) return "male";
  if (variant.startsWith("PCF")) return "female";
  return "";
}

function displayName(game, id) {
  return characterName(id, game.names || {}, game.id === "awakening" ? "러플레" : "카무이");
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), "ko", { numeric: true, sensitivity: "base" });
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
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
