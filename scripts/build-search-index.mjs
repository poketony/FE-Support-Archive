import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { characterName } from "../assets/display.js";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function decodeGenderVariants(text) {
  return String(text ?? "")
    .replaceAll("{{PLAYER_NAME}}", "주인공")
    .replace(/\{\{G:([^:]*):([^}]*)\}\}/gu, (_, male, female) => {
      const decode = (value) => {
        try { return decodeURIComponent(value); } catch { return value; }
      };
      return `${decode(male)} ${decode(female)}`;
    });
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\s+/gu, " ")
    .trim();
}

export function buildSearchRecord({ game, mode, conversation, entry, entryIndex, contentId }) {
  const names = game.names || {};
  const playerName = game.id === "awakening" ? "러플레" : "카무이";
  const characterNames = conversation.characters.map((id) => characterName(id, names, playerName));
  const speakers = [...new Set((entry.segments || []).map((segment) => characterName(segment.speaker, names, playerName)))];
  const text = (entry.segments || [])
    .map((segment) => decodeGenderVariants(segment.text))
    .filter(Boolean)
    .join("\n");
  const searchable = [
    conversation.title,
    conversation.relationship,
    conversation.sourceLabel,
    conversation.sourceFile,
    entry.label,
    ...characterNames,
    ...speakers,
    text,
  ].filter(Boolean).join("\n");

  return {
    game: game.id,
    mode,
    contentId: contentId || "",
    conversationId: conversation.id,
    characters: conversation.characters,
    characterNames,
    title: conversation.title,
    relationship: conversation.relationship,
    sourceLabel: conversation.sourceLabel || "",
    sourceFile: conversation.sourceFile || "",
    entryIndex,
    entryLabel: entry.label,
    speakers,
    text,
    searchText: normalizeSearchText(searchable),
  };
}

export function routeForSearchRecord(record) {
  const parts = [record.game, record.mode];
  if (record.mode === "dlc" && record.contentId) parts.push(record.contentId);
  parts.push(...record.characters, record.conversationId);
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}

export async function buildSearchIndexes(root) {
  const indexPath = path.join(root, "data", "index.json");
  const archive = JSON.parse(await readFile(indexPath, "utf8"));
  const searchDir = path.join(root, "data", "search");
  await mkdir(searchDir, { recursive: true });

  for (const game of archive.games) {
    const records = [];
    const collectionIds = new Map((game.modes.dlc?.collections || []).map((item) => [item.label, item.id]));

    for (const [modeId, mode] of Object.entries(game.modes)) {
      for (const metadata of mode.conversations) {
        const conversationPath = path.join(root, metadata.path.replace(/^\.\//u, ""));
        const conversation = JSON.parse(await readFile(conversationPath, "utf8"));
        const contentId = modeId === "dlc" ? collectionIds.get(conversation.sourceLabel) || "" : "";

        conversation.entries.forEach((entry, entryIndex) => {
          records.push(buildSearchRecord({
            game,
            mode: modeId,
            conversation,
            entry,
            entryIndex,
            contentId,
          }));
        });
      }
    }

    const payload = {
      schemaVersion: 1,
      game: game.id,
      generatedAt: archive.generatedAt,
      count: records.length,
      records,
    };
    await writeFile(path.join(searchDir, `${game.id}.json`), `${JSON.stringify(payload)}\n`, "utf8");
    console.log(`Search index ${game.id}: ${records.length} entries`);
  }
}

const args = parseArgs(process.argv.slice(2));
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(args.root || "dist");
  await buildSearchIndexes(root);
}
