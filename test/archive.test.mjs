import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAllowedArchivePair, isAllowedArchiveSource, isAllowedPlayerVariant, extractMainSupportKey, extractDlcSupportKey, relationshipLabel } from "../scripts/lib/parser.mjs";
import { characterName, transcriptCharacterId, visibleText } from "../assets/display.js";
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

test("excludes obsolete source filenames even when their MID refers to Marth", () => {
  assert.equal(isAllowedArchiveSource("デジェル_ルキナ.txt", "awakening"), false);
  assert.equal(isAllowedArchiveSource("セレナ_父親_親子.txt", "awakening"), false);
  assert.equal(isAllowedArchiveSource("ロラン_父親_親子.txt", "awakening"), false);
  assert.equal(isAllowedArchiveSource("デジェル_マルス.txt", "awakening"), true);
  assert.equal(isAllowedArchiveSource("マルス_デジェル_兄弟.txt", "awakening"), true);
  assert.equal(isAllowedArchiveSource("ルキナ.txt", "fates"), true);
});

test("keeps main support relationship markers separate from ranks", () => {
  const general = extractMainSupportKey("MID_支援_デジェル_マルス_Ｃ");
  const siblings = extractMainSupportKey("MID_支援_マルス_デジェル_兄弟_Ｃ");
  const family = extractMainSupportKey("MID_支援_マーク女_マルス_親子_Ａ");
  assert.equal(general.relationship, "일반");
  assert.equal(siblings.relationship, "가족 · 형제·자매");
  assert.equal(family.relationship, "가족 · 부모·자녀");
  assert.deepEqual(family.characters, ["マーク女", "マルス"]);
  assert.equal(family.rank, "Ａ");
});

test("retains DLC lover/family branches and sequence separately from voice variant", () => {
  const names = new Map([["クロム", "크롬"], ["プレイヤー", "러플레"]]);
  const general = extractDlcSupportKey("MID_E033_TK_クロム_プレイヤー女_1_PCF2", names);
  const lover = extractDlcSupportKey("MID_E033_TK_クロム_プレイヤー恋人_2_PCF2", names);
  const family = extractDlcSupportKey("MID_E000_EV_クロム_プレイヤー親子_PCM1", names);
  assert.deepEqual(general.characters, lover.characters);
  assert.equal(general.relationship, "일반");
  assert.equal(lover.relationship, "연인");
  assert.equal(lover.variant, "여성 · 2편");
  assert.equal(family.relationship, "가족 · 부모·자녀");
  assert.equal(family.variant, "남성");
  assert.equal(relationshipLabel("MID_支援_父親_クロム_Ｃ"), "일반");
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

test("Awakening transcript Lucina uses the retained portrait without restoring excluded entries", () => {
  const characters = [{ id: "マルス", name: "루키나", portrait: "./lucina.png" }];
  const portrait = characters.find((item) => item.id === transcriptCharacterId("ルキナ", "awakening"))?.portrait;
  assert.equal(portrait, "./lucina.png");
  assert.equal(transcriptCharacterId("マルス", "awakening"), "マルス");
  assert.equal(transcriptCharacterId("デジェル", "awakening"), "デジェル");
  assert.equal(transcriptCharacterId("ルキナ", "fates"), "ルキナ");
  assert.equal(isAllowedArchivePair(["ルキナ", "デジェル"], "awakening"), false);
  assert.equal(isAllowedArchiveSource("デジェル_ルキナ.txt", "awakening"), false);
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
