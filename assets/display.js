export const NAME_OVERRIDES = {
  "マーク男": "마크(남)", "マーク女": "마크(여)",
  "カンナ男": "칸나(남)", "カンナ女": "칸나(여)",
  "父親": "아버지", "侍": "무사", "ランサー": "창병", "シーフ": "도적",
  "村長１章版": "마을 이장", "トリックスター男": "트릭스터",
  "ゾンビ男": "좀비", "ボウナイト男": "보우 나이트", "ソードマスター男": "소드 마스터",
};
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export function visibleText(text) {
  return JAPANESE.test(text) ? "아직 번역되지 않은 대사입니다." : text;
}

export function characterName(id, names, playerName = "") {
  if (id === "나레이션") return id;
  if (id.startsWith("username") || id.startsWith("プレイヤー")) return playerName || "주인공";
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
  const clean = id.replace(/画像なし|素顔/gu, "").replace(/[白黒透]$/u, "");
  const alias = ({ "べロア": "ベロア", "オファリア": "オフェリア" })[clean] || clean;
  const get = (key) => names instanceof Map ? names.get(key) : names?.[key];
  const name = get(id) || get(alias);
  return name && !JAPANESE.test(name) ? name : "이름 미상";
}
