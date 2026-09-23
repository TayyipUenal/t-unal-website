import { createCanvas, loadImage, GlobalFonts, Path2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";

// Draw a complete, reproducible German process story. No remote media or
// browser capture. Icons are from the project's existing Lucide library (ISC).
GlobalFonts.registerFromPath(
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "Studio",
);
GlobalFonts.registerFromPath(
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "StudioBold",
);
const icons = {};
for (const name of [
  "badge-check",
  "clipboard-check",
  "briefcase-business",
  "building-2",
  "thumbs-up",
  "handshake",
]) {
  icons[name] = (
    await import(`../node_modules/lucide-react/dist/esm/icons/${name}.mjs`)
  ).__iconData.node;
}
const W = 1280,
  H = 720,
  FPS = 25,
  DURATION = 28;
const canvas = createCanvas(W, H),
  ctx = canvas.getContext("2d");
const logo = await loadImage("public/brand-logo.png");
const colors = {
  ink: "#204d63",
  blue: "#0787b9",
  pale: "#eaf7fd",
  muted: "#607f8e",
  line: "#c7e2ee",
  white: "#ffffff",
};
const steps = [
  {
    start: 0,
    end: 4.5,
    title: "Das passende Paket wählen.",
    subtitle: "Zertifizierung, Audit oder Beratung.",
    label: "Paket",
  },
  {
    start: 4.5,
    end: 10,
    title: "Unterlagen sammeln.",
    subtitle: "Dokumente bündeln und Vollständigkeit bestätigen.",
    label: "Unterlagen",
  },
  {
    start: 10,
    end: 16,
    title: "Direkt in die Bearbeitung.",
    subtitle: "An Tayyip Ünal übermitteln. Prüfung und Freigabe abstimmen.",
    label: "Bearbeitung",
  },
  {
    start: 16,
    end: 21,
    title: "Geprüft. Freigegeben.",
    subtitle: "Nach erfolgreicher Prüfung sind die Unterlagen finalisiert.",
    label: "Freigabe",
  },
  {
    start: 21,
    end: 28,
    title: "Gemeinsam abgeschlossen.",
    subtitle: "Die Bestätigung liegt vor. Ihr Vorgang ist abgeschlossen.",
    label: "Abschluss",
  },
];
const clamp = (n) => Math.max(0, Math.min(1, n));
const ease = (n) => 1 - Math.pow(1 - clamp(n), 3);
const mix = (a, b, n) => a + (b - a) * n;
function rounded(x, y, w, h, r, fill = colors.white, stroke = colors.line) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}
function circle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function text(
  value,
  x,
  y,
  size = 24,
  { color = colors.ink, bold = false, align = "center", maxWidth = 1160 } = {},
) {
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${size}px ${bold ? "StudioBold" : "Studio"}`;
  while (ctx.measureText(value).width > maxWidth && size > 18) {
    size--;
    ctx.font = `${size}px ${bold ? "StudioBold" : "Studio"}`;
  }
  if (ctx.measureText(value).width > maxWidth)
    throw new Error(`Text overflow: ${value}`);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function line(x1, y1, x2, y2, color = colors.line, width = 3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}
function check(x, y, size = 24, progress = 1, color = colors.blue) {
  const points = [
    [-0.48, 0],
    [-0.12, 0.34],
    [0.52, -0.37],
  ];
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(points[0][0] * size, points[0][1] * size);
  const first = clamp(progress * 2),
    second = clamp(progress * 2 - 1);
  ctx.lineTo(
    mix(points[0][0], points[1][0], first) * size,
    mix(points[0][1], points[1][1], first) * size,
  );
  if (second > 0)
    ctx.lineTo(
      mix(points[1][0], points[2][0], second) * size,
      mix(points[1][1], points[2][1], second) * size,
    );
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, size * 0.105);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}
function icon(name, x, y, size, color = colors.blue) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [tag, attrs] of icons[name]) {
    if (tag === "path") ctx.stroke(new Path2D(attrs.d));
    else if (tag === "rect") {
      ctx.beginPath();
      ctx.roundRect(
        +attrs.x,
        +attrs.y,
        +attrs.width,
        +attrs.height,
        +(attrs.rx || 0),
      );
      ctx.stroke();
    } else if (tag === "circle") {
      ctx.beginPath();
      ctx.arc(+attrs.cx, +attrs.cy, +attrs.r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tag === "line") {
      ctx.beginPath();
      ctx.moveTo(+attrs.x1, +attrs.y1);
      ctx.lineTo(+attrs.x2, +attrs.y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function paper(
  x,
  y,
  {
    scale = 1,
    rotation = 0,
    title = "Unterlagen",
    approved = false,
    alpha = 1,
  } = {},
) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.shadowColor = "#245c7012";
  ctx.shadowBlur = 23;
  ctx.shadowOffsetY = 10;
  rounded(-97, -120, 194, 240, 13);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  rounded(57, -109, 25, 29, 4, colors.pale, null);
  text(title, 0, -65, 23, { bold: true, maxWidth: 160 });
  for (let i = 0; i < 4; i++)
    line(-65, -25 + i * 23, i === 3 ? 23 : 65, -25 + i * 23, "#c3dbe7", 5);
  if (approved) {
    circle(51, 81, 26, colors.blue);
    check(51, 81, 24, 1, "#fff");
  } else {
    line(-65, 89, -20, 89, "#82bbd1", 4);
  }
  ctx.restore();
}
function statusPill(value, x, y, width, progress = 1) {
  ctx.save();
  ctx.globalAlpha *= clamp(progress);
  rounded(x - width / 2, y - 25, width, 50, 25, "#e2f4fc", "#baddea");
  check(x - width / 2 + 28, y, 19);
  text(value, x + 10, y + 8, 23, {
    color: colors.blue,
    bold: true,
    maxWidth: width - 70,
  });
  ctx.restore();
}
function cursor(x, y, clickProgress = 0) {
  if (clickProgress > 0 && clickProgress < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - clickProgress;
    circle(x, y, 8 + clickProgress * 35, "#0796c71a", "#0796c7");
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 33);
  ctx.lineTo(8, 25);
  ctx.lineTo(15, 40);
  ctx.lineTo(24, 35);
  ctx.lineTo(17, 21);
  ctx.lineTo(30, 20);
  ctx.closePath();
  ctx.fillStyle = colors.ink;
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
function footer(chapter, u) {
  for (let i = 0; i < 5; i++) {
    const x = 135 + i * 252;
    if (i < 4)
      line(x + 26, 648, x + 226, 648, i < chapter ? "#76bad4" : "#d4e6ee", 2);
    circle(x, 648, 17, i <= chapter ? colors.blue : "#e5f0f5");
    if (i < chapter || (chapter === 4 && u > 1.5))
      check(x, 648, 15, 1, "white");
    else
      text(String(i + 1), x, 654, 16, {
        bold: true,
        color: i === chapter ? "white" : colors.muted,
        maxWidth: 25,
      });
    text(steps[i].label, x, 688, 20, {
      color: i <= chapter ? colors.ink : colors.muted,
      bold: i === chapter,
      maxWidth: 230,
    });
  }
}
function draw(t) {
  const chapter = Math.max(
    0,
    steps.findIndex((step) => t >= step.start && t < step.end),
  );
  const step = steps[chapter],
    u = t - step.start;
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#f5fbfe";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(640, 385, 60, 640, 385, 510);
  glow.addColorStop(0, "#e7f6fd");
  glow.addColorStop(1, "#f5fbfe");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  text("BEISPIEL: ZERTIFIZIERUNG", 640, 45, 16, {
    align: "center",
    color: colors.muted,
    maxWidth: 400,
  });
  const appear = ease(u / 0.45),
    disappear = chapter === 4 ? 1 : clamp((step.end - t) / 0.35);
  ctx.save();
  ctx.globalAlpha = appear * disappear;
  text(step.title, 640, 123, 48, { bold: true, maxWidth: 1120 });
  text(step.subtitle, 640, 172, 25, { color: colors.muted, maxWidth: 1150 });
  if (chapter === 0) {
    const selected = u >= 1.75;
    ["Zertifizierung", "Audit", "Beratung"].forEach((title, i) => {
      const x = 80 + i * 385,
        active = i === 0 && selected;
      ctx.save();
      ctx.globalAlpha *= selected && !active ? 0.52 : 1;
      ctx.shadowColor = active ? "#0787b91c" : "#245c7008";
      ctx.shadowBlur = active ? 30 : 14;
      ctx.shadowOffsetY = 8;
      rounded(
        x,
        263,
        350,
        237,
        20,
        active ? "#e7f6fd" : "#fff",
        active ? colors.blue : colors.line,
      );
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      circle(x + 175, 345, 49, active ? "#d0ecf9" : "#eff7fb");
      icon(
        ["badge-check", "clipboard-check", "briefcase-business"][i],
        x + 175,
        345,
        54,
      );
      text(title, x + 175, 447, 29, { bold: true, maxWidth: 310 });
      if (active) {
        circle(x + 320, 289, 18, colors.blue);
        check(x + 320, 289, 17, 1, "white");
      }
      ctx.restore();
    });
    if (u < 3.1) {
      const p = ease((u - 0.45) / 1.25);
      ctx.save();
      ctx.globalAlpha = clamp((3.1 - u) / 0.35);
      cursor(mix(1030, 325, p), mix(550, 400, p), clamp((u - 1.75) / 0.55));
      ctx.restore();
    }
    if (selected)
      statusPill("Paket ausgewählt", 640, 558, 302, ease((u - 1.75) / 0.3));
  } else if (chapter === 1) {
    const labels = ["Stammdaten", "Nachweise", "Antrag"];
    const starts = [
      [255, 389],
      [640, 389],
      [1025, 389],
    ];
    starts.forEach(([x, y], i) => {
      const p = ease((u - 0.6 - i * 0.45) / 1.4);
      paper(mix(x, 640 + (i - 1) * 12, p), mix(y, 386 + (i - 1) * 9, p), {
        rotation: mix((i - 1) * 0.08, (i - 1) * 0.025, p),
        title: labels[i],
      });
    });
    if (u > 3.1) {
      const p = ease((u - 3.1) / 0.4);
      circle(752, 453, 41 * p, colors.blue);
      check(752, 453, 37, clamp((u - 3.15) / 0.45), "#fff");
    }
    if (u > 3.3)
      statusPill(
        "Unterlagen vollständig",
        640,
        566,
        372,
        ease((u - 3.3) / 0.35),
      );
  } else if (chapter === 2) {
    line(310, 385, 536, 385);
    line(744, 385, 973, 385);
    paper(224, 382, { scale: 0.75, rotation: -0.07, title: "Nachweise" });
    paper(242, 393, {
      scale: 0.75,
      rotation: 0.035,
      title: "Antrag",
      approved: true,
    });
    const transfer = ease((u - 0.3) / 1.9);
    if (u < 2.6) {
      paper(mix(340, 610, transfer), 340 - Math.sin(transfer * Math.PI) * 48, {
        scale: 0.32,
        title: "Antrag",
        alpha: clamp((2.6 - u) / 0.4),
      });
    }
    rounded(530, 277, 220, 220, 24, "white", "#aed6e7");
    ctx.drawImage(logo, 0, 320, 1254, 630, 547, 317, 186, 94);
    text(u < 2 ? "Eingang" : "In Bearbeitung", 640, 466, 22, {
      color: colors.blue,
      bold: true,
      maxWidth: 190,
    });
    circle(1030, 385, 79, "#fff", "#b8dbe9");
    icon("building-2", 1030, 382, 90);
    const out = clamp((u - 2.2) / 1.5);
    if (out > 0 && out < 1) {
      circle(mix(763, 946, out), 385, 6, colors.blue);
    }
    if (u > 3.7) {
      circle(1103, 440, 28, colors.blue);
      check(1103, 440, 25, ease((u - 3.7) / 0.4), "#fff");
    }
    text("Ihre Unterlagen", 240, 550, 24, { bold: true, maxWidth: 300 });
    text("Tayyip Ünal", 640, 550, 24, { bold: true, maxWidth: 260 });
    text("Zertifizierungsstelle", 1030, 550, 24, { bold: true, maxWidth: 340 });
  } else if (chapter === 3) {
    paper(385, 374, { scale: 1.08, rotation: -0.075, title: "Nachweise" });
    paper(408, 391, {
      scale: 1.08,
      rotation: 0,
      title: "Abschluss",
      approved: true,
    });
    const p = ease((u - 0.6) / 0.65);
    ctx.save();
    ctx.translate(855, 377);
    ctx.scale(0.7 + 0.3 * p, 0.7 + 0.3 * p);
    ctx.globalAlpha *= p;
    circle(0, 0, 107, "#e0f2fa", "#b4ddea");
    icon("thumbs-up", 0, -7, 130);
    ctx.restore();
    if (u > 1.6)
      statusPill(
        "Dokumentation finalisiert",
        640,
        565,
        417,
        ease((u - 1.6) / 0.4),
      );
  } else {
    const p = ease(u / 1.1);
    ctx.save();
    ctx.translate(
      640,
      367 +
        Math.sin(Math.max(0, u - 0.7) * 6) *
          4 *
          Math.max(0, 1 - (u - 0.7) / 2.1),
    );
    ctx.scale(0.78 + 0.22 * p, 0.78 + 0.22 * p);
    circle(0, 0, 132, "#e3f4fc", "#c0e1ef");
    ctx.globalAlpha *= p;
    icon("handshake", 0, -2, 180);
    ctx.restore();
    if (u > 1) {
      circle(754, 455, 31, colors.blue);
      check(754, 455, 29, ease((u - 1) / 0.45), "white");
    }
    if (u > 1.4)
      statusPill(
        "Zertifizierung abgeschlossen",
        640,
        565,
        470,
        ease((u - 1.4) / 0.5),
      );
  }
  ctx.restore();
  footer(chapter, u);
}
fs.mkdirSync("public/media", { recursive: true });
fs.mkdirSync("preview", { recursive: true });
const encoder = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "public/media/workflow-de.mp4",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const finished = once(encoder, "close");
for (let frame = 0; frame < FPS * DURATION; frame++) {
  draw(frame / FPS);
  if (frame === 85)
    fs.writeFileSync(
      "public/media/workflow-poster.png",
      canvas.toBuffer("image/png"),
    );
  if (!encoder.stdin.write(canvas.toBuffer("image/png")))
    await once(encoder.stdin, "drain");
  if (frame % 175 === 0)
    console.log(`Video ${Math.round((frame / (FPS * DURATION)) * 100)}%`);
}
encoder.stdin.end();
const [code] = await finished;
if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
const board = createCanvas(1280, 3 * 390),
  b = board.getContext("2d");
b.fillStyle = "#dceef7";
b.fillRect(0, 0, 1280, 1170);
[3.4, 8.8, 14.9, 19.8, 26].forEach((time, i) => {
  draw(time);
  const x = (i % 2) * 640,
    y = Math.floor(i / 2) * 390;
  b.drawImage(canvas, x, y, 640, 360);
  b.font = "17px Studio";
  b.fillStyle = colors.ink;
  b.fillText(
    `${i + 1}. ${steps[i].label} · ${time.toFixed(1)} s`,
    x + 20,
    y + 383,
  );
});
fs.writeFileSync(
  "preview/workflow-storyboard.png",
  board.toBuffer("image/png"),
);
console.log(
  "Created 28-second German process video and five-scene storyboard.",
);
