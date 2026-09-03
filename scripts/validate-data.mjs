import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isAllowedArchivePair, isAllowedPlayerVariant } from "./lib/parser.mjs";
import { visibleText } from "../assets/display.js";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root ?? ".");
const index = JSON.parse(await readFile(path.join(root, "data", "index.json"), "utf8"));
const problems = [];
let conversationCount = 0;
let entryCount = 0;
let segmentCount = 0;
let portraitCount = 0;
const modeSummary = [];

for (const game of index.games) {
  for (const mode of Object.values(game.modes)) {
    const ids = new Set(mode.characters.map((character) => character.id));
    if (!mode.characters.length) problems.push(`${game.id}/${mode.id}: 캐릭터가 없습니다.`);
    if (!mode.conversations.length) problems.push(`${game.id}/${mode.id}: 회화가 없습니다.`);
    if (mode.id === "dlc") {
      for (const content of mode.collections || []) {
        if (!mode.conversations.some((item) => item.sourceLabel === content.label)) problems.push(`${content.id}: 빈 DLC`);
        if (content.image && !(await isFile(path.join(root, content.image)))) problems.push(`${content.id}: DLC 이미지 누락`);
      }
      if (!mode.collections?.length) problems.push(`${game.id}: DLC 선택 목록 누락`);
    }

    for (const character of mode.characters) {
      if (visibleText(character.name) !== character.name) problems.push(`${game.id}: 일본어 인물명 노출`);
      if (!isAllowedArchivePair([character.id], game.id)) problems.push(`${game.id}: 제외 대상 인물 노출`);
      if (game.id === "awakening" && character.id === "マルス" && character.name !== "루키나") problems.push("루키나 이름 불일치");
      if (character.id === "ベロア" && !character.portrait) problems.push("벨로리아 초상화 누락");
      for (const partner of character.partners) {
        if (!ids.has(partner)) problems.push(`${game.id}/${mode.id}: 없는 상대 ${partner}`);
        const reverse = mode.characters.find((item) => item.id === partner)?.partners.includes(character.id);
        if (!reverse) problems.push(`${game.id}/${mode.id}: ${character.id} ↔ ${partner} 연결이 비대칭입니다.`);
      }
      if (character.portrait) {
        portraitCount += 1;
        const assetId = character.id === "ベロア" ? "べロア" : character.id;
        const hairPath = path.join(root, "assets/renderers", game.id, "img/hair", `${assetId}_bu_髪0.png`);
        if (await isFile(hairPath)) {
          if (!character.portrait.endsWith(".svg")) {
            problems.push(`${game.id}/${character.id}: 선택용 초상화 머리카락 합성 누락`);
          } else {
            const composed = await readFile(path.join(root, character.portrait), "utf8");
            const hairData = (await readFile(hairPath)).toString("base64");
            if (!composed.includes(hairData) || (composed.match(/<image /g) || []).length !== 2) {
              problems.push(`${game.id}/${character.id}: 합성 초상화의 머리카락 레이어 누락`);
            }
          }
        }
        if (!(await isFile(path.join(root, character.portrait.replace(/^\.\//u, ""))))) {
          problems.push(`${game.id}/${mode.id}: 초상화 파일 누락 ${character.portrait}`);
        }
      }
    }

    for (const metadata of mode.conversations) {
      if (visibleText(metadata.title) !== metadata.title) problems.push(`${metadata.id}: 일본어 제목 노출`);
      conversationCount += 1;
      if (metadata.characters.length !== 2 || metadata.characters.some((id) => !ids.has(id))) {
        problems.push(`${game.id}/${mode.id}/${metadata.id}: 캐릭터 참조 오류`);
      }
      const filePath = path.join(root, metadata.path.replace(/^\.\//u, ""));
      if (!(await isFile(filePath))) {
        problems.push(`${game.id}/${mode.id}/${metadata.id}: 회화 파일 누락`);
        continue;
      }
      const conversation = JSON.parse(await readFile(filePath, "utf8"));
      if (!conversation.entries.length) problems.push(`${game.id}/${mode.id}/${metadata.id}: 빈 회화`);
      for (const entry of conversation.entries) {
        if (!isAllowedPlayerVariant(entry.key, game.id)) problems.push(`${metadata.id}: 제외 대상 주인공 변형`);
        entryCount += 1;
        if (!entry.script?.trim()) problems.push(`${game.id}/${metadata.id}/${entry.key}: 렌더링 스크립트 없음`);
        segmentCount += entry.segments.length;
        if (!entry.segments.length) problems.push(`${game.id}/${mode.id}/${metadata.id}/${entry.key}: 표시 대사 없음`);
      }
    }
    modeSummary.push(`${game.shortLabel}/${mode.label}: ${mode.characters.length}명, ${mode.conversations.length}개`);
  }
}

if (problems.length) {
  console.error(problems.slice(0, 50).join("\n"));
  console.error(`Validation failed with ${problems.length} problem(s).`);
  process.exitCode = 1;
} else {
  console.log(modeSummary.join("\n"));
  console.log(`Validated ${conversationCount} conversations, ${entryCount} entries, ${segmentCount} speech segments, ${portraitCount} portrait references.`);
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
