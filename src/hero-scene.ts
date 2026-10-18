import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Hero centrepiece: three graphite monoliths, one per standard, on a fine
 * plinth with a single thin ring. No decoration: polished material, hairline
 * edges, slow movement that follows the pointer a little. Loaded on demand
 * (see HeroScene); rendering pauses off screen or when the tab is hidden.
 */
export type HeroScene = { stop: () => void; setTheme: (dark: boolean) => void };

type Options = { still: boolean; dark: boolean; small: boolean };

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

function faceTexture(number: string, name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#2b2f36";
  g.fillRect(0, 0, 512, 1024);
  // very fine vertical lines, like brushed metal
  for (let x = 0; x < 512; x += 8) {
    g.fillStyle = x % 16 === 0 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.05)";
    g.fillRect(x, 0, 2, 1024);
  }
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(48, 896, 56, 2);
  g.fillStyle = "rgba(255,255,255,0.88)";
  g.textBaseline = "alphabetic";
  g.font = '500 66px "Plus Jakarta Sans", "DM Sans", sans-serif';
  g.fillText(number, 48, 960);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.font = '400 30px "DM Sans", sans-serif';
  g.fillText(name, 48, 1000);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const TOWERS = [
  { x: -1.55, z: 0.35, h: 3.3, number: "9001", name: "Qualität" },
  { x: 0, z: -0.25, h: 4.7, number: "14001", name: "Umwelt" },
  { x: 1.55, z: 0.35, h: 2.6, number: "45001", name: "Arbeitsschutz" },
];

export function startHeroScene(canvas: HTMLCanvasElement, options: Options): HeroScene {
  const edge = token("--blue-300", 0xe6d3a8);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.6, 15);

  const ambient = new AmbientLight(0xffffff, 0.35);
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-5, 8, 7);
  const rim = new PointLight(edge, 140, 40);
  rim.position.set(6, 3, -4);
  scene.add(ambient, key, rim);

  const rig = new Group();
  scene.add(rig);
  const stage = new Group();
  rig.add(stage);

  // Plinth and ring
  const plinthMaterial = new MeshStandardMaterial({ color: 0x20262e, metalness: 0.7, roughness: 0.35 });
  const plinth = new Mesh(new CircleGeometry(3.7, 96), plinthMaterial);
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.y = -2.4;
  stage.add(plinth);
  const ringLineMaterial = new MeshBasicMaterial({ color: edge, transparent: true, opacity: 0.55 });
  const plinthRing = new Mesh(new RingGeometry(3.68, 3.7, 128), ringLineMaterial);
  plinthRing.rotation.x = -Math.PI / 2;
  plinthRing.position.y = -2.39;
  stage.add(plinthRing);
  const halo = new Mesh(new TorusGeometry(4.6, 0.006, 6, 220), ringLineMaterial);
  halo.rotation.x = Math.PI / 2.35;
  halo.position.y = -0.4;
  stage.add(halo);

  // Monoliths
  const edgeMaterial = new LineBasicMaterial({ color: edge, transparent: true, opacity: 0.6 });
  const bodyMaterial = new MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.9, roughness: 0.3 });
  const towers: Group[] = [];
  for (const spec of TOWERS) {
    const group = new Group();
    const geometry = new BoxGeometry(1.15, spec.h, 1.15);
    const front = new MeshStandardMaterial({
      map: faceTexture(spec.number, spec.name),
      metalness: 0.7,
      roughness: 0.35,
    });
    // +x, -x, +y, -y, +z (front), -z
    const body = new Mesh(geometry, [bodyMaterial, bodyMaterial, bodyMaterial, bodyMaterial, front, bodyMaterial]);
    const lines = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    group.add(body, lines);
    group.position.set(spec.x, -2.4 + spec.h / 2, spec.z);
    stage.add(group);
    towers.push(group);
  }

  const apply = (dark: boolean) => {
    edgeMaterial.opacity = dark ? 0.9 : 0.7;
    ringLineMaterial.opacity = dark ? 0.6 : 0.4;
    plinthMaterial.color = new Color(dark ? 0x1d1d1d : 0x2a2a2a);
    ambient.intensity = dark ? 0.25 : 0.4;
    key.intensity = dark ? 2.0 : 2.6;
  };
  apply(options.dark);

  let width = 1;
  const place = () => {
    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    if (options.small || width < 781) {
      rig.position.set(0, -halfH * 0.42, 0);
      rig.scale.setScalar(0.55);
    } else {
      rig.position.set(halfW * 0.6, 0.9, 0);
      rig.scale.setScalar(Math.min(0.9, halfH / 5.2));
    }
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

    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.2);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.2);
    const scroll = Math.min(1, window.scrollY / 900);

    stage.rotation.y = -0.5 + Math.sin(time * 0.18) * 0.22 + pointer.sx * 0.18 + scroll * 0.4;
    stage.rotation.x = -pointer.sy * 0.04;
    halo.rotation.z = time * 0.03;
    towers.forEach((tower, i) => {
      tower.position.y = -2.4 + TOWERS[i].h / 2 + Math.sin(time * 0.5 + i * 1.7) * 0.025;
    });
    camera.position.x = pointer.sx * 0.25;
    camera.position.y = 0.6 - pointer.sy * 0.15;
    camera.lookAt(0, -0.2, 0);

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
