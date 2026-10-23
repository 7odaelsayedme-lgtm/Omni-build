import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const C = {
  dark: 0x10141f,
  ink: 0x171c2a,
  light: 0xf3f1ec,
  slab: 0xe6e2da,
  red: 0xe1302e,
  redHot: 0xff5a4e,
  water: 0x4fa3ff,
  glass: 0x2a3550,
  winOff: 0x0e1524,
  winOn: 0xffd59a,
  leaf: 0x3f8f4e,
  leaf2: 0x5aa860,
  trunk: 0x8a6a4a,
};

const FLOORS = 7;
const FH = 0.62; // floor height
const W = 3.2, D = 2.4;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(C.dark, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.dark, 20, 46);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);

  // ---------- lights
  scene.add(new THREE.HemisphereLight(0xcdd6ff, C.dark, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1e0, 1.7);
  sun.position.set(7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const glow = new THREE.PointLight(C.red, 6, 14, 2);
  glow.position.set(-3, 0.8, 3);
  scene.add(glow);

  // ---------- world root (rotates slowly)
  const world = new THREE.Group();
  scene.add(world);

  // ground + plinth
  const grid = new THREE.GridHelper(80, 80, 0x232a3c, 0x1a2030);
  grid.position.y = -0.01;
  scene.add(grid);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.6, 0.3, 96),
    new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.85, metalness: 0.1 })
  );
  plinth.position.y = 0.15;
  plinth.receiveShadow = true;
  world.add(plinth);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(5.48, 0.025, 8, 160),
    new THREE.MeshBasicMaterial({ color: C.red })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  world.add(rim);

  const G = 0.3; // ground level on plinth

  // ---------- building
  const building = new THREE.Group();
  building.position.y = G;
  world.add(building);

  const slabMat = new THREE.MeshStandardMaterial({ color: C.slab, roughness: 0.6, metalness: 0.05 });
  const colMat = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.7 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: C.glass, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.88,
    envMapIntensity: 1.4, clearcoat: 1,
  });
  const slabGeo = new THREE.BoxGeometry(W + 0.24, 0.1, D + 0.24);
  const glassGeo = new THREE.BoxGeometry(W - 0.1, FH - 0.1, D - 0.1);
  const colGeo = new THREE.BoxGeometry(0.12, FH - 0.1, 0.12);

  // windows as one instanced mesh
  const winPerSideX = 6, winPerSideZ = 4;
  const winCount = FLOORS * (winPerSideX * 2 + winPerSideZ * 2);
  const winGeo = new THREE.PlaneGeometry(0.36, FH - 0.24);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
  const windows = new THREE.InstancedMesh(winGeo, winMat, winCount);
  const winData = []; // {floor, threshold}
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  const cOff = new THREE.Color(C.winOff), cOn = new THREE.Color(C.winOn), cTmp = new THREE.Color();

  const floors = [];
  for (let i = 0; i < FLOORS; i++) {
    const f = new THREE.Group();
    const baseY = i * FH;
    f.userData.baseY = baseY;
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = 0.05;
    slab.castShadow = slab.receiveShadow = true;
    f.add(slab);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = FH / 2 + 0.05;
    f.add(glass);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x * (W / 2 - 0.02), FH / 2 + 0.05, z * (D / 2 - 0.02));
      col.castShadow = true;
      f.add(col);
    }
    floors.push(f);
    building.add(f);
  }
  // roof slab
  const roof = new THREE.Mesh(slabGeo, slabMat);
  roof.castShadow = true;
  building.add(roof);

  // window placements (relative to building)
  let wi = 0;
  const placeWin = (x, y, z, ry, floor) => {
    q.setFromEuler(new THREE.Euler(0, ry, 0));
    m4.compose(new THREE.Vector3(x, y, z), q, s1);
    windows.setMatrixAt(wi, m4);
    windows.setColorAt(wi, cOff);
    winData.push({ floor, t: Math.random() * 0.85, flick: Math.random() * 6.28 });
    wi++;
  };
  for (let i = 0; i < FLOORS; i++) {
    const y = i * FH + FH / 2 + 0.05;
    for (let k = 0; k < winPerSideX; k++) {
      const x = -W / 2 + 0.33 + k * ((W - 0.66) / (winPerSideX - 1));
      placeWin(x, y, D / 2 - 0.035, 0, i);
      placeWin(x, y, -D / 2 + 0.035, Math.PI, i);
    }
    for (let k = 0; k < winPerSideZ; k++) {
      const z = -D / 2 + 0.36 + k * ((D - 0.72) / (winPerSideZ - 1));
      placeWin(W / 2 - 0.035, y, z, Math.PI / 2, i);
      placeWin(-W / 2 + 0.035, y, z, -Math.PI / 2, i);
    }
  }
  windows.instanceColor.needsUpdate = true;
  building.add(windows);

  // ---------- brand mark on the roof (red top bar + three bars)
  const mark = new THREE.Group();
  const markMatL = new THREE.MeshStandardMaterial({ color: C.light, roughness: 0.4 });
  const markMatR = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.35, emissive: C.red, emissiveIntensity: 0.35 });
  const bar = (w, h, x, y, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    mark.add(m);
  };
  // 100-unit logo scaled to 1.1
  const S = 1.1 / 100;
  const r = (x, y, w, h, mat) => bar(w * S, h * S, (x + w / 2 - 50) * S, (50 - (y + h / 2)) * S, mat);
  r(0, 0, 72, 24, markMatR);
  r(78, 0, 22, 72, markMatL);
  r(28, 78, 72, 22, markMatL);
  r(0, 30, 22, 70, markMatL);
  mark.position.set(0, FLOORS * FH + 1.05, 0);
  building.add(mark);

  // ---------- crane
  const crane = new THREE.Group();
  const craneMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.5, metalness: 0.3 });
  const craneDark = new THREE.MeshStandardMaterial({ color: 0x3a4157, roughness: 0.6 });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.6, 0.22), craneMat);
  mast.position.y = 3.8;
  mast.castShadow = true;
  crane.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 0.16), craneMat);
  jib.position.set(1.4, 7.5, 0);
  jib.castShadow = true;
  crane.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), craneDark);
  counter.position.set(-1.15, 7.3, 0);
  crane.add(counter);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), craneDark);
  cab.position.set(0.25, 7.2, 0);
  crane.add(cab);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), craneDark);
  crane.add(cable);
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), slabMat);
  load.castShadow = true;
  crane.add(load);
  crane.position.set(-3.1, G, -1.9);
  crane.rotation.y = 0.5;
  world.add(crane);

  // ---------- facility management: service risers + pulses + scan ring
  const fm = new THREE.Group();
  building.add(fm);
  const riserH = FLOORS * FH;
  const riserDefs = [
    { x: -0.9, z: -0.5, color: C.redHot },   // electrical
    { x: -0.55, z: -0.5, color: C.water },   // water
    { x: -0.2, z: -0.5, color: 0xbfc6d6 },   // hvac
  ];
  const risers = [];
  riserDefs.forEach((d) => {
    const mat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.95, toneMapped: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, riserH, 10), mat);
    m.geometry.translate(0, riserH / 2, 0);
    m.position.set(d.x, 0.1, d.z);
    fm.add(m);
    risers.push(m);
    // branches on each floor
    for (let i = 0; i < FLOORS; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.04), mat);
      b.position.set(d.x + 0.95, i * FH + 0.2 + risers.length * 0.05, d.z);
      b.userData.branch = true;
      fm.add(b);
    }
  });
  const pulseCount = 36;
  const pulses = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.1, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    pulseCount
  );
  const pulseData = [];
  for (let i = 0; i < pulseCount; i++) {
    const d = riserDefs[i % 3];
    pulseData.push({ x: d.x, z: d.z, off: Math.random(), speed: 0.12 + Math.random() * 0.08 });
    pulses.setColorAt(i, new THREE.Color(d.color));
  }
  pulses.instanceColor.needsUpdate = true;
  fm.add(pulses);

  const scanMat = new THREE.MeshBasicMaterial({ color: C.redHot, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
  const scan = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.03, D + 0.5), scanMat);
  const scanEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.5, 0.03, D + 0.5)),
    new THREE.LineBasicMaterial({ color: C.redHot, transparent: true, opacity: 0 })
  );
  scan.add(scanEdges);
  building.add(scan);

  // ---------- smart: hub + wifi waves + sensors
  const smart = new THREE.Group();
  building.add(smart);
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 24),
    new THREE.MeshBasicMaterial({ color: C.winOn, toneMapped: false, transparent: true })
  );
  hub.position.set(1.0, FLOORS * FH + 0.3, 0.6);
  smart.add(hub);
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: C.winOn, transparent: true, opacity: 0, toneMapped: false })
    );
    w.rotation.x = Math.PI / 2;
    w.position.copy(hub.position);
    w.userData.off = i / 3;
    smart.add(w);
    waves.push(w);
  }
  // sensor dots on facade
  const sensors = [];
  for (let i = 0; i < 10; i++) {
    const sMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0, toneMapped: false })
    );
    const side = i % 2 ? 1 : -1;
    sMesh.position.set(side * (W / 2 + 0.03), (i >> 1) * FH * 1.4 + 0.5, (Math.random() - 0.5) * (D - 0.6));
    sMesh.userData.off = Math.random() * 6.28;
    smart.add(sMesh);
    sensors.push(sMesh);
  }

  // ---------- landscaping
  const land = new THREE.Group();
  world.add(land);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x2e5d36, roughness: 0.95, transparent: true, opacity: 0 });
  const lawn = new THREE.Mesh(new THREE.RingGeometry(2.6, 5.15, 96), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = G + 0.005;
  lawn.receiveShadow = true;
  land.add(lawn);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9, transparent: true, opacity: 0 });
  const tiles = [];
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.42), pathMat);
    t.position.set(0, G + 0.02, D / 2 + 0.6 + i * 0.6);
    t.receiveShadow = true;
    land.add(t);
    tiles.push(t);
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 0.9 });
  const frondMat = new THREE.MeshStandardMaterial({ color: C.leaf2, roughness: 0.8, side: THREE.DoubleSide });
  const bushMat = new THREE.MeshStandardMaterial({ color: C.leaf, roughness: 0.85, flatShading: true });
  const flowerMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.6 });

  const makePalm = (h) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, h, 8), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const frondGeo = new THREE.ConeGeometry(0.11, 1.0, 3, 1, true);
    frondGeo.translate(0, 0.5, 0);
    for (let k = 0; k < 7; k++) {
      const fr = new THREE.Mesh(frondGeo, frondMat);
      fr.scale.set(1, 1, 0.25);
      fr.position.y = h;
      fr.rotation.set(1.15 + Math.random() * 0.25, (k / 7) * Math.PI * 2, 0, 'YXZ');
      fr.castShadow = true;
      g.add(fr);
    }
    return g;
  };
  const makeTree = (s) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5 * s, 6), trunkMat);
    trunk.position.y = 0.25 * s;
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), bushMat);
    crown.position.y = 0.7 * s;
    crown.castShadow = true;
    g.add(crown);
    return g;
  };
  const makeBush = () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), bushMat);
    b.position.y = 0.16;
    b.castShadow = true;
    g.add(b);
    for (let k = 0; k < 3; k++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), flowerMat);
      fl.position.set(Math.cos(k * 2.1) * 0.16, 0.3, Math.sin(k * 2.1) * 0.16);
      g.add(fl);
    }
    return g;
  };

  const plants = [];
  const addPlant = (obj, angle, radius, delay) => {
    obj.position.set(Math.cos(angle) * radius, G, Math.sin(angle) * radius);
    obj.rotation.y = Math.random() * 6.28;
    obj.scale.setScalar(0.0001);
    obj.userData.delay = delay;
    land.add(obj);
    plants.push(obj);
  };
  const palmAngles = [0.35, 1.2, 2.2, 3.0, 3.9, 4.7, 5.6];
  palmAngles.forEach((a, i) => addPlant(makePalm(1.6 + Math.random() * 0.8), a, 4.25 + Math.random() * 0.5, i * 0.06));
  for (let i = 0; i < 9; i++) addPlant(makeTree(0.9 + Math.random() * 0.5), i * 0.71 + 0.2, 3.4 + Math.random() * 1.2, 0.1 + i * 0.04);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.08) continue; // keep path clear
    addPlant(makeBush(), a, 2.9 + (i % 2) * 0.3, 0.2 + i * 0.02);
  }

  // ---------- dust particles for depth
  const dustGeo = new THREE.BufferGeometry();
  const dustN = 380;
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 40;
    dp[i * 3 + 1] = Math.random() * 16;
    dp[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8a93aa, size: 0.035, transparent: true, opacity: 0.5 }));
  scene.add(dust);

  // ---------- camera keyframes (hero, build, fm, smart, land)
  const keys = [
    { p: [14, 8, 16.5], t: [0, 2.4, 0] },
    { p: [11, 6, 12.5], t: [0, 2.2, 0] },
    { p: [7.8, 4.8, 9.2], t: [0, 2.4, 0] },
    { p: [-10, 7, 11], t: [0, 2.6, 0] },
    { p: [12.5, 11, 8.5], t: [0, 1.0, 0] },
  ];
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3();
  function cameraAt(focus) {
    const i = Math.min(keys.length - 2, Math.floor(focus));
    const t = smooth(0, 1, focus - i);
    camPos.lerpVectors(vA.fromArray(keys[i].p), vB.fromArray(keys[i + 1].p), t);
    camTgt.lerpVectors(vA.fromArray(keys[i].t), vB.fromArray(keys[i + 1].t), t);
  }

  // ---------- state driven from outside
  const state = {
    intro: 0,      // 0..1 build-up on load
    focus: 0,      // 0..4 scroll position through the journey
    side: 1,       // +1 subject on left (RTL), -1 on right (LTR)
    mobile: false,
    active: true,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let vw = 1, vh = 1;
  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    state.mobile = vw < 900;
    camera.aspect = vw / vh;
    camera.fov = state.mobile ? 48 : 36;
    applyOffset();
  }
  function applyOffset() {
    if (state.mobile) {
      camera.setViewOffset(vw, vh, 0, vh * 0.2, vw, vh);
    } else {
      camera.setViewOffset(vw, vh, state.side * vw * 0.2, 0, vw, vh);
    }
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- frame loop
  const clock = new THREE.Clock();
  let time = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!state.active) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    const f = state.focus;

    // stage weights
    const buildP = state.intro;
    const craneV = 1 - smooth(1.4, 1.9, f);
    const fmV = smooth(1.3, 1.9, f);
    const xray = smooth(1.3, 1.9, f) * (1 - smooth(2.4, 2.9, f));
    const smartV = smooth(2.3, 2.9, f);
    const landV = smooth(3.2, 3.9, f);

    // build floors
    floors.forEach((fl, i) => {
      const local = clamp01(buildP * (FLOORS + 1.5) - i);
      const e = easeOut(local);
      fl.visible = local > 0.001;
      fl.position.y = fl.userData.baseY + (1 - e) * 2.4;
      fl.scale.set(0.9 + 0.1 * e, 1, 0.9 + 0.1 * e);
    });
    const roofLocal = clamp01(buildP * (FLOORS + 1.5) - FLOORS);
    roof.visible = roofLocal > 0.001;
    roof.position.y = FLOORS * FH + 0.05 + (1 - easeOut(roofLocal)) * 2.4;
    const markP = easeOut(clamp01(buildP * (FLOORS + 1.5) - FLOORS - 0.5));
    mark.scale.setScalar(Math.max(0.0001, markP));
    mark.rotation.y = state.reduced ? 0.5 : Math.sin(time * 0.6) * 0.5 + 0.3;
    windows.visible = buildP > 0.05;

    // crane
    crane.scale.setScalar(Math.max(0.0001, craneV));
    crane.visible = craneV > 0.01;
    const swing = state.reduced ? 0 : Math.sin(time * 0.4) * 0.35;
    crane.rotation.y = 0.5 + swing;
    const hookY = 2.2 + Math.sin(time * 0.7) * 1.4 + 1.8 * (1 - buildP);
    cable.scale.y = 7.45 - hookY;
    cable.position.set(3.4, (7.45 + hookY) / 2, 0);
    load.position.set(3.4, hookY - 0.06, 0);

    // glass x-ray
    glassMat.opacity = 0.88 - xray * 0.7;
    winMat.opacity = 1 - xray * 0.8;

    // FM
    fm.visible = fmV > 0.01;
    risers.forEach((rM) => { rM.scale.y = Math.max(0.001, fmV); });
    fm.children.forEach((ch) => { if (ch.userData.branch) ch.scale.x = Math.max(0.001, smooth(0.3, 1, fmV)); });
    for (let i = 0; i < pulseCount; i++) {
      const d = pulseData[i];
      const y = ((d.off + time * d.speed) % 1) * riserH * fmV;
      m4.makeTranslation(d.x, y + 0.1, d.z);
      pulses.setMatrixAt(i, m4);
    }
    pulses.instanceMatrix.needsUpdate = true;
    const scanT = (Math.sin(time * 0.9) * 0.5 + 0.5);
    scan.position.y = 0.1 + scanT * riserH;
    scanMat.opacity = xray * 0.18;
    scanEdges.material.opacity = xray * 0.9;

    // windows / smart lighting
    for (let i = 0; i < winData.length; i++) {
      const w = winData[i];
      let on = smooth(w.t, w.t + 0.15, smartV);
            cTmp.copy(cOff).lerp(cOn, on);
      windows.setColorAt(i, cTmp);
    }
    windows.instanceColor.needsUpdate = true;
    smart.visible = smartV > 0.01;
    hub.material.opacity = smartV;
    hub.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
    waves.forEach((w) => {
      const p = (time * 0.35 + w.userData.off) % 1;
      w.scale.setScalar(0.4 + p * 4.2);
      w.material.opacity = (1 - p) * 0.7 * smartV;
    });
    sensors.forEach((sM) => { sM.material.opacity = smartV * (0.5 + 0.5 * Math.sin(time * 4 + sM.userData.off)); });

    // landscaping
    lawnMat.opacity = landV * 0.95;
    pathMat.opacity = landV;
    tiles.forEach((t, i) => { t.scale.y = Math.max(0.001, smooth(i * 0.08, i * 0.08 + 0.3, landV)); });
    plants.forEach((p) => {
      const v = easeOut(clamp01((landV - p.userData.delay) / 0.45));
      p.scale.setScalar(Math.max(0.0001, v));
    });

    // glow pulse
    glow.intensity = 5 + Math.sin(time * 1.5) * 1.5;

    // world idle rotation
    if (!state.reduced) world.rotation.y = Math.sin(time * 0.08) * 0.35;
    dust.rotation.y = time * 0.01;

    // camera
    cameraAt(f);
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
    const par = state.reduced || state.mobile ? 0 : 1;
    camera.position.set(camPos.x + mouse.sx * 0.8 * par, camPos.y - mouse.sy * 0.5 * par, camPos.z);
    camera.lookAt(camTgt);

    renderer.render(scene, camera);
  }
  frame();

  return {
    state,
    setSide(side) { state.side = side; applyOffset(); },
  };
}
