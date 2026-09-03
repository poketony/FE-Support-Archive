import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDlcSupportKey,
  extractMainSupportKey,
  parseNameMap,
  parseScript,
} from "../scripts/lib/parser.mjs";

const names = parseNameMap("MPID_クロム: 크롬\nMPID_スミア: 스미아\nMPID_アクア: 아주라\nMPID_サクラ: 사쿠라\n");

test("extracts main support pair and rank", () => {
  assert.deepEqual(extractMainSupportKey("MID_支援_クロム_スミア_Ｃ", names), {
    characters: ["クロム", "スミア"],
    rank: "Ｃ",
  });
});

test("extracts DLC pair while ignoring variant suffixes", () => {
  assert.deepEqual(extractDlcSupportKey("MID_E033_TK_アクア_サクラ_PCF2", names), {
    characters: ["アクア", "サクラ"],
    variant: "여성 2",
  });
});

test("parses speaker, emotion, Korean particles, and message breaks", () => {
  const result = parseScript("$Wsクロム|$E笑,汗|$Nu$KrP1| 왔다.$k$Wsスミア|반가워요.$k");
  assert.deepEqual(result.segments, [
    { speaker: "クロム", emotion: "笑", text: "{{PLAYER_NAME}}는 왔다." },
    { speaker: "スミア", emotion: "笑", text: "반가워요." },
  ]);
});

test("unknown commands always advance and preserve following dialogue", () => {
  const result = parseScript("$Wsクロム|$Unknown値|계속 읽을 수 있다.$k");
  assert.equal(result.segments[0].text, "계속 읽을 수 있다.");
  assert.deepEqual(result.unknownCommands, ["Unknown"]);
});

test("supports gender substitutions without deciding them at build time", () => {
  const result = parseScript("$Wsクロム|$G형,누나|이라고 불렀다.$k");
  assert.equal(result.segments[0].text, "{{G:%ED%98%95:%EB%88%84%EB%82%98}}이라고 불렀다.");
});
