import { createCanvas } from "@napi-rs/canvas";
import gifenc from "gifenc";
import fs from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

// Animated assets for the portal mails. Mail clients cannot run CSS gradients or animation
// (Outlook desktop renders with Word), so the effects ship as GIFs. Every first frame is a
// finished picture for clients that only show one frame.
fs.mkdirSync("public/mail", { recursive: true });

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function encode(file, width, height, frames, draw, colors = 192) {
  const gif = GIFEncoder();
  frames.forEach(({ t, delay }) => {
    const canvas = createCanvas(width, height);
    const g = canvas.getContext("2d");
    draw(g, t);
    const data = g.getImageData(0, 0, width, height).data;
    const palette = quantize(data, colors);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
  });
  gif.finish();
  fs.writeFileSync(file, gif.bytes());
  console.log(file, Math.round(gif.bytes().length / 1024), "KB");
}

/* ---------- header: TÜ seal and name, a light sweeps across the gold ---------- */
const HW = 1200;
const HH = 200;
const GOLD = ["#8f7038", "#c9a45e", "#f1dca0", "#c9a45e", "#8f7038"];

function goldFill(g, x0, x1, sweep) {
  const fill = g.createLinearGradient(x0, 0, x1, 0);
  GOLD.forEach((color, i) => fill.addColorStop(i / (GOLD.length - 1), color));
  g.fillStyle = fill;
  g.strokeStyle = fill;
  // bright band
  if (sweep !== null) {
    const band = g.createLinearGradient(sweep - 140, 0, sweep + 140, 0);
    band.addColorStop(0, "rgba(255,248,225,0)");
    band.addColorStop(0.5, "rgba(255,250,232,1)");
    band.addColorStop(1, "rgba(255,248,225,0)");
    return band;
  }
  return null;
}

function header(g, t) {
  g.fillStyle = "#0e0e0e";
  g.fillRect(0, 0, HW, HH);
  // the seal stays plain: no glow, no light; only the name gets the light pass below

  // the light runs over the name only
  const sweep = t === null ? null : 40 + ease(t) * 900;
  const draw = () => {
    g.lineWidth = 4;
    g.beginPath();
    g.arc(110, 100, 62, 0, Math.PI * 2);
    g.stroke();
    g.font = "700 50px 'Segoe UI'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("TÜ", 110, 103);
    g.textAlign = "left";
    g.font = "700 58px 'Segoe UI'";
    g.fillText("T A Y Y İ P   Ü N A L", 210, 82);
    g.font = "400 22px 'Segoe UI'";
    g.fillStyle = "#8d877b";
    g.fillText("A U D I T   ·   Z E R T I F I Z I E R U N G   ·   S C H U L U N G", 214, 138);
  };
  goldFill(g, 0, HW, null);
  draw();
  if (sweep !== null) {
    // light pass on top of the gold parts only
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.85;
    const band = g.createLinearGradient(sweep - 160, 0, sweep + 160, 0);
    band.addColorStop(0, "rgba(120,90,30,0)");
    band.addColorStop(0.5, "rgba(140,110,60,1)");
    band.addColorStop(1, "rgba(120,90,30,0)");
    g.fillStyle = band;
    g.strokeStyle = band;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = "700 58px 'Segoe UI'";
    g.fillText("T A Y Y İ P   Ü N A L", 210, 82);
    g.restore();
  }
}

const sweepFrames = [
  { t: 0.42, delay: 900 },
  ...Array.from({ length: 22 }, (_, i) => ({ t: i / 21, delay: 50 })),
  { t: 1, delay: 2600 },
];
encode("public/mail/header.gif", HW, HH, sweepFrames, header);

/* ---------- services as planets slowly orbiting the TÜ seal ---------- */
const PW = 800;
const PH = 440;
const SCALE = 0.85;
const SERVICES = [
  "Zertifizierung",
  "Personenzertifizierung",
  "Schulungen",
  "Arbeitsschutz",
  "Arbeitssicherheit",
  "IT-Sicherheit",
  "Factoring",
  "Webseiten",
];
const STEP = (Math.PI * 2) / SERVICES.length;
const ORBIT = { cx: PW / 2, cy: 228, rx: 285, ry: 112 };

/**
 * The TÜ seal as a 3D gold coin turning around its vertical axis: the face narrows with cos(angle),
 * the rim shows as stacked ellipses, and the light on the face follows the turn.
 */
function drawCoin(g, cx, cy, angle) {
  const R = 56;
  const THICK = 9;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const w = Math.max(Math.abs(c) * R, 1.5);

  // soft shadow under the coin
  const shadow = g.createRadialGradient(cx, cy + R + 14, 4, cx, cy + R + 14, R);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shadow;
  g.beginPath();
  g.ellipse(cx, cy + R + 14, R, 10, 0, 0, Math.PI * 2);
  g.fill();

  // rim: a stack of thin ellipses from back to front
  for (let i = THICK; i >= 0; i -= 1) {
    const offset = s * i * (c >= 0 ? -1 : 1);
    g.fillStyle = i === 0 ? "#b08d57" : i % 2 ? "#6e5321" : "#7a5f2c";
    g.beginPath();
    g.ellipse(cx + offset, cy, w, R, 0, 0, Math.PI * 2);
    g.fill();
  }

  // face with moving light
  const light = cx - w * 0.6 + (1 - (s + 1) / 2) * w * 1.2;
  const face = g.createRadialGradient(light, cy - R * 0.35, 4, cx, cy, R * 1.1);
  face.addColorStop(0, "#f6e3ad");
  face.addColorStop(0.45, "#c9a45e");
  face.addColorStop(1, "#7a5f2c");
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(cx, cy, w, R, 0, 0, Math.PI * 2);
  g.fill();

  // engraved ring and TÜ, squeezed with the turn (both sides carry the mark)
  g.save();
  g.translate(cx, cy);
  g.scale(Math.max(Math.abs(c), 0.02), 1);
  g.strokeStyle = "rgba(80,60,22,0.85)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, R - 8, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(70,52,18,0.9)";
  g.font = "800 40px 'Segoe UI'";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TÜ", 0, 2);
  g.fillStyle = "rgba(255,240,205,0.35)";
  g.fillText("TÜ", -1, 1);
  g.restore();
}

function planets(g, t) {
  g.scale(SCALE, SCALE); // drawn on the 800 x 440 grid, exported smaller to keep the GIF light
  g.fillStyle = "#0e0e0e";
  g.fillRect(0, 0, PW, PH);

  // a few fixed stars
  g.fillStyle = "rgba(245,242,236,0.35)";
  for (let i = 0; i < 46; i += 1) {
    const x = (i * 137.5) % PW;
    const y = (i * 71.3 + (i % 5) * 29) % PH;
    g.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
  }

  // orbit ring
  g.strokeStyle = "rgba(201,164,94,0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(ORBIT.cx, ORBIT.cy, ORBIT.rx, ORBIT.ry, 0, 0, Math.PI * 2);
  g.stroke();

  // one full revolution per loop, so every planet keeps its own name all the way round
  const turn = t * Math.PI * 2;
  const bodies = SERVICES.map((label, i) => {
    const angle = i * STEP + turn + Math.PI / 2;
    const depth = (Math.sin(angle) + 1) / 2; // 0 = back, 1 = front
    return {
      label,
      x: ORBIT.cx + Math.cos(angle) * ORBIT.rx,
      y: ORBIT.cy + Math.sin(angle) * ORBIT.ry,
      depth,
    };
  }).sort((a, b) => a.depth - b.depth);

  const drawPlanet = (body) => {
    const r = 9 + body.depth * 11;
    const fill = g.createRadialGradient(body.x - r * 0.4, body.y - r * 0.4, r * 0.1, body.x, body.y, r);
    fill.addColorStop(0, "#f1dca0");
    fill.addColorStop(0.55, "#c9a45e");
    fill.addColorStop(1, "#6e5321");
    g.globalAlpha = 0.55 + body.depth * 0.45;
    g.fillStyle = fill;
    g.beginPath();
    g.arc(body.x, body.y, r, 0, Math.PI * 2);
    g.fill();
    g.font = `${body.depth > 0.55 ? 600 : 400} ${Math.round(13 + body.depth * 6)}px 'Segoe UI'`;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = body.depth > 0.55 ? "#f5f2ec" : "#bdb7ab";
    g.fillText(body.label, body.x, body.y + r + 7);
    g.globalAlpha = 1;
  };

  // back half, then the seal, then the front half
  bodies.filter((b) => b.depth < 0.5).forEach(drawPlanet);
  drawCoin(g, ORBIT.cx, ORBIT.cy, t * Math.PI * 2);
  bodies.filter((b) => b.depth >= 0.5).forEach(drawPlanet);

  // caption
  g.fillStyle = "#c9a45e";
  g.font = "700 15px 'Segoe UI'";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText("A L L E S   A U S   E I N E R   H A N D", PW / 2, 40);
}

encode(
  "public/mail/services.gif",
  Math.round(PW * SCALE),
  Math.round(PH * SCALE),
  Array.from({ length: 80 }, (_, i) => ({ t: i / 80, delay: 180 })),
  planets,
  64,
);

/* ---------- gold line under the header, light running left to right ---------- */
const LW = 1200;
const LH = 8;
encode(
  "public/mail/gold-line.gif",
  LW,
  LH,
  [{ t: 0.3, delay: 900 }, ...Array.from({ length: 24 }, (_, i) => ({ t: i / 23, delay: 45 })), { t: 1, delay: 2600 }],
  (g, t) => {
    const base = g.createLinearGradient(0, 0, LW, 0);
    base.addColorStop(0, "#5c4720");
    base.addColorStop(0.5, "#c9a45e");
    base.addColorStop(1, "#5c4720");
    g.fillStyle = base;
    g.fillRect(0, 0, LW, LH);
    const center = -220 + ease(t) * (LW + 440);
    const shine = g.createLinearGradient(center - 220, 0, center + 220, 0);
    shine.addColorStop(0, "rgba(255,244,214,0)");
    shine.addColorStop(0.5, "rgba(255,248,228,1)");
    shine.addColorStop(1, "rgba(255,244,214,0)");
    g.fillStyle = shine;
    g.fillRect(0, 0, LW, LH);
  },
);

// Optional: MAIL_PREVIEW_DIR=<dir> writes single frames as PNG to check the coin mid-turn.
if (process.env.MAIL_PREVIEW_DIR) {
  for (const t of [0.12, 0.2, 0.3]) {
    const canvas = createCanvas(Math.round(PW * SCALE), Math.round(PH * SCALE));
    planets(canvas.getContext("2d"), t);
    fs.writeFileSync(`${process.env.MAIL_PREVIEW_DIR}/services-${t}.png`, canvas.toBuffer("image/png"));
  }
}
