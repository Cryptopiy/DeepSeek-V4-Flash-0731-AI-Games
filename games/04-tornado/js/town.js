import * as THREE from './three.js';

// Deterministic procedural low-poly town: streets, sidewalks, houses with
// breakable walls/roofs, trees, cars, light poles, signs, fences and props.
// Everything uses shared geometry/material caches so reset+rebuild is cheap.

let rngState = 1234567;
function rr() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return (rngState >>> 8) / 16777216;
}
function rnd(a, b) { return a + (b - a) * rr(); }

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const unitCone = new THREE.ConeGeometry(1, 1, 10);
const unitSph = new THREE.SphereGeometry(1, 12, 9);

const _mats = {};
function m(color) {
  if (!_mats[color]) _mats[color] = new THREE.MeshLambertMaterial({ color });
  return _mats[color];
}
function lampMat() {
  if (!_mats['lamp']) _mats['lamp'] = new THREE.MeshLambertMaterial({ color: 0xffe7ae, emissive: 0xffb94f, emissiveIntensity: 0.65 });
  return _mats['lamp'];
}
function darkMat() {
  if (!_mats['dark']) _mats['dark'] = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  return _mats['dark'];
}

function mesh(parent, geometry, material, pos, scale, rot, shadow) {
  const o = new THREE.Mesh(geometry, material);
  o.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  o.scale.set(scale[0], scale[1], scale[2]);
  if (rot && (rot[0] || rot[1] || rot[2])) o.rotation.set(rot[0], rot[1], rot[2]);
  if (shadow) { o.castShadow = true; o.receiveShadow = true; }
  parent.add(o);
  return o;
}

const HOUSE_COLORS = [
  ['#e8b394', '#5b4f46'], ['#b7c6e4', '#4e5566'], ['#d6b0cd', '#6b4f5d'],
  ['#e6d398', '#5d5a4a'], ['#a5c49f', '#46503f'], ['#d3a493', '#664d40'],
  ['#9fbdd8', '#3f4a5c'], ['#cbb999', '#675f4e'], ['#e3b8b8', '#5c4444'],
];

let houseCounter = 0;
let engineRef = null;
let town = null;

const ROADS = [-72, -16, 40, 96];

export function buildTown(engine, townGroup) {
  engineRef = engine;
  town = townGroup;
  rngState = 1234567; // reset seed so the town always rebuilds identically
  houseCounter = 0;

  _buildGround();
  _buildStreets();
  _buildBlocks();
  _buildRoadside();
  _buildFieldsAndTrees();
}

function _buildGround() {
  mesh(town, unitBox, m('#79a05c'), [0, -0.22, 0], [540, 0.44, 540], null, true);
  // subtle grass tint variation near the town
  for (let i = 0; i < 26; i++) {
    const x = rnd(-150, 150), z = rnd(-150, 150);
    const col = rr() < 0.6 ? '#6f9750' : '#85ab60';
    mesh(town, unitCyl, m(col), [x, 0.01, z], [rnd(1.6, 4.5), 0.03, rnd(1.6, 4.5)], null, false);
  }
}

function _buildStreets() {
  const roadM = m('#3f434a');
  const swM = m('#b4bac0');
  const curbM = m('#cfd4da');
  for (const c of ROADS) {
    // horizontal bands (along x)
    mesh(town, unitBox, roadM, [12, 0.015, c], [190, 0.03, 12], null, true);
    mesh(town, unitBox, swM, [12, 0.02, c + 7.1], [190, 0.04, 2.2], null, true);
    mesh(town, unitBox, swM, [12, 0.02, c - 7.1], [190, 0.04, 2.2], null, true);
    mesh(town, unitBox, curbM, [12, 0.025, c + 6.12], [190, 0.04, 0.28], null, true);
    mesh(town, unitBox, curbM, [12, 0.025, c - 6.12], [190, 0.04, 0.28], null, true);
    // vertical bands (along z)
    mesh(town, unitBox, roadM, [c, 0.015, 12], [12, 0.03, 190], null, true);
    mesh(town, unitBox, swM, [c + 7.1, 0.02, 12], [2.2, 0.04, 190], null, true);
    mesh(town, unitBox, swM, [c - 7.1, 0.02, 12], [2.2, 0.04, 190], null, true);
    mesh(town, unitBox, curbM, [c + 6.12, 0.025, 12], [0.28, 0.04, 190], null, true);
    mesh(town, unitBox, curbM, [c - 6.12, 0.025, 12], [0.28, 0.04, 190], null, true);
  }
}

function _buildBlocks() {
  const candidates = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const key = c * 3 + r;
      const cx = _k(c), cz = _k(r);
      if (key === 4) { _buildPark(cx, cz); continue; }
      candidates.push([cx, cz]);
      if ((key === 1 || key === 5 || key === 6) && rr() < 0.7) candidates.push([cx, cz]);
    }
  }
  // couple of houses on the outer ring road
  candidates.push([-58, -88], [58, 112]);
  candidates.push([-88, 26], [112, -20]);

  const placed = [];
  for (const [cx, cz] of candidates) {
    let bx = cx, bz = cz;
    for (let tries = 0; tries < 10; tries++) {
      bx = cx + rnd(-13, 13);
      bz = cz + rnd(-13, 13);
      let ok = true;
      for (const p of placed) {
        if ((p[0] - bx) * (p[0] - bx) + (p[1] - bz) * (p[1] - bz) < 100) { ok = false; break; }
      }
      if (ok) break;
    }
    placed.push([bx, bz]);
    _makeHouse(bx, bz);
  }
}

function _k(i) { return i * 56 + 22 - 66; }

function _buildPark(cx, cz) {
  mesh(town, unitCyl, m('#8cb063'), [cx, 0.02, cz], [26, 0.04, 26], null, true);
  mesh(town, unitCyl, m('#a3c47e'), [cx, 0.025, cz], [18, 0.03, 18], null, true);
  // trees
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(0, 0.8);
    const r = rnd(7, 17);
    _tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, rnd(0.8, 1.25));
  }
  // benches
  for (const [bx, bz, yaw] of [[cx - 9, cz - 14, 0.4], [cx + 11, cz + 13, -0.6]]) {
    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    g.rotation.y = yaw;
    mesh(g, unitBox, m('#8a6b47'), [0, 0.25, 0], [1.8, 0.14, 0.55], null, true);
    mesh(g, unitBox, m('#8a6b47'), [0, 0.6, -0.42], [1.8, 0.55, 0.1], null, false);
    mesh(g, unitBox, darkMat(), [0, 0.32, 0.42], [1.8, 0.1, 0.1], null, false);
    town.add(g);
    engineRef.addStaticBox([1.9, 0.5, 0.9], { x: bx, y: 0.3, z: bz });
  }
}

function _makeHouse(bx, bz) {
  const idx = Math.floor(rr() * HOUSE_COLORS.length);
  const [bodyC, roofC] = HOUSE_COLORS[idx];
  const wallM = m(bodyC), roofM = m(roofC), trimM = m('#dcd6c9');
  const winM = m('#2b3c4d'), doorM = m('#6b4a2f');
  const w = rnd(6.4, 8.2), d = rnd(5.6, 7.0), h = rnd(3.0, 3.6);
  const houseId = ++houseCounter;

  // foundation
  mesh(town, unitBox, trimM, [bx, 0.14, bz], [w + 1, 0.28, d + 1], null, true);
  engineRef.addStaticBox([w + 1, 0.3, d + 1], { x: bx, y: 0.14, z: bz });

  const doorSide = rr() < 0.5 ? 1 : -1;

  // ---- front wall
  _panel([w, h, 0.28], [bx, 0.14 + h / 2, bz + doorSide * (d / 2 + 0.02)], wallM, {
    kind: 'wall', size: [w, h, 0.28], mass: 44, threshold: 270, houseId, breakColor: 'wall',
  }, [
    { mat: winM, size: [0.82, 0.7, 0.06], pos: [-w * 0.24, -(h / 2 - 1.05), doorSide * 0.17] },
    { mat: winM, size: [0.82, 0.7, 0.06], pos: [w * 0.24, -(h / 2 - 1.05), doorSide * 0.17] },
    { mat: doorM, size: [0.85, 1.55, 0.07], pos: [0, -(h / 2 - 0.22), doorSide * 0.17] },
  ]);

  // ---- back wall (two windows)
  _panel([w, h, 0.28], [bx, 0.14 + h / 2, bz - doorSide * (d / 2 + 0.02)], wallM, {
    kind: 'wall', size: [w, h, 0.28], mass: 44, threshold: 270, houseId, breakColor: 'wall',
  }, [
    { mat: winM, size: [0.82, 0.7, 0.06], pos: [-w * 0.24, -(h / 2 - 1.05), -doorSide * 0.17] },
    { mat: winM, size: [0.82, 0.7, 0.06], pos: [w * 0.24, -(h / 2 - 1.05), -doorSide * 0.17] },
  ]);

  // ---- side walls (one window each, facing outward)
  _panel([0.28, h, d], [bx + (w / 2 + 0.02), 0.14 + h / 2, bz], wallM, {
    kind: 'wall', size: [0.28, h, d], mass: 44, threshold: 270, houseId, breakColor: 'wall',
  }, [
    { mat: winM, size: [0.06, 0.7, 0.72], pos: [0.17, -(h / 2 - 1.4), rnd(-1.2, 1.2)] },
  ]);
  _panel([0.28, h, d], [bx - (w / 2 + 0.02), 0.14 + h / 2, bz], wallM, {
    kind: 'wall', size: [0.28, h, d], mass: 44, threshold: 270, houseId, breakColor: 'wall',
  }, [
    { mat: winM, size: [0.06, 0.7, 0.72], pos: [-0.17, -(h / 2 - 1.4), rnd(-1.2, 1.2)] },
  ]);

  // ---- roof panels (gable ridge along X)
  const rise = rnd(1.5, 2.2);
  const slopeLen = Math.hypot(d / 2, rise);
  const slopeW = w + 0.9;
  const a = Math.atan2(rise, d / 2);
  for (const sign of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(bx, h + rise / 2, bz + sign * (d / 4 + 0.01));
    g.rotation.x = sign * a;
    mesh(g, unitBox, roofM, [0, 0, 0], [slopeW, 0.16, slopeLen + 0.4], null, true);
    town.add(g);
    engineRef.registerBreakable({
      group: g, kind: 'roof', size: [slopeW, 0.2, slopeLen + 0.4], mass: 26,
      threshold: 150, houseId, breakColor: 'roof',
    });
  }
  // ridge cap
  {
    const g = new THREE.Group();
    g.position.set(bx, h + rise + 0.1, bz);
    mesh(g, unitBox, trimM, [0, 0, 0], [slopeW + 0.2, 0.12, 0.44], null, true);
    town.add(g);
    engineRef.registerBreakable({
      group: g, kind: 'roof', size: [slopeW + 0.2, 0.12, 0.44], mass: 9,
      threshold: 95, houseId, breakColor: 'roof',
    });
  }
  // chimney
  {
    const g = new THREE.Group();
    g.position.set(bx + rnd(-w * 0.18, w * 0.18), h + rise + 0.55, bz);
    mesh(g, unitBox, m('#9a8f81'), [0, 0, 0], [0.8, 1.1, 0.8], [rnd(-0.1, 0.1), 0, 0], true);
    mesh(g, unitBox, darkMat(), [0, 0.62, 0], [0.98, 0.14, 0.98], null, false);
    town.add(g);
    engineRef.registerBreakable({
      group: g, kind: 'chimney', size: [0.8, 1.2, 0.8], mass: 30,
      threshold: 160, houseId, breakColor: 'wall',
    });
  }

  // a bin and crate near the yard in a random direction
  _bin(bx + rnd(3.2, 5.5) * (rr() < 0.5 ? 1 : -1), bz + rnd(3, 5.5) * (rr() < 0.5 ? 1 : -1));
  if (rr() < 0.8) {
    const cx2 = bx + rnd(2.5, 4.5) * (rr() < 0.5 ? 1 : -1);
    _crate(cx2, bz + rnd(2.5, 4.5) * (rr() < 0.5 ? 1 : -1));
  }
}

function _panel(size, pos, matRef, opts, children) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  mesh(g, unitBox, matRef, [0, 0, 0], size, null, true);
  for (const c of children) mesh(g, unitBox, c.mat, c.pos, c.size, null, false);
  town.add(g);
  engineRef.registerBreakable({
    group: g,
    kind: opts.kind, size: opts.size || size, mass: opts.mass,
    threshold: opts.threshold, resist: 0.85 + rr() * 0.4,
    houseId: opts.houseId || null, breakColor: opts.breakColor || 'wood',
  });
}

function _tree(x, z, s) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(g, unitCyl, m('#7a5a3a'), [0, 1.0 * s, 0], [0.16 * s, 2.0 * s, 0.16 * s], null, true);
  const crown = new THREE.Group();
  crown.position.set(0, 2.1 * s, 0);
  mesh(crown, unitCone, m('#4c7a39'), [0, 1.15 * s, 0], [1.2 * s, 2.3 * s, 1.2 * s], null, true);
  mesh(crown, unitCone, m('#5f9347'), [0, 0.15 * s, 0], [0.8 * s, 1.4 * s, 0.8 * s], null, true);
  g.add(crown);
  town.add(g);
  const def = engineRef.registerBreakable({
    group: g, kind: 'tree', shape: 'cyl', cylR: 0.2 * s, cylH: 2.4 * s,
    mass: 140, threshold: 245, resist: 0.85 + rr() * 0.35, breakColor: 'wood',
  });
  def.crown = crown;
  def.phase = rr() * Math.PI * 2;
}

function _bin(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(g, unitCyl, m('#6e7f46'), [0, 0.58, 0], [0.42, 1.16, 0.42], null, true);
  mesh(g, unitCyl, m('#4b5668'), [0, 0.62, 0], [0.45, 0.1, 0.45], null, false);
  town.add(g);
  engineRef.registerBreakable({
    group: g, kind: 'bin', shape: 'cyl', cylR: 0.42, cylH: 1.16,
    mass: 18, threshold: 120, resist: 0.85 + rr() * 0.4, breakColor: 'wood',
  });
}

function _crate(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rr() * Math.PI;
  mesh(g, unitBox, m('#b08a52'), [0, 0.5, 0], [1.0, 1.0, 1.0], null, true);
  town.add(g);
  engineRef.registerBreakable({
    group: g, kind: 'crate', size: [1.0, 1.0, 1.0], mass: 9,
    threshold: 85, resist: 0.85 + rr() * 0.4, breakColor: 'wood',
  });
}

function _buildRoadside() {
  // streetlights at the four inner intersections + a couple more
  const spots = [];
  for (const x of [-16, 40]) {
    for (const z of [-16, 40]) {
      spots.push([x + 8.5, z + 8.5], [x - 8.5, z - 8.5]);
    }
  }
  spots.push([-85, -85], [100, 100]);
  for (const [x, z] of spots) _streetlight(x, z);

  // parked cars along road shoulders
  const carColors = ['#c23b2e', '#3b6fb5', '#d8b23a', '#4aa05a', '#9a9aa4', '#7045a0', '#e4e4e4', '#2f5f7f', '#b3502f'];
  const slots = [];
  const vz = [-16, 40];
  for (const zc of vz) {
    for (const side of [-1, 1]) {
      const z = zc + (6.6 + 2.6) * side;
      for (let k = 0; k < 2; k++) {
        let x;
        do { x = rnd(-56, 68); } while (Math.abs(x + 16) < 12 || Math.abs(x - 40) < 12);
        slots.push([x, z, side > 0 ? -1 : 1]);
      }
    }
  }
  for (let i = 0; i < slots.length; i++) {
    const [x, z, dir] = slots[i];
    _car(x, z, dir * Math.PI / 2, carColors[i % carColors.length]);
  }

  // signs near intersections
  _sign(-70, 9, 1.0);
  _sign(68, -47, -0.4);
  _sign(-47, 68, -1.2);
  _sign(-2, -79, 0.5);

  // billboards with canvas text
  _billboard(-95, 40, 0.2, 'MAIN ST', '#f4f1ea', '#20262e');
  _billboard(95, -60, -2.9, 'WELCOME', '#f4f1ea', '#20262e');

  // utility poles + sagging wires on one block edge
  const px1 = -34.5, px2 = -56.5, pz = -8.1;
  _pole(px1, pz);
  _pole(px2, pz);
  _wire(px1, pz, px2, pz);

  // fences along block park edges
  _fenceRow(12, 34.4, 36, 0);
  _fenceRow(-52, -22.4, 36, 0);
  _fenceRow(44, 12.4, 36, Math.PI / 2);
}

function _pole(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(g, unitCyl, m('#4b3827'), [0, 4.4, 0], [0.13, 8.8, 0.13], null, true);
  mesh(g, unitBox, m('#4b3827'), [0, 8.4, 0], [2.4, 0.12, 0.12], null, false);
  town.add(g);
  engineRef.addStaticBox([0.3, 9, 2.6], { x, y: 4.4, z });
}

function _wire(x1, z1, x2, z2) {
  const n = 6, pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = 6.9 - Math.sin(t * Math.PI) * 0.85;
    pts.push(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t);
  }
const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  town.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x33383f })));
  const pts2 = pts.map((v, i) => i % 3 === 2 ? v + 0.6 : v);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(pts2, 3));
  town.add(new THREE.Line(g2, new THREE.LineBasicMaterial({ color: 0x33383f })));
}

function _streetlight(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(g, unitCyl, m('#3f4349'), [0, 2.8, 0], [0.14, 5.6, 0.14], null, true);
  mesh(g, unitBox, m('#2c2f34'), [0, 4.55, 0.65], [0.12, 0.12, 1.4], null, false);
  mesh(g, unitSph, lampMat(), [0, 4.55, 1.25], [0.34, 0.34, 0.34], null, false);
  town.add(g);
  engineRef.addStaticBox([0.4, 5.8, 1.8], { x, y: 2.8, z });
}

function _sign(x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  mesh(g, unitCyl, m('#5d636b'), [0, 1.55, 0], [0.09, 3.1, 0.09], null, true);
  mesh(g, unitBox, m('#e2e6ea'), [0, 3.3, 0], [1.7, 0.75, 0.14], null, true);
  mesh(g, unitBox, m('#c03a2b'), [0, 3.3, 0.075], [1.5, 0.16, 0.01], null, false);
  town.add(g);
  engineRef.registerBreakable({
    group: g, kind: 'sign', size: [1.8, 3.6, 0.3], mass: 13,
    threshold: 42, resist: 0.85 + rr() * 0.4, breakColor: 'sign',
  });
}

function _billboard(x, z, yaw, text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = fg;
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 82);
  ctx.strokeStyle = fg;
  ctx.strokeRect(8, 8, 240, 144);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex });

  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  mesh(g, unitCyl, m('#5d636b'), [0, 3.2, 0], [0.12, 6.4, 0.12], null, true);
  const panel = new THREE.Mesh(unitBox, mat);
  panel.position.set(0, 6.6, 0);
  panel.scale.set(3.6, 2.3, 0.3);
  panel.castShadow = true;
  g.add(panel);
  town.add(g);
  engineRef.registerBreakable({
    group: g, kind: 'sign', size: [3.9, 7, 0.6], mass: 30,
    threshold: 60, resist: 0.85 + rr() * 0.4, breakColor: 'wood',
  });
}

function _fenceRow(x, z, len, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const woodM = m('#8a745f');
  const posts = Math.max(5, Math.round(len / 3) + 1);
  for (let i = 0; i < posts; i++) {
    mesh(g, unitBox, woodM, [i * 3 - len / 2, 0.45, 0], [0.14, 0.9, 0.14], null, true);
  }
  mesh(g, unitBox, woodM, [0, 0.68, 0], [len, 0.1, 0.08], null, true);
  mesh(g, unitBox, woodM, [0, 0.3, 0], [len, 0.1, 0.08], null, true);
  town.add(g);
  engineRef.registerBreakable({
    group: g, kind: 'fence', size: [len, 0.95, 0.2], mass: 42,
    threshold: 48, resist: 0.85 + rr() * 0.4, breakColor: 'wood',
  });
}

function _car(x, z, yaw, color) {
  const g = new THREE.Group();
  g.position.set(x, 0.02, z);
  g.rotation.y = yaw;
  const bodyM = m(color);
  const glassM = m('#27424f');
  mesh(g, unitBox, bodyM, [0.1, 0.55, 0], [4.2, 0.95, 1.9], null, true);
  mesh(g, unitBox, bodyM, [-0.25, 1.28, 0], [2.05, 0.6, 1.75], null, true);
  mesh(g, unitBox, glassM, [-0.25, 1.06, 0], [2.1, 0.42, 1.7], null, false);
  mesh(g, unitBox, darkMat(), [2.15, 0.55, 0.35], [0.16, 0.1, 0.5], null, false);
  mesh(g, unitBox, darkMat(), [2.15, 0.55, -0.35], [0.16, 0.1, 0.5], null, false);
  for (const sx of [-1, 1]) {
    mesh(g, unitCyl, m('#1f2126'), [1.35 * sx, 0.34, 0.95], [0.34, 0.3, 0.34], [0, 0, Math.PI / 2], false);
    mesh(g, unitCyl, m('#1f2126'), [1.35 * sx, 0.34, -0.95], [0.34, 0.3, 0.34], [0, 0, Math.PI / 2], false);
  }
  town.add(g);
  engineRef.registerDynamic({
    group: g, kind: 'vehicle', size: [4.2, 1.0, 1.9], mass: 1250,
    angularDamping: 0.16, linearDamping: 0.05,
  });
}

function _buildFieldsAndTrees() {
  // trees sprinkled along roads and the open field
  const free = [[-96, -52], [-96, 14], [2, -62], [66, -95], [-30, 108], [98, 8],
                [-70, -108], [108, 78], [-112, 8], [60, 60], [-8, -110], [112, -8]];
  for (const [x, z] of free) _tree(x, z, rnd(0.7, 1.2));
  // low bushes for variety (static)
  const bushM = m('#4f7a3c');
  for (let i = 0; i < 18; i++) {
    mesh(town, unitSph, bushM, [rnd(-140, 140), 0.45, rnd(-140, 140)], [rnd(0.6, 1.1), rnd(0.5, 0.9), rnd(0.6, 1.1)], null, false);
  }
}