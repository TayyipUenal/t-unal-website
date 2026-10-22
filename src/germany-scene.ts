import {
  AmbientLight,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { DE_STATES } from "./globe-data";

/**
 * Germany as a fine golden line map in 3D: the federal states as hairlines,
 * a node for every city we serve, and connections that run out from Dortmund.
 * The map leans back like a table, drifts slowly and follows the pointer.
 * Loaded on demand (see Nationwide); rendering pauses off screen.
 */
export type GermanyScene = { stop: () => void; setTheme: (dark: boolean) => void };

type Options = { still: boolean; dark: boolean };

const HOME = { name: "Dortmund", lon: 7.47, lat: 51.51 };
const CITIES: { name: string; lon: number; lat: number }[] = [
  { name: "Hamburg", lon: 9.99, lat: 53.55 },
  { name: "Berlin", lon: 13.4, lat: 52.52 },
  { name: "München", lon: 11.58, lat: 48.14 },
  { name: "Köln", lon: 6.96, lat: 50.94 },
  { name: "Frankfurt", lon: 8.68, lat: 50.11 },
  { name: "Stuttgart", lon: 9.18, lat: 48.78 },
  { name: "Leipzig", lon: 12.37, lat: 51.34 },
  { name: "Hannover", lon: 9.73, lat: 52.37 },
  { name: "Nürnberg", lon: 11.08, lat: 49.45 },
  { name: "Dresden", lon: 13.74, lat: 51.05 },
  { name: "Bremen", lon: 8.8, lat: 53.08 },
  { name: "Rostock", lon: 12.14, lat: 54.09 },
  { name: "Saarbrücken", lon: 6.99, lat: 49.24 },
  { name: "Kiel", lon: 10.14, lat: 54.32 },
  { name: "Erfurt", lon: 11.03, lat: 50.98 },
  { name: "Magdeburg", lon: 11.63, lat: 52.13 },
  { name: "Freiburg", lon: 7.85, lat: 47.99 },
  { name: "Münster", lon: 7.63, lat: 51.96 },
];

const CENTER = { lon: 10.4, lat: 51.2 };
const SCALE = 1.5; // world units per degree of latitude
const KX = Math.cos((51.2 * Math.PI) / 180);
const project = (lon: number, lat: number) => new Vector3((lon - CENTER.lon) * KX * SCALE, 0, -(lat - CENTER.lat) * SCALE);

function decode(base64: string) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function statesGeometry() {
  const data = decode(DE_STATES);
  const positions: number[] = [];
  for (let i = 0; i < data.length; ) {
    const n = data[i];
    for (let k = 0; k < n - 1; k += 1) {
      const a = project(data[i + 1 + k * 2] / 100, data[i + 2 + k * 2] / 100);
      const b = project(data[i + 1 + (k + 1) * 2] / 100, data[i + 2 + (k + 1) * 2] / 100);
      positions.push(a.x, 0, a.z, b.x, 0, b.z);
    }
    i += 1 + n * 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

export function startGermanyScene(canvas: HTMLCanvasElement, options: Options): GermanyScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1));
  const camera = new PerspectiveCamera(30, 1, 0.1, 200);

  const world = new Group();
  scene.add(world);
  const gold = new Color(0xd6bb85);
  const soft = new Color(0xb08d57);

  // Federal states and borders
  const mapMaterial = new LineBasicMaterial({ color: soft, transparent: true, opacity: 0.75 });
  world.add(new LineSegments(statesGeometry(), mapMaterial));
  // Fine ground grid under the map, like a drawing board
  const gridPositions: number[] = [];
  for (let x = -9; x <= 9; x += 1.5) gridPositions.push(x, -0.02, -8, x, -0.02, 8);
  for (let z = -8; z <= 8; z += 1.5) gridPositions.push(-9, -0.02, z, 9, -0.02, z);
  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute("position", new Float32BufferAttribute(gridPositions, 3));
  const gridMaterial = new LineBasicMaterial({ color: gold, transparent: true, opacity: 0.08 });
  world.add(new LineSegments(gridGeometry, gridMaterial));

  // City nodes
  const nodeMaterial = new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.95 });
  const ringMaterial = new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.5, side: 2, depthWrite: false });
  const nodeGeometry = new CircleGeometry(0.07, 20);
  const ringGeometry = new RingGeometry(0.09, 0.11, 32);
  const rings: { mesh: Mesh; phase: number }[] = [];
  const addNode = (lon: number, lat: number, size: number, phase: number) => {
    const p = project(lon, lat);
    const dot = new Mesh(nodeGeometry, nodeMaterial);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(p.x, 0.01, p.z);
    dot.scale.setScalar(size);
    const ring = new Mesh(ringGeometry, ringMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.012, p.z);
    world.add(dot, ring);
    rings.push({ mesh: ring, phase });
  };
  addNode(HOME.lon, HOME.lat, 2.1, 0);
  CITIES.forEach((city, index) => addNode(city.lon, city.lat, 1, (index + 1) * 0.37));

  // Connections from the home point, lifted above the map
  const homePoint = project(HOME.lon, HOME.lat);
  const STEPS = 48;
  const arcs = CITIES.map((city, index) => {
    const end = project(city.lon, city.lat);
    const mid = homePoint.clone().lerp(end, 0.5);
    mid.y = 0.5 + homePoint.distanceTo(end) * 0.28;
    const curve = new QuadraticBezierCurve3(homePoint.clone(), mid, end);
    const points = curve.getPoints(STEPS);
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({ color: gold, transparent: true, opacity: 0.9 });
    const line = new Line(geometry, material);
    geometry.setDrawRange(0, 0);
    world.add(line);
    return { line, geometry, material, delay: index * 0.42 };
  });

  const apply = (dark: boolean) => {
    mapMaterial.opacity = dark ? 0.75 : 0.9;
    mapMaterial.color.set(dark ? 0xb08d57 : 0x7a5f2c);
    gridMaterial.opacity = dark ? 0.08 : 0.12;
    gridMaterial.color.set(dark ? 0xd6bb85 : 0x7a5f2c);
    const accent = dark ? 0xd6bb85 : 0x8f7038;
    nodeMaterial.color.set(accent);
    arcs.forEach((arc) => arc.material.color.set(accent));
    rings.forEach((ring) => (ring.mesh.material as MeshBasicMaterial).color.set(accent));
  };
  apply(options.dark);

  let width = 1;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(box.width));
    const height = Math.max(1, Math.floor(box.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const span = 10.5;
    const distance = span / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    camera.position.set(0, distance * 0.86, distance * 0.62);
    camera.lookAt(0, 0, 0.3);
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
  const CYCLE = 6.5;
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += options.still ? 0 : dt;

    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2);
    world.rotation.y = Math.sin(time * 0.12) * 0.12 + pointer.sx * 0.16;
    world.rotation.x = pointer.sy * 0.05;

    arcs.forEach((arc, index) => {
      const local = options.still ? 0.6 : ((time + arc.delay) % CYCLE) / CYCLE;
      const head = MathUtils.clamp(local / 0.45, 0, 1);
      const fade = local < 0.7 ? 1 : 1 - (local - 0.7) / 0.3;
      arc.geometry.setDrawRange(0, Math.max(0, Math.floor(head * (STEPS + 1))));
      arc.material.opacity = 0.85 * fade;
      void index;
    });
    rings.forEach(({ mesh, phase }) => {
      const t = ((time * 0.45 + phase) % 1 + 1) % 1;
      mesh.scale.setScalar(1 + t * 2.4);
      (mesh.material as MeshBasicMaterial).opacity = (1 - t) * 0.5;
    });

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
        const item = object as Mesh;
        item.geometry?.dispose?.();
        const material = item.material;
        const list = Array.isArray(material) ? material : material ? [material] : [];
        list.forEach((m) => m.dispose());
      });
      renderer.dispose();
    },
  };
}
