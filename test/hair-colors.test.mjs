import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HAIR_COLOR,
  hairColorForAssetPath,
  hairColorForCharacter,
} from "../assets/hair-colors.js";

test("Awakening children use their fixed parent's hair color", () => {
  assert.deepEqual(hairColorForCharacter("awakening", "ウード"), [0xDA, 0xD3, 0xBD]);
  assert.deepEqual(hairColorForCharacter("awakening", "アズール"), [0xEB, 0xCD, 0xD6]);
  assert.deepEqual(hairColorForCharacter("awakening", "デジェル"), [0x59, 0x56, 0x55]);
  assert.deepEqual(hairColorForCharacter("awakening", "セレナ"), [0xAF, 0x54, 0x54]);
  assert.deepEqual(hairColorForCharacter("awakening", "ンン"), [0xC2, 0xD6, 0xAE]);
});

test("official-art child color exceptions stay explicit", () => {
  assert.deepEqual(hairColorForCharacter("awakening", "マーク男"), DEFAULT_HAIR_COLOR);
  assert.deepEqual(hairColorForCharacter("awakening", "マーク女"), DEFAULT_HAIR_COLOR);
  assert.deepEqual(hairColorForCharacter("fates", "ミタマ"), [0xFF, 0xE3, 0xED]);
  assert.deepEqual(hairColorForCharacter("fates", "ベロア"), [0x48, 0x48, 0x48]);
  assert.deepEqual(hairColorForCharacter("fates", "べロア"), [0x48, 0x48, 0x48]);
  assert.deepEqual(hairColorForCharacter("fates", "ソレイユ"), [0xED, 0xD2, 0xDA]);
});

test("other Fates children use their fixed parent's hair color", () => {
  assert.deepEqual(hairColorForCharacter("fates", "シノノメ"), [0x58, 0x33, 0x2D]);
  assert.deepEqual(hairColorForCharacter("fates", "マトイ"), [0x8A, 0x41, 0x44]);
  assert.deepEqual(hairColorForCharacter("fates", "シャラ"), [0x8B, 0x5A, 0x5C]);
});

test("Robin and Corrin use their official default hair colors", () => {
  assert.deepEqual(hairColorForCharacter("awakening", "プレイヤー"), [0xF6, 0xF4, 0xEF]);
  assert.deepEqual(hairColorForCharacter("fates", "プレイヤー"), [0xFF, 0xFF, 0xFF]);
  assert.deepEqual(hairColorForCharacter("fates", "カンナ男"), [0xFF, 0xFF, 0xFF]);
});

test("live-renderer hair paths resolve to the same character colors", () => {
  assert.deepEqual(
    hairColorForAssetPath("awakening", "img/hair/ジェローム_st_髪0.png"),
    hairColorForCharacter("awakening", "ジェローム"),
  );
  assert.deepEqual(
    hairColorForAssetPath("fates", "img/hair/マイユニ女1_bu_髪0.png"),
    [0xFF, 0xFF, 0xFF],
  );
  assert.deepEqual(hairColorForCharacter("awakening", "not-mapped"), DEFAULT_HAIR_COLOR);
});
