import { createCanvas } from "@napi-rs/canvas";
import gifenc from "gifenc";
import fs from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

// Animated assets for the portal mails. Mail clients cannot run CSS gradients or animation
// (Outlook desktop renders with Word), so the effects ship as GIFs. Every first frame is a
// finished picture for clients that only show one frame.
fs.mkdirSync("public/mail", { recursive: true });

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function encode(file, width, height, frames, draw) {
  const gif = GIFEncoder();
  frames.forEach(({ t, delay }) => {
    const canvas = createCanvas(width, height);
    const g = canvas.getContext("2d");
    draw(g, t);
    const data = g.getImageData(0, 0, width, height).data;
    const palette = quantize(data, 192);
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
  // soft glow behind the seal
  const glow = g.createRadialGradient(110, 100, 10, 110, 100, 170);
  glow.addColorStop(0, "rgba(201,164,94,0.16)"); // steady: the seal itself stays calm
  glow.addColorStop(1, "rgba(201,164,94,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 400, HH);

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
