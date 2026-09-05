// Canonical tint colors for portraits whose hair is stored as a separate grayscale layer.
// Child units normally use the hair color of their fixed parent so the archive has one stable look.
// A few official-art exceptions are kept explicitly below.

export const DEFAULT_HAIR_COLOR = Object.freeze([0x5b, 0x58, 0x55]);

function rgb(hex) {
  const value = Number.parseInt(hex.replace(/^#/u, ""), 16);
  return Object.freeze([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

const AWAKENING_HAIR_COLORS = new Map([
  // Robin: default official Robin appearance. Morgan keeps the archive's original neutral tint.
  ["プレイヤー", rgb("#F6F4EF")],
  ["マイユニ_青年_顔立ちA", rgb("#F6F4EF")],
  ["マイユニ_少女_顔立ちA", rgb("#F6F4EF")],
  ["マーク", DEFAULT_HAIR_COLOR],
  ["マーク男", DEFAULT_HAIR_COLOR],
  ["マーク女", DEFAULT_HAIR_COLOR],

  // Children -> fixed parent.
  ["ルキナ", rgb("#505C81")], // Chrom
  ["マルス", rgb("#505C81")], // Lucina alias -> Chrom
  ["ウード", rgb("#DAD3BD")], // Lissa
  ["ウード正体不明", rgb("#DAD3BD")],
  ["アズール", rgb("#EBCDD6")], // Olivia
  ["ブレディ", rgb("#F2E7C4")], // Maribelle
  ["デジェル", rgb("#595655")], // Kellam
  ["シンシア", rgb("#A19791")], // Sumia
  ["セレナ", rgb("#AF5454")], // Cordelia
  ["ジェローム", rgb("#D48085")], // Cherche
  ["シャンブレー", rgb("#463E36")], // Panne
  ["ロラン", rgb("#532426")], // Miriel
  ["ノワール", rgb("#484848")], // Tharja
  ["ンン", rgb("#C2D6AE")], // Nowi
]);

const FATES_HAIR_COLORS = new Map([
  // Corrin / Kana: canonical white default Corrin appearance.
  ["プレイヤー", rgb("#FFFFFF")],
  ["マイユニ男1", rgb("#FFFFFF")],
  ["マイユニ女1", rgb("#FFFFFF")],
  ["カンナ男", rgb("#FFFFFF")],
  ["カンナ女", rgb("#FFFFFF")],

  // Children -> fixed parent, except official-art color overrides noted below.
  ["シグレ", rgb("#BAE1E1")], // Azura
  ["ディーア", rgb("#D2D2C3")], // Jakob
  ["ゾフィー", rgb("#AAB4B4")], // Silas
  ["ミドリコ", rgb("#7D9682")], // Kaze
  ["シノノメ", rgb("#58332D")], // Ryoma
  ["キサラギ", rgb("#C1B2AC")], // Takumi
  ["グレイ", rgb("#914343")], // Saizo
  ["キヌ", rgb("#D39146")], // Kaden
  ["ヒサメ", rgb("#6F554B")], // Hinata
  ["ミタマ", rgb("#FFE3ED")], // Official artwork override
  ["マトイ", rgb("#8A4144")], // Subaki
  ["シャラ", rgb("#484848")], // Official artwork override
  ["ジークベルト", rgb("#D0C29F")], // Xander
  ["フォレオ", rgb("#D2C3AA")], // Leo
  ["イグニス", rgb("#F2E3B5")], // Benny
  ["ベロア", rgb("#484848")], // Official artwork override
  ["べロア", rgb("#484848")],
  ["ルッツ", rgb("#FEEAB7")], // Arthur
  ["オフェリア", rgb("#DAD3BD")], // Odin
  ["ソレイユ", rgb("#EDD2DA")], // Official artwork override
  ["エポニーヌ", rgb("#F5F3F0")], // Niles
]);

const TABLES = {
  awakening: AWAKENING_HAIR_COLORS,
  fates: FATES_HAIR_COLORS,
};

export function hairColorForCharacter(gameId, characterId) {
  const table = TABLES[gameId];
  if (!table) return DEFAULT_HAIR_COLOR;
  const id = String(characterId || "").trim();
  return table.get(id) || DEFAULT_HAIR_COLOR;
}

export function hairColorForAssetPath(gameId, assetPath) {
  const fileName = String(assetPath || "").split("/").pop() || "";
  const id = fileName.replace(/_(?:st|bu|ct)_髪0\.png$/u, "");
  return hairColorForCharacter(gameId, id);
}
