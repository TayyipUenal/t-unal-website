import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";

// Draws the gold TÜ monogram on black and exports the favicon set.
function drawMark(size){
  const c=createCanvas(size,size),g=c.getContext('2d');
  const r=size*0.22;
  g.beginPath();g.roundRect(0,0,size,size,r);g.closePath();
  g.fillStyle='#0b0b0b';g.fill();
  const grad=g.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#f1dca0');grad.addColorStop(0.5,'#c9a45e');grad.addColorStop(1,'#9a7a3a');
  g.strokeStyle=grad;g.lineWidth=Math.max(1,size*0.035);
  g.beginPath();g.roundRect(size*0.07,size*0.07,size*0.86,size*0.86,r*0.7);g.stroke();
  g.fillStyle=grad;g.textAlign='center';g.textBaseline='middle';
  g.font='800 '+(size*0.5)+'px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
  g.fillText('TÜ',size/2,size*0.54);
  return c;
}
const master=drawMark(512);
function render(size, { opaque = false, inset = 0 } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opaque) {
    ctx.fillStyle = "#0b0b0b";
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
      theme_color: "#0b0b0b",
      background_color: "#0b0b0b",
      display: "browser",
    },
    null,
    2,
  ) + "\n",
);
console.log("Wrote favicon.ico, PNG icons, apple-touch-icon, site.webmanifest");
