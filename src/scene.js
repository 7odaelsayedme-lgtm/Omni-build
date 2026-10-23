import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const C = {
  dark: 0x10141f,
  ink: 0x171c2a,
  light: 0xf3f1ec,
  red: 0xe1302e,
  redHot: 0xff5a4e,
  water: 0x4fa3ff,
  concrete: 0x777b84,
  block: 0x948d82,
  sand: 0xe0caa4,
  trim: 0xc3a57a,
  wood: 0x6e4528,
  pit: 0x2b241e,
  yard: 0x8d7c62,
  winOff: 0x141b2a,
  winOn: 0xffd08a,
  leaf: 0x3f8f4e,
  leaf2: 0x5aa860,
  trunk: 0x8a6a4a,
};

// villa volumes (Najdi-inspired: stacked cubic masses, flat roofs, crenellated parapets)
const B = 0.1; // top of the raft foundation
const SL = 0.08; // slab thickness
const VOL = [
  { id: 'g', x0: -2.2, x1: 1.4, z0: -2.2, z1: 0.6, y0: B, h: 1.05 },          // ground floor
  { id: 'm', x0: 1.4, x1: 3.0, z0: -1.6, z1: 0.3, y0: B, h: 0.9 },            // majlis wing
  { id: 'f', x0: -2.2, x1: 0.8, z0: -2.2, z1: 0.3, y0: B + 1.05 + SL, h: 1.0 }, // first floor
];
VOL.push({ id: 'a', x0: -2.1, x1: -1.0, z0: -2.1, z1: -1.1, y0: VOL[2].y0 + 1.0 + SL, h: 0.6 }); // roof annex
const TOP = VOL[3].y0 + VOL[3].h + SL;
const DOOR_X = -0.4;
const PLOT = { x: 4, z: 3.3, wallH: 0.55 };
const GATE = [-1.0, 0.2];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const tiny = (v) => Math.max(0.0001, v);

function latticeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#7a4e2d';
  g.lineWidth = 7;
  g.strokeRect(3, 3, 122, 122);
  g.lineWidth = 4;
  for (let i = -128; i <= 128; i += 21) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(C.dark, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.dark, 18, 42);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);

  // ---------- lights (warm dusk)
  scene.add(new THREE.HemisphereLight(0xd6dcff, 0x2a2420, 0.6));
  const sun = new THREE.DirectionalLight(0xffe2bd, 1.6);
  sun.position.set(8, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

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
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.48, 0.025, 8, 160), new THREE.MeshBasicMaterial({ color: C.red }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  world.add(rim);

  const G = 0.3;
  const site = new THREE.Group(); // everything on the plot, y=0 is plinth top
  site.position.y = G;
  world.add(site);

  // ---------- materials
  const concreteMat = new THREE.MeshStandardMaterial({ color: C.concrete, roughness: 0.92 });
  const wallMat = new THREE.MeshStandardMaterial({ color: C.block, roughness: 0.88, transparent: false });
  const trimMat = new THREE.MeshStandardMaterial({ color: C.trim, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.65 });
  const membraneMat = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.7 });
  const cBlock = new THREE.Color(C.block), cSand = new THREE.Color(C.sand);

  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // box whose origin sits on its base so scale.y grows it upward
  const riser = (w, h, d, mat, x, y, z, parent) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------- 1. excavation + foundation
  const pitMat = new THREE.MeshStandardMaterial({ color: C.pit, roughness: 1, transparent: true, opacity: 0 });
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.6), pitMat);
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0.4, 0.004, -0.8);
  pit.receiveShadow = true;
  site.add(pit);
  const raft = riser(5.4, B, 3.0, concreteMat, 0.4, 0, -0.8, site);
  const rebarPts = [];
  for (let x = -2.25; x <= 3.05; x += 0.22) rebarPts.push(x, B * 0.6, -2.25, x, B * 0.6, 0.65);
  for (let z = -2.25; z <= 0.65; z += 0.22) rebarPts.push(-2.25, B * 0.6, z, 3.05, B * 0.6, z);
  const rebarGeo = new THREE.BufferGeometry();
  rebarGeo.setAttribute('position', new THREE.Float32BufferAttribute(rebarPts, 3));
  const rebar = new THREE.LineSegments(rebarGeo, new THREE.LineBasicMaterial({ color: 0xc8703a, transparent: true, opacity: 0 }));
  site.add(rebar);

  // ---------- 2-3. frame, slabs, walls per volume
  const vols = VOL.map((v) => {
    const w = v.x1 - v.x0, d = v.z1 - v.z0, cx = (v.x0 + v.x1) / 2, cz = (v.z0 + v.z1) / 2;
    const o = { ...v, w, d, cx, cz, cols: [] };
    const g = new THREE.Group();
    site.add(g);
    o.group = g;
    const nx = Math.max(1, Math.round(w / 1.2)), nz = Math.max(1, Math.round(d / 1.2));
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
      if (i > 0 && i < nx && k > 0 && k < nz) continue;
      const x = v.x0 + 0.06 + (w - 0.12) * (i / nx), z = v.z0 + 0.06 + (d - 0.12) * (k / nz);
      o.cols.push(riser(0.1, v.h, 0.1, concreteMat, x, v.y0, z, g));
    }
    o.slab = box(w + 0.08, SL, d + 0.08, concreteMat, cx, v.y0 + v.h + SL / 2, cz, g);
    o.wall = riser(w, v.h, d, wallMat, cx, v.y0, cz, g);
    o.membrane = box(w - 0.06, 0.015, d - 0.06, membraneMat, cx, v.y0 + v.h + SL + 0.008, cz, g);
    return o;
  });
  const V = Object.fromEntries(vols.map((v) => [v.id, v]));

  // ---------- windows, frames, Najdi triangle vents
  const winGeo = new THREE.PlaneGeometry(0.2, 1);
  const frameGeo = new THREE.PlaneGeometry(0.3, 1);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
  const winSpecs = []; // {vol, x,y,z, ry, h}
  const faceWins = (v, face, spacing, skip) => {
    const along = face === 'front' || face === 'back' ? [v.x0, v.x1] : [v.z0, v.z1];
    const len = along[1] - along[0];
    const n = Math.max(1, Math.floor((len - 0.3) / spacing));
    const h = v.h * 0.52;
    const y = v.y0 + v.h * 0.47;
    for (let i = 0; i < n; i++) {
      const t = along[0] + (len / n) * (i + 0.5);
      if (skip && skip(t)) continue;
      if (face === 'front') winSpecs.push({ vol: v.id, x: t, y, z: v.z1, ry: 0, h });
      if (face === 'back') winSpecs.push({ vol: v.id, x: t, y, z: v.z0, ry: Math.PI, h });
      if (face === 'right') winSpecs.push({ vol: v.id, x: v.x1, y, z: t, ry: Math.PI / 2, h });
      if (face === 'left') winSpecs.push({ vol: v.id, x: v.x0, y, z: t, ry: -Math.PI / 2, h });
    }
  };
  faceWins(V.g, 'front', 0.6, (x) => Math.abs(x - DOOR_X) < 0.5);
  faceWins(V.g, 'left', 0.6);
  faceWins(V.g, 'back', 0.6);
  faceWins(V.m, 'front', 0.5);
  faceWins(V.m, 'right', 0.55);
  faceWins(V.f, 'front', 0.55, (x) => x > -1.45 && x < -0.35);
  faceWins(V.f, 'left', 0.55);
  faceWins(V.f, 'back', 0.55);
  faceWins(V.f, 'right', 0.55);
  faceWins(V.a, 'front', 0.5);
  faceWins(V.a, 'right', 0.5);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const place = (mesh, i, x, y, z, ry, sx = 1, sy = 1, sz = 1) => {
    q.setFromEuler(e3.set(0, ry, 0));
    m4.compose(v3.set(x, y, z), q, s3.set(sx, sy, sz));
    mesh.setMatrixAt(i, m4);
  };
  const offs = (s, d) => [s.x + Math.sin(s.ry) * d, s.z + Math.cos(s.ry) * d];

  const winByVol = {}, frameByVol = {}, winData = {};
  const cOff = new THREE.Color(C.winOff), cOn = new THREE.Color(C.winOn), cTmp = new THREE.Color();
  for (const v of vols) {
    const list = winSpecs.filter((s) => s.vol === v.id);
    const wm = new THREE.InstancedMesh(winGeo, winMat, list.length);
    const fm = new THREE.InstancedMesh(frameGeo, trimMat, list.length);
    winData[v.id] = [];
    list.forEach((s, i) => {
      const [wx, wz] = offs(s, 0.022);
      place(wm, i, wx, s.y, wz, s.ry, 1, s.h);
      wm.setColorAt(i, cOff);
      const [fx, fz] = offs(s, 0.012);
      place(fm, i, fx, s.y + 0.02, fz, s.ry, 1, s.h + 0.12);
      winData[v.id].push({ t: Math.random() * 0.85 });
    });
    wm.instanceColor.needsUpdate = true;
    site.add(wm, fm);
    winByVol[v.id] = wm;
    frameByVol[v.id] = fm;
  }

  // triangle vents under the parapet on the street facades
  const tri = new THREE.Shape();
  tri.moveTo(-0.045, 0); tri.lineTo(0.045, 0); tri.lineTo(0, 0.08); tri.lineTo(-0.045, 0);
  const ventSpecs = [];
  for (const v of [V.g, V.m, V.f]) {
    for (let x = v.x0 + 0.18; x < v.x1 - 0.12; x += 0.17) {
      if (v.id === 'g' && x < V.f.x1 + 0.05) continue; // hidden behind the upper floor
      ventSpecs.push([x, v.y0 + v.h - 0.16, v.z1 + 0.012]);
    }
  }
  const vents = new THREE.InstancedMesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: 0x3a2a1c }), ventSpecs.length);
  ventSpecs.forEach((p, i) => place(vents, i, p[0], p[1], p[2], 0));
  site.add(vents);

  // ---------- parapets + crenellations (shurfat)
  const parapetG = new THREE.Group();
  site.add(parapetG);
  const crenSpecs = [];
  const parapetSeg = (xa, za, xb, zb, y, inward, parent, specs, ph = 0.13) => {
    const len = Math.hypot(xb - xa, zb - za);
    const horiz = Math.abs(zb - za) < 1e-6;
    const [ix, iz] = inward;
    const cx = (xa + xb) / 2 + ix * 0.03, cz = (za + zb) / 2 + iz * 0.03;
    box(horiz ? len : 0.06, ph, horiz ? 0.06 : len, trimMat, cx, y + ph / 2, cz, parent);
    const n = Math.floor(len / 0.19);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      specs.push([xa + (xb - xa) * t + ix * 0.03, y + ph, za + (zb - za) * t + iz * 0.03]);
    }
  };
  const roofY = (v) => v.y0 + v.h + SL;
  const rect = (v, sides) => {
    const y = roofY(v);
    if (sides.includes('front')) parapetSeg(v.x0, v.z1, v.x1, v.z1, y, [0, -1], parapetG, crenSpecs);
    if (sides.includes('back')) parapetSeg(v.x0, v.z0, v.x1, v.z0, y, [0, 1], parapetG, crenSpecs);
    if (sides.includes('left')) parapetSeg(v.x0, v.z0, v.x0, v.z1, y, [1, 0], parapetG, crenSpecs);
    if (sides.includes('right')) parapetSeg(v.x1, v.z0, v.x1, v.z1, y, [-1, 0], parapetG, crenSpecs);
  };
  rect(V.f, ['front', 'back', 'left', 'right']);
  rect(V.a, ['front', 'back', 'left', 'right']);
  rect(V.m, ['front', 'back', 'right']);
  // ground roof terrace: only the exposed L around the first floor
  {
    const y = roofY(V.g);
    parapetSeg(V.g.x0, V.g.z1, V.g.x1, V.g.z1, y, [0, -1], parapetG, crenSpecs);
    parapetSeg(V.g.x1, V.g.z0, V.g.x1, V.g.z1, y, [-1, 0], parapetG, crenSpecs);
    parapetSeg(V.f.x1, V.g.z0, V.g.x1, V.g.z0, y, [0, 1], parapetG, crenSpecs);
    parapetSeg(V.g.x0, V.f.z1, V.g.x0, V.g.z1, y, [1, 0], parapetG, crenSpecs);
  }
  const crenGeo = new THREE.ConeGeometry(0.055, 0.11, 4);
  crenGeo.rotateY(Math.PI / 4);
  crenGeo.translate(0, 0.055, 0);
  const crens = new THREE.InstancedMesh(crenGeo, trimMat, crenSpecs.length);
  crenSpecs.forEach((p, i) => place(crens, i, p[0], p[1], p[2], 0));
  crens.castShadow = true;
  parapetG.add(crens);

  // ---------- entrance, canopy, mashrabiya
  const details = new THREE.Group();
  site.add(details);
  box(0.62, 0.86, 0.06, trimMat, DOOR_X, B + 0.43, V.g.z1 + 0.03, details);
  box(0.46, 0.74, 0.04, woodMat, DOOR_X, B + 0.37, V.g.z1 + 0.065, details);
  box(0.02, 0.74, 0.01, trimMat, DOOR_X, B + 0.37, V.g.z1 + 0.09, details);
  box(0.9, 0.05, 0.42, trimMat, DOOR_X, B + 0.92, V.g.z1 + 0.21, details);
  for (const sx of [-1, 1]) box(0.06, 0.82, 0.06, trimMat, DOOR_X + sx * 0.4, B + 0.41, V.g.z1 + 0.39, details);
  box(0.9, 0.04, 0.5, trimMat, DOOR_X, 0.02, V.g.z1 + 0.25, details);
  const lattice = latticeTexture();
  lattice.repeat.set(2, 2);
  const mashGlow = new THREE.MeshBasicMaterial({ color: C.winOff, toneMapped: false });
  const mash = new THREE.Group();
  const mY = V.f.y0 + V.f.h * 0.5, mX = -0.9;
  box(0.86, 0.66, 0.02, mashGlow, mX, mY, V.f.z1 + 0.01, mash);
  box(0.94, 0.06, 0.2, woodMat, mX, mY + 0.36, V.f.z1 + 0.1, mash);
  box(0.94, 0.06, 0.2, woodMat, mX, mY - 0.36, V.f.z1 + 0.1, mash);
  for (const sx of [-1, 1]) box(0.05, 0.66, 0.18, woodMat, mX + sx * 0.445, mY, V.f.z1 + 0.1, mash);
  const lat = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.66),
    new THREE.MeshStandardMaterial({ map: lattice, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide, roughness: 0.7 })
  );
  lat.position.set(mX, mY, V.f.z1 + 0.19);
  mash.add(lat);
  details.add(mash);

  // ---------- scaffolding
  const scafPts = [];
  const scafFace = (xa, za, xb, zb, h) => {
    const len = Math.hypot(xb - xa, zb - za), n = Math.max(2, Math.round(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * (i / n), z = za + (zb - za) * (i / n);
      scafPts.push(x, 0, z, x, h, z);
    }
    for (let y = 0.5; y <= h + 0.01; y += 0.5) scafPts.push(xa, y, za, xb, y, zb);
    for (let i = 0; i < n; i++) {
      const xA = xa + (xb - xa) * (i / n), zA = za + (zb - za) * (i / n);
      const xB = xa + (xb - xa) * ((i + 1) / n), zB = za + (zb - za) * ((i + 1) / n);
      scafPts.push(xA, (i % 2) * 0.5, zA, xB, ((i + 1) % 2) * 0.5 + 0.5 * Math.floor(h / 0.5 - 1), zB);
    }
  };
  const so = 0.24;
  scafFace(V.g.x0 - so, V.g.z1 + so, V.m.x1 + so, V.g.z1 + so, 2.3);
  scafFace(V.g.x0 - so, V.g.z0 - so, V.g.x0 - so, V.g.z1 + so, 2.3);
  scafFace(V.m.x1 + so, V.m.z0 - so, V.m.x1 + so, V.g.z1 + so, 1.1);
  const scafGeo = new THREE.BufferGeometry();
  scafGeo.setAttribute('position', new THREE.Float32BufferAttribute(scafPts, 3));
  const scafMat = new THREE.LineBasicMaterial({ color: 0xc4c9d2, transparent: true, opacity: 0 });
  const scaffold = new THREE.LineSegments(scafGeo, scafMat);
  site.add(scaffold);

  // ---------- blueprint ghost (the plan the build follows)
  const ghostMat = new THREE.LineBasicMaterial({ color: C.redHot, transparent: true, opacity: 0 });
  const ghost = new THREE.Group();
  for (const v of vols) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(v.w, v.h + SL, v.d)), ghostMat);
    e.position.set(v.cx, v.y0 + (v.h + SL) / 2, v.cz);
    ghost.add(e);
  }
  site.add(ghost);

  // ---------- 6. handover: yard, boundary wall, gate, sign
  const yardMat = new THREE.MeshStandardMaterial({ color: C.yard, roughness: 1, transparent: true, opacity: 0 });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.x * 2, PLOT.z * 2), yardMat);
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = 0.003;
  yard.receiveShadow = true;
  site.add(yard);

  const boundary = new THREE.Group();
  site.add(boundary);
  const bWallMat = new THREE.MeshStandardMaterial({ color: C.sand, roughness: 0.9 });
  const bCren = [];
  const bWall = (xa, za, xb, zb, inward) => {
    const len = Math.hypot(xb - xa, zb - za), horiz = Math.abs(zb - za) < 1e-6;
    riser(horiz ? len : 0.1, PLOT.wallH, horiz ? 0.1 : len, bWallMat, (xa + xb) / 2, 0, (za + zb) / 2, boundary);
    const n = Math.floor(len / 0.2);
    for (let i = 0; i <= n; i++) bCren.push([xa + (xb - xa) * (i / n), PLOT.wallH, za + (zb - za) * (i / n)]);
  };
  bWall(-PLOT.x, PLOT.z, GATE[0], PLOT.z);
  bWall(GATE[1], PLOT.z, PLOT.x, PLOT.z);
  bWall(-PLOT.x, -PLOT.z, PLOT.x, -PLOT.z);
  bWall(-PLOT.x, -PLOT.z, -PLOT.x, PLOT.z);
  bWall(PLOT.x, -PLOT.z, PLOT.x, PLOT.z);
  const bCrens = new THREE.InstancedMesh(crenGeo, trimMat, bCren.length);
  bCren.forEach((p, i) => place(bCrens, i, p[0], p[1], p[2], 0));
  boundary.add(bCrens);
  for (const x of GATE) {
    riser(0.22, 0.8, 0.22, trimMat, x + (x < DOOR_X ? -0.06 : 0.06), 0, PLOT.z, boundary);
    const cap = box(0.3, 0.05, 0.3, trimMat, x + (x < DOOR_X ? -0.06 : 0.06), 0.825, PLOT.z, boundary);
    cap.castShadow = false;
  }
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.4, metalness: 0.6 });
  box(0.56, 0.5, 0.04, gateMat, DOOR_X - 0.29, 0.3, PLOT.z, boundary);
  box(0.56, 0.5, 0.04, gateMat, DOOR_X + 0.29, 0.3, PLOT.z, boundary);

  // brand sign on the boundary wall (red top bar + three bars)
  const mark = new THREE.Group();
  const markL = new THREE.MeshStandardMaterial({ color: C.light, roughness: 0.4 });
  const markR = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.35, emissive: C.red, emissiveIntensity: 0.5 });
  const S = 0.36 / 100;
  const bar = (x, y, w, h, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, 0.03), mat);
    m.position.set((x + w / 2 - 50) * S, (50 - (y + h / 2)) * S, 0);
    mark.add(m);
  };
  bar(0, 0, 72, 24, markR); bar(78, 0, 22, 72, markL); bar(28, 78, 72, 22, markL); bar(0, 30, 22, 70, markL);
  mark.position.set(1.15, 0.29, PLOT.z + 0.07);
  boundary.add(mark);

  const entryLight = new THREE.PointLight(0xffc27a, 0, 5, 2);
  entryLight.position.set(DOOR_X, 0.85, V.g.z1 + 0.6);
  site.add(entryLight);

  // ---------- facility management: service risers + pulses + scan
  const fm = new THREE.Group();
  site.add(fm);
  const riserH = V.f.y0 + V.f.h - B;
  const riserDefs = [
    { x: -1.7, z: -1.7, color: C.redHot },
    { x: -1.4, z: -1.7, color: C.water },
    { x: -1.1, z: -1.7, color: 0xbfc6d6 },
  ];
  const risers = [], branches = [];
  riserDefs.forEach((d, k) => {
    const mat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.95, toneMapped: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, riserH, 10).translate(0, riserH / 2, 0), mat);
    m.position.set(d.x, B, d.z);
    fm.add(m);
    risers.push(m);
    for (const [y, len] of [[B + 0.3, 3.9], [V.f.y0 + 0.3, 2.6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.035).translate(len / 2, 0, 0), mat);
      b.position.set(d.x, y + k * 0.06, d.z + 0.3 + k * 0.25);
      fm.add(b);
      branches.push(b);
    }
  });
  const pulseCount = 30;
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pulseCount);
  const pulseData = [];
  for (let i = 0; i < pulseCount; i++) {
    const d = riserDefs[i % 3];
    pulseData.push({ x: d.x, z: d.z, off: Math.random(), speed: 0.14 + Math.random() * 0.08 });
    pulses.setColorAt(i, new THREE.Color(d.color));
  }
  pulses.instanceColor.needsUpdate = true;
  fm.add(pulses);
  const scanW = V.m.x1 - V.g.x0 + 0.5, scanD = V.g.z1 - V.g.z0 + 0.5;
  const scanMat = new THREE.MeshBasicMaterial({ color: C.redHot, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
  const scan = new THREE.Mesh(new THREE.BoxGeometry(scanW, 0.02, scanD), scanMat);
  const scanEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(scanW, 0.02, scanD)), new THREE.LineBasicMaterial({ color: C.redHot, transparent: true, opacity: 0 }));
  scan.add(scanEdges);
  scan.position.set((V.g.x0 + V.m.x1) / 2, 0, V.g.cz);
  site.add(scan);

  // ---------- smart: hub on the roof annex + waves + sensors
  const smart = new THREE.Group();
  site.add(smart);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 24), new THREE.MeshBasicMaterial({ color: C.winOn, toneMapped: false, transparent: true }));
  hub.position.set(V.a.cx, TOP + 0.3, V.a.cz);
  smart.add(hub);
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 8, 96), new THREE.MeshBasicMaterial({ color: C.winOn, transparent: true, opacity: 0, toneMapped: false }));
    w.rotation.x = Math.PI / 2;
    w.position.copy(hub.position);
    w.userData.off = i / 3;
    smart.add(w);
    waves.push(w);
  }
  const sensors = [];
  const sensorAt = [[V.g.x1 - 0.2, 0.9, V.g.z1 + 0.03], [V.m.x1 - 0.3, 0.75, V.m.z1 + 0.03], [V.f.x1 - 0.2, V.f.y0 + 0.85, V.f.z1 + 0.03],
    [V.g.x0 - 0.03, 0.9, -0.4], [V.f.x0 - 0.03, V.f.y0 + 0.8, -1.2], [GATE[1] + 0.06, 0.95, PLOT.z], [GATE[0] - 0.06, 0.95, PLOT.z],
    [V.m.x1 + 0.03, 0.7, -0.8]];
  for (const p of sensorAt) {
    const sM = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0, toneMapped: false }));
    sM.position.set(...p);
    sM.userData.off = Math.random() * 6.28;
    smart.add(sM);
    sensors.push(sM);
  }

  // ---------- landscaping inside the plot
  const land = new THREE.Group();
  site.add(land);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x3b6e3e, roughness: 0.95, transparent: true, opacity: 0 });
  const lawnPatch = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lawnMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2);
    m.receiveShadow = true;
    land.add(m);
  };
  lawnPatch(-3.9, DOOR_X - 0.45, 0.95, 3.2);
  lawnPatch(DOOR_X + 0.45, 3.9, 2.75, 3.2);
  lawnPatch(-3.9, -2.45, -3.2, 0.95);
  lawnPatch(-2.45, 3.9, -3.2, -2.45);
  lawnPatch(3.2, 3.9, -2.45, 2.75);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.9, transparent: true, opacity: 0 });
  const tiles = [];
  for (let i = 0; i < 5; i++) {
    const t = box(0.7, 0.03, 0.36, pathMat, DOOR_X, 0.015, V.g.z1 + 0.75 + i * 0.47, land);
    tiles.push(t);
  }
  // pool with stone coping
  const pool = new THREE.Group();
  const copeMat = new THREE.MeshStandardMaterial({ color: 0xe8e1d3, roughness: 0.7, transparent: true, opacity: 0 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f8fd8, roughness: 0.08, metalness: 0.1, emissive: 0x0f4f8a, emissiveIntensity: 0.6, transparent: true, opacity: 0 });
  box(2.3, 0.06, 1.3, copeMat, 2.2, 0.03, 1.75, pool);
  const water = box(2.06, 0.02, 1.06, waterMat, 2.2, 0.065, 1.75, pool);
  water.castShadow = false;
  land.add(pool);

  const trunkMat = new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 0.9 });
  const frondMat = new THREE.MeshStandardMaterial({ color: C.leaf2, roughness: 0.8, side: THREE.DoubleSide });
  const bushMat = new THREE.MeshStandardMaterial({ color: C.leaf, roughness: 0.85, flatShading: true });
  const flowerMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.6 });
  const frondGeo = new THREE.ConeGeometry(0.1, 0.9, 3, 1, true).translate(0, 0.45, 0);
  const makePalm = (h) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, h, 8), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    for (let k = 0; k < 8; k++) {
      const fr = new THREE.Mesh(frondGeo, frondMat);
      fr.scale.set(1, 1, 0.25);
      fr.position.y = h;
      fr.rotation.set(1.1 + Math.random() * 0.3, (k / 8) * Math.PI * 2, 0, 'YXZ');
      fr.castShadow = true;
      g.add(fr);
    }
    return g;
  };
  const makeBush = (flowers) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), bushMat);
    b.position.y = 0.12;
    b.castShadow = true;
    g.add(b);
    if (flowers) for (let k = 0; k < 3; k++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), flowerMat);
      fl.position.set(Math.cos(k * 2.1) * 0.12, 0.24, Math.sin(k * 2.1) * 0.12);
      g.add(fl);
    }
    return g;
  };
  const plants = [];
  const addPlant = (obj, x, z, delay, parent = land) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = Math.random() * 6.28;
    obj.scale.setScalar(0.0001);
    obj.userData.delay = delay;
    parent.add(obj);
    plants.push(obj);
    return obj;
  };
  // two palms flanking the gate arrive with the handover
  const gatePalms = [makePalm(1.35), makePalm(1.5)];
  gatePalms[0].position.set(-2.3, 0, PLOT.z - 0.4);
  gatePalms[1].position.set(3.4, 0, PLOT.z - 0.4);
  gatePalms.forEach((p) => { p.scale.setScalar(0.0001); site.add(p); });
  [[-3.4, 2.6], [-3.4, 0.9], [-3.35, -1.0], [-3.35, -2.7], [0.8, -2.85], [2.6, -2.85], [3.55, -1.4], [3.55, 0.6]]
    .forEach(([x, z], i) => addPlant(makePalm(1.4 + Math.random() * 0.7), x, z, i * 0.05));
  for (let i = 0; i < 4; i++) {
    addPlant(makeBush(i % 2 === 0), DOOR_X - 0.6, V.g.z1 + 0.8 + i * 0.55, 0.15 + i * 0.04);
    addPlant(makeBush(i % 2 === 1), DOOR_X + 0.6, V.g.z1 + 0.8 + i * 0.55, 0.17 + i * 0.04);
  }
  [[-2.6, 2.9], [-1.9, 1.4], [1.0, 2.95], [3.5, 2.9], [-3.0, -3.0], [1.7, -3.0], [3.6, -2.9]]
    .forEach(([x, z], i) => addPlant(makeBush(true), x, z, 0.25 + i * 0.03));

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
    { p: [12.6, 8.0, 15.2], t: [0.3, 0.7, -0.2] },
    { p: [10.4, 6.2, 12.4], t: [0.3, 0.8, -0.3] },
    { p: [8.4, 5.0, 10.2], t: [0.2, 1.0, -0.6] },
    { p: [-11.6, 7.6, 12.2], t: [0, 1.0, -0.4] },
    { p: [11.6, 12.4, 9.4], t: [0, 0.2, 0.2] },
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
    intro: 0,        // 0..1 the villa assembles on load
    build: -1,       // 0..1 while scrolling the build steps, -1 outside them
    focus: 0,        // 0..4 scroll position through the journey
    side: 1,         // +1 subject on left (RTL), -1 on right (LTR)
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
    camera.fov = state.mobile ? 50 : 36;
    applyOffset();
  }
  function applyOffset() {
    if (state.mobile) camera.setViewOffset(vw, vh, 0, vh * 0.2, vw, vh);
    else camera.setViewOffset(vw, vh, state.side * vw * 0.23, 0, vw, vh);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- frame loop
  const clock = new THREE.Clock();
  let time = 0, P = 0, bm = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!state.active) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    const f = state.focus;

    // construction progress: intro on load, scroll inside the build steps
    const target = state.build >= 0 ? state.build : state.intro;
    P = state.reduced ? target : P + (target - P) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - P) < 0.0005) P = target;
    const inBuild = state.build >= 0 && state.build < 1 ? 1 : 0;
    bm += (inBuild - bm) * (1 - Math.exp(-dt * 3));

    // 1 foundations
    pitMat.opacity = smooth(0, 0.03, P) * (1 - smooth(0.3, 0.4, P));
    pit.visible = pitMat.opacity > 0.01;
    raft.scale.y = tiny(smooth(0.06, 0.14, P));
    raft.visible = P > 0.06;
    rebar.material.opacity = smooth(0.02, 0.06, P) * (1 - smooth(0.11, 0.15, P));
    rebar.visible = rebar.material.opacity > 0.01;

    // 2 frame + 3 walls, staged per volume
    const frameT = { g: [0.16, 0.22], m: [0.17, 0.23], f: [0.24, 0.3], a: [0.29, 0.32] };
    const slabT = { g: 0.225, m: 0.235, f: 0.305, a: 0.33 };
    const wallT = { g: [0.34, 0.42], m: [0.36, 0.43], f: [0.41, 0.48], a: [0.46, 0.5] };
    for (const v of vols) {
      const c = smooth(frameT[v.id][0], frameT[v.id][1], P);
      v.cols.forEach((col) => { col.scale.y = tiny(c); col.visible = c > 0.001; });
      const s = easeOut(smooth(slabT[v.id], slabT[v.id] + 0.03, P));
      v.slab.visible = s > 0.001;
      v.slab.position.y = v.y0 + v.h + SL / 2 + (1 - s) * 0.5;
      v.slab.scale.set(0.85 + 0.15 * s, 1, 0.85 + 0.15 * s);
      const w = smooth(wallT[v.id][0], wallT[v.id][1], P);
      v.wall.scale.y = tiny(w);
      v.wall.visible = w > 0.001;
      winByVol[v.id].visible = w > 0.98;
      v.membrane.visible = P > 0.56;
      v.membrane.scale.set(tiny(smooth(0.56, 0.62, P)), 1, 1);
    }

    // 4 MEP rough-in (walls go see-through) — reused later by facility management
    const mepV = smooth(0.52, 0.56, P) * (1 - smooth(0.65, 0.69, P));
    const fmV = Math.max(smooth(1.3, 1.9, f), mepV);
    const xray = Math.max(mepV, smooth(1.3, 1.9, f) * (1 - smooth(2.4, 2.9, f)));

    // 5 finishes
    const fin = smooth(0.68, 0.8, P);
    wallMat.color.copy(cBlock).lerp(cSand, fin);
    const wo = 1 - xray * 0.72;
    if ((wo < 0.999) !== wallMat.transparent) { wallMat.transparent = wo < 0.999; wallMat.needsUpdate = true; }
    wallMat.opacity = wo;
    wallMat.depthWrite = wo > 0.95;
    const det = smooth(0.74, 0.86, P);
    parapetG.visible = det > 0.001;
    parapetG.scale.y = tiny(det);
    details.visible = det > 0.001;
    details.scale.y = tiny(det);
    vents.visible = det > 0.5;
    for (const id in frameByVol) frameByVol[id].visible = fin > 0.4 && winByVol[id].visible;
    scafMat.opacity = smooth(0.3, 0.36, P) * (1 - smooth(0.82, 0.88, P)) * 0.85;
    scaffold.visible = scafMat.opacity > 0.01;
    ghostMat.opacity = 0.55 * (1 - smooth(0.72, 0.9, P)) * smooth(0, 0.02, P + 0.02);
    ghost.visible = ghostMat.opacity > 0.01;

    // 6 handover
    const ho = smooth(0.86, 0.97, P);
    yardMat.opacity = ho;
    yard.visible = ho > 0.01;
    boundary.visible = ho > 0.001;
    boundary.scale.y = tiny(ho);
    gatePalms.forEach((p, i) => p.scale.setScalar(tiny(easeOut(smooth(0.9 + i * 0.03, 1, P)))));
    entryLight.intensity = ho * (2.4 + Math.sin(time * 2) * 0.15);

    // FM layer
    fm.visible = fmV > 0.01;
    risers.forEach((r) => { r.scale.y = tiny(fmV); });
    branches.forEach((b) => { b.scale.x = tiny(smooth(0.3, 1, fmV)); });
    for (let i = 0; i < pulseCount; i++) {
      const d = pulseData[i];
      m4.makeTranslation(d.x, B + ((d.off + time * d.speed) % 1) * riserH * fmV, d.z);
      pulses.setMatrixAt(i, m4);
    }
    pulses.instanceMatrix.needsUpdate = true;
    const scanX = smooth(1.3, 1.9, f) * (1 - smooth(2.4, 2.9, f));
    scan.position.y = B + (Math.sin(time * 0.9) * 0.5 + 0.5) * (TOP - B);
    scanMat.opacity = scanX * 0.16;
    scanEdges.material.opacity = scanX * 0.9;
    scan.visible = scanX > 0.01;
    winMat.opacity = 1 - xray * 0.75;

    // windows: some lit at handover (evening), all lit with smart control
    const smartV = smooth(2.3, 2.9, f);
    const lit = Math.max(smartV, ho * 0.45);
    for (const id in winByVol) {
      const data = winData[id], wm = winByVol[id];
      for (let i = 0; i < data.length; i++) {
        cTmp.copy(cOff).lerp(cOn, smooth(data[i].t, data[i].t + 0.15, lit));
        wm.setColorAt(i, cTmp);
      }
      wm.instanceColor.needsUpdate = true;
    }
    mashGlow.color.copy(cOff).lerp(cOn, Math.max(ho * 0.8, smartV));
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
    const landV = smooth(3.2, 3.9, f);
    land.visible = landV > 0.001;
    lawnMat.opacity = landV;
    pathMat.opacity = landV;
    copeMat.opacity = landV;
    waterMat.opacity = landV * 0.92;
    waterMat.emissiveIntensity = 0.5 + Math.sin(time * 1.6) * 0.15;
    tiles.forEach((t, i) => { t.scale.y = tiny(smooth(i * 0.08, i * 0.08 + 0.3, landV)); });
    plants.forEach((p) => p.scale.setScalar(tiny(easeOut(clamp01((landV - p.userData.delay) / 0.45)))));

    if (!state.reduced) world.rotation.y = Math.sin(time * 0.08) * 0.3;
    dust.rotation.y = time * 0.01;

    // camera: journey keys, with a slow orbit while the villa is being built
    cameraAt(f);
    if (bm > 0.001) {
      const a = (P - 0.5) * 0.9 * bm;
      const dx = camPos.x - camTgt.x, dz = camPos.z - camTgt.z;
      const k = 1 - 0.12 * bm;
      camPos.x = camTgt.x + (dx * Math.cos(a) - dz * Math.sin(a)) * k;
      camPos.z = camTgt.z + (dx * Math.sin(a) + dz * Math.cos(a)) * k;
      camPos.y = camTgt.y + (camPos.y - camTgt.y) * k;
    }
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
