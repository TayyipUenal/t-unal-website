import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";

// Builds the favicon set from the TÜ monogram inside public/brand-logo.png.
// The wordmark artwork is too detailed for tab size, so the monogram is
// measured, cropped to a square, keyed off its white background and
// exported in the sizes browsers and platforms actually request.
const source = await loadImage("public/brand-logo.png");
const SW = source.width,
  SH = source.height;

const probe = createCanvas(SW, SH);
const pctx = probe.getContext("2d");
pctx.drawImage(source, 0, 0);
const pixels = pctx.getImageData(0, 0, SW, SH).data;

// Monogram sits above the wordmark text; find its exact bounding box.
const TEXT_TOP = 780;
let minX = SW,
  minY = TEXT_TOP,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < TEXT_TOP; y++) {
  for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4;
    if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const side = Math.ceil(Math.max(maxX - minX, maxY - minY) * 1.14);
const cx = (minX + maxX) / 2,
  cy = (minY + maxY) / 2;
const sx = Math.round(Math.max(0, Math.min(SW - side, cx - side / 2)));
// Keep clear of the wordmark text below when centering vertically.
const sy = Math.round(
  Math.max(0, Math.min(TEXT_TOP - 8 - side, cy - side / 2)),
);
console.log(
  `Monogram box ${minX},${minY} – ${maxX},${maxY} → crop ${sx},${sy} ${side}px`,
);

// Master render at 512px.
const MASTER = 512;
const master = createCanvas(MASTER, MASTER);
const mctx = master.getContext("2d");
mctx.imageSmoothingEnabled = true;
mctx.imageSmoothingQuality = "high";
mctx.drawImage(source, sx, sy, side, side, 0, 0, MASTER, MASTER);

// Un-blend from white: observed = fg·a + 255·(1-a)  →  recover fg and alpha.
const img = mctx.getImageData(0, 0, MASTER, MASTER);
const d = img.data;
for (let i = 0; i < d.length; i += 4) {
  const a = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
  if (a === 0) {
    d[i + 3] = 0;
    continue;
  }
  const keep = 255 - a;
  d[i] = Math.max(0, Math.round(((d[i] - keep) * 255) / a));
  d[i + 1] = Math.max(0, Math.round(((d[i + 1] - keep) * 255) / a));
  d[i + 2] = Math.max(0, Math.round(((d[i + 2] - keep) * 255) / a));
  d[i + 3] = a;
}
mctx.putImageData(img, 0, 0);

function render(size, { opaque = false, inset = 0 } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }
  const inner = size - inset * 2;
  ctx.drawImage(master, inset, inset, inner, inner);
  return canvas.toBuffer("image/png");
}

fs.writeFileSync("public/favicon-16x16.png", render(16));
fs.writeFileSync("public/favicon-32x32.png", render(32));
fs.writeFileSync("public/icon-192x192.png", render(192));
fs.writeFileSync("public/icon-512x512.png", render(512));
// Apple requires opaque artwork; give the mark breathing room.
fs.writeFileSync(
  "public/apple-touch-icon.png",
  render(180, { opaque: true, inset: 16 }),
);

// Classic .ico fallback (PNG-compressed 16 + 32 entries).
function ico(buffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(buffers.length, 4);
  let offset = 6 + buffers.length * 16;
  const entries = buffers.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...buffers.map((b) => b.png)]);
}
fs.writeFileSync(
  "public/favicon.ico",
  ico([
    { size: 16, png: render(16) },
    { size: 32, png: render(32) },
  ]),
);

fs.writeFileSync(
  "public/site.webmanifest",
  JSON.stringify(
    {
      name: "Tayyip Ünal — Audits & Schulungen",
      short_name: "Tayyip Ünal",
      icons: [
        { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#f3f1eb",
      background_color: "#f3f1eb",
      display: "browser",
    },
    null,
    2,
  ) + "\n",
);
console.log("Wrote favicon.ico, PNG icons, apple-touch-icon, site.webmanifest");
