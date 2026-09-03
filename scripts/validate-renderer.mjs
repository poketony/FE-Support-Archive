import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { GameRenderer, createState } from "../assets/game-renderer.js";
import { splitConversationFrames } from "../assets/renderer-format.js";

const root = path.resolve(process.argv[2] || ".");
const archive = JSON.parse(await readFile(path.join(root, "data/index.json"), "utf8"));
let frames = 0;
for (const game of archive.games) {
  const renderer = new GameRenderer(game.id);
  const assetRoot = path.join(root, "assets/renderers", game.id);
  const faceFiles = new Set(await readdir(path.join(assetRoot, "img/face")));
  const hairFiles = new Set(await readdir(path.join(assetRoot, "img/hair")));
  const missing = new Set();
  let hairComposites = 0;
  for (const relative of ["bin/chars.bin", "bin/faces.bin", "txt/FID.txt", "img/Awakening_0.png", "img/Awakening_1.png", "img/SupportBG.png", "img/TextBox.png", "img/NameBox.png", "img/KeyPress.png"]) {
    assert.ok((await stat(path.join(assetRoot, relative))).size > 0, relative);
  }
  const chars = await readFile(path.join(assetRoot, "bin/chars.bin"));
  renderer.loadFontCharacters(chars.buffer.slice(chars.byteOffset, chars.byteOffset + chars.byteLength));
  assert.ok(renderer.fontCharacters.has("가".codePointAt(0)), "Korean glyphs");
  for (const gender of ["male", "female"]) {
    const avatar = renderer.resolveCharacter("username", gender);
    for (const mode of ["st", "bu"]) {
      assert.ok(hairFiles.has(`${avatar.hair}_${mode}_髪0.png`), `${game.id}: ${gender} avatar hair`);
    }
  }
  for (const child of game.id === "awakening" ? ["アズール", "ウード", "セレナ"] : ["キヌ", "シノノメ", "キサラギ"]) {
    for (const mode of ["st", "bu"]) {
      assert.ok(hairFiles.has(`${child}_${mode}_髪0.png`), `${game.id}: ${child} child hair`);
    }
  }
  for (const mode of Object.values(game.modes)) {
    for (const metadata of mode.conversations) {
      const conversation = JSON.parse(await readFile(path.join(root, metadata.path), "utf8"));
      for (const entry of conversation.entries) {
        const state = createState(entry.defaultPlayerName, "female");
        for (const frame of splitConversationFrames(entry.script)) {
          renderer.parseFrame(frame, state);
          frames++;
          for (const character of [state.charA, state.charB]) {
            if (!character.name) continue;
            const asset = renderer.resolveCharacter(character.name, "female");
            const mode = state.type === 0 ? "bu" : "st";
            const emotion = character.emotion.split(",")[0] || "通常";
            const face = `${asset.base}_${mode}_${emotion}.png`;
            if (!faceFiles.has(face)) missing.add(face);
            if (hairFiles.has(`${asset.hair}_${mode}_髪0.png`)) hairComposites++;
          }
        }
      }
    }
  }
  console.log(`${game.id}: ${hairFiles.size} hair assets, ${hairComposites} visible hair composites, ${missing.size} unavailable source expressions.`);
  if (missing.size) console.log([...missing].slice(0, 30).join("\n"));
}
console.log(`Parsed ${frames} game frames without stalling.`);
