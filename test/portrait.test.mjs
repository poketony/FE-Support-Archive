import test from "node:test";
import assert from "node:assert/strict";
import { composePortraitSvg, hairColorTable } from "../scripts/lib/portrait.mjs";

test("picker portrait embeds face followed by tinted hair at native dimensions", () => {
  const face = Buffer.alloc(24);
  face.writeUInt32BE(128, 16);
  face.writeUInt32BE(128, 20);
  const hair = Buffer.from(face);
  hair[0] = 1;
  const svg = composePortraitSvg(face, hair);
  assert.match(svg, /viewBox="0 0 128 128"/);
  assert.equal((svg.match(/<image /g) || []).length, 2);
  assert.ok(svg.indexOf(face.toString("base64")) < svg.indexOf(hair.toString("base64")));
  assert.match(svg, /filter="url\(#hair\)"/);
  assert.match(svg, /color-interpolation-filters="sRGB"/);
  assert.ok(!svg.includes("<feFuncA"), "preserve hair alpha");
});

test("picker tint matches conversation renderer overlay math", () => {
  for (const color of [0x5b, 0x58, 0x55]) {
    const table = hairColorTable(color).split(" ").map(Number);
    assert.equal(table.length, 256);
    for (let value = 0; value < 256; value++) {
      const expected = value < 128 ? 2 * color * value / 255 : 255 - 2 * (255 - color) * (255 - value) / 255;
      assert.ok(Math.abs(table[value] * 255 - expected) < .001);
    }
  }
});

test("if light and dark reading surfaces meet 4.5:1 text contrast", () => {
  function luminance(hex) {
    const channels = hex.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16) / 255)
      .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  for (const [foreground, background] of [
    ["25262b", "f0eee8"], ["505158", "f0eee8"], ["64353f", "f0eee8"],
    ["f1f0ee", "25242a"], ["c2bfc6", "25242a"], ["c2bfc6", "222126"],
    ["e0d1ea", "28252d"], ["c2bfc6", "17161b"],
  ]) {
    const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
    assert.ok((a + .05) / (b + .05) >= 4.5, `${foreground} / ${background}`);
  }
});
