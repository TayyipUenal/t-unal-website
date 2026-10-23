import { createCanvas } from "@napi-rs/canvas";
import gifenc from "gifenc";
import fs from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

// Gold line with a light sweeping left to right, used at the top of the portal mails.
// Mail clients cannot run CSS gradients or animation (Outlook desktop renders with Word), so the
// effect ships as an animated GIF. The first frame already shows a highlight for clients that
// only display one frame.
const WIDTH = 1200; // drawn at 2x, shown at 600 x 8
const HEIGHT = 16;
const FRAMES = 36;

function frame(position) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const g = canvas.getContext("2d");
  const base = g.createLinearGradient(0, 0, WIDTH, 0);
  base.addColorStop(0, "#7a5f2c");
  base.addColorStop(0.5, "#c9a45e");
  base.addColorStop(1, "#7a5f2c");
  g.fillStyle = base;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  // bright sweep
  const center = position * (WIDTH + 400) - 200;
  const shine = g.createLinearGradient(center - 200, 0, center + 200, 0);
  shine.addColorStop(0, "rgba(255,240,200,0)");
  shine.addColorStop(0.5, "rgba(255,246,220,0.95)");
  shine.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = shine;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  // soft top highlight for depth
  const gloss = g.createLinearGradient(0, 0, 0, HEIGHT);
  gloss.addColorStop(0, "rgba(255,255,255,0.35)");
  gloss.addColorStop(0.5, "rgba(255,255,255,0)");
  g.fillStyle = gloss;
  g.fillRect(0, 0, WIDTH, HEIGHT);
  return g.getImageData(0, 0, WIDTH, HEIGHT).data;
}

fs.mkdirSync("public/mail", { recursive: true });

const gif = GIFEncoder();
// first frame: highlight in the middle-left, held a little longer
const positions = [0.35, ...Array.from({ length: FRAMES }, (_, i) => i / (FRAMES - 1)), 1];
positions.forEach((position, index) => {
  const data = frame(position);
  const palette = quantize(data, 128);
  gif.writeFrame(applyPalette(data, palette), WIDTH, HEIGHT, {
    palette,
    delay: index === 0 ? 1200 : index === positions.length - 1 ? 1800 : 40,
  });
});
gif.finish();
fs.writeFileSync("public/mail/gold-line.gif", gif.bytes());

// static fallback (PNG) with the highlight in place
const still = createCanvas(WIDTH, HEIGHT);
still.getContext("2d").putImageData(new (still.getContext("2d").createImageData(WIDTH, HEIGHT).constructor)(frame(0.35), WIDTH, HEIGHT), 0, 0);
fs.writeFileSync("public/mail/gold-line.png", still.toBuffer("image/png"));
console.log("wrote public/mail/gold-line.gif and .png");
