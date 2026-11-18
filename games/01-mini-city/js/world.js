// world.js ---------------------------------------------------------------
// Procedural low-poly city: scene/renderer/camera setup, lighting, road grid,
// sidewalks, buildings, street props, perimeter walls and cannon static bodies.
// Exports: constants, helpers (collision, boundaries), parking spots and a
// build function that returns everything the rest of the game needs.
import * as THREE from './three.js';
import { CANNON } from './cannon.js';

// ---- Layout constants ----------------------------------------------------
export const ROADS = [-42, 0, 42];     // road center lines (x for vertical rows, z for horizontal rows)
export const ROAD_RW = 5.5;            // road half width
export const SIDEWALK_W = 2.0;         // sidewalk width
export const BOUNDARY_R = 78;          // hard playable radius
export const WALL_D = 70;              // perimeter wall distance
export const PLAZA_CENTERS = [
  { x: -21, z: -21 }, { x: 21, z: -21 }, { x: -21, z: 21 }, { x: 21, z: 21 }
];

export const BUILDING_ZONE_HALF = 13.5; // half of the building area inside a 30x30 block

// Parking spots: the player can enter any car found here.
export const PARKING_SPOTS = [
  { x: 6.5,  z: -20,   h: 0 },                    // near the player spawn
  { x: -12,  z: -4.5,  h: Math.PI / 2 },          // center intersection corner
  { x: -18.5, z: -21,  h: 0 },                    // SW plaza
  { x: 24,   z: -24,   h: Math.PI / 2 },          // SE plaza
  { x: -24,  z: 24,    h: -Math.PI / 2 },         // NW plaza
  { x: 21,   z: 18,    h: Math.PI },              // NE plaza
  { x: -42 + 7.5, z: -24, h: 0 },                 // shoulder of vertical road
  { x: 42 - 7.5,  z: 24,  h: Math.PI },           // shoulder of vertical road
  { x: 24,   z: 42 - 6,  h: Math.PI / 2 },        // shoulder of horizontal road
  { x: -24,  z: -42 + 6, h: -Math.PI / 2 },       // shoulder of horizontal road
];

// Player spawn point (sidewalk near the first parking spot).
export const PLAYER_SPAWN = { x: 6.5, z: -12 };

// ---- Small deterministic RNG ---------------------------------------------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Collision helpers (circle vs AABB, boundary clamp) ------------------
export function collideCircle(px, pz, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (px + r > b.minX && px - r < b.maxX && pz + r > b.minZ && pz - r < b.maxZ) {
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      let dx = px - cx, dz = pz - cz;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-5) {
        // center inside the box -> push along the smallest penetration axis
        const pl = px - b.minX, pr = b.maxX - px, pb = pz - b.minZ, pt = b.maxZ - pz;
        const m = Math.min(pl, pr, pb, pt);
        if (m === pl) px = b.minX - r;
        else if (m === pr) px = b.maxX + r;
        else if (m === pb) pz = b.minZ - r;
        else pz = b.maxZ + r;
        continue;
      }
      const need = r - dist;
      if (need > 0) {
        px += (dx / dist) * need;
        pz += (dz / dist) * need;
      }
    }
  }
  return [px, pz];
}

export function clampBoundary(x, z, r) {
  const d = Math.hypot(x, z);
  const lim = BOUNDARY_R - r;
  if (d > lim) {
    const k = lim / d;
    return [x * k, z * k];
  }
  return [x, z];
}

export function isBlocked(x, z, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if (Math.hypot(x - cx, z - cz) < r) return true;
    }
  }
  return false;
}

// ---- Shared geometries / materials ---------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const SPH = new THREE.SphereGeometry(1, 10, 8);
const FOLIAGE = new THREE.SphereGeometry(1, 8, 6);
const CONE = new THREE.CylinderGeometry(0.12, 0.3, 0.5, 6);

const M = {};
M.ground = new THREE.MeshLambertMaterial({ color: 0x6fae57 });
M.asphalt = new THREE.MeshLambertMaterial({ color: 0x3b3b41 });
M.asphaltLight = new THREE.MeshLambertMaterial({ color: 0x45454d });
M.line = new THREE.MeshBasicMaterial({ color: 0xcfd4da });
M.cross = new THREE.MeshBasicMaterial({ color: 0xd8dde4 });
M.sidewalk = new THREE.MeshLambertMaterial({ color: 0x9b9b95 });
M.wall = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
M.trunk = new THREE.MeshLambertMaterial({ color: 0x6b4b2a });
M.foliage = new THREE.MeshLambertMaterial({ color: 0x3f8f4c });
M.stone = new THREE.MeshLambertMaterial({ color: 0xa8adb4 });
M.water = new THREE.MeshLambertMaterial({ color: 0x5fb7d9 });
M.bench = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
M.cone = new THREE.MeshLambertMaterial({ color: 0xe86a3c });
const BUILDING_COLORS = [0x9aa4ae, 0xd8c39a, 0xb5653a, 0x7a8fa8, 0x9b6f8c,
  0x97999b, 0xc9c9c9, 0x8f8f9a, 0xa3b18a, 0xc08457, 0x6f7f9c, 0xaeae96];

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addBox(target, mat, x, y, z, w, h, d, ry) {
  const m = new THREE.Mesh(BOX, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  if (ry) m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  target.add(m);
  return m;
}

// ---- Main world builder --------------------------------------------------
export function createWorld(physicsWorld) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb9e4);
  scene.fog = new THREE.Fog(0x8fb9e4, 140, 340);

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 700);
  camera.position.set(8, 10, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'game-canvas';
  document.body.appendChild(renderer.domElement);

  // ---- Lighting ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a4a40, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2df, 1.15);
  sun.position.set(60, 95, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
  scene.add(sun);

  // ---- Ground plane ------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);

  const colliders = [];

  buildRoads(scene);
  buildSidewalks(scene);
  buildBuildings(scene, physicsWorld, colliders);
  buildPlazas(scene);
  buildStreetProps(scene);
  buildPerimeter(scene, physicsWorld, colliders);

  // ---- Night mode references ---------------------------------------------
  const night = {
    enabled: false,
    scene, hemi, sun,
    lampGlows: glowRefs,
  };
  night.set = function (on) {
    this.enabled = on;
    this.scene.background = new THREE.Color(on ? 0x0c1226 : 0x8fb9e4);
    this.scene.fog.color.set(on ? 0x0c1226 : 0x8fb9e4);
    this.hemi.intensity = on ? 0.35 : 1.0;
    this.sun.intensity = on ? 0.12 : 1.15;
    for (let i = 0; i < this.lampGlows.length; i++) {
      this.lampGlows[i].emissiveIntensity = on ? 2.6 : 0.4;
    }
  };

  return {
    scene, renderer, camera, night, colliders,
  };
}

// ---- Roads & lane markings -----------------------------------------------
function buildRoads(scene) {
  // horizontal road strips (along X) at each z centerline
  for (let i = 0; i < ROADS.length; i++) {
    const z = ROADS[i];
    addBox(scene, M.asphalt, 0, 0.045, z, 700, 0.09, ROAD_RW * 2);
    // edge lines
    for (const s of [-1, 1]) {
      addBox(scene, M.line, 0, 0.1, z + s * (ROAD_RW - 0.35), 700, 0.03, 0.22);
    }
    // center dashes
    for (let x = -66; x <= 66; x += 6) {
      if (x > -60) addBox(scene, M.line, x, 0.1, z, 3.2, 0.03, 0.24);
    }
  }
  // vertical road strips (along Z) at each x centerline
  for (let i = 0; i < ROADS.length; i++) {
    const x = ROADS[i];
    addBox(scene, M.asphalt, x, 0.045, 0, ROAD_RW * 2, 0.09, 700);
    for (const s of [-1, 1]) {
      addBox(scene, M.line, x + s * (ROAD_RW - 0.35), 0.1, 0, 0.22, 0.03, 700);
    }
    for (let z = -66; z <= 66; z += 6) {
      if (z > -60) addBox(scene, M.line, x, 0.1, z, 0.24, 0.03, 3.2);
    }
  }
  // crosswalk stripes at every intersection
  for (const x of ROADS) {
    for (const z of ROADS) {
      // north side of intersection
      for (const s of [-ROAD_RW + 0.8, -ROAD_RW + 1.9, ROAD_RW - 1.9, ROAD_RW - 0.8]) {
        addBox(scene, M.cross, x - 3.2, 0.1, z + s, 1.1, 0.03, 0.7);
        addBox(scene, M.cross, x + 3.2, 0.1, z + s, 1.1, 0.03, 0.7);
        addBox(scene, M.cross, x - 4.2, 0.1, z + s, 0.7, 0.03, 0.7);
        addBox(scene, M.cross, x + 4.2, 0.1, z + s, 0.7, 0.03, 0.7);
      }
      for (const s of [-3.6, -2.5, 2.5, 3.6]) {
        addBox(scene, M.cross, x + s, 0.1, z - 5.6, 0.7, 0.03, 6.4);
      }
    }
  }
}

// ---- Sidewalks -----------------------------------------------------------
function buildSidewalks(scene) {
  for (let i = 0; i < ROADS.length; i++) {
    const c = ROADS[i];
    for (const s of [-1, 1]) {
      const os = s * (ROAD_RW + SIDEWALK_W / 2);
      addBox(scene, M.sidewalk, 0, 0.055, c + os, 700, 0.055, SIDEWALK_W);
      addBox(scene, M.sidewalk, c + os, 0.055, 0, SIDEWALK_W, 0.055, 700);
    }
  }
}

// ---- Buildings -----------------------------------------------------------
function buildBuildings(scene, physicsWorld, colliders) {
  const rng = mulberry32(2024);
  const matCache = new Map();
  for (const p of PLAZA_CENTERS) {
    const zoneMin = p.x - BUILDING_ZONE_HALF;
    const zoneMax = p.x + BUILDING_ZONE_HALF;
    const zMin = p.z - BUILDING_ZONE_HALF;
    const zMax = p.z + BUILDING_ZONE_HALF;
    const L = 11, depth = 8;
    const posA = zoneMin + 6, posB = zoneMax - 6;
    // bottom / top rows: long along X
    const xBuildings = [
      { x: posA, z: zMin + depth / 2, w: L, d: depth },
      { x: posB, z: zMin + depth / 2, w: L, d: depth },
      { x: posA, z: zMax - depth / 2, w: L, d: depth },
      { x: posB, z: zMax - depth / 2, w: L, d: depth },
    ];
    // left / right rows: long along Z
    const zBuildings = [
      { x: zoneMin + depth / 2, z: posA, w: depth, d: L },
      { x: zoneMin + depth / 2, z: posB, w: depth, d: L },
      { x: zoneMax - depth / 2, z: posA, w: depth, d: L },
      { x: zoneMax - depth / 2, z: posB, w: depth, d: L },
    ];
    for (const b of xBuildings.concat(zBuildings)) {
      const hgt = 5 + rng() * 18;
      const col = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
      let mat = matCache.get(col);
      if (!mat) { mat = new THREE.MeshLambertMaterial({ color: col }); matCache.set(col, mat); }
      const hgt2 = hgt / 2;
      addBox(scene, mat, b.x, hgt2, b.z, b.w, hgt, b.d);
      colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });

      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(b.w / 2, hgt / 2, b.d / 2)),
        position: new CANNON.Vec3(b.x, hgt / 2, b.z),
      });
      physicsWorld.addBody(body);
    }
  }
}

// ---- Plaza props: fountain + benches + trees -----------------------------
function buildPlazas(scene) {
  for (const p of PLAZA_CENTERS) {
    const cy = p.x, cz = p.z;
    const pool = mesh(new THREE.CylinderGeometry(4.4, 5, 0.4, 10), M.stone);
    pool.position.set(cy, 0.2, cz);
    scene.add(pool);
    const water = mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.25, 10), M.water);
    water.position.set(cy, 0.35, cz);
    scene.add(water);
    const jet = mesh(new THREE.CylinderGeometry(0.5, 0.9, 3.2, 8), M.stone);
    jet.position.set(cy, 1.9, cz);
    scene.add(jet);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const bx = cy + Math.cos(a) * 7.4;
      const bz = cz + Math.sin(a) * 7.4;
      addBox(scene, M.bench, bx, 0.35, bz, 1.8, 0.7, 0.7, -a);
      const tx = cy + Math.cos(a + 0.6) * 9.5;
      const tz = cz + Math.sin(a + 0.6) * 9.5;
      addTree(scene, tx, tz, 1);
    }
  }
}

// ---- Street props: lamps + trees + cones --------------------------------
function buildStreetProps(scene) {
  for (const c of ROADS) {
    let side = 1, x = -66;
    let n = 0;
    while (x <= 66) {
      const lx = x, lz = c + side * (ROAD_RW + 1.1);
      addLamp(scene, lx, lz);
      side *= -1; n++;
      x += (n % 3 === 0) ? 12 : 8;
    }
    side = -1;
    let xx = -60;
    n = 0;
    while (xx <= 60) {
      if (n % 2 === 0) {
        const tx = xx, tz = c + side * (ROAD_RW + 2.3);
        if (Math.abs(tx) > 4 && Math.abs(tz) > 4) addTree(scene, tx, tz, 0.9 + mulberry32(tx * 7 + tz * 11)() * 0.4);
      }
      side *= -1; n++; xx += 16;
    }
  }
  // traffic cones near intersections
  for (const x of ROADS) {
    for (const z of ROADS) {
      for (const [ox, oz] of [[x + ROAD_RW + 0.4, z + 1.4], [x - ROAD_RW - 0.4, z - 1.4],
                             [x + 1.4, z + ROAD_RW + 0.4], [x - 1.4, z - ROAD_RW - 0.4]]) {
        const cone = mesh(CONE, M.cone);
        cone.position.set(ox, 0.25, oz);
        scene.add(cone);
      }
    }
  }
  // distant trees beyond the walls for horizon depth
  const rng = mulberry32(99);
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const d = WALL_D + 6 + rng() * 70;
    addTree(scene, Math.cos(a) * d, Math.sin(a) * d, 1 + rng() * 0.6);
  }
}

function addTree(scene, x, z, s) {
  const trunk = mesh(CYL8, M.trunk);
  trunk.scale.set(s * 0.28, s, s * 0.28);
  trunk.position.set(x, s * 1.1, z);
  trunk.castShadow = false;
  scene.add(trunk);
  for (let i = 0; i < 3; i++) {
    const f = mesh(FOLIAGE, M.foliage);
    const yy = s * (1.8 + i * 0.7);
    const rr = s * (1.2 - i * 0.22);
    f.scale.set(rr, rr, rr);
    f.position.set(x, yy, z);
    f.castShadow = false;
    scene.add(f);
  }
}

function addLamp(scene, x, z) {
  const pole = mesh(CYL6, M.wall);
  pole.scale.set(0.12, 3.4, 0.12);
  pole.position.set(x, 1.7, z);
  scene.add(pole);
  const arm = new THREE.Mesh(BOX, M.wall);
  arm.scale.set(0.1, 0.1, 1.2);
  arm.position.set(x, 3.35, z - 0.5);
  scene.add(arm);
  const head = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xfff6cf }));
  head.scale.set(0.3, 0.3, 0.3);
  head.position.set(x, 3.32, z - 1.08);
  scene.add(head);
  // keep reference to glow material for night mode
  glowRefs.push(head.material);
}

// Glow materials collected for night mode (module-level; shared with night.lampGlows).
const glowRefs = [];

// ---- Perimeter walls (with gaps at road exits) ---------------------------
function buildPerimeter(scene, physicsWorld, colliders) {
  const roadGapX = ROADS.map(r => [r - 8, r + 8]);
  const roadGapZ = ROADS.map(r => [r - 8, r + 8]);
  // walls along Z=±D (long along X)
  for (const s of [-1, 1]) {
    let x = -WALL_D;
    while (x < WALL_D) {
      const w = 6;
      let blocked = false;
      for (const [g0, g1] of roadGapX) if (x + w > g0 && x < g1) { blocked = true; break; }
      if (!blocked) {
        addWall(scene, physicsWorld, colliders, x + w / 2, 0, s * WALL_D, w, 2.6, 0.5);
      }
      x += w;
    }
  }
  // walls along X=±D (long along Z)
  for (const s of [-1, 1]) {
    let z = -WALL_D;
    while (z < WALL_D) {
      const w = 6;
      let blocked = false;
      for (const [g0, g1] of roadGapZ) if (z + w > g0 && z < g1) { blocked = true; break; }
      if (!blocked) {
        addWall(scene, physicsWorld, colliders, s * WALL_D, 0, z + w / 2, 0.5, 2.6, w);
      }
      z += w;
    }
  }
}

function addWall(scene, physicsWorld, colliders, x, y, z, w, h, d) {
  addBox(scene, M.wall, x, h / 2, z, w, h, d);
  addBox(scene, M.wall, x, h + 0.12, z, w, 0.24, d);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    position: new CANNON.Vec3(x, h / 2, z),
  });
  physicsWorld.addBody(body);
}
