import { DEFAULT_HAIR_COLOR } from "../../assets/hair-colors.js";

// Match the game's overlay tint while keeping the source alpha unchanged.
export function hairColorTable(source) {
  return Array.from({ length: 256 }, (_, value) => {
    const destination = value / 255;
    const color = source / 255;
    return (destination < .5 ? 2 * color * destination : 1 - 2 * (1 - color) * (1 - destination)).toFixed(6);
  }).join(" ");
}

export function composePortraitSvg(face, hair, hairColor = DEFAULT_HAIR_COLOR) {
  const width = face.readUInt32BE(16);
  const height = face.readUInt32BE(20);
  const hairWidth = hair.readUInt32BE(16);
  const hairHeight = hair.readUInt32BE(20);
  const channels = ["R", "G", "B"].map((channel, index) =>
    `<feFunc${channel} type="table" tableValues="${hairColorTable(hairColor[index])}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><filter id="hair" color-interpolation-filters="sRGB"><feComponentTransfer>${channels}</feComponentTransfer></filter></defs>
<image width="${width}" height="${height}" href="data:image/png;base64,${face.toString("base64")}"/>
<image width="${hairWidth}" height="${hairHeight}" filter="url(#hair)" href="data:image/png;base64,${hair.toString("base64")}"/>
</svg>`;
}
