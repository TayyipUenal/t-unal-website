import { BORDERS, CITIES, COAST, DE_STATES, EU_BORDERS, EU_COAST, LAND } from "./globe-data";

/**
 * Night globe: a rotating Earth drawn on a 2D canvas. Land is a field of dim
 * dots, coasts and borders are thin lines, and populated places glow like city
 * lights after dark. `focus(true)` flies to the office in Dortmund and zooms
 * in; `focus(false)` flies back out. No dependencies; data: Natural Earth.
 */

const RAD = Math.PI / 180;
const HOME = { lon: 7.47, lat: 51.51, label: "Dortmund" };
const SPIN = -3 * RAD; // radians per second; the surface drifts eastwards
const START_LON = 34 * RAD;
const REST_LON = 12 * RAD;
const TILT = 30 * RAD;
const ZOOM_IN = 10;
const FLIGHT = 3.4; // seconds

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function decode(base64: string) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Unit vector for a position; longitude 0 faces the viewer. */
function unit(lon100: number, lat100: number, out: Float32Array, at: number) {
  const lon = (lon100 / 100) * RAD;
  const lat = (lat100 / 100) * RAD;
  const c = Math.cos(lat);
  out[at] = c * Math.sin(lon);
  out[at + 1] = Math.sin(lat);
  out[at + 2] = c * Math.cos(lon);
}

function points(stream: Int16Array, stride: number) {
  const count = stream.length / stride;
  const xyz = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) unit(stream[i * stride], stream[i * stride + 1], xyz, i * 3);
  return { count, xyz };
}

function polylines(stream: Int16Array) {
  const lines: Float32Array[] = [];
  for (let i = 0; i < stream.length; ) {
    const n = stream[i];
    const xyz = new Float32Array(n * 3);
    for (let k = 0; k < n; k += 1) unit(stream[i + 1 + k * 2], stream[i + 2 + k * 2], xyz, k * 3);
    lines.push(xyz);
    i += 1 + n * 2;
  }
  return lines;
}

function glowSprite() {
  const size = 48;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = size;
  const g = sprite.getContext("2d")!;
  const fill = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fill.addColorStop(0, "rgba(255, 244, 214, 1)");
  fill.addColorStop(0.18, "rgba(255, 214, 150, 0.85)");
  fill.addColorStop(0.5, "rgba(255, 176, 92, 0.22)");
  fill.addColorStop(1, "rgba(255, 160, 70, 0)");
  g.fillStyle = fill;
  g.fillRect(0, 0, size, size);
  return sprite;
}

export type Globe = { stop: () => void; focus: (on: boolean) => void };

export function startGlobe(canvas: HTMLCanvasElement, options: { still?: boolean } = {}): Globe {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop: () => {}, focus: () => {} };

  const land = points(decode(LAND), 2);
  const cityStream = decode(CITIES);
  const cities = points(cityStream, 3);
  const coast = polylines(decode(COAST));
  const borders = polylines(decode(BORDERS));
  const euCoast = polylines(decode(EU_COAST));
  const euBorders = polylines(decode(EU_BORDERS));
  const states = polylines(decode(DE_STATES));
  const home = new Float32Array(3);
  unit(HOME.lon * 100, HOME.lat * 100, home, 0);
  const sprite = glowSprite();

  let width = 0;
  let height = 0;
  let ratio = 1;
  let lon = options.still ? REST_LON : START_LON;
  let tilt = TILT;
  let velocity = options.still ? 0 : SPIN;
  let zoom = 1;
  let focused = false;
  let flight: { t: number; lon0: number; dLon: number; tilt0: number; tilt1: number; z0: number; z1: number } | null = null;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let frame = 0;
  let visible = true;
  let stopped = false;

  // Rotation terms, refreshed once per frame.
  let cs = 1;
  let sn = 0;
  let ct = 1;
  let st = 0;
  let cx = 0;
  let cy = 0;
  let radius = 0;
  let base = 0;
  const p = [0, 0, 0];

  function project(xyz: Float32Array, at: number) {
    const x = xyz[at] * cs - xyz[at + 2] * sn;
    const z1 = xyz[at] * sn + xyz[at + 2] * cs;
    const y = xyz[at + 1] * ct - z1 * st;
    p[0] = cx + radius * x;
    p[1] = cy - radius * y;
    p[2] = xyz[at + 1] * st + z1 * ct;
  }

  function strokeLines(lines: Float32Array[]) {
    ctx!.beginPath();
    for (const xyz of lines) {
      let pen = false;
      for (let i = 0; i < xyz.length; i += 3) {
        project(xyz, i);
        if (p[2] <= 0.02) {
          pen = false;
        } else if (pen) {
          ctx!.lineTo(p[0], p[1]);
        } else {
          ctx!.moveTo(p[0], p[1]);
          pen = true;
        }
      }
    }
    ctx!.stroke();
  }

  function draw(time: number) {
    const g = ctx!;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);
    cx = width / 2;
    cy = height / 2;
    base = Math.min(width, height) * 0.43;
    radius = base * zoom;
    const detail = clamp01((zoom - 1.8) / 2.2); // 0 = whole globe, 1 = close-up
    cs = Math.cos(lon);
    sn = Math.sin(lon);
    ct = Math.cos(tilt);
    st = Math.sin(tilt);

    // Atmosphere
    const halo = g.createRadialGradient(cx, cy, base * 0.94, cx, cy, base * 1.16);
    halo.addColorStop(0, "rgba(72, 166, 232, 0.42)");
    halo.addColorStop(0.35, "rgba(56, 140, 210, 0.16)");
    halo.addColorStop(1, "rgba(40, 120, 200, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, width, height);

    // Ocean
    const ocean = g.createRadialGradient(cx - base * 0.35, cy - base * 0.4, base * 0.1, cx, cy, base);
    ocean.addColorStop(0, "#12344d");
    ocean.addColorStop(0.55, "#0a2233");
    ocean.addColorStop(1, "#050f18");
    g.fillStyle = ocean;
    g.beginPath();
    g.arc(cx, cy, base, 0, Math.PI * 2);
    g.fill();

    // Everything on the surface stays inside the disc, so zooming in reads
    // as looking through a round window.
    g.save();
    g.clip();
    const reach = (base + 12) * (base + 12);
    const inView = () => (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy) < reach;

    // Land
    const dot = Math.max(1, base / 230) * Math.min(2.4, Math.sqrt(zoom));
    g.fillStyle = "rgba(118, 170, 208, 0.34)";
    g.beginPath();
    for (let i = 0; i < land.count; i += 1) {
      project(land.xyz, i * 3);
      if (p[2] > 0.03 && inView()) g.rect(p[0] - dot / 2, p[1] - dot / 2, dot, dot);
    }
    g.fill();

    g.lineWidth = 1;
    if (detail < 1) {
      g.strokeStyle = `rgba(132, 190, 232, ${0.2 * (1 - detail)})`;
      strokeLines(borders);
      g.strokeStyle = `rgba(132, 190, 232, ${0.5 * (1 - detail)})`;
      strokeLines(coast);
    }
    if (detail > 0) {
      g.strokeStyle = `rgba(132, 190, 232, ${0.16 * detail})`;
      g.setLineDash([2, 4]);
      strokeLines(states);
      g.setLineDash([]);
      g.strokeStyle = `rgba(150, 204, 240, ${0.42 * detail})`;
      strokeLines(euBorders);
      g.strokeStyle = `rgba(150, 204, 240, ${0.62 * detail})`;
      strokeLines(euCoast);
    }

    // City lights
    g.globalCompositeOperation = "lighter";
    const small = base < 190;
    const grow = Math.pow(zoom, 0.5);
    for (let i = 0; i < cities.count; i += 1) {
      const mag = cityStream[i * 3 + 2] / 255;
      if (small && mag < 0.16) continue;
      project(cities.xyz, i * 3);
      if (p[2] <= 0.04 || !inView()) continue;
      const size = base * (0.014 + mag * mag * 0.05) * (0.55 + 0.45 * p[2]) * grow;
      g.globalAlpha = Math.min(1, p[2] * 3.2) * (0.3 + 0.7 * mag);
      g.drawImage(sprite, p[0] - size / 2, p[1] - size / 2, size, size);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    // Shade towards the limb so the sphere reads as round
    g.restore();
    const lit = 0.2 * (1 - detail);
    const shade = g.createRadialGradient(cx - base * lit, cy - base * lit * 1.25, base * 0.45, cx, cy, base);
    shade.addColorStop(0, "rgba(3, 10, 18, 0)");
    shade.addColorStop(1, `rgba(3, 10, 18, ${0.62 - 0.2 * detail})`);
    g.fillStyle = shade;
    g.beginPath();
    g.arc(cx, cy, base, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(150, 208, 245, 0.32)";
    g.stroke();

    // Home marker
    project(home, 0);
    if (p[2] > 0.12) {
      const fade = Math.min(1, (p[2] - 0.12) * 4);
      const tag = fade * (1 - detail); // the page shows the address card up close
      const pulse = options.still ? 0.4 : (time / 2400) % 1;
      g.strokeStyle = `rgba(140, 214, 255, ${(1 - pulse) * 0.8 * fade})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(p[0], p[1], 5 + pulse * 16, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = `rgba(255, 255, 255, ${fade})`;
      g.beginPath();
      g.arc(p[0], p[1], 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(5, 16, 26, ${0.9 * fade})`;
      g.lineWidth = 1.5;
      g.stroke();
      if (tag > 0.01) {
        // Label on a dark plate, set off from the lights around it
        g.font = '600 13px "Inter", sans-serif';
        g.textBaseline = "middle";
        const labelWidth = g.measureText(HOME.label).width + 22;
        const lx = p[0] - 34 - labelWidth;
        const ly = p[1] - 46;
        g.strokeStyle = `rgba(234, 244, 251, ${0.7 * tag})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p[0] - 4, p[1] - 4);
        g.lineTo(lx + labelWidth - 2, ly + 18);
        g.stroke();
        g.fillStyle = `rgba(5, 16, 26, ${0.86 * tag})`;
        g.beginPath();
        g.roundRect(lx, ly - 6, labelWidth, 26, 13);
        g.fill();
        g.strokeStyle = `rgba(140, 214, 255, ${0.5 * tag})`;
        g.stroke();
        g.fillStyle = `rgba(255, 255, 255, ${tag})`;
        g.fillText(HOME.label, lx + 11, ly + 8);
      }
    }
  }

  function tick(time: number) {
    frame = 0;
    if (stopped) return;
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    if (flight) {
      flight.t = Math.min(1, flight.t + (options.still ? 1 : dt / FLIGHT));
      // Turn first, then dive: the two phases overlap in the middle.
      const zoomingIn = flight.z1 > flight.z0;
      const turn = ease(clamp01(flight.t / (zoomingIn ? 0.6 : 1)));
      const dive = ease(clamp01(zoomingIn ? (flight.t - 0.3) / 0.7 : flight.t / 0.7));
      lon = flight.lon0 + flight.dLon * turn;
      tilt = flight.tilt0 + (flight.tilt1 - flight.tilt0) * turn;
      zoom = Math.exp(Math.log(flight.z0) + (Math.log(flight.z1) - Math.log(flight.z0)) * dive);
      velocity = 0;
      if (flight.t >= 1) flight = null;
    } else if (!dragging && !focused) {
      // After a drag, ease back to the resting spin.
      const target = options.still ? 0 : SPIN;
      velocity += (target - velocity) * Math.min(1, dt * 1.6);
      lon += velocity * dt;
      tilt += (TILT - tilt) * Math.min(1, dt * 0.8);
    }
    draw(time);
    const moving = flight !== null || dragging || (!focused && (!options.still || Math.abs(velocity) > 0.002));
    if (visible && moving) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (!frame && !stopped) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    wake();
  }

  function focus(on: boolean) {
    if (on === focused) return;
    focused = on;
    dragging = false;
    canvas.classList.toggle("is-focused", on);
    const target = HOME.lon * RAD;
    const turn = on ? ((((target - lon) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI : -0.35;
    flight = { t: 0, lon0: lon, dLon: turn, tilt0: tilt, tilt1: on ? HOME.lat * RAD : TILT, z0: zoom, z1: on ? ZOOM_IN : 1 };
    wake();
  }

  function down(event: PointerEvent) {
    if (focused || flight) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    wake();
  }
  function move(event: PointerEvent) {
    if (!dragging) return;
    const scale = 1 / Math.max(120, radius);
    const dx = (event.clientX - lastX) * scale;
    lon -= dx;
    velocity = -dx * 60;
    tilt = Math.max(-0.2, Math.min(1.1, tilt + (event.clientY - lastY) * scale));
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function up() {
    dragging = false;
    canvas.classList.remove("is-dragging");
  }

  const sizes = new ResizeObserver(resize);
  sizes.observe(canvas);
  const watcher = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) wake();
  });
  watcher.observe(canvas);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  // The label uses the page font; redraw once it has loaded.
  document.fonts?.ready.then(wake);
  resize();

  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    sizes.disconnect();
    watcher.disconnect();
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
  };
  return { stop, focus };
}
