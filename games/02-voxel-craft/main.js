import { World, AIR, WATER, WORLD_W, WORLD_H, WORLD_D, CHUNK } from "./world.js";
import { buildChunkMesh } from "./mesher.js";
import { Player } from "./player.js";
import * as ui from "./ui.js";

let THREE = null;
async function loadThree() {
  const candidates = [
    "https://unpkg.com/three@0.160.0/build/three.module.js",
    "./vendor/three.module.js",
  ];
  for (const url of candidates) {
    try {
      const mod = await import(url);
      if (mod && mod.WebGLRenderer && mod.Scene) { THREE = mod; return url; }
    } catch (e) {
      console.warn("Three.js failed to load from " + url, e);
    }
  }
  return null;
}

const SAVE_KEY = "voxelcraft-save-v1";
const MAX_REACH = 6;
const BREAK_COOLDOWN = 0.16;
const PLACE_COOLDOWN = 0.18;

let canvas, renderer, scene, camera;
let sunLight, hemiLight, fogColor;
let world, player;
let chunkGroup, chunkMeshes, solidMat, waterMat;
let highlight;

let playing = false;
let pointerLocked = false;
let lockFallback = false;
let lockFallbackTimer = null;
let breakCd = 0;
let placeCd = 0;
let lastTime = 0;
let fpsEma = 60;
let fpsTimer = 0;

let dayTime = 0.28;
let cycleOn = true;

let currentHit = null;
let rayDir = null;
let rayOrigin = null;

const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };

/* ---------------- Sfx ---------------- */
class Sfx {
  constructor() { this.ctx = null; }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  tone(f0, f1, dur, type, vol) {
    const c = this.ensure();
    if (!c || c.state !== "running") return;
    try {
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(Math.max(1, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  noise(dur, vol) {
    const c = this.ensure();
    if (!c || c.state !== "running") return;
    try {
      const t = c.currentTime;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 900;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t);
    } catch (e) {}
  }
  breakSound() { this.noise(0.09, 0.22); }
  placeSound() { this.tone(190, 95, 0.09, "triangle", 0.18); }
  jump() { this.tone(135, 215, 0.08, "sine", 0.07); }
}
const sfx = new Sfx();

/* ---------------- Sky ---------------- */
let skyCanvas, skyTex;
const DAY = [[61, 127, 196], [155, 207, 228], [168, 216, 239]];
const NIGHT = [[7, 11, 26], [12, 19, 40], [16, 26, 51]];
let lastSkyKey = "";

function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function dayFactor(ang) {
  const e = Math.sin(ang);
  return THREE.MathUtils.clamp(e * 2.4 + 0.28, 0.14, 1.15);
}

function updateSky() {
  const ang = dayTime * Math.PI * 2;
  const df = dayFactor(ang);
  const top = mixColor(NIGHT[0], DAY[0], df);
  const mid = mixColor(NIGHT[1], DAY[1], df);
  const hor = mixColor(NIGHT[2], DAY[2], df);
  const key = df.toFixed(3);
  if (key !== lastSkyKey) {
    lastSkyKey = key;
    const ctx = skyCanvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgb(" + top.map(Math.round).join(",") + ")");
    g.addColorStop(0.5, "rgb(" + mid.map(Math.round).join(",") + ")");
    g.addColorStop(1, "rgb(" + hor.map(Math.round).join(",") + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    skyTex.needsUpdate = true;
  }
  fogColor.copy(new THREE.Color("rgb(" + hor.map(Math.round).join(",") + ")"));
  scene.fog.color.copy(fogColor);

  const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.35).normalize();
  sunLight.position.copy(sunDir).multiplyScalar(90);
  sunLight.intensity = 1.3 * df;
  const warm = 1 - THREE.MathUtils.clamp(Math.sin(ang) * 3 + 0.7, 0, 1);
  sunLight.color.setRGB(1, 0.62 + 0.38 * warm, 0.45 + 0.55 * warm);
  hemiLight.intensity = 0.22 + 0.75 * df;
  const hs = mixColor([6, 9, 20], [110, 170, 230], df);
  hemiLight.color.setRGB(hs[0] / 255, hs[1] / 255, hs[2] / 255);
}

/* ---------------- Clouds ---------------- */
let clouds;

function buildClouds() {
  clouds = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const w = 4 + Math.random() * 6;
      const h = 1 + Math.random() * 1.4;
      const d = 3 + Math.random() * 5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 8);
      g.add(m);
    }
    g.position.set(Math.random() * 80 - 10, 48 + Math.random() * 10, Math.random() * 80 - 10);
    g.userData.speed = 0.5 + Math.random() * 0.8;
    scene.add(g);
    clouds.push(g);
  }
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 82) c.position.x = -12;
  }
}

/* ---------------- Particles ---------------- */
const MAX_P = 600;
const pPos = new Float32Array(MAX_P * 3);
const pCol = new Float32Array(MAX_P * 3);
const pVel = new Float32Array(MAX_P * 3);
const pLife = new Float32Array(MAX_P);
let pCount = 0;
let pGeom, points;

function initParticles() {
  pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeom.setAttribute("color", new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  pGeom.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true });
  points = new THREE.Points(pGeom, mat);
  scene.add(points);
}

function spawnParticles(x, y, z, hex) {
  const n = parseInt(hex.replace("0x", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0; i < 12; i++) {
    if (pCount >= MAX_P) return;
    const base = pCount * 3;
    pPos[base] = x + (Math.random() - 0.5) * 0.5;
    pPos[base + 1] = y + (Math.random() - 0.5) * 0.5;
    pPos[base + 2] = z + (Math.random() - 0.5) * 0.5;
    pVel[base] = (Math.random() - 0.5) * 5;
    pVel[base + 1] = Math.random() * 4 + 1;
    pVel[base + 2] = (Math.random() - 0.5) * 5;
    pCol[base] = r / 255;
    pCol[base + 1] = g / 255;
    pCol[base + 2] = b / 255;
    pLife[pCount] = 0.5 + Math.random() * 0.6;
    pCount++;
  }
  pGeom.setDrawRange(0, pCount);
}

function updateParticles(dt) {
  for (let i = pCount - 1; i >= 0; i--) {
    const b = i * 3;
    pVel[b + 1] -= 22 * dt;
    pPos[b] += pVel[b] * dt;
    pPos[b + 1] += pVel[b + 1] * dt;
    pPos[b + 2] += pVel[b + 2] * dt;
    pLife[i] -= dt;
    if (pLife[i] <= 0) {
      const last = pCount - 1;
      const lb = last * 3;
      for (let k = 0; k < 3; k++) {
        pPos[b + k] = pPos[lb + k];
        pVel[b + k] = pVel[lb + k];
        pCol[b + k] = pCol[lb + k];
      }
      pLife[i] = pLife[last];
      pCount--;
    }
  }
  pGeom.attributes.position.needsUpdate = true;
  pGeom.attributes.color.needsUpdate = true;
  pGeom.setDrawRange(0, pCount);
}

/* ---------------- Chunks ---------------- */
function makeGeometry(data) {
  if (!data) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(data.nor), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(data.col), 3));
  const idx = data.idx.length > 65535 ? new Uint32Array(data.idx) : new Uint16Array(data.idx);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function rebuildChunk(cx, cz) {
  const key = cx + "," + cz;
  const res = buildChunkMesh(world, cx, cz);
  let group = chunkMeshes.get(key);
  if (!group) {
    group = new THREE.Group();
    group.position.set(cx * CHUNK, 0, cz * CHUNK);
    chunkGroup.add(group);
    chunkMeshes.set(key, group);
  }
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  if (res.solid) {
    const m = new THREE.Mesh(makeGeometry(res.solid), solidMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  if (res.water) {
    group.add(new THREE.Mesh(makeGeometry(res.water), waterMat));
  }
}

function rebuildAllChunks() {
  chunkMeshes.clear();
  while (chunkGroup.children.length) {
    const c = chunkGroup.children[0];
    chunkGroup.remove(c);
  }
  for (let cx = 0; cx < world.chunkCountX; cx++) {
    for (let cz = 0; cz < world.chunkCountZ; cz++) rebuildChunk(cx, cz);
  }
}

function drainChunks(limit) {
  const dirty = world.takeDirty();
  let n = 0;
  for (const key of dirty) {
    if (n >= limit) break;
    const p = key.split(",");
    rebuildChunk(+p[0], +p[1]);
    n++;
  }
  if (dirty.length - n > 0) {
    for (const key of dirty.slice(n)) world.dirtyChunks.add(key);
  }
}

/* ---------------- Raycast ---------------- */
function voxelRaycast(ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tx = sx !== 0 ? Math.abs(1 / dx) : Infinity;
  const ty = sy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tz = sz !== 0 ? Math.abs(1 / dz) : Infinity;
  let mx = sx > 0 ? (x + 1 - ox) / dx : sx < 0 ? (x - ox) / dx : Infinity;
  let my = sy > 0 ? (y + 1 - oy) / dy : sy < 0 ? (y - oy) / dy : Infinity;
  let mz = sz > 0 ? (z + 1 - oz) / dz : sz < 0 ? (z - oz) / dz : Infinity;
  let nx = 0, ny = 0, nz = 0;
  const maxSteps = 128;
  for (let i = 0; i < maxSteps; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== AIR && id !== WATER) return { x, y, z, nx, ny, nz };
    if (mx < my && mx < mz) {
      if (mx > maxDist) return null;
      x += sx; mx += tx;
      nx = -sx; ny = 0; nz = 0;
    } else if (my < mz) {
      if (my > maxDist) return null;
      y += sy; my += ty;
      nx = 0; ny = -sy; nz = 0;
    } else {
      if (mz > maxDist) return null;
      z += sz; mz += tz;
      nx = 0; ny = 0; nz = -sz;
    }
  }
  return null;
}

/* ---------------- Interaction ---------------- */
function doBreak() {
  if (!currentHit || breakCd > 0) return;
  const { x, y, z } = currentHit;
  const id = world.getBlock(x, y, z);
  if (id === AIR || id === WATER) return;
  world.setBlock(x, y, z, AIR, true);
  spawnParticles(x + 0.5, y + 0.5, z + 0.5, blockHex(id));
  sfx.breakSound();
  breakCd = BREAK_COOLDOWN;
}

function blockHex(id) {
  const map = {
    1: "0x8ec96a", 2: "0x9a6b38", 3: "0x8c8e96",
    4: "0xe4d39c", 5: "0x8c5d38", 6: "0x6fc04e", 7: "0x448bc9"
  };
  return map[id] || "0xaaaaaa";
}

function inPlayerCell(px, py, pz) {
  const p = player.pos;
  const x0 = Math.floor(p.x - 0.3), x1 = Math.floor(p.x + 0.3);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + 1.8);
  const z0 = Math.floor(p.z - 0.3), z1 = Math.floor(p.z + 0.3);
  return px >= x0 && px <= x1 && py >= y0 && py <= y1 && pz >= z0 && pz <= z1;
}

function doPlace() {
  if (!currentHit || placeCd > 0) return;
  const px = currentHit.x + currentHit.nx;
  const py = currentHit.y + currentHit.ny;
  const pz = currentHit.z + currentHit.nz;
  if (!world.inBounds(px, py, pz)) return;
  if (inPlayerCell(px, py, pz)) return;
  const sel = ui.getSelected();
  if (world.setBlock(px, py, pz, sel, true)) {
    sfx.placeSound();
    placeCd = PLACE_COOLDOWN;
  }
}

/* ---------------- Save / Load / Reset ---------------- */
function saveWorld() {
  try {
    const data = { v: 1, seed: world.seed, edits: world.getEdits() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    ui.showToast("World saved (" + data.edits.length + " edits)");
  } catch (e) {
    ui.showToast("Save failed: storage unavailable");
  }
}

function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { ui.showToast("No saved world found"); return; }
    const data = JSON.parse(raw);
    world.generate(data.seed | 0 || 1);
    world.applyEdits(data.edits || []);
    rebuildAllChunks();
    ui.setSeedText(world.seed);
    player.spawn();
    ui.showToast("World loaded");
  } catch (e) {
    ui.showToast("Load failed");
  }
}

function regenerateWorld() {
  const seed = (Math.random() * 2147483647) | 0;
  world.generate(seed);
  rebuildAllChunks();
  ui.setSeedText(seed);
  player.spawn();
  ui.showToast("New world generated (seed " + seed + ")");
}

/* ---------------- Input ---------------- */
function onKeyDown(e) {
  if (!playing) return;
  if (e.code === "Escape" && lockFallback) {
    lockFallback = false;
    pointerLocked = false;
    ui.showPaused();
    return;
  }
  switch (e.code) {
    case "KeyW": input.forward = true; break;
    case "KeyS": input.back = true; break;
    case "KeyA": input.left = true; break;
    case "KeyD": input.right = true; break;
    case "ShiftLeft":
    case "ShiftRight": input.sprint = true; break;
    case "Space": input.jump = true; e.preventDefault(); break;
    case "Digit1": case "Numpad1": ui.selectSlot(0); break;
    case "Digit2": case "Numpad2": ui.selectSlot(1); break;
    case "Digit3": case "Numpad3": ui.selectSlot(2); break;
    case "Digit4": case "Numpad4": ui.selectSlot(3); break;
    case "Digit5": case "Numpad5": ui.selectSlot(4); break;
    case "Digit6": case "Numpad6": ui.selectSlot(5); break;
    case "KeyN":
      cycleOn = !cycleOn;
      ui.showToast("Day/night cycle: " + (cycleOn ? "ON" : "OFF"));
      break;
    case "KeyP": saveWorld(); break;
    case "KeyL": loadWorld(); break;
    case "KeyR":
      if (e.shiftKey) {
        regenerateWorld();
      } else {
        sfx.ensure();
        ui.showToast("Hold Shift and press R to regenerate the world");
      }
      break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case "KeyW": input.forward = false; break;
    case "KeyS": input.back = false; break;
    case "KeyA": input.left = false; break;
    case "KeyD": input.right = false; break;
    case "ShiftLeft":
    case "ShiftRight": input.sprint = false; break;
  }
}

function onMouseMove(e) {
  if (!playing) return;
  const sens = 0.0022;
  if (lockFallback) {
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.01;
    if (player.pitch > lim) player.pitch = lim;
    if (player.pitch < -lim) player.pitch = -lim;
    ui.moveCrosshair(e.clientX, e.clientY);
    return;
  }
  if (!pointerLocked) return;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  const lim = Math.PI / 2 - 0.01;
  if (player.pitch > lim) player.pitch = lim;
  if (player.pitch < -lim) player.pitch = -lim;
}

function onMouseDown(e) {
  if (!playing || !pointerLocked) return;
  if (e.button === 0) doBreak();
  else if (e.button === 2) doPlace();
}

function onWheel(e) {
  if (!playing || !pointerLocked) return;
  ui.cycleSlot(e.deltaY > 0 ? 1 : -1);
}

function requestLock() {
  if (lockFallback || !playing) return;
  if (lockFallbackTimer) clearTimeout(lockFallbackTimer);
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => scheduleFallback());
  } catch (e) {
    scheduleFallback();
    return;
  }
  lockFallbackTimer = setTimeout(() => {
    if (playing && document.pointerLockElement !== canvas) scheduleFallback();
  }, 700);
}

function scheduleFallback() {
  if (!playing || lockFallback) return;
  lockFallback = true;
  pointerLocked = true;
  ui.hidePaused();
  ui.showToast("Pointer lock unavailable - enabled mouse fallback (Esc to pause)");
  ui.centerCrosshair();
}

/* ---------------- Pointer lock / menu ---------------- */
function startGame() {
  if (playing) {
    requestLock();
    return;
  }
  if (!world || !player) {
    ui.setMenuMsg("Game not initialized — Three.js could not be loaded. Check the browser console.");
    return;
  }
  try {
    playing = true;
    const seedInput = ui.getSeedInput();
    const seed = seedInput !== "" && !isNaN(+seedInput) ? (+seedInput | 0) : (Math.random() * 2147483647) | 0;
    world.generate(seed);
    rebuildAllChunks();
    ui.setSeedText(seed);
    player.spawn();
    ui.hideMenu();
    requestLock();
  } catch (err) {
    playing = false;
    ui.setMenuMsg("Start failed: " + (err && err.message));
    console.error(err);
  }
}

window.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) {
    lockFallback = false;
    if (lockFallbackTimer) clearTimeout(lockFallbackTimer);
    pointerLocked = true;
    ui.hidePaused();
    ui.centerCrosshair();
  } else if (playing) {
    pointerLocked = false;
    if (!lockFallback) ui.showPaused();
  }
});

/* ---------------- Main loop ---------------- */
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastTime) / 1000 || 0.016);
  lastTime = t;

  if (cycleOn) {
    dayTime += dt * 0.006;
    if (dayTime > 1) dayTime -= 1;
  }
  updateSky();

  if (playing && pointerLocked) {
    player.update(dt, input, sfx);
  }
  const eye = player.eye();
  camera.position.set(eye.x, eye.y, eye.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  camera.getWorldDirection(rayDir);
  rayOrigin.copy(camera.position);
  currentHit = voxelRaycast(rayOrigin.x, rayOrigin.y, rayOrigin.z, rayDir.x, rayDir.y, rayDir.z, MAX_REACH);

  if (currentHit) {
    highlight.visible = true;
    highlight.position.set(currentHit.x + 0.5, currentHit.y + 0.5, currentHit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  breakCd -= dt;
  placeCd -= dt;
  drainChunks(2);
  updateClouds(dt);
  updateParticles(dt);

  renderer.render(scene, camera);

  fpsEma = fpsEma * 0.95 + (1 / Math.max(dt, 0.0001)) * 0.05;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fpsTimer = 0;
    ui.updateFPS(fpsEma.toFixed(0));
    ui.updateCoords(player.pos.x, player.pos.y, player.pos.z);
    const info = renderer.info.render;
    ui.updateDebug("draw calls: " + info.calls + " | tris: " + info.triangles);
  }
}

/* ---------------- Boot ---------------- */
function boot() {
  canvas = document.getElementById("game");
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    ui.setMenuMsg("WebGL is not available in this browser.");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  fogColor = new THREE.Color(0xa8d8ef);
  scene.fog = new THREE.Fog(fogColor.getHex(), 30, 115);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
  rayDir = new THREE.Vector3();
  rayOrigin = new THREE.Vector3();

  hemiLight = new THREE.HemisphereLight(0xb4d4ff, 0x5a4a3a, 0.85);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
  sunLight.position.set(60, 80, 30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -48;
  sunLight.shadow.camera.right = 48;
  sunLight.shadow.camera.top = 48;
  sunLight.shadow.camera.bottom = -48;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 180;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);
  scene.add(sunLight.target);

  skyCanvas = document.createElement("canvas");
  skyCanvas.width = 256;
  skyCanvas.height = 256;
  skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  initParticles();
  buildClouds();

  chunkGroup = new THREE.Group();
  scene.add(chunkGroup);
  chunkMeshes = new Map();
  solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false });

  world = new World();
  world.generate((Math.random() * 2147483647) | 0);
  rebuildAllChunks();
  ui.setSeedText(world.seed);

  player = new Player(world);
  player.spawn();
  ui.updateCoords(player.pos.x, player.pos.y, player.pos.z);

  const hg = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  highlight = new THREE.LineSegments(new THREE.EdgesGeometry(hg), new THREE.LineBasicMaterial({ color: 0xbfd9ff, transparent: true, opacity: 0.9 }));
  highlight.visible = false;
  scene.add(highlight);

  ui.initUI();
  ui.bindSlotSelect(() => {});

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

window.addEventListener("unhandledrejection", (e) => {
  const r = (e.reason && e.reason.message) || e.reason;
  try { ui.setMenuMsg(r ? "Error: " + r : "An async error occurred"); } catch (_) {}
  console.error(e.reason);
});

window.addEventListener("error", (e) => {
  try { ui.setMenuMsg(e.message ? "JS error: " + e.message : "A script error occurred"); } catch (_) {}
});

async function init() {
  try {
    canvas = document.getElementById("game");
    document.getElementById("play-btn").addEventListener("click", () => { sfx.ensure(); startGame(); });
    canvas.addEventListener("click", () => { if (playing) requestLock(); });
    document.getElementById("paused").addEventListener("click", () => { if (playing) requestLock(); });
    const src = await loadThree();
    if (!THREE) {
      ui.setMenuMsg("Could not load Three.js — no internet access to the CDN and no local copy. Run the game over http://localhost.");
      return;
    }
    console.log("Three.js loaded from " + src);
    boot();
  } catch (err) {
    ui.setMenuMsg("Init failed: " + (err && err.message));
    console.error(err);
  }
}

function ready(fn) {
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", fn);
  else fn();
}
ready(() => { init(); });