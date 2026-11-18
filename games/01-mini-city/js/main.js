// main.js ------------------------------------------------------------------
// Game logic + main loop. Owns the camera rig, wanted level / police flow,
// player/vehicle switching, pedestrian hits, effects (skid marks, dust,
// camera shake) and wires everything up to the HUD + audio.
import * as THREE from './three.js';
import { CANNON } from './cannon.js';
import { createWorld, PLAYER_SPAWN, PARKING_SPOTS, ROADS, BOUNDARY_R,
  isBlocked, clampBoundary } from './world.js';
import { Player } from './player.js';
import { VehicleManager } from './vehicle.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';

const SKID_GEO = new THREE.PlaneGeometry(1.4, 0.42);
const DUST_GEO = new THREE.BoxGeometry(1, 1, 1);

class Game {
  constructor() {
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
    const w = createWorld(this.physics);
    this.scene = w.scene;
    this.renderer = w.renderer;
    this.camera = w.camera;
    this.nightRef = w.night;
    this.colliders = w.colliders;

    this.player = new Player(this.scene);
    this.player.spawn(PLAYER_SPAWN.x, PLAYER_SPAWN.z);
    this.vehicles = new VehicleManager(this.scene, this.physics, PARKING_SPOTS);
    this.peds = new PedestrianManager(this.scene, this.colliders, 22);
    this.police = new PoliceManager(this.scene, this.colliders);
    this.ui = new UI();
    this.audio = new AudioManager();

    // camera rig state
    this.yaw = 0;   // facing -Z on spawn -> the starting car is straight ahead
    this.pitch = 0.28;
    this.camSmoothed = new THREE.Vector3(PLAYER_SPAWN.x + 4, 5, PLAYER_SPAWN.z + 3);
    this.camLook = new THREE.Vector3(PLAYER_SPAWN.x, 1.2, PLAYER_SPAWN.z);
    this.camDist = 5.8;
    this.camShake = 0;
    this.fov = this.camera.fov;

    // game state
    this.state = 'menu';
    this.driving = false;
    this.wanted = 0;
    this.wantedLosTimer = 0;
    this.recklessTimer = 0;
    this.starCdPolice = 0;
    this.lastEngaged = -1e9;
    this.drivenDist = 0;
    this.stage = 0;
    this.night = false;
    this.wasLocked = false;
    this.keys = {};
    this._engineOn = false;

    // effects
    this.skids = [];
    this.skidMatCount = 0;
    this.dust = [];
    this._lastHint = '';

    this._bind();
    this._bindResize();
    this._startRaf();

    // debug hook (harmless; lets automated tests inspect internals)
    window.__game = this;
  }

  // ------------------------------------------------------------- input
  _bind() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.onE();
      if (e.code === 'KeyR') this.onR();
      if (e.code === 'KeyN') this.onN();
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch += e.movementY * 0.0023;
      this.pitch = Math.max(-0.25, Math.min(1.1, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (locked) {
        this.wasLocked = true;
        if (this.state === 'paused') { this.ui.hidePause(); this.state = 'playing'; }
      } else {
        if (this.state === 'playing' && this.wasLocked) this.pause();
      }
    });

    this.ui.startBtn.addEventListener('click', () => this.startGame());
    this.ui.resumeBtn.addEventListener('click', () => this.resumeGame());
  }

  resumeGame() {
    this.ui.hidePause();
    this.audio.setMuted(false);
    if (this.driving && !this._engineOn) { this.audio.engineStart(); this._engineOn = true; }
    if (this.state === 'paused') {
      this.state = 'playing';
      try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
    } else {
      try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
    }
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _key(c) { return !!this.keys[c]; }

  startGame() {
    this.audio.unlock();
    this.ui.hideStart();
    this.ui.showHud();
    this.state = 'playing';
    this.ui.setMode('foot');
    this.ui.setStars(0);
    this.audio.click();
    try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
    this.audio.setMuted(true);
    this.audio.engineStop();
    this.audio.sirenOff();
  }

  // ------------------------------------------------------------- loop
  _startRaf() {
    this._last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      if (this.state === 'playing') this.update(dt);
      this.updateEffectsAlways(dt);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- update
  update(dt) {
    this.physics.step(1 / 60, Math.min(dt, 1 / 30));

    if (this.driving) this.updateDriving(dt);
    else this.updateFoot(dt);

    this.updateWanted(dt);
    this.updatePolice(dt);
    this.updateCamera(dt);

    // pedestrians
    const threats = [];
    const a = this.vehicles.active;
    if (a) threats.push({ x: a.body.position.x, z: a.body.position.z });
    for (const c of this.police.cars) threats.push({ x: c.x, z: c.z });
    this.peds.setThreats(threats);
    this.peds.update(dt);

    this.updateEffects(dt);
    this.updateUI(dt);
  }

  playerPos() {
    return this.driving && this.vehicles.active
      ? { x: this.vehicles.active.body.position.x, z: this.vehicles.active.body.position.z }
      : { x: this.player.pos.x, z: this.player.pos.z };
  }
  playerHeading() {
    if (this.driving && this.vehicles.active) return this.vehicles.active.heading;
    return this.player.heading;
  }
  playerSpeed() {
    if (this.driving && this.vehicles.active) return Math.abs(this.vehicles.active.speed);
    return 0;
  }

  updateFoot(dt) {
    const yaw = this.yaw;
    const fw = -Math.sin(yaw), fwz = -Math.cos(yaw);
    const rt = Math.cos(yaw), rtz = -Math.sin(yaw);
    const f = (this._key('KeyW') ? 1 : 0) - (this._key('KeyS') ? 1 : 0);
    const s = (this._key('KeyD') ? 1 : 0) - (this._key('KeyA') ? 1 : 0);
    const dx = f * fw + s * rt;
    const dz = f * fwz + s * rtz;
    const sprint = this._key('ShiftLeft') || this._key('ShiftRight');
    this.player.update(dt, dx, dz, sprint, this.colliders);

    // context hint when near a car
    const near = this.vehicles.nearbyParked(this.player.pos.x, this.player.pos.z, 2.8);
    this.ui.setHint(near ? 'Press E to enter vehicle' : '');
    if (this._engineOn) { this.audio.engineStop(); this._engineOn = false; }
    this.ui.setMode('foot');
  }

  updateDriving(dt) {
    const ctrl = {
      throttle: this._key('KeyW') ? 1 : 0,
      brake: this._key('KeyS') ? 1 : 0,
      steer: (this._key('KeyD') ? 1 : 0) - (this._key('KeyA') ? 1 : 0),
      handbrake: this._key('Space') ? 1 : 0,
    };
    const a = this.vehicles.update(dt, ctrl);
    if (!a) { this.driving = false; return; }

    this.drivenDist += Math.abs(a.speed) * dt;
    if (this.drivenDist > 350) this.stage = Math.max(this.stage, 1);

    // running over pedestrians
    const i = this.peds.hitPlayerCar(a.body.position.x, a.body.position.z, 1.8);
    if (i >= 0 && Math.abs(a.speed) > 3.5) {
      const p = this.peds.peds[i];
      this.peds.hit(i);
      this.ui.addFloat(p.x, 1.4, p.z, '+ WANTED!', '#ff5a3c');
      this.wantedAdd(1);
      this.audio.crash(0.35);
      this.camShake = Math.min(1, this.camShake + 0.5);
      a.speed *= 0.82;
    }

    // police ramming
    this.police.checkRams(a.body.position.x, a.body.position.z, 3.2, (dx, dz, mag) => {
      a.applyRam(dx, dz, mag);
      this.crashPolice();
    });

    // hard impacts against buildings/walls
    if (a.lastImpact > 3.5) this.onCarImpact(a);

    // skid marks while drifting
    if ((ctrl.handbrake && Math.abs(a.speed) > 4) || (Math.abs(ctrl.steer) > 0.5 && Math.abs(a.speed) > 11)) {
      this.spawnSkid(a);
      this.audio.skidSound(true, Math.abs(a.speed) / 32);
    } else {
      this.audio.skidSound(false, 0);
    }

    this.audio.engineUpdate(Math.abs(a.speed) / 32, ctrl.throttle);
    this.ui.setHint(Math.abs(a.speed) < 2.5 ? 'Press E to exit vehicle' : '');
    this.ui.setMode('drive');
  }

  updateWanted(dt) {
    const p = this.playerPos();
    const speed = this.playerSpeed();
    const near = this.police.closest(p.x, p.z);

    // reckless driving near police
    if (this.wanted > 0 && near < 28 && speed > 9) {
      this.recklessTimer += dt;
      if (this.recklessTimer > 1.6) {
        this.recklessTimer = 0;
        this.wantedAdd(1);
        this.ui.addFloat(p.x, 2, p.z, 'RECKLESS!', '#ffb74d');
      }
    } else this.recklessTimer = Math.max(0, this.recklessTimer - dt);

    // decay when police are far away
    if (this.wanted > 0) {
      if (near < 55) this.wantedLosTimer = Math.min(this.wantedLosTimer, 0.15);
      else this.wantedLosTimer += dt;
      if (this.wantedLosTimer > (2.0 + this.wanted * 2.0)) {
        this.wantedLosTimer = 0;
        this.wanted--;
        this.ui.setStars(this.wanted);
        if (this.wanted === 0) { this.audio.sirenOff(); this.ui.addFloat(p.x, 2, p.z, 'LOST THEM!', '#8cffb0'); }
      }
    }

    // audio siren state
    if (this.wanted > 0 && this.police.cars.length > 0) { this.audio.sirenOn(); this.audio.sirenUpdate(); }
    else this.audio.sirenOff();
  }

  updatePolice(dt) {
    const p = this.playerPos();
    const h = this.playerHeading();
    this.police.setWanted(p.x, p.z, this.wanted);
    this.police.update(dt, { x: p.x, z: p.z, h }, this.wanted);
  }

  // ------------------------------------------------------------- events
  onE() {
    if (this.state !== 'playing') return;
    if (this.driving) {
      const a = this.vehicles.active;
      if (!a) return;
      if (Math.abs(a.speed) > 2.5) return;
      this.exitVehicle();
    } else {
      const near = this.vehicles.nearbyParked(this.player.pos.x, this.player.pos.z, 2.8);
      if (near) this.enterVehicle(near);
    }
  }

  enterVehicle(near) {
    this.vehicles.enter(near);
    this.driving = true;
    this.player.setVisible(false);
    this.audio.engineStart();
    this._engineOn = true;
    this.audio.click();
    this.camSmoothed.copy(this.camera.position);
  }

  exitVehicle() {
    const out = this.vehicles.exit();
    if (!out) return;
    this.driving = false;
    this._engineOn = false;
    this.player.setVisible(true);
    const [sx, sz] = this.findSafeSpawn(out.x, out.z, out.h);
    this.player.spawn(sx, sz);
    this.audio.click();
  }

  onR() {
    if (this.state !== 'playing') return;
    const a = this.vehicles.active;
    if (!a) return;
    const [nx, nz] = this.findSafeSpawn(a.body.position.x, a.body.position.z, a.heading, 14);
    this.vehicles.resetActive(nx, nz);
    this.audio.click();
    this.camShake = Math.min(1, this.camShake + 0.3);
  }

  onN() {
    if (this.state !== 'playing') return;
    this.night = !this.night;
    this.nightRef.set(this.night);
    const p = this.playerPos();
    this.ui.addFloat(p.x, 2, p.z, this.night ? 'NIGHT' : 'DAY', '#ffffff');
    this.audio.click();
  }

  wantedAdd(n) {
    if (this.wanted >= 3) return;
    this.wanted = Math.min(3, this.wanted + n);
    this.ui.setStars(this.wanted);
    this.lastEngaged = performance.now();
    if (this.wanted > 0) this.audio.sirenOn();
  }

  crashPolice() {
    const now = performance.now();
    if (now - this.starCdPolice < 3000) return;
    this.starCdPolice = now;
    this.wantedAdd(1);
    const p = this.playerPos();
    this.ui.addFloat(p.x, 2, p.z, 'COPS HIT!', '#ff5a3c');
    this.audio.crash(0.5);
    this.camShake = Math.min(1, this.camShake + 0.6);
  }

  onCarImpact(a) {
    const inten = Math.min(1, (a.lastImpact - 3) / 20);
    this.audio.crash(inten);
    this.camShake = Math.min(1, this.camShake + inten * 0.8);
    this.spawnDust(a.body.position.x, 0.5, a.body.position.z, Math.round(4 + inten * 10));
    a.lastImpact = 0;
  }

  // find a clear spot for spawning / resetting near a point
  findSafeSpawn(x, z, h, maxR = 7) {
    const fwd = { x: -Math.sin(h), z: -Math.cos(h) };
    const right = { x: Math.cos(h), z: -Math.sin(h) };
    const offsets = [
      [-1, 0], [1, 0], [-1.6, 0], [1.6, 0], [0, -1.5], [0, 1.5],
      [-1, -1], [1, -1], [-1, 1], [1, 1], [-2.2, 0], [2.2, 0],
    ];
    for (const [sx, sz] of offsets) {
      const wx = x + right.x * sx + fwd.x * sz;
      const wz = z + right.z * sx + fwd.z * sz;
      if (!isBlocked(wx, wz, 0.42, this.colliders)) {
        const [bx, bz] = clampBoundary(wx, wz, 0.42);
        return [bx, bz];
      }
    }
    for (let r = 2.5; r <= maxR; r += 0.9) {
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
        if (!isBlocked(wx, wz, 0.42, this.colliders)) {
          const [bx, bz] = clampBoundary(wx, wz, 0.42);
          return [bx, bz];
        }
      }
    }
    const [bx, bz] = clampBoundary(x, z, 0.42);
    return [bx, bz];
  }

  // ------------------------------------------------------------- camera
  updateCamera(dt) {
    const c = this.camera;
    let targetPos, look;

    if (this.driving && this.vehicles.active) {
      const a = this.vehicles.active;
      const h = a.heading;
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const px = a.body.position.x, pz = a.body.position.z;
      const speed = Math.abs(a.speed);
      const dist = 7.6 + speed * 0.07;
      const height = 2.7 + speed * 0.04;
      const backX = px - fx * dist;
      const backZ = pz - fz * dist;
      // slight outward lean while steering for a more dynamic chase feel
      const lean = a.steerVisual * Math.min(1, speed / 16) * 1.6;
      targetPos = new THREE.Vector3(backX + Math.cos(h) * lean, 1.2 + height, backZ - Math.sin(h) * lean);
      look = new THREE.Vector3(px + fx * 5, 1.1, pz + fz * 5);
      const tfov = 62 + speed * 0.42;
      this.fov += (tfov - this.fov) * Math.min(1, dt * 4);
    } else {
      const px = this.player.pos.x, pz = this.player.pos.z;
      const dist = this.camDist;
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const ox = Math.sin(this.yaw) * cp * dist;
      const oy = sp * dist;
      const oz = Math.cos(this.yaw) * cp * dist;
      targetPos = new THREE.Vector3(px + ox, 1.4 + oy, pz + oz);
      look = new THREE.Vector3(px, 1.4, pz);
      this.fov += (68 - this.fov) * Math.min(1, dt * 4);
    }

    const k = 1 - Math.exp(-dt * (this.driving ? 7 : 12));
    this.camSmoothed.lerp(targetPos, k);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 18));
    c.position.copy(this.camSmoothed);

    // camera shake (decays)
    if (this.camShake > 0.001) {
      c.position.x += (Math.random() - 0.5) * this.camShake * 0.6;
      c.position.y += (Math.random() - 0.5) * this.camShake * 0.6;
      this.camShake *= Math.exp(-4 * dt);
    }
    c.lookAt(this.camLook);
    c.fov = this.fov;
    c.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- effects
  spawnSkid(a) {
    const h = a.heading;
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    for (const sw of [-1, 1]) {
      const wx = a.body.position.x + rx * (sw * 0.72) - fx * 1.42;
      const wz = a.body.position.z + rz * (sw * 0.72) - fz * 1.42;
      if (this.skids.length >= 220) {
        const old = this.skids.shift();
        this.scene.remove(old.mesh);
      }
      const sk = new THREE.Mesh(SKID_GEO,
        new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.0 }));
      sk.rotation.x = -Math.PI / 2;
      sk.position.set(wx, 0.035, wz);
      sk.rotation.z = -h;
      sk.material.opacity = 0.45;
      this.scene.add(sk);
      this.skids.push({ mesh: sk, life: 7 });
    }
  }

  spawnDust(x, y, z, n) {
    for (let i = 0; i < Math.min(n, 14); i++) {
      if (this.dust.length >= 70) {
        const old = this.dust.shift();
        this.scene.remove(old.mesh);
      }
      const s = 0.1 + Math.random() * 0.25;
      const d = new THREE.Mesh(DUST_GEO,
        new THREE.MeshLambertMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.85 }));
      d.position.set(x + (Math.random() - 0.5), y + 0.2, z + (Math.random() - 0.5));
      this.scene.add(d);
      this.dust.push({
        mesh: d,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 6,
        life: 1.2,
        max: 1.2,
      });
    }
  }

  updateEffects(dt) {
    for (let i = this.skids.length - 1; i >= 0; i--) {
      const s = this.skids[i];
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.mesh.material.opacity - dt * 0.12);
      if (s.life <= 0) { this.scene.remove(s.mesh); this.skids.splice(i, 1); }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.life -= dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.vy -= 18 * dt;
      d.mesh.material.opacity = Math.max(0, d.life / d.max) * 0.85;
      const sc = Math.max(0.01, d.life / d.max) * 0.35;
      d.mesh.scale.setScalar(sc);
      if (d.life <= 0) { this.scene.remove(d.mesh); this.dust.splice(i, 1); }
    }
  }

  updateEffectsAlways(dt) {
    // floats update even while paused so they don't pile up
    this.ui.updateFloats(dt, this.camera, innerWidth, innerHeight);
  }

  // ------------------------------------------------------------- UI
  updateUI(dt) {
    const p = this.playerPos();
    // speed
    if (this.driving && this.vehicles.active) {
      this.ui.setSpeed(Math.abs(this.vehicles.active.speed) * 3.6);
    }
    // objective
    let obj;
    if (this.wanted > 0) obj = 'Escape the police! Get far from their lights...';
    else if (performance.now() - this.lastEngaged < 12000 && this.drivenDist > 0) obj = 'You got away... for now.';
    else if (this.stage >= 1 || this.drivenDist > 350) obj = 'Cause trouble, then lose the police.';
    else obj = 'Get in the car and explore the city.';
    this.ui.setObjective(obj);

    // radar
    this.ui.drawRadar({
      roads: ROADS,
      boundary: BOUNDARY_R,
      parked: this.vehicles.parked,
      police: this.police.positions(),
      player: { x: p.x, z: p.z, h: this.driving ? this.playerHeading() : undefined },
      driving: this.driving,
    });
  }
}

window.addEventListener('load', () => {
  new Game();
});
