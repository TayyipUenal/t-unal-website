import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Hero centrepiece in real 3D: a small low-poly town around the office in
 * Dortmund (factory, office tower, warehouse, homes, wind turbines). Every few
 * seconds a certification wave rolls over the town; each building it passes
 * lights up and receives its ISO badge. The scene follows the pointer, leans
 * while scrolling and switches between day and night (lit windows). Loaded on
 * demand (see HeroScene) so it stays out of the first paint; rendering pauses
 * while off screen or when the tab is hidden.
 */
export type HeroScene = { stop: () => void; setTheme: (dark: boolean) => void };

type Options = { still: boolean; dark: boolean; small: boolean };

const NAVY = "#0a2738";
const BLUE = "#0784b8";
const GREEN = "#17a673";
const ORANGE = "#ff5b22";
const CYCLE = 8; // seconds per certification wave
const REACH = 5.2; // wave radius at the end of its run

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

/** A grid of windows, some lit. Used as colour map and, at night, as glow map. */
function windowTexture() {
  const texture = drawTexture(128, 128, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 128);
    const seeded = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const lit = seeded(row * 4 + col + 3) > 0.35;
        g.fillStyle = lit ? "#1d3d52" : "#8ea7b6";
        roundRect(g, 10 + col * 30, 12 + row * 28, 18, 16, 3);
        g.fill();
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function glowTexture() {
  const texture = drawTexture(128, 128, (g) => {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 128, 128);
    const seeded = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if (seeded(row * 4 + col + 3) > 0.35) {
          g.fillStyle = "#ffffff";
          roundRect(g, 10 + col * 30, 12 + row * 28, 18, 16, 3);
          g.fill();
        }
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function badge(label: string, accent: string) {
  const texture = drawTexture(512, 176, (g) => {
    g.shadowColor = "rgba(7,29,43,0.35)";
    g.shadowBlur = 28;
    g.shadowOffsetY = 10;
    g.fillStyle = "#ffffff";
    roundRect(g, 24, 16, 464, 128, 64);
    g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = accent;
    g.beginPath();
    g.arc(88, 80, 30, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(74, 82);
    g.lineTo(85, 93);
    g.lineTo(104, 69);
    g.stroke();
    g.fillStyle = NAVY;
    g.font = '800 52px "Bricolage Grotesque", "Figtree", sans-serif';
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(label, 138, 84);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(2.1, 0.72, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function pinLabel() {
  const texture = drawTexture(384, 128, (g) => {
    g.shadowColor = "rgba(7,29,43,0.45)";
    g.shadowBlur = 22;
    g.shadowOffsetY = 8;
    g.fillStyle = ORANGE;
    roundRect(g, 20, 14, 344, 84, 42);
    g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = "#ffffff";
    g.font = '800 44px "Bricolage Grotesque", "Figtree", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Dortmund", 192, 58);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(1.5, 0.5, 1);
  sprite.renderOrder = 11;
  return sprite;
}

type Building = {
  group: Group;
  materials: MeshStandardMaterial[];
  dist: number;
  at: number;
  badge?: Sprite;
  top: number;
};

export function startHeroScene(canvas: HTMLCanvasElement, options: Options): HeroScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const ambient = new AmbientLight(0xffffff, 0.5);
  const sun = new DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-4, 7, 5);
  const moon = new PointLight(0x6cc0e5, 60, 30);
  moon.position.set(4, 5, 6);
  scene.add(ambient, sun, moon);

  const rig = new Group();
  scene.add(rig);
  const town = new Group();
  town.rotation.x = 0.62;
  rig.add(town);
  const spinner = new Group();
  town.add(spinner);

  const windows = windowTexture();
  const glow = glowTexture();
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
      emissive: new Color(0xffd9a0),
      emissiveMap,
      emissiveIntensity: 0.05,
      metalness: glass ? 0.7 : 0.1,
      roughness: glass ? 0.25 : 0.65,
    });
    walls.push(material);
    return material;
  };
  const roofMaterial = (color: number) => new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });

  // Platform
  const baseMaterial = new MeshStandardMaterial({ color: 0x0f3a55, roughness: 0.6, metalness: 0.3 });
  const base = new Mesh(new BoxGeometry(7.4, 0.36, 7.4), baseMaterial);
  base.position.y = -0.2;
  spinner.add(base);
  const lawnMaterial = new MeshStandardMaterial({ color: 0x1d7a63, roughness: 0.9 });
  const lawn = new Mesh(new BoxGeometry(7.2, 0.06, 7.2), lawnMaterial);
  lawn.position.y = 0.01;
  spinner.add(lawn);
  const roadMaterial = new MeshStandardMaterial({ color: 0x2a4658, roughness: 0.8 });
  const roadA = new Mesh(new BoxGeometry(7.2, 0.02, 0.32), roadMaterial);
  roadA.position.set(0, 0.05, 0.9);
  const roadB = new Mesh(new BoxGeometry(0.32, 0.02, 7.2), roadMaterial);
  roadB.position.set(-0.55, 0.05, 0);
  spinner.add(roadA, roadB);

  const add = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    material: MeshStandardMaterial,
    roof: number,
    key?: { label: string; accent: string },
  ) => {
    const group = new Group();
    group.position.set(x, 0, z);
    const sideMaterial = material;
    const body = new Mesh(new BoxGeometry(w, h, d), [sideMaterial, sideMaterial, roofMaterial(roof), roofMaterial(roof), sideMaterial, sideMaterial]);
    body.position.y = h / 2 + 0.04;
    group.add(body);
    spinner.add(group);
    const entry: Building = { group, materials: [material], dist: Math.hypot(x, z), at: -1, top: h + 0.04 };
    if (key) {
      const sprite = badge(key.label, key.accent);
      sprite.position.set(0, h + 0.95, 0);
      sprite.scale.setScalar(0.001);
      group.add(sprite);
      entry.badge = sprite;
    }
    buildings.push(entry);
    return { group, entry };
  };

  // Factory with sawtooth roof and chimneys
  const factory = add(-1.7, -1.2, 2.0, 1.2, 0.8, wall(0xe9f2f8, 3, 1), 0x9fb8c7, { label: "ISO 14001", accent: GREEN });
  for (const dx of [-0.6, 0, 0.6]) {
    const tooth = new Mesh(new ConeGeometry(0.34, 0.3, 3), roofMaterial(0x6f8da0));
    tooth.rotation.y = Math.PI / 2;
    tooth.position.set(dx, 0.98, 0);
    factory.group.add(tooth);
  }
  const chimneyMaterial = roofMaterial(0xc9d6de);
  const smoke: { mesh: Mesh; phase: number; x: number; z: number }[] = [];
  for (const [cx, cz] of [[-0.7, 0.3], [-0.35, 0.3]]) {
    const chimney = new Mesh(new CylinderGeometry(0.1, 0.13, 1.3, 14), chimneyMaterial);
    chimney.position.set(cx, 1.2, cz);
    factory.group.add(chimney);
    for (let i = 0; i < 3; i += 1) {
      const puff = new Mesh(
        new SphereGeometry(0.16, 10, 10),
        new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false }),
      );
      factory.group.add(puff);
      smoke.push({ mesh: puff, phase: i / 3 + (cx > -0.5 ? 0.17 : 0), x: cx, z: cz });
    }
  }

  // Office tower (glass)
  add(1.5, -1.5, 0.9, 0.9, 2.5, wall(0x9fd0ea, 2, 6, true), 0x6cc0e5, { label: "ISO 9001", accent: BLUE });
  // Mid office
  add(1.95, 0.2, 0.8, 0.8, 1.3, wall(0xdfeaf1, 2, 3), 0x9fb8c7);
  // Warehouse
  const warehouse = add(-1.7, 1.55, 2.0, 1.0, 0.7, wall(0xcfe0ea, 4, 1), 0x7e99ab, { label: "ISO 45001", accent: ORANGE });
  const door = new Mesh(new BoxGeometry(0.7, 0.4, 0.04), new MeshStandardMaterial({ color: 0xff8a4c, roughness: 0.5 }));
  door.position.set(0.3, 0.26, 0.52);
  warehouse.group.add(door);
  // Office Dortmund (centre, with pin)
  const home = add(0.45, -0.2, 0.9, 0.9, 1.1, wall(0xf4f8fb, 2, 3), 0xff5b22);
  const pin = new Mesh(new ConeGeometry(0.18, 0.5, 20), new MeshStandardMaterial({ color: 0xff5b22, roughness: 0.35, metalness: 0.4 }));
  pin.rotation.x = Math.PI;
  pin.position.set(0, 1.7, 0);
  const pinHead = new Mesh(new SphereGeometry(0.2, 20, 20), pin.material);
  pinHead.position.set(0, 2.05, 0);
  home.group.add(pin, pinHead);
  const label = pinLabel();
  label.position.set(0, 2.65, 0);
  home.group.add(label);
  // Homes
  for (const [x, z, h] of [[0.4, 1.7, 0.45], [1.25, 1.75, 0.55], [2.05, 1.7, 0.4], [-0.1, -2.35, 0.5]]) {
    const roofHome = add(x, z, 0.62, 0.62, h, wall(0xf2ede4, 1, 1), 0xd9674a);
    roofHome.entry.dist = Math.hypot(x, z);
  }

  // Wind turbines
  const blades: Object3D[] = [];
  for (const [x, z] of [[2.7, 2.6], [-2.8, -2.6]]) {
    const turbine = new Group();
    turbine.position.set(x, 0, z);
    const pole = new Mesh(new CylinderGeometry(0.04, 0.07, 1.7, 10), roofMaterial(0xffffff));
    pole.position.y = 0.9;
    const hub = new Group();
    hub.position.set(0, 1.75, 0.08);
    const bladeMaterial = roofMaterial(0xffffff);
    for (let i = 0; i < 3; i += 1) {
      const blade = new Mesh(new BoxGeometry(0.06, 0.8, 0.02), bladeMaterial);
      blade.position.y = 0.4;
      const arm = new Group();
      arm.rotation.z = (i * Math.PI * 2) / 3;
      arm.add(blade);
      hub.add(arm);
    }
    turbine.add(pole, hub);
    spinner.add(turbine);
    blades.push(hub);
  }

  // Trees
  const treeMaterial = new MeshStandardMaterial({ color: 0x159a6a, roughness: 0.8 });
  const trunkMaterial = new MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const taken = buildings.map((b) => ({ x: b.group.position.x, z: b.group.position.z }));
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const treeCount = options.small ? 10 : 22;
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < treeCount; tries += 1) {
    const x = (rand() - 0.5) * 6.6;
    const z = (rand() - 0.5) * 6.6;
    const onRoad = Math.abs(z - 0.9) < 0.3 || Math.abs(x + 0.55) < 0.3;
    if (onRoad || taken.some((t) => Math.hypot(t.x - x, t.z - z) < 1.15)) continue;
    const tree = new Group();
    tree.position.set(x, 0, z);
    const trunk = new Mesh(new CylinderGeometry(0.03, 0.04, 0.2, 6), trunkMaterial);
    trunk.position.y = 0.14;
    const crown = new Mesh(new ConeGeometry(0.17, 0.42, 8), treeMaterial);
    crown.position.y = 0.42;
    tree.add(trunk, crown);
    tree.scale.setScalar(0.8 + rand() * 0.6);
    spinner.add(tree);
    taken.push({ x, z });
    placed += 1;
  }

  // Certification wave
  const waveMaterial = new MeshBasicMaterial({ color: 0x6cc0e5, transparent: true, opacity: 0, depthWrite: false });
  const wave = new Mesh(new TorusGeometry(1, 0.025, 8, 120), waveMaterial);
  wave.rotation.x = Math.PI / 2;
  wave.position.y = 0.12;
  spinner.add(wave);
  const waveFill = new Mesh(
    new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ color: 0x6cc0e5, transparent: true, opacity: 0, depthWrite: false }),
  );
  waveFill.rotation.x = -Math.PI / 2;
  waveFill.position.y = 0.1;
  spinner.add(waveFill);

  // Particles
  const count = options.small ? 200 : 560;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = MathUtils.randFloatSpread(30);
    positions[i * 3 + 1] = MathUtils.randFloatSpread(18);
    positions[i * 3 + 2] = MathUtils.randFloatSpread(14) - 4;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  const dustMaterial = new PointsMaterial({ color: 0x0a6fa6, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false });
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
    baseMaterial.color.set(dark ? 0x0a2a3f : 0x0f3a55);
    lawnMaterial.color.set(dark ? 0x0f5846 : 0x1d9a73);
    roadMaterial.color.set(dark ? 0x16303f : 0x2a4658);
    dustMaterial.color = new Color(dark ? 0x8fd3f5 : 0x0a6fa6);
    dustMaterial.opacity = dark ? 0.9 : 0.5;
    dustMaterial.blending = dark ? AdditiveBlending : NormalBlending;
    dustMaterial.needsUpdate = true;
  };
  apply(options.dark);

  let width = 1;
  let height = 1;
  const place = () => {
    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    if (options.small || width < 781) {
      rig.position.set(0, -halfH * 0.42, 0);
      rig.scale.setScalar(0.5);
    } else {
      rig.position.set(halfW * 0.5, -0.2, 0);
      rig.scale.setScalar(Math.min(1.12, halfH / 4.9 + 0.1));
    }
  };
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(box.width));
    height = Math.max(1, Math.floor(box.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    place();
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

  const easeOutBack = (t: number) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };

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

    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    const scroll = Math.min(1, window.scrollY / 800);

    spinner.rotation.y = -0.55 + Math.sin(time * 0.2) * 0.35 + pointer.sx * 0.5;
    town.rotation.x = 0.62 - pointer.sy * 0.14 + scroll * 0.5;

    // Certification wave
    const phase = (time % CYCLE) / CYCLE;
    const run = Math.min(1, phase / 0.45);
    const radius = run * REACH;
    wave.scale.setScalar(Math.max(0.001, radius));
    waveFill.scale.setScalar(Math.max(0.001, radius));
    const waveOpacity = phase < 0.45 ? 0.9 * (1 - run * 0.4) : Math.max(0, 0.54 * (1 - (phase - 0.45) / 0.15));
    waveMaterial.opacity = waveOpacity;
    (waveFill.material as MeshBasicMaterial).opacity = waveOpacity * 0.12;

    const reset = phase > 0.9;
    for (const b of buildings) {
      if (reset) b.at = -1;
      else if (b.at < 0 && radius >= b.dist && phase < 0.45) b.at = time;
      const age = b.at < 0 ? -1 : time - b.at;
      const lit = age >= 0 ? Math.max(0, 1 - age / 1.2) : 0;
      b.materials.forEach((m) => m.emissive.set(lit > 0 ? 0x6cc0e5 : 0xffd9a0));
      b.group.position.y = lit * 0.12;
      if (b.badge) {
        const grow = age < 0 ? 0 : Math.min(1, age / 0.7);
        const fade = phase > 0.8 ? Math.max(0, 1 - (phase - 0.8) / 0.1) : 1;
        b.badge.scale.set(2.1 * easeOutBack(grow) * fade + 0.001, 0.72 * easeOutBack(grow) * fade + 0.001, 1);
        b.badge.position.y = b.top + 0.95 + Math.sin(time * 1.6 + b.dist) * 0.05;
      }
    }

    smoke.forEach(({ mesh, phase: p, x, z }) => {
      const t = (time * 0.22 + p) % 1;
      mesh.position.set(x + t * 0.5, 1.9 + t * 1.3, z);
      mesh.scale.setScalar(0.5 + t * 1.3);
      (mesh.material as MeshStandardMaterial).opacity = 0.5 * (1 - t);
    });
    blades.forEach((hub, i) => {
      hub.rotation.z = time * (1.4 + i * 0.3);
    });
    pin.position.y = 1.7 + Math.sin(time * 2) * 0.05;
    pinHead.position.y = 2.05 + Math.sin(time * 2) * 0.05;

    dust.rotation.y = time * 0.02 + pointer.sx * 0.08;
    dust.position.y = scroll * 2;
    camera.position.x = pointer.sx * 0.35;
    camera.position.y = -pointer.sy * 0.25;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(draw);

  return {
    setTheme: apply,
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
