import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root ?? ".");
const index = JSON.parse(await readFile(path.join(root, "data", "index.json"), "utf8"));

for (const game of index.games) {
  const genderByConversation = new Map();
  for (const mode of Object.values(game.modes)) {
    for (const conversation of mode.conversations) {
      genderByConversation.set(conversation.id, conversation.playerGender || "");
    }
  }
  const filePath = path.join(root, "data", "search", `${game.id}.json`);
  const search = JSON.parse(await readFile(filePath, "utf8"));
  for (const record of search.records) {
    record.playerGender = genderByConversation.get(record.conversationId) || "";
  }
  await writeFile(filePath, `${JSON.stringify(search)}\n`, "utf8");
}

console.log("Annotated game-wide search records with Avatar gender.");

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    result[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}
