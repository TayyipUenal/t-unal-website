import {
  AdditiveBlending,
  NormalBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  TorusGeometry,
  WebGLRenderer,
  AmbientLight,
  MathUtils,
} from "three";

/**
 * Hero backdrop in real 3D: a faceted crystal with two orbiting rings and a
 * drifting particle field. It reacts to the pointer, to scrolling and to the
 * day/night theme. Loaded on demand (see HeroScene) so it stays out of the
 * first paint. Rendering stops while the hero is off screen or the tab hidden.
 */
export type HeroScene = { stop: () => void; setTheme: (dark: boolean) => void };

const PALETTE = {
  light: { crystal: 0x0a6fa6, edge: 0x0784b8, ring: 0x6cc0e5, dust: 0x0a6fa6, fog: 0.55, dustOpacity: 0.55 },
  dark: { crystal: 0x2a8fc2, edge: 0x8fd3f5, ring: 0x5cc0f0, dust: 0x8fd3f5, fog: 0.9, dustOpacity: 0.9 },
};

export function startHeroScene(canvas: HTMLCanvasElement, options: { still: boolean; dark: boolean; small: boolean }): HeroScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.75));
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  scene.add(new AmbientLight(0xffffff, 0.8));
  const key = new PointLight(0x6cc0e5, 90, 40);
  key.position.set(5, 4, 8);
  const rim = new PointLight(0x0a6fa6, 60, 40);
  rim.position.set(-6, -3, 4);
  scene.add(key, rim);

  // Everything sits on the right, behind the hero visual.
  const rig = new Group();
  rig.position.set(options.small ? 0 : 3.1, 0.2, 0);
  scene.add(rig);

  const crystalGeometry = new IcosahedronGeometry(2.1, 1);
  const crystalMaterial = new MeshStandardMaterial({
    color: PALETTE.light.crystal,
    metalness: 0.65,
    roughness: 0.22,
    flatShading: true,
    transparent: true,
    opacity: 0.88,
  });
  const crystal = new Mesh(crystalGeometry, crystalMaterial);
  const edgeMaterial = new LineBasicMaterial({ color: PALETTE.light.edge, transparent: true, opacity: 0.9 });
  const edges = new LineSegments(new EdgesGeometry(crystalGeometry), edgeMaterial);
  const core = new Mesh(new DodecahedronGeometry(0.9, 0), new MeshStandardMaterial({ color: 0xffffff, emissive: 0x6cc0e5, emissiveIntensity: 0.9, roughness: 0.3 }));
  rig.add(crystal, edges, core);

  const ringMaterial = new MeshStandardMaterial({ color: PALETTE.light.ring, metalness: 0.8, roughness: 0.25 });
  const ringA = new Mesh(new TorusGeometry(3.4, 0.035, 12, 160), ringMaterial);
  const ringB = new Mesh(new TorusGeometry(4.3, 0.025, 12, 180), ringMaterial);
  ringA.rotation.set(1.2, 0.3, 0);
  ringB.rotation.set(0.5, 0.9, 0);
  rig.add(ringA, ringB);

  // Orbiting satellites ride on the rings.
  const satelliteMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x6cc0e5, emissiveIntensity: 1.2 });
  const satA = new Mesh(new IcosahedronGeometry(0.16, 0), satelliteMaterial);
  const satB = new Mesh(new IcosahedronGeometry(0.12, 0), satelliteMaterial);
  ringA.add(satA);
  ringB.add(satB);

  const count = options.small ? 260 : 700;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = MathUtils.randFloatSpread(26);
    positions[i * 3 + 1] = MathUtils.randFloatSpread(15);
    positions[i * 3 + 2] = MathUtils.randFloatSpread(14) - 2;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  const dustMaterial = new PointsMaterial({
    color: PALETTE.light.dust,
    size: 0.045,
    transparent: true,
    opacity: PALETTE.light.dustOpacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const apply = (dark: boolean) => {
    const p = dark ? PALETTE.dark : PALETTE.light;
    crystalMaterial.color = new Color(p.crystal);
    edgeMaterial.color = new Color(p.edge);
    ringMaterial.color = new Color(p.ring);
    dustMaterial.color = new Color(p.dust);
    dustMaterial.opacity = p.dustOpacity;
    dustMaterial.blending = dark ? AdditiveBlending : NormalBlending;
    dustMaterial.needsUpdate = true;
    key.intensity = dark ? 140 : 90;
    edgeMaterial.opacity = dark ? 1 : 0.9;
  };
  apply(options.dark);

  let width = 0;
  let height = 0;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(box.width));
    height = Math.max(1, Math.floor(box.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
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

    crystal.rotation.y = edges.rotation.y = time * 0.28 + pointer.sx * 0.7;
    crystal.rotation.x = edges.rotation.x = time * 0.16 + pointer.sy * 0.5 + scroll * 1.2;
    core.rotation.y = -time * 0.6;
    core.rotation.x = time * 0.4;
    const pulse = 1 + Math.sin(time * 1.6) * 0.04;
    core.scale.setScalar(pulse);
    ringA.rotation.z = time * 0.35;
    ringB.rotation.z = -time * 0.22;
    satA.position.set(3.4, 0, 0);
    satB.position.set(0, 4.3, 0);
    rig.position.y = 0.2 + Math.sin(time * 0.8) * 0.18 + scroll * 1.5;
    rig.rotation.y = pointer.sx * 0.25;
    rig.rotation.x = pointer.sy * 0.18;
    dust.rotation.y = time * 0.02 + pointer.sx * 0.08;
    dust.position.y = scroll * 2;
    camera.position.x = pointer.sx * 0.5;
    camera.position.y = -pointer.sy * 0.35;
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
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
