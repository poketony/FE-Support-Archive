import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAllowedArchivePair, isAllowedPlayerVariant } from "../scripts/lib/parser.mjs";
import { characterName, visibleText } from "../assets/display.js";
import { selectDlcContent } from "../assets/archive-navigation.js";

test("keeps only the requested player script variants", () => {
  for (const game of ["awakening", "fates"]) {
    const allowed = game === "awakening" ? ["PCM1", "PCF1"] : ["PCM1", "PCF2"];
    for (const variant of ["PCM1", "PCM2", "PCM3", "PCF1", "PCF2", "PCF3"]) {
      assert.equal(isAllowedPlayerVariant("MID_E001_TK_username_クロム_" + variant, game), allowed.includes(variant));
    }
    assert.equal(isAllowedPlayerVariant("MID_支援_クロム_スミア_Ｃ", game), true);
  }
});

test("excludes Father and the old Awakening Lucina without excluding Marth's entry", () => {
  assert.equal(isAllowedArchivePair(["クロム", "父親"], "awakening"), false);
  assert.equal(isAllowedArchivePair(["父親", "アクア"], "fates"), false);
  assert.equal(isAllowedArchivePair(["ルキナ", "クロム"], "awakening"), false);
  assert.equal(isAllowedArchivePair(["マルス", "クロム"], "awakening"), true);
  assert.equal(isAllowedArchivePair(["ルキナ", "アクア"], "fates"), true);
  assert.equal(characterName("マルス", { マルス: "루키나" }), "루키나");
});

test("display names and untranslated text never leak Japanese", () => {
  assert.equal(characterName("マーク男", {}), "마크(남)");
  assert.equal(characterName("マーク女", {}), "마크(여)");
  assert.equal(characterName("べロア", { ベロア: "벨로리아" }), "벨로리아");
  assert.equal(characterName("unknown", {}), "이름 미상");
  assert.equal(characterName("unknown", { unknown: "未翻訳" }), "이름 미상");
  assert.equal(visibleText("안녕하세요."), "안녕하세요.");
  assert.equal(visibleText("こんにちは"), "아직 번역되지 않은 대사입니다.");
});

test("DLC selection isolates conversations and both directions of partner links", () => {
  const mode = {
    collections: [{ id: "summer", label: "여름" }, { id: "spring", label: "온천" }],
    characters: [
      { id: "a", partners: ["b", "c"] }, { id: "b", partners: ["a"] }, { id: "c", partners: ["a"] },
    ],
    conversations: [
      { id: "one", sourceLabel: "여름", characters: ["a", "b"] },
      { id: "two", sourceLabel: "온천", characters: ["a", "c"] },
    ],
  };
  const selected = selectDlcContent(mode, "summer");
  assert.equal(selected.label, "여름");
  assert.deepEqual(selected.conversations.map((item) => item.id), ["one"]);
  assert.deepEqual(selected.characters, [{ id: "a", partners: ["b"] }, { id: "b", partners: ["a"] }]);
  assert.deepEqual(mode.characters[0].partners, ["b", "c"]);
  assert.equal(selectDlcContent(mode, "missing"), null);
});

test("home-screen icons use project-relative paths and declared PNG sizes", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith("./assets/"));
    assert.ok(icon.purpose.includes("maskable"));
    const png = await readFile(new URL(icon.src, root));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
