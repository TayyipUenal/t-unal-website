import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
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
  Scene,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Hero centrepiece in real 3D: a thick ISO certificate with a metal seal and
 * three orbiting standard chips (ISO 9001, 14001, 45001), floating in a
 * particle field. It follows the pointer, leans while scrolling and adapts to
 * the day/night theme. Loaded on demand (see HeroScene) so it stays out of the
 * first paint; rendering pauses while off screen or when the tab is hidden.
 */
export type HeroScene = { stop: () => void; setTheme: (dark: boolean) => void };

type Options = { still: boolean; dark: boolean; small: boolean };

const NAVY = "#0a2738";
const BLUE = "#0784b8";
const ORANGE = "#ff5b22";

function drawTexture(width: number, height: number, paint: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  paint(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
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

function certificateFace() {
  return drawTexture(900, 1200, (g) => {
    const sky = g.createLinearGradient(0, 0, 900, 1200);
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(1, "#dcecf5");
    g.fillStyle = sky;
    g.fillRect(0, 0, 900, 1200);
    g.strokeStyle = "rgba(10,92,134,0.35)";
    g.lineWidth = 4;
    roundRect(g, 38, 38, 824, 1124, 28);
    g.stroke();
    g.strokeStyle = "rgba(10,92,134,0.15)";
    g.lineWidth = 2;
    roundRect(g, 58, 58, 784, 1084, 20);
    g.stroke();

    g.textAlign = "center";
    g.fillStyle = "#6b8494";
    g.font = '700 30px "JetBrains Mono", monospace';
    g.fillText("Z E R T I F I K A T", 450, 170);

    g.fillStyle = NAVY;
    g.font = '800 118px "Bricolage Grotesque", "Figtree", sans-serif';
    g.fillText("ISO", 450, 330);
    g.fillStyle = BLUE;
    g.font = '800 64px "Bricolage Grotesque", "Figtree", sans-serif';
    g.fillText("9001 · 14001 · 45001", 450, 410);

    g.fillStyle = "rgba(10,39,56,0.8)";
    g.font = '600 34px "Figtree", sans-serif';
    g.fillText("Qualität  ·  Umwelt  ·  Arbeitsschutz", 450, 490);

    const bars = [820, 740, 780];
    bars.forEach((w, i) => {
      g.fillStyle = i === 0 ? "rgba(7,132,184,0.35)" : "rgba(10,39,56,0.12)";
      roundRect(g, (900 - w) / 2, 580 + i * 56, w, 24, 12);
      g.fill();
    });

    g.fillStyle = "rgba(10,39,56,0.1)";
    g.fillRect(120, 930, 300, 3);
    g.fillRect(480, 930, 300, 3);
    g.fillStyle = "#6b8494";
    g.font = '600 26px "Figtree", sans-serif';
    g.fillText("Auditor", 270, 975);
    g.fillText("Datum", 630, 975);

    g.fillStyle = NAVY;
    g.font = '700 38px "Bricolage Grotesque", "Figtree", sans-serif';
    g.fillText("Tayyip Ünal", 450, 1100);
  });
}

function sealFace() {
  return drawTexture(512, 512, (g) => {
    const disc = g.createRadialGradient(256, 200, 20, 256, 256, 256);
    disc.addColorStop(0, "#ff9a6b");
    disc.addColorStop(1, "#e84a14");
    g.fillStyle = disc;
    g.beginPath();
    g.arc(256, 256, 256, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.65)";
    g.lineWidth = 10;
    g.beginPath();
    g.arc(256, 256, 214, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([2, 22]);
    g.lineWidth = 8;
    g.beginPath();
    g.arc(256, 256, 188, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "#fff";
    g.lineWidth = 36;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(170, 262);
    g.lineTo(234, 326);
    g.lineTo(350, 190);
    g.stroke();
  });
}

function chipSprite(label: string, accent: string) {
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
    g.arc(88, 80, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = NAVY;
    g.font = '800 54px "Bricolage Grotesque", "Figtree", sans-serif';
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(label, 132, 84);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.3, 0.79, 1);
  return sprite;
}

function roundedPlate(width: number, height: number, radius: number, depth: number) {
  const shape = new Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2);
  // Map the front and back caps onto the whole plate.
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getX(i) + width / 2) / width;
    uv[i * 2 + 1] = (position.getY(i) + height / 2) / height;
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  return geometry;
}

export function startHeroScene(canvas: HTMLCanvasElement, options: Options): HeroScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new PointLight(0x9fd8f5, 120, 40);
  key.position.set(5, 5, 9);
  const warm = new PointLight(0xff8a4c, 70, 40);
  warm.position.set(-6, -3, 6);
  scene.add(key, warm);

  const rig = new Group();
  scene.add(rig);
  const float = new Group();
  rig.add(float);

  // Certificate plate
  const plate = new Mesh(
    roundedPlate(3.3, 4.4, 0.22, 0.14),
    [
      new MeshStandardMaterial({ map: certificateFace(), roughness: 0.42, metalness: 0.05 }),
      new MeshStandardMaterial({ color: 0x0a5c86, metalness: 0.7, roughness: 0.3 }),
    ],
  );
  float.add(plate);

  // Seal: metal disc with an orange face, ring and two ribbons
  const seal = new Group();
  seal.position.set(0.95, -1.55, 0.42);
  const rim = new Mesh(new TorusGeometry(0.78, 0.09, 24, 80), new MeshStandardMaterial({ color: 0xffd0b8, metalness: 1, roughness: 0.2 }));
  const body = new Mesh(new CylinderGeometry(0.78, 0.78, 0.12, 64), new MeshStandardMaterial({ color: 0xe84a14, metalness: 0.85, roughness: 0.3 }));
  body.rotation.x = Math.PI / 2;
  const face = new Mesh(new PlaneGeometry(1.5, 1.5), new MeshBasicMaterial({ map: sealFace(), transparent: true }));
  face.position.z = 0.07;
  face.scale.setScalar(0.96);
  seal.add(body, rim, face);
  const ribbonMaterial = new MeshStandardMaterial({ color: 0x0a6fa6, roughness: 0.5, side: DoubleSide });
  for (const side of [-1, 1]) {
    const ribbon = new Mesh(new PlaneGeometry(0.42, 1.1), ribbonMaterial);
    ribbon.position.set(side * 0.3, -0.95, -0.05);
    ribbon.rotation.z = side * 0.18;
    seal.add(ribbon);
  }
  float.add(seal);

  // Standard chips orbiting the plate
  const chips: { sprite: Sprite; phase: number; radius: number; height: number }[] = [
    { sprite: chipSprite("ISO 9001", BLUE), phase: 0, radius: 3.5, height: 1.5 },
    { sprite: chipSprite("ISO 14001", "#17a673"), phase: (Math.PI * 2) / 3, radius: 3.7, height: -0.2 },
    { sprite: chipSprite("ISO 45001", ORANGE), phase: (Math.PI * 4) / 3, radius: 3.5, height: -1.9 },
  ];
  if (!options.small) chips.forEach((chip) => rig.add(chip.sprite));

  // Soft orbit ring under the plate
  const ringMaterial = new MeshStandardMaterial({ color: 0x6cc0e5, metalness: 0.8, roughness: 0.3, transparent: true, opacity: 0.55 });
  const ring = new Mesh(new TorusGeometry(3.6, 0.018, 12, 200), ringMaterial);
  ring.rotation.x = Math.PI / 2.15;
  rig.add(ring);

  // Particles
  const count = options.small ? 220 : 620;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = MathUtils.randFloatSpread(28);
    positions[i * 3 + 1] = MathUtils.randFloatSpread(16);
    positions[i * 3 + 2] = MathUtils.randFloatSpread(14) - 3;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  const dustMaterial = new PointsMaterial({ color: 0x0a6fa6, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false });
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const apply = (dark: boolean) => {
    dustMaterial.color = new Color(dark ? 0x8fd3f5 : 0x0a6fa6);
    dustMaterial.opacity = dark ? 0.9 : 0.55;
    dustMaterial.blending = dark ? AdditiveBlending : NormalBlending;
    dustMaterial.needsUpdate = true;
    ringMaterial.opacity = dark ? 0.8 : 0.55;
    renderer.toneMappingExposure = dark ? 1 : 1.05;
  };
  apply(options.dark);

  let width = 1;
  let height = 1;
  const place = () => {
    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    if (options.small || width < 781) {
      rig.position.set(0, -halfH * 0.38, 0);
      rig.scale.setScalar(0.55);
    } else {
      rig.position.set(halfW * 0.5, 0.1, 0);
      rig.scale.setScalar(Math.min(1.05, halfH / 4.6 + 0.12));
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

    float.position.y = Math.sin(time * 0.9) * 0.16;
    float.rotation.y = Math.sin(time * 0.45) * 0.32 + pointer.sx * 0.55;
    float.rotation.x = -pointer.sy * 0.28 + scroll * 0.7 + Math.sin(time * 0.6) * 0.04;
    float.rotation.z = Math.sin(time * 0.35) * 0.04;
    seal.rotation.y = Math.sin(time * 1.1) * 0.5;
    seal.position.z = 0.42 + Math.sin(time * 1.3) * 0.04;

    chips.forEach(({ sprite, phase, radius, height: h }) => {
      const angle = time * 0.42 + phase;
      sprite.position.set(Math.cos(angle) * radius, h + Math.sin(time * 0.8 + phase) * 0.12, Math.sin(angle) * radius);
      sprite.material.opacity = 0.5 + 0.5 * ((Math.sin(angle) + 1) / 2);
    });
    ring.rotation.z = time * 0.1;

    dust.rotation.y = time * 0.02 + pointer.sx * 0.08;
    dust.position.y = scroll * 2;
    camera.position.x = pointer.sx * 0.45;
    camera.position.y = -pointer.sy * 0.3;
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
          (m as MeshStandardMaterial).map?.dispose?.();
          m.dispose();
        });
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
