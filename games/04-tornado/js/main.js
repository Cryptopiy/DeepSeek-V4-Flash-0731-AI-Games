import * as THREE from './three.js';
import * as CANNON from 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';
import { PhysicsEngine } from './physics.js';
import { buildTown } from './town.js';
import { Tornado, LEVEL_NAMES, LEVEL_WORDS } from './tornado.js';
import * as Particles from './particles.js';
import { UI } from './ui.js';

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sunnySky = new THREE.Color(0x8fb6da);
const stormSky = new THREE.Color(0x2f3f4c);
scene.background = sunnySky.clone();
scene.fog = new THREE.Fog(0x8fb6da, 260, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 2000);

const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x5c6a4c, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.1);
sun.position.set(60, 90, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
{
  const c = sun.shadow.camera;
  c.left = -150; c.right = 150; c.top = 150; c.bottom = -150; c.near = 20; c.far = 320;
}
scene.add(sun);
const amb = new THREE.AmbientLight(0xffffff, 0.34);
scene.add(amb);

// ---------------- state ----------------
let engine = null;
let townGroup = null;
let tornado = null;
let paused = true;
let started = false;
const damagedHouses = new Set();
const lastDir = new THREE.Vector3(0, 0, -1);
let lastPrune = 0;

// ---------------- UI ----------------
const ui = new UI({
  onStart() {
    startGame();
  },
  onResume() {
    audio.init();
    togglePause();
  },
});
ui.overlayStart();
ui.setState('PAUSED');

// ---------------- town build / reset ----------------
function buildCity() {
  if (townGroup) scene.remove(townGroup);
  engine = new PhysicsEngine(scene);
  townGroup = new THREE.Group();
  scene.add(townGroup);
  buildTown(engine, townGroup);
  townGroup.updateMatrixWorld(true);
  engine.onBreak = onPieceBreak;
}

function onPieceBreak(def) {
  const p = new THREE.Vector3();
  def.group.getWorldPosition(p);
  Particles.burst(p, def.breakColor || 'wood', def.breakVel || 10);
  if (def.houseId != null) damagedHouses.add(def.houseId);
}

function resetAll() {
  buildCity();
  tornado.reset();
  Particles.clear();
  damagedHouses.clear();
  ui.setBroken(0);
  ui.setHouses(0);
  ui.setDebris(0);
  ui.flash('TOWN REBUILT — press E to raise strength');
}

// ---------------- tornado & particles ----------------
tornado = new Tornado(scene);
Particles.init(scene, renderer);
Particles.setWindFn((p, out) => {
  tornado.windAt(p, out);
  out.multiplyScalar(0.65);
});

buildCity();

// ---------------- storm audio ----------------
const audio = new (class StormAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this.filter = filter;
    this.windGain = gain;

    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 33;
    const rGain = ctx.createGain();
    rGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 5;
    lfo.connect(lfoAmt);
    lfoAmt.connect(rumble.frequency);
    rumble.connect(rGain);
    rGain.connect(ctx.destination);
    rumble.start();
    lfo.start();
    this.rumbleGain = rGain;
  }
  toggle() {
    this.muted = !this.muted;
    if (!this.ctx) return;
    this.update(0, true);
  }
  update(strength, pause) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.muted || pause) {
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.12);
      if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(Math.min(0.55, 0.05 + strength * 0.045), t, 0.3);
      this.filter.frequency.setTargetAtTime(150 + strength * 230, t, 0.35);
    }
    if (this.rumbleGain) {
      this.rumbleGain.gain.setTargetAtTime(strength >= 3 ? 0.08 * (strength - 2) : 0, t, 0.5);
    }
  }
})();

// ---------------- input ----------------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (started) audio.init();
  if (e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault();
    if (!started) {
      startGame();
    } else if (!e.repeat) togglePause();
  } else if (e.code === 'KeyC') {
    if (!e.repeat) cycleCamera();
  } else if (e.code === 'KeyR') {
    if (!e.repeat && started) resetAll();
  } else if (e.code === 'KeyM') {
    if (!e.repeat) {
      audio.toggle();
      ui.flash(audio.muted ? 'SOUND MUTED' : 'SOUND ON', 1200);
    }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function startGame() {
  if (started) return;
  started = true;
  paused = false;
  audio.init();
  ui.hideAll();
  ui.setState('RUNNING');
  ui.flash('The storm has arrived', 2000);
}

function togglePause() {
  paused = !paused;
  ui.overlayPause(paused);
  ui.setState(paused ? 'PAUSED' : 'RUNNING');
}

// ---------------- camera ----------------
const CAM_NAMES = ['FOLLOW', 'ORBIT', 'OVERVIEW'];
let camMode = 0;
let orbitYaw = 0.7;
let orbitPitch = 0.42;
let orbitDist = 62;
const camPos = new THREE.Vector3(-150, 60, 150);
const camLook = new THREE.Vector3(-100, 10, 120);
let shakeAmp = 0;
let dragging = false;
let prevX = 0;
let prevY = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging || camMode !== 1) return;
  orbitYaw += (e.clientX - prevX) * 0.005;
  orbitPitch += (e.clientY - prevY) * 0.004;
  orbitPitch = Math.max(-0.3, Math.min(1.4, orbitPitch));
  prevX = e.clientX;
  prevY = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', (e) => {
  if (camMode !== 1) return;
  e.preventDefault();
  orbitDist = Math.max(28, Math.min(150, orbitDist + e.deltaY * 0.05));
}, { passive: false });

const camTmp = new THREE.Vector3();
function updateCamera(dt) {
  const t = tornado.pos;
  let target;
  if (camMode === 0) {
    let dir = lastDir;
    if (dir.lengthSq() < 0.0001) dir = camTmp.set(0, 0, -1);
    target = new THREE.Vector3(
      t.x - dir.x * 46,
      34,
      t.z - dir.z * 46
    );
  } else if (camMode === 1) {
    target = new THREE.Vector3(
      t.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist,
      12 + Math.sin(orbitPitch) * orbitDist,
      t.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist
    );
  } else {
    target = new THREE.Vector3(0, 104, 232);
  }

  // smooth interpolation
  const k = 1 - Math.exp(-3.0 * dt);
  camPos.lerp(target, k);
  const lookTarget = camMode === 2
    ? camTmp.set(0, 10, 30)
    : camTmp.set(t.x, 16, t.z);
  camLook.lerp(lookTarget, k);

  const d = camPos.distanceTo(tornado.pos);
  const prox = Math.max(0, 1 - d / 130);
  shakeAmp = prox * (tornado.strength / 5) * 0.38;
  const sx = camPos.x + (Math.random() - 0.5) * 2 * shakeAmp;
  const sy = camPos.y + (Math.random() - 0.5) * 2 * shakeAmp;
  const sz = camPos.z + (Math.random() - 0.5) * 2 * shakeAmp;
  camera.position.set(sx, sy, sz);
  camera.lookAt(camLook);
}

function cycleCamera() {
  camMode = (camMode + 1) % 3;
  ui.setCam(CAM_NAMES[camMode]);
  ui.flash('CAMERA: ' + CAM_NAMES[camMode], 1300);
}

// ---------------- simulation step ----------------
const _wind = new THREE.Vector3();
const _cf = new CANNON.Vec3();
const _ct = new CANNON.Vec3();
const _nul = new CANNON.Vec3();

function readInput(dt) {
  if (paused) return;
  const mv = camTmp;
  mv.set(0, 0, 0);
  if (keys['ArrowLeft'] || keys['KeyA']) mv.x -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) mv.x += 1;
  if (keys['ArrowUp'] || keys['KeyW']) mv.z -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) mv.z += 1;
  if (mv.lengthSq() > 0.0001) {
    mv.normalize();
    lastDir.copy(mv);
  }
  tornado.move(dt, mv, keys['ShiftLeft'] || keys['ShiftRight']);
  if (keys['KeyQ']) tornado.strength = Math.max(1, tornado.strength - dt * 2.5);
  if (keys['KeyE']) tornado.strength = Math.min(5, tornado.strength + dt * 2.5);
}

function applyWind() {
  engine.forEachDynamic((body) => {
    const ex = tornado.windAt(body.position, _wind);
    if (ex < 1) return;
    const m = body.mass;
    _cf.set(_wind.x * m, _wind.y * m, _wind.z * m);
    body.applyForce(_cf, _nul);
    const k = 0.06 * m * Math.min(ex, 300);
    _ct.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    body.applyTorque(_ct);
  });
}

function checkDamage() {
  for (const def of engine.breakables) {
    if (def.broken) continue;
    const ex = tornado.exposureAt(def.body.position);
    if (ex > def.threshold * def.resist) {
      engine.breakDef(def);
      continue;
    }
    if (def.kind === 'tree' && def.crown) {
      const amt = Math.min(1, ex / (def.threshold * def.resist));
      def.crown.rotation.z = amt * Math.sin(tornado.time * 5.2 + def.phase) * 0.4;
    }
  }
}

function updateLighting() {
  const d = tornado.stormAmount;
  scene.background.copy(sunnySky).lerp(stormSky, d * 0.85);
  scene.fog.color.copy(sunnySky).lerp(stormSky, d * 0.75);
  scene.fog.near = 260 - d * 130;
  scene.fog.far = 720 - d * 330;
  hemi.intensity = 0.95 - d * 0.42;
  sun.intensity = 1.1 - d * 0.75;
  amb.intensity = 0.34 + d * 0.14;
}

let hudAccum = 0;
function updateHud(dt) {
  hudAccum += dt;
  if (hudAccum < 0.22) return;
  hudAccum = 0;
  const s = tornado.strength;
  const lvl = Math.max(1, Math.min(5, Math.round(s)));
  ui.setStrength(lvl, `${LEVEL_NAMES[lvl - 1]} · ${LEVEL_WORDS[lvl - 1]}`);
  ui.setWind(Math.round(80 + 55 * (lvl - 1)));
  ui.setBroken(engine.breakableCount());
  ui.setHouses(damagedHouses.size);
  ui.setDebris(engine.activeDebris());
}

function update(dt) {
  readInput(dt);
  tornado.update(dt);
  applyWind();
  checkDamage();
  engine.step(dt);
  if (performance.now() - lastPrune > 700) {
    lastPrune = performance.now();
    engine.prune(130, { x: 0, y: 0, z: 20 }, 430);
  }
  Particles.update(dt);
  updateCamera(dt);
  updateLighting();
  updateHud(dt);
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let audioAccum = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started && !paused) update(dt);
  audioAccum += dt;
  if (started && audioAccum > 0.25) {
    audioAccum = 0;
    audio.update(tornado.strength, paused);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});

updateCamera(0.05);
animate();

// handle idle focus: stop key-repeat sticking when window loses focus
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});