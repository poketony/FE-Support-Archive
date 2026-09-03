import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchRecord, normalizeSearchText, routeForSearchRecord } from "../scripts/build-search-index.mjs";

test("game-wide search record includes Korean names and dialogue text", () => {
  const game = {
    id: "fates",
    names: { レオン: "리오", プレイヤー: "카무이" },
  };
  const conversation = {
    id: "abc123",
    title: "리오 × 카무이 · 일반",
    relationship: "일반",
    sourceLabel: "",
    sourceFile: "レオン_プレイヤー.txt",
    characters: ["レオン", "プレイヤー"],
  };
  const entry = {
    label: "A",
    segments: [
      { speaker: "レオン", text: "형도 그 정도는 알고 있을 텐데." },
      { speaker: "プレイヤー", text: "그건 그렇지만…" },
    ],
  };
  const record = buildSearchRecord({ game, mode: "main", conversation, entry, entryIndex: 2, contentId: "" });
  assert.deepEqual(record.characterNames, ["리오", "카무이"]);
  assert.match(record.searchText, /리오/u);
  assert.match(record.searchText, /형도 그 정도/u);
  assert.equal(routeForSearchRecord(record), "#/fates/main/%E3%83%AC%E3%82%AA%E3%83%B3/%E3%83%97%E3%83%AC%E3%82%A4%E3%83%A4%E3%83%BC/abc123");
});

test("search normalization collapses whitespace and case", () => {
  assert.equal(normalizeSearchText("  ABC   리오\n형  "), "abc 리오 형");
});

test("DLC route includes content id", () => {
  const route = routeForSearchRecord({
    game: "fates",
    mode: "dlc",
    contentId: "nohr",
    characters: ["レオン", "プレイヤー"],
    conversationId: "xyz",
  });
  assert.equal(route, "#/fates/dlc/nohr/%E3%83%AC%E3%82%AA%E3%83%B3/%E3%83%97%E3%83%AC%E3%82%A4%E3%83%A4%E3%83%BC/xyz");
});
