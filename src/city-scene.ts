import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * "Audit-Flug": one larger low-poly town in which a camera flies from station
 * to station while the visitor scrolls. Each station (Qualität, Umwelt,
 * Arbeitsschutz, Schulung) triggers a certification wave and an ISO badge, and
 * exposes finding hot spots whose screen positions are handed to the page.
 * Loaded on demand (see AuditCity); rendering pauses off screen or when hidden.
 */
export type CityScene = {
  stop: () => void;
  setTheme: (dark: boolean) => void;
  setProgress: (value: number) => void;
  setStation: (index: number) => void;
};

export type HotspotInput = { id: string; position: [number, number, number] };
export type ProjectedHotspot = { id: string; x: number; y: number; visible: boolean };
type Options = {
  still: boolean;
  dark: boolean;
  small: boolean;
  hotspots: HotspotInput[];
  onProject: (list: ProjectedHotspot[]) => void;
};

function token(name: string, fallback: number) {
  try {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    probe.style.display = "none";
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = resolved;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    return (r << 16) | (gg << 8) | b;
  } catch {
    return fallback;
  }
}
const css = (value: number) => "#" + value.toString(16).padStart(6, "0");

function drawTexture(width: number, height: number, paint: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const seeded = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;

function windowTexture(glow: boolean) {
  const texture = drawTexture(128, 128, (g) => {
    g.fillStyle = glow ? "#000000" : "#ffffff";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const lit = seeded(row * 4 + col + 3) > 0.35;
        if (glow && !lit) continue;
        g.fillStyle = glow ? "#ffffff" : lit ? "#1d3d52" : "#8ea7b6";
        roundRect(g, 10 + col * 30, 12 + row * 28, 18, 16, 3);
        g.fill();
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function badge(label: string, accent: string, navy: string) {
  const texture = drawTexture(512, 176, (g) => {
    g.shadowColor = "rgba(7,29,43,0.35)";
    g.shadowBlur = 28;
    g.shadowOffsetY = 10;
    g.fillStyle = "#ffffff";
    roundRect(g, 24, 16, 464, 128, 64);
    g.fill();
    g.shadowColor = "transparent";
    g.strokeStyle = "rgba(10,14,20,0.14)";
    g.lineWidth = 2;
    roundRect(g, 24, 16, 464, 128, 64);
    g.stroke();
    g.fillStyle = accent;
    g.beginPath();
    g.arc(86, 80, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = navy;
    g.font = '500 52px "Plus Jakarta Sans", "DM Sans", sans-serif';
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(label, 118, 84);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(0.001, 0.001, 1);
  sprite.renderOrder = 10;
  return sprite;
}

type Station = { anchor: Vector3; label: string; accent: string };
type Building = { group: Group; materials: MeshStandardMaterial[]; x: number; z: number; at: number; top: number };

export function startCityScene(canvas: HTMLCanvasElement, options: Options): CityScene {
  const colour = {
    navy: css(token("--navy-900", 0x0a2738)),
    blue: css(token("--blue-500", 0x0784b8)),
    accent: css(token("--accent", 0x3d4a5a)),
    light: token("--blue-300", 0x6cc0e5),
    deep: token("--navy-800", 0x0e3450),
    road: token("--navy-700", 0x2a4658),
    dust: token("--blue-600", 0x0a6fa6),
    glass: token("--blue-300", 0x9fd0ea),
  };
  
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(38, 1, 0.1, 120);

  const ambient = new AmbientLight(0xffffff, 0.5);
  const sun = new DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-6, 10, 6);
  const moon = new PointLight(colour.light, 60, 40);
  moon.position.set(6, 6, 6);
  scene.add(ambient, sun, moon);

  const world = new Group();
  scene.add(world);

  const windows = windowTexture(false);
  const glow = windowTexture(true);
  const walls: MeshStandardMaterial[] = [];
  const buildings: Building[] = [];

  const wall = (color: number, tileX: number, tileY: number, glass = false) => {
    const map = windows.clone();
    map.repeat.set(tileX, tileY);
    map.needsUpdate = true;
    const emissiveMap = glow.clone();
    emissiveMap.repeat.set(tileX, tileY);
    emissiveMap.needsUpdate = true;
    const material = new MeshStandardMaterial({
      color,
      map,
      emissive: new Color(0xdfe9f5),
      emissiveMap,
      emissiveIntensity: 0.05,
      metalness: glass ? 0.7 : 0.1,
      roughness: glass ? 0.25 : 0.65,
    });
    walls.push(material);
    return material;
  };
  const plain = (color: number, rough = 0.7, metal = 0.1) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal });

  // Ground
  const baseMaterial = new MeshStandardMaterial({ color: colour.deep, roughness: 0.6, metalness: 0.3 });
  const base = new Mesh(new BoxGeometry(14, 0.4, 14), baseMaterial);
  base.position.y = -0.22;
  const lawnMaterial = new MeshStandardMaterial({ color: 0xdde2e8, roughness: 0.9 });
  const lawn = new Mesh(new BoxGeometry(13.7, 0.06, 13.7), lawnMaterial);
  lawn.position.y = 0.01;
  world.add(base, lawn);
  const roadMaterial = new MeshStandardMaterial({ color: colour.road, roughness: 0.8 });
  for (const [x, z, w, d] of [[-1.7, 0, 0.34, 13.7], [0, 1.6, 13.7, 0.34], [1.9, -0.5, 0.34, 13.7]] as const) {
    const road = new Mesh(new BoxGeometry(w, 0.02, d), roadMaterial);
    road.position.set(x, 0.05, z);
    world.add(road);
  }

  const add = (x: number, z: number, w: number, d: number, h: number, material: MeshStandardMaterial, roof: number) => {
    const group = new Group();
    group.position.set(x, 0, z);
    const top = plain(roof);
    const body = new Mesh(new BoxGeometry(w, h, d), [material, material, top, top, material, material]);
    body.position.y = h / 2 + 0.04;
    group.add(body);
    world.add(group);
    const entry: Building = { group, materials: [material], x, z, at: -1, top: h + 0.04 };
    buildings.push(entry);
    return { group, entry };
  };

  // Office Dortmund (centre)
  const office = add(0, 0, 1.2, 1.2, 1.7, wall(0xf4f8fb, 3, 4), 0x3d4a5a);
  const pin = new Mesh(new ConeGeometry(0.2, 0.55, 20), new MeshStandardMaterial({ color: 0x3d4a5a, roughness: 0.35, metalness: 0.4 }));
  pin.rotation.x = Math.PI;
  pin.position.set(0, 2.3, 0);
  const pinHead = new Mesh(new SphereGeometry(0.23, 20, 20), pin.material);
  pinHead.position.set(0, 2.68, 0);
  office.group.add(pin, pinHead);

  // Station A: Qualität (factory with sawtooth roof, chimneys, smoke)
  const factory = add(-4.2, -2.8, 2.8, 1.7, 1.0, wall(0xe9f2f8, 4, 1), 0x9fb8c7);
  for (const dx of [-0.9, -0.3, 0.3, 0.9]) {
    const tooth = new Mesh(new ConeGeometry(0.34, 0.32, 3), plain(0x6f8da0));
    tooth.rotation.y = Math.PI / 2;
    tooth.position.set(dx, 1.2, 0);
    factory.group.add(tooth);
  }
  const smoke: { mesh: Mesh; phase: number; x: number; z: number }[] = [];
  for (const [cx, cz] of [[-1.0, 0.4], [-0.6, 0.4]]) {
    const chimney = new Mesh(new CylinderGeometry(0.11, 0.14, 1.5, 14), plain(0xc9d6de));
    chimney.position.set(cx, 1.4, cz);
    factory.group.add(chimney);
    for (let i = 0; i < 3; i += 1) {
      const puff = new Mesh(new SphereGeometry(0.17, 10, 10), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false }));
      factory.group.add(puff);
      smoke.push({ mesh: puff, phase: i / 3 + (cx > -0.8 ? 0.17 : 0), x: cx, z: cz });
    }
  }
  add(-2.7, -1.1, 0.9, 0.9, 0.7, wall(0xdfeaf1, 2, 2), 0x9fb8c7);

  // Station B: Umwelt (wind park, solar field, trees)
  const blades: Object3D[] = [];
  for (const [x, z, s] of [[4.0, -3.6, 1.2], [5.4, -2.4, 1], [2.9, -2.3, 0.9]] as const) {
    const turbine = new Group();
    turbine.position.set(x, 0, z);
    turbine.scale.setScalar(s);
    const pole = new Mesh(new CylinderGeometry(0.05, 0.09, 2.2, 10), plain(0xffffff));
    pole.position.y = 1.1;
    const hub = new Group();
    hub.position.set(0, 2.25, 0.1);
    for (let i = 0; i < 3; i += 1) {
      const blade = new Mesh(new BoxGeometry(0.07, 1.05, 0.025), plain(0xffffff));
      blade.position.y = 0.52;
      const arm = new Group();
      arm.rotation.z = (i * Math.PI * 2) / 3;
      arm.add(blade);
      hub.add(arm);
    }
    turbine.add(pole, hub);
    world.add(turbine);
    blades.push(hub);
  }
  const panelMaterial = new MeshStandardMaterial({ color: 0x14406a, metalness: 0.8, roughness: 0.2 });
  for (let i = 0; i < 6; i += 1) {
    const panel = new Mesh(new BoxGeometry(0.62, 0.04, 0.4), panelMaterial);
    panel.position.set(3.2 + (i % 3) * 0.72, 0.28, -4.7 + Math.floor(i / 3) * 0.55);
    panel.rotation.x = -0.45;
    world.add(panel);
  }
  add(5.4, -4.4, 0.9, 0.9, 0.55, wall(0xf2f4f6, 1, 1), 0x6b7686);

  // Station C: Arbeitsschutz (warehouse, crates, forklift)
  const warehouse = add(-4.3, 3.2, 2.8, 1.5, 0.9, wall(0xcfe0ea, 5, 1), 0x7e99ab);
  const door = new Mesh(new BoxGeometry(0.9, 0.5, 0.04), plain(0x58667a, 0.5));
  door.position.set(0.5, 0.3, 0.77);
  warehouse.group.add(door);
  for (let i = 0; i < 5; i += 1) {
    const crate = new Mesh(new BoxGeometry(0.34, 0.34, 0.34), plain(i % 2 ? 0x9aa4b0 : 0x838e9b));
    crate.position.set(-3.2 + (i % 3) * 0.4, 0.2 + Math.floor(i / 3) * 0.36, 4.3 + (i % 2) * 0.1);
    world.add(crate);
  }
  const forklift = new Group();
  forklift.position.set(-2.6, 0, 4.4);
  const fbody = new Mesh(new BoxGeometry(0.5, 0.26, 0.34), plain(0x66717e, 0.5));
  fbody.position.y = 0.2;
  const mast = new Mesh(new BoxGeometry(0.06, 0.6, 0.3), plain(0x444c52));
  mast.position.set(0.3, 0.35, 0);
  forklift.add(fbody, mast);
  world.add(forklift);

  // Station D: Schulung (training centre with glass tower)
  add(4.2, 3.4, 2.0, 1.7, 1.2, wall(0xdfeaf1, 3, 2), 0x9fb8c7);
  add(5.9, 4.0, 1.0, 1.0, 3.0, wall(colour.glass, 2, 6, true), colour.light);
  for (let i = 0; i < 6; i += 1) {
    const seat = new Mesh(new BoxGeometry(0.22, 0.12, 0.22), plain(0xffffff));
    seat.position.set(3.4 + (i % 3) * 0.4, 0.14, 4.7 + Math.floor(i / 3) * 0.35);
    world.add(seat);
  }

  // Homes
  for (const [x, z, h] of [[0.5, 3.5, 0.5], [1.4, 4.4, 0.6], [-0.9, 5.2, 0.45], [0.4, -3.3, 0.55], [-1.0, -4.8, 0.5], [2.6, 0.9, 0.5], [-5.6, 0.4, 0.55], [5.8, 0.6, 0.5]] as const) {
    add(x, z, 0.66, 0.66, h, wall(0xf2f4f6, 1, 1), 0x8b95a1);
  }

  // Trees
  const treeMaterial = new MeshStandardMaterial({ color: 0xb7c0ca, roughness: 0.8 });
  const trunkMaterial = new MeshStandardMaterial({ color: 0x8a929c, roughness: 0.9 });
  const taken = buildings.map((b) => ({ x: b.x, z: b.z }));
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const treeCount = options.small ? 6 : 12;
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < treeCount; tries += 1) {
    const x = (rand() - 0.5) * 13;
    const z = (rand() - 0.5) * 13;
    const onRoad = Math.abs(x + 1.7) < 0.35 || Math.abs(z - 1.6) < 0.35 || Math.abs(x - 1.9) < 0.35;
    if (onRoad || taken.some((t) => Math.hypot(t.x - x, t.z - z) < 1.5)) continue;
    const tree = new Group();
    tree.position.set(x, 0, z);
    const trunk = new Mesh(new CylinderGeometry(0.03, 0.04, 0.2, 6), trunkMaterial);
    trunk.position.y = 0.14;
    const crown = new Mesh(new ConeGeometry(0.18, 0.46, 8), treeMaterial);
    crown.position.y = 0.45;
    tree.add(trunk, crown);
    tree.scale.setScalar(0.8 + rand() * 0.6);
    world.add(tree);
    taken.push({ x, z });
    placed += 1;
  }

  // Stations: camera keyframes, anchors, badges
  const stations: Station[] = [
    { anchor: new Vector3(0, 0, 0), label: "Dortmund", accent: colour.accent },
    { anchor: new Vector3(-4.2, 0, -2.8), label: "ISO 9001", accent: colour.blue },
    { anchor: new Vector3(4.2, 0, -3.4), label: "ISO 14001", accent: colour.blue },
    { anchor: new Vector3(-4.3, 0, 3.2), label: "ISO 45001", accent: colour.accent },
    { anchor: new Vector3(4.6, 0, 3.6), label: "SCC", accent: colour.blue },
    { anchor: new Vector3(0, 0, 0), label: "Dortmund", accent: colour.accent },
  ];
  const badges: (Sprite | null)[] = stations.map((station, index) => {
    if (index === 0 || index === 5) return null;
    const sprite = badge(station.label, station.accent, colour.navy);
    sprite.position.set(station.anchor.x, 2.9, station.anchor.z);
    world.add(sprite);
    return sprite;
  });
  const camPoints = [
    new Vector3(9, 10, 13),
    new Vector3(-1.4, 3.6, 0.6),
    new Vector3(1.6, 3.4, -0.2),
    new Vector3(-1.2, 3.0, 6.6),
    new Vector3(1.8, 3.8, 6.9),
    new Vector3(0, 12, 13),
  ];
  const lookPoints = [
    new Vector3(0, 0, 0),
    new Vector3(-4.2, 0.6, -2.8),
    new Vector3(4.2, 1.0, -3.2),
    new Vector3(-4.3, 0.5, 3.2),
    new Vector3(4.6, 1.0, 3.6),
    new Vector3(0, 0.2, 0),
  ];
  const camCurve = new CatmullRomCurve3(camPoints, false, "catmullrom", 0.4);
  const lookCurve = new CatmullRomCurve3(lookPoints, false, "catmullrom", 0.4);

  // Certification wave
  const waveMaterial = new MeshBasicMaterial({ color: colour.light, transparent: true, opacity: 0, depthWrite: false });
  const wave = new Mesh(new TorusGeometry(1, 0.03, 8, 120), waveMaterial);
  wave.rotation.x = Math.PI / 2;
  wave.position.y = 0.14;
  world.add(wave);
  const waveFillMaterial = new MeshBasicMaterial({ color: colour.light, transparent: true, opacity: 0, depthWrite: false });
  const waveFill = new Mesh(new PlaneGeometry(2, 2), waveFillMaterial);
  waveFill.rotation.x = -Math.PI / 2;
  waveFill.position.y = 0.12;
  world.add(waveFill);

  // Particles
  const count = options.small ? 70 : 160;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = MathUtils.randFloatSpread(40);
    positions[i * 3 + 1] = MathUtils.randFloat(0.5, 14);
    positions[i * 3 + 2] = MathUtils.randFloatSpread(40);
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  const dustMaterial = new PointsMaterial({ color: colour.dust, size: 0.04, transparent: true, opacity: 0.35, depthWrite: false });
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const apply = (dark: boolean) => {
    walls.forEach((material) => {
      material.emissiveIntensity = dark ? 1.5 : 0.05;
    });
    ambient.intensity = dark ? 0.18 : 0.6;
    sun.intensity = dark ? 0.35 : 2.3;
    sun.color.set(dark ? 0x8fb4ff : 0xfff1dc);
    moon.intensity = dark ? 90 : 25;
    baseMaterial.color.set(dark ? token("--navy-900", 0x0a2a3f) : colour.deep);
    lawnMaterial.color.set(dark ? 0x1a2027 : 0xdde2e8);
    roadMaterial.color.set(dark ? token("--navy-800", 0x16303f) : colour.road);
    dustMaterial.color = new Color(dark ? colour.light : colour.dust);
    dustMaterial.opacity = dark ? 0.5 : 0.35;
    dustMaterial.blending = dark ? AdditiveBlending : NormalBlending;
    dustMaterial.needsUpdate = true;
  };
  apply(options.dark);

  let width = 1;
  let height = 1;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(box.width));
    height = Math.max(1, Math.floor(box.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 781 ? 52 : 38;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(canvas);

  let target = 0;
  let current = 0;
  let station = 0;
  let waveStart = -10;
  let waveStation = 0;
  const startWave = (index: number, now: number) => {
    waveStation = index;
    waveStart = now;
    buildings.forEach((b) => {
      b.at = -1;
    });
  };

  const easeOutBack = (t: number) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  const hotspotVectors = options.hotspots.map((h) => ({ id: h.id, v: new Vector3(...h.position) }));
  const camPos = new Vector3();
  const lookPos = new Vector3();
  const projected = new Vector3();

  let frame = 0;
  let last = performance.now();
  let time = 0;
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += options.still ? 0 : dt;

    current += (target - current) * Math.min(1, dt * 3.2);
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);

    const t = MathUtils.clamp(current, 0, 1);
    camCurve.getPoint(t, camPos);
    lookCurve.getPoint(t, lookPos);
    camera.position.set(camPos.x + pointer.sx * 0.35, camPos.y - pointer.sy * 0.2, camPos.z);
    camera.lookAt(lookPos);

    // Wave from the active station
    const age = time - waveStart;
    const anchor = stations[waveStation].anchor;
    const radius = MathUtils.clamp(age / 1.8, 0, 1) * 5.6;
    wave.position.set(anchor.x, 0.14, anchor.z);
    waveFill.position.set(anchor.x, 0.12, anchor.z);
    wave.scale.setScalar(Math.max(0.001, radius));
    waveFill.scale.setScalar(Math.max(0.001, radius));
    const waveOpacity = age < 0 ? 0 : age < 1.8 ? 0.9 * (1 - age / 2.6) : Math.max(0, 0.28 * (1 - (age - 1.8) / 0.8));
    waveMaterial.opacity = waveOpacity;
    waveFillMaterial.opacity = waveOpacity * 0.14;

    for (const b of buildings) {
      const dist = Math.hypot(b.x - anchor.x, b.z - anchor.z);
      if (b.at < 0 && age >= 0 && radius >= dist && age < 2.4) b.at = time;
      const bAge = b.at < 0 ? -1 : time - b.at;
      const lit = bAge >= 0 ? Math.max(0, 1 - bAge / 1.3) : 0;
      b.materials.forEach((m) => m.emissive.set(lit > 0 ? colour.light : 0xdfe9f5));
      b.group.position.y = lit * 0.12;
    }

    badges.forEach((sprite, index) => {
      if (!sprite) return;
      const on = station === index && age > 0.5;
      const grow = on ? Math.min(1, (age - 0.5) / 0.7) : 0;
      const e = grow > 0 ? easeOutBack(grow) : 0;
      sprite.scale.set(2.1 * e + 0.001, 0.72 * e + 0.001, 1);
      sprite.position.y = 2.9 + Math.sin(time * 1.6 + index) * 0.06;
    });

    smoke.forEach(({ mesh, phase: p, x, z }) => {
      const s = (time * 0.22 + p) % 1;
      mesh.position.set(x + s * 0.55, 2.3 + s * 1.5, z);
      mesh.scale.setScalar(0.5 + s * 1.4);
      (mesh.material as MeshStandardMaterial).opacity = 0.5 * (1 - s);
    });
    blades.forEach((hub, i) => {
      hub.rotation.z = time * (1.5 + i * 0.3);
    });
    forklift.position.x = -2.6 + Math.sin(time * 0.6) * 0.5;
    pin.position.y = 2.3 + Math.sin(time * 2) * 0.05;
    pinHead.position.y = 2.68 + Math.sin(time * 2) * 0.05;
    dust.rotation.y = time * 0.015;

    renderer.render(scene, camera);

    // Hot spot screen positions for the page
    const list: ProjectedHotspot[] = hotspotVectors.map(({ id, v }) => {
      projected.copy(v).project(camera);
      return {
        id,
        x: ((projected.x + 1) / 2) * width,
        y: ((1 - projected.y) / 2) * height,
        visible: projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1,
      };
    });
    options.onProject(list);
  };
  frame = requestAnimationFrame(draw);

  return {
    setTheme: apply,
    setProgress(value: number) {
      target = value;
    },
    setStation(index: number) {
      if (index === station) return;
      station = index;
      startWave(index, time);
    },
    stop() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      scene.traverse((object: Object3D) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        const list = Array.isArray(material) ? material : material ? [material] : [];
        list.forEach((m) => {
          const standard = m as MeshStandardMaterial;
          standard.map?.dispose?.();
          standard.emissiveMap?.dispose?.();
          m.dispose();
        });
      });
      windows.dispose();
      glow.dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
