import test from "node:test";
import assert from "node:assert/strict";
import { GameRenderer, createState } from "../assets/game-renderer.js";
import { splitConversationFrames } from "../assets/renderer-format.js";

test("frames preserve sound-prefixed dialogue and literal newlines", () => {
  assert.deepEqual(splitConversationFrames("$SbsBGM|첫 줄\\n둘째 줄$k$p다음$k"), ["$SbsBGM|첫 줄\\n둘째 줄", "다음$k"]);
});

for (const game of ["awakening", "fates"]) {
  test(`${game}: staging, expressions, player name and Korean controls`, () => {
    const renderer = new GameRenderer(game);
    const state = createState("러플레", "female");
    const first = renderer.parseFrame("$t1$Wmusername|3$Wmクロム|7$Wsusername|$E笑,汗|$Nu$KrP1| 왔어.$k", state);
    assert.equal(first, "러플레는 왔어.");
    assert.equal(state.charA.name, "username");
    assert.equal(state.charA.emotion, "笑,汗");
    assert.equal(state.charB.name, "クロム");
    assert.equal(state.active, "A");
    assert.equal(renderer.parseFrame("$Wsクロム|$G남성,여성|$Mystery$E怒,|대사", state), "여성대사");
    assert.equal(state.active, "B");
    assert.equal(state.charB.emotion, "怒,");
    assert.ok(state.unknownCodes.has("$Mystery"));
    renderer.parseFrame("$Wd", state);
    assert.equal(state.charB.name, "");
  });
}

test("game-specific avatar and face metadata layouts", () => {
  const awakening = new GameRenderer("awakening");
  const fates = new GameRenderer("fates");
  assert.equal(awakening.config.faceRecordSize, 0x28);
  assert.equal(fates.config.faceRecordSize, 0x48);
  assert.equal(fates.config.bustCropOffset, 0x30);
  assert.equal(fates.resolveCharacter("username", "female").base, "aマイユニ女1");
  assert.equal(fates.resolveCharacter("username", "male").data, "マイユニ_男1_顔A");
  assert.equal(awakening.resolveCharacter("username2", "male").base, "マイユニ_青年_顔立ちA");
});

for (const game of ["awakening", "fates"]) {
  for (const gender of ["male", "female"]) {
    test(`${game}/${gender}: stage and bust composite separate hair`, async () => {
      const renderer = new GameRenderer(game);
      const avatar = renderer.resolveCharacter("username", gender);
      const draws = [];
      const context = {
        save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
        drawImage(image) { draws.push(image.path); },
      };
      renderer.loadImage = async (path) => ({ path, width: 256, height: 256 });
      renderer.recolorHair = (image) => image;
      const data = new DataView(new ArrayBuffer(renderer.config.faceRecordSize));
      data.setUint16(renderer.config.bustCropOffset + 4, 69, true);
      data.setUint16(renderer.config.bustCropOffset + 6, 76, true);
      renderer.faceData.set(`FSID_BU_${avatar.data}`, data);
      const character = { name: "username", emotion: "通常,", flip: true };
      await renderer.drawStage(context, character, true, new Set(), gender);
      await renderer.drawBust(context, character, 3, new Set(), gender);
      for (const mode of ["st", "bu"]) {
        assert.ok(draws.includes(`img/hair/${avatar.hair}_${mode}_髪0.png`), `${mode} hair drawn`);
      }
    });
  }
}
