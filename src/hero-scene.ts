import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Hero centrepiece: a polished gold certification seal. A scalloped rosette
 * with an embossed ring of text and the TÜ monogram, two ribbon tails below,
 * turning slowly and catching the light as the pointer moves. Loaded on demand
 * (see HeroScene); rendering pauses off screen or when the tab is hidden.
 */
export type HeroScene = { stop: () => void; setTheme: (dark: boolean) => void };

type Options = { still: boolean; dark: boolean; small: boolean };

const R = 2.05; // seal radius in world units
const DEPTH = 0.22;

/** Seal face as colour map and matching bump map (white = raised). */
function faceTextures() {
  const size = 1024;
  const paint = (emboss: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    const c = size / 2;
    if (emboss) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, size, size);
    } else {
      const base = g.createRadialGradient(c * 0.8, c * 0.7, 40, c, c, c);
      base.addColorStop(0, "#e3c987");
      base.addColorStop(0.6, "#c4a05a");
      base.addColorStop(1, "#a78443");
      g.fillStyle = base;
      g.fillRect(0, 0, size, size);
    }
    const ink = emboss ? "#fff" : "#6e5321";
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(c, c, c * 0.93, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, c * 0.63, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(c, c, c * 0.88, 0, Math.PI * 2);
    g.stroke();

    // Text on the ring
    const text = "AUDIT  ·  ZERTIFIZIERUNG  ·  SCHULUNG  ·  ";
    const repeated = text + text;
    g.font = '700 54px "Plus Jakarta Sans", "DM Sans", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    const radius = c * 0.755;
    const step = (Math.PI * 2) / repeated.length;
    for (let i = 0; i < repeated.length; i += 1) {
      const angle = -Math.PI / 2 + i * step;
      g.save();
      g.translate(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
      g.rotate(angle + Math.PI / 2);
      g.fillText(repeated[i], 0, 0);
      g.restore();
    }

    // Monogram
    g.font = '800 270px "Plus Jakarta Sans", "DM Sans", sans-serif';
    g.fillText("TÜ", c, c + 6);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(c - 150, c + 150);
    g.lineTo(c + 150, c + 150);
    g.stroke();
    g.font = '600 40px "DM Sans", sans-serif';
    g.fillText("GEPRÜFT · ZERTIFIZIERT", c, c + 196);
    const texture = new CanvasTexture(canvas);
    texture.anisotropy = 8;
    if (!emboss) texture.colorSpace = SRGBColorSpace;
    return texture;
  };
  return { map: paint(false), bump: paint(true) };
}

function rosetteGeometry() {
  const shape = new Shape();
  const lobes = 30;
  const steps = 360;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const r = R * (1 + 0.035 * Math.cos(lobes * a));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -DEPTH / 2);
  return geometry;
}

function ribbonGeometry(width: number, length: number) {
  const shape = new Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, -length);
  shape.lineTo(0, -length + width * 0.55);
  shape.lineTo(-width / 2, -length);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  geometry.translate(0, 0, -0.02);
  return geometry;
}

export function startHeroScene(canvas: HTMLCanvasElement, options: Options): HeroScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const ambient = new AmbientLight(0xffffff, 0.3);
  const key = new DirectionalLight(0xfff0d0, 2.2);
  key.position.set(-4, 6, 8);
  const glint = new PointLight(0xffe2a8, 60, 30);
  glint.position.set(3, 2, 6);
  scene.add(ambient, key, glint);

  const rig = new Group();
  scene.add(rig);
  const seal = new Group();
  rig.add(seal);

  const goldMaterial = new MeshStandardMaterial({ color: 0xc9a45e, metalness: 1, roughness: 0.27, envMapIntensity: 1.5 });
  const rosette = new Mesh(rosetteGeometry(), goldMaterial);
  seal.add(rosette);

  const ring = new Mesh(new TorusGeometry(R * 0.93, 0.045, 16, 140), goldMaterial);
  ring.position.z = DEPTH / 2 + 0.05;
  seal.add(ring);

  const textures = faceTextures();
  const faceMaterial = new MeshStandardMaterial({
    map: textures.map,
    bumpMap: textures.bump,
    bumpScale: 2.2,
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.3,
    envMapIntensity: 1.4,
  });
  const face = new Mesh(new CircleGeometry(R * 0.93, 96), faceMaterial);
  face.position.z = DEPTH / 2 + 0.052;
  seal.add(face);

  // Back: plain polished disc so the turn never shows a hole
  const back = new Mesh(new CircleGeometry(R * 0.93, 96), goldMaterial);
  back.rotation.y = Math.PI;
  back.position.z = -(DEPTH / 2 + 0.052);
  seal.add(back);

  // Ribbon tails
  const ribbonMaterial = new MeshStandardMaterial({ color: 0x4a3e2a, metalness: 0.35, roughness: 0.5 });
  const tails: Mesh[] = [];
  for (const side of [-1, 1]) {
    const tail = new Mesh(ribbonGeometry(0.85, 2.7), ribbonMaterial);
    tail.position.set(side * 0.55, -R * 0.78, -0.12);
    tail.rotation.z = side * 0.16;
    seal.add(tail);
    tails.push(tail);
  }
  const edgeMaterial = new MeshStandardMaterial({ color: 0xc9a45e, metalness: 1, roughness: 0.3 });
  for (const tail of tails) {
    const edge = new Mesh(new PlaneGeometry(0.85, 0.05), edgeMaterial);
    edge.position.set(0, -0.001, 0.025);
    tail.add(edge);
  }

  const apply = (dark: boolean) => {
    ambient.intensity = dark ? 0.25 : 0.4;
    key.intensity = dark ? 2.0 : 2.6;
    goldMaterial.color = new Color(dark ? 0xc9a45e : 0xb8924d);
    ribbonMaterial.color = new Color(dark ? 0x4a3e2a : 0x3a2f1e);
  };
  apply(options.dark);

  let width = 1;
  const place = () => {
    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    rig.position.set(0, 0.55, 0);
    rig.scale.setScalar(Math.min(options.small || width < 781 ? 0.8 : 1.12, halfH / 4.3));
  };
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(box.width));
    const height = Math.max(1, Math.floor(box.height));
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

    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
    const scroll = Math.min(1, window.scrollY / 900);

    seal.rotation.y = Math.sin(time * 0.4) * 0.55 + pointer.sx * 0.35 + scroll * 0.5;
    seal.rotation.x = -pointer.sy * 0.18 + Math.sin(time * 0.3) * 0.04;
    seal.position.y = Math.sin(time * 0.8) * 0.08;
    tails.forEach((tail, i) => {
      tail.rotation.z = (i === 0 ? -1 : 1) * (0.16 + Math.sin(time * 1.1 + i) * 0.035);
    });
    glint.position.set(Math.sin(time * 0.6) * 4.5, 2 + Math.cos(time * 0.5), 6);

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
          standard.bumpMap?.dispose?.();
          m.dispose();
        });
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
