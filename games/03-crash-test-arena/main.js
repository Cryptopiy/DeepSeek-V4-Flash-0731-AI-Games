import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { physics } from './physics.js';
import { PlayerCar } from './vehicle.js';
import { ParticleSystem, DamageManager } from './damage.js';
import { ScenarioManager, SCENARIOS } from './scenarios.js';
import { UI } from './ui.js';

const CAMERA_MODES = ['CHASE', 'HOOD', 'ORBIT'];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true });
} catch (err) {
  console.error(err);
  new UI({}).showError('WebGL is not available in this browser: ' + err.message);
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ef);
scene.fog = new THREE.Fog(0x9ec9ef, 90, 190);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, 12);

// ----- lighting ------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3630, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
sun.position.set(28, 45, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0xbfe3ff, 0.35);
fill.position.set(-30, 20, -25);
scene.add(fill);

// ----- ground --------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 60),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

physics.addGround();

// ----- entities ------------------------------------------------------------
const car = new PlayerCar(scene);
const particles = new ParticleSystem(scene);

const ui = new UI({
  scenario: (key) => scenario.load(key),
  reset: () => resetCar(),
  reload: () => scenario.load(scenario.current),
  slowmo: () => { userSlow = !userSlow; },
  camera: () => cycleCamera(1),
});

let userSlow = false;
let slowT = 0;
let shakeMag = 0;
let shakeT = 0;

const app = {
  particles,
  shake(mag) {
    shakeMag = Math.max(shakeMag, Math.min(1, mag));
    shakeT = Math.max(shakeT, 0.55);
  },
  slowPulse(sec) {
    if (sec > 0) slowT = Math.max(slowT, sec);
  },
  onCrash(info) {
    ui.setImpact(info);
    ui.showCrash(info);
  },
  onDamageUpdate() {
    ui.setDamage(damage.zonePct());
    ui.setCondition(damage.conditionPct());
  },
};

const damage = new DamageManager(car, app);
const scenario = new ScenarioManager(scene, car);
scenario.onScenarioChanged = (label) => {
  ui.setScenario(label, scenario.current);
  particles.reset();
  applyShadowsToScene();
};

// ----- cameras -------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enabled = false;

let camMode = 0;

function cycleCamera(dir) {
  camMode = (camMode + dir + CAMERA_MODES.length) % CAMERA_MODES.length;
  controls.enabled = camMode === 2;
  if (camMode === 2) {
    controls.target.copy(car.getWorldPosition());
    controls.update();
  }
  ui.setCameraMode(camMode);
}

function updateCamera(dt) {
  if (camMode === 2) {
    controls.target.copy(car.getWorldPosition());
    controls.update();
    return;
  }

  const carPos = car.getWorldPosition();
  const q = car.getWorldQuaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = car.getWorldForward(new THREE.Vector3());

  if (camMode === 0) {
    const offset = new THREE.Vector3(0, 2.7, -7.0).applyQuaternion(q);
    const desired = carPos.clone().add(offset);
    const k = 1 - Math.exp(-6 * dt);
    camera.position.lerp(desired, k);
    const look = carPos.clone().addScaledVector(up, 0.9);
    camera.lookAt(look);
  } else {
    // Hood camera
    const desired = carPos.clone().add(new THREE.Vector3(0, 1.0, 0.7).applyQuaternion(q));
    const k = 1 - Math.exp(-12 * dt);
    camera.position.lerp(desired, k);
    const look = carPos.clone().addScaledVector(fwd, 40).addScaledVector(up, 0.5);
    camera.lookAt(look);
  }

  applyShake(dt);
}

function applyShake(dt) {
  if (shakeT > 0) {
    shakeT -= dt;
    const m = shakeMag * Math.min(1, shakeT / 0.35) * 0.4;
    camera.position.x += (Math.random() - 0.5) * m;
    camera.position.y += (Math.random() - 0.5) * m;
    camera.position.z += (Math.random() - 0.5) * m;
  } else {
    shakeMag = 0;
  }
}

// ----- input ---------------------------------------------------------------
const input = { throttle: 0, reverse: 0, steer: 0, handbrake: false };

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  switch (e.code) {
    case 'KeyW': input.throttle = 1; break;
    case 'KeyS': input.reverse = 1; break;
    case 'KeyA': input.steer = -1; break;
    case 'KeyD': input.steer = 1; break;
    case 'Space': input.handbrake = true; break;
    case 'KeyR': resetCar(); break;
    case 'KeyC': cycleCamera(1); break;
    case 'KeyT': userSlow = !userSlow; break;
    case 'Enter': scenario.load(scenario.current); break;
    case 'Digit1': scenario.load('wall'); break;
    case 'Digit2': scenario.load('twocar'); break;
    case 'Digit3': scenario.load('ramp'); break;
    case 'Digit4': scenario.load('arena'); break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': input.throttle = 0; break;
    case 'KeyS': input.reverse = 0; break;
    case 'KeyA': if (input.steer === -1) input.steer = 0; break;
    case 'KeyD': if (input.steer === 1) input.steer = 0; break;
    case 'Space': input.handbrake = false; break;
  }
});

// ----- reset helper --------------------------------------------------------
function resetCar() {
  damage.repairAll();
  car.reset(scenario.spawn, scenario.spawnQuat);
  particles.reset();
  ui.hideCrash();
  ui.setDamage({ front: 0, rear: 0, left: 0, right: 0 });
  ui.setCondition(100);
  ui.setImpact({ speed: 0, energy: 0, severity: 'none', label: '—' });
  scenario.onScenarioChanged && scenario.onScenarioChanged(SCENARIOS[scenario.current].label);
}

// ----- game loop -----------------------------------------------------------
const clock = new THREE.Clock();
let dustAcc = 0;
let hudAcc = 0;
let lastCondition = -1;
let lastZones = '';

const _v = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  slowT = Math.max(0, slowT - dt);

  const eff = slowT > 0 ? 0.4 : (userSlow ? 0.3 : 1);
  const scaled = dt * eff;

  car.applyControls(input);
  car.setBrakeLights(input.reverse > 0);

  physics.step(scaled);
  car.update(dt);
  scenario.syncAll();
  particles.update(scaled);
  damage.tick(scaled);

  // wheel dust
  const speed = Math.abs(car.speedKmh);
  dustAcc += scaled;
  if (dustAcc > 0.05) {
    dustAcc = 0;
    if ((input.throttle > 0 || input.handbrake) && speed > 8) {
      for (let i = 2; i < 4; i++) {
        const w = car.wheelMeshes[i];
        _v.set(w.position.x, w.position.y, w.position.z);
        particles.emitDust(_v, 1);
      }
    }
  }

  // fall-through-floor safety
  if (car.chassis.position.y < -6) {
    resetCar();
  }

  updateCamera(dt);

  // HUD (throttled)
  hudAcc += dt;
  if (hudAcc > 0.12) {
    hudAcc = 0;
    ui.setSpeed(car.speedKmh, car.gear);
    const cp = damage.conditionPct();
    if (cp !== lastCondition) {
      lastCondition = cp;
      ui.setCondition(cp);
    }
    const z = JSON.stringify(damage.zonePct());
    if (z !== lastZones) {
      lastZones = z;
      ui.setDamage(damage.zonePct());
    }
    ui.setSlowmo(eff < 0.999);
  }

  renderer.render(scene, camera);
}

// ----- resize --------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- boot ----------------------------------------------------------------
function applyShadowsToScene() {
  scene.traverse((obj) => {
    if (obj.isMesh && obj !== ground) {
      obj.castShadow = true;
      obj.receiveShadow = obj === ground;
    }
  });
}

scenario.load('arena');
cycleCamera(0);
applyShadowsToScene();
frame();

// ----- ground texture -------------------------------------------------------
function makeGroundTexture() {
  const w = 2048, h = 1536;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  // asphalt
  ctx.fillStyle = '#2f3238';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) {
    const g = 45 + Math.random() * 14;
    ctx.fillStyle = `rgba(${g},${g},${g + 4},0.5)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }

  const X = (x) => ((x + 45) / 90) * w;      // world x -45..45 -> u
  const Y = (z) => ((30 - z) / 60) * h;      // world z 30..-30 -> v

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let x = -45; x <= 45; x += 5) {
    ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke();
  }
  for (let z = -30; z <= 30; z += 5) {
    ctx.beginPath(); ctx.moveTo(0, Y(z)); ctx.lineTo(w, Y(z)); ctx.stroke();
  }

  // dashed lane edges (x = -3 and +3)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 5;
  for (const lx of [-3, 3]) {
    ctx.setLineDash([18, 20]);
    ctx.beginPath(); ctx.moveTo(X(lx), Y(2)); ctx.lineTo(X(lx), Y(30)); ctx.stroke();
  }
  ctx.setLineDash([]);

  // center guide
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(X(0), Y(4)); ctx.lineTo(X(0), Y(8)); ctx.stroke();

  // start line
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X(-5), Y(15), X(5) - X(-5), 8);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('START', X(0), Y(16.8));

  // arena label
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 110px sans-serif';
  ctx.fillText('CRASH TEST ARENA', X(0), Y(-16));

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
