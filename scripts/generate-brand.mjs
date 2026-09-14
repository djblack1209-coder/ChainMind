import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

// One vector source feeds React, web icons, GitHub assets and desktop icons.
const root = new URL("../", import.meta.url);
const brand = JSON.parse(await readFile(new URL("lib/brand.json", root), "utf8"));
const c = brand.colors;
const svg = (width, height, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">${body}</svg>\n`;
const symbol = `<path d="${brand.ribbon}" fill="${c.lime}"/><path d="${brand.ribbon}" transform="rotate(180 32 32)" fill="${c.jade}"/>`;
const tile = `<rect width="64" height="64" rx="18" fill="${c.ink}"/><g transform="translate(6 6) scale(.8125)">${symbol}</g>`;
const icon = svg(64, 64, tile, "ChainMind — Decision Weave");
const save = async (path, data) => {
  const target = new URL(path, root);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, data);
};
const png = (size) => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer();
await save("public/icon.svg", icon);
await save("public/favicon.svg", icon);
await save("public/brand-symbol.svg", svg(64, 64, symbol, "ChainMind symbol"));
for (const [path, size] of [["public/apple-touch-icon.png", 180], ["public/icon-192.png", 192], ["public/icon.png", 512], ["resources/icon.png", 1024]]) {
  await save(path, await png(size));
}

// Standard PNG-compressed ICO / ICNS containers; no OS-specific build tools.
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(png));
const icoHeader = Buffer.alloc(6 + sizes.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(sizes.length, 4);
let offset = icoHeader.length;
images.forEach((bytes, index) => {
  const at = 6 + index * 16;
  icoHeader[at] = icoHeader[at + 1] = sizes[index] % 256;
  icoHeader.writeUInt16LE(1, at + 4);
  icoHeader.writeUInt16LE(32, at + 6);
  icoHeader.writeUInt32LE(bytes.length, at + 8);
  icoHeader.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
await save("resources/icon.ico", Buffer.concat([icoHeader, ...images]));
const chunks = await Promise.all([["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]].map(async ([type, size]) => {
  const bytes = await png(size);
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(bytes.length + 8, 4);
  return Buffer.concat([header, bytes]);
}));
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns");
icnsHeader.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await save("resources/icon.icns", Buffer.concat([icnsHeader, ...chunks]));

const cover = (height, social = false) => svg(1280, height, `
  <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="${c.paper}" opacity=".1"/></pattern></defs>
  <rect width="1280" height="${height}" rx="24" fill="${c.ink}"/>
  <rect x="720" width="560" height="${height}" fill="url(#grid)"/>
  <g transform="translate(0 ${social ? 94 : 0})">
    <circle cx="1020" cy="215" r="226" fill="none" stroke="${c.jade}" opacity=".14"/>
    <circle cx="1020" cy="215" r="177" fill="none" stroke="${c.jade}" opacity=".14"/>
    <g transform="translate(842 40) scale(5.4)">${symbol}</g>
    <g font-family="Arial,Helvetica,sans-serif">
      <g transform="translate(52 33) scale(.67)">${symbol}</g>
      <text x="104" y="65" font-size="29" font-weight="700" letter-spacing="-1" fill="${c.paper}">ChainMind</text>
      <text x="56" y="168" font-size="66" font-weight="700" letter-spacing="-2.5" fill="${c.paper}">Many minds.</text>
      <text x="56" y="239" font-size="66" font-weight="700" letter-spacing="-2.5" fill="${c.lime}">Your direction.</text>
      <text x="58" y="287" font-size="18" fill="${c.muted}">A local-first workspace for AI collaboration.</text>
      <path d="M58 329h654" stroke="${c.jade}" opacity=".25"/>
      <g font-size="12" fill="${c.paper}" letter-spacing="1.1">
        <circle cx="62" cy="364" r="4" fill="${c.lime}"/>
        <text x="79" y="368">LOCAL-FIRST</text>
        <text x="244" y="368">MULTI-AGENT</text>
        <text x="411" y="368">HUMAN-GUIDED</text>
      </g>
      <text x="865" y="392" font-size="10" fill="${c.muted}" letter-spacing="2">DIFFERENT VOICES. SHARED CONTEXT.</text>
    </g>
  </g>`, "ChainMind — Many minds. Your direction.");
await save("docs/assets/hero.svg", cover(424));
await save("docs/assets/social-preview.png", await sharp(Buffer.from(cover(640, true))).png().toBuffer());

const board = svg(1280, 760, `
  <rect width="1280" height="760" rx="24" fill="${c.paper}"/>
  <rect width="790" height="760" rx="24" fill="${c.ink}"/>
  <rect x="766" width="24" height="760" fill="${c.ink}"/>
  <g font-family="Arial,Helvetica,sans-serif">
    <text x="48" y="57" fill="${c.muted}" font-size="12" letter-spacing="2">CHAINMIND / DECISION WEAVE</text>
    <g transform="translate(236 110) scale(5)">${symbol}</g>
    <text x="396" y="517" fill="${c.paper}" font-size="66" text-anchor="middle" font-weight="700" letter-spacing="-2.5">ChainMind</text>
    <text x="396" y="557" fill="${c.muted}" font-size="18" text-anchor="middle">Many minds. Your direction.</text>
    <path d="M48 654h694" stroke="${c.jade}" opacity=".25"/>
    <text x="48" y="699" fill="${c.muted}" font-size="12" letter-spacing="1.4">TWO VOICES. ONE CONTINUOUS THREAD.</text>
    <text x="838" y="57" fill="${c.ink}" font-size="12" letter-spacing="2">BUILT TO BELONG</text>
    <g transform="translate(918 103) scale(3.5)">${tile}</g>
    <text x="1030" y="368" fill="${c.ink}" font-size="17" text-anchor="middle">Desktop · Browser · Workspace</text>
    <g transform="translate(859 429) scale(.25)">${tile}</g>
    <g transform="translate(928 418) scale(.5)">${tile}</g>
    <g transform="translate(1012 405) scale(.875)">${tile}</g>
    <g transform="translate(1121 390) scale(1.25)">${tile}</g>
    <text x="1030" y="510" fill="${c.ink}" font-size="13" text-anchor="middle">16 / 32 / 56 / 80 px</text>
    ${[c.ink, c.lime, c.jade].map((color, i) => `<rect x="${838 + i * 132}" y="595" width="118" height="61" rx="12" fill="${color}"/><text x="${838 + i * 132}" y="685" fill="${c.ink}" font-size="13">${color.toUpperCase()}</text>`).join("")}
  </g>`, "ChainMind identity: ribbon symbol, app icon, small-size examples and palette");
await save("docs/assets/brand-board.png", await sharp(Buffer.from(board)).png().toBuffer());
console.log("Generated ChainMind web, desktop and GitHub assets.");
