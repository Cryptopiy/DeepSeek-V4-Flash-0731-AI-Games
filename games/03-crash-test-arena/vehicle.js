import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { physics } from './physics.js';
import { makePaint, makeGlass, makeEmissive, matDarkPlastic, matTire, matHub } from './materials.js';

export const WHEEL_RADIUS = 0.36;
export const WHEEL_WIDTH = 0.34;
export const CHASSIS_MASS = 1400;

export const MAX_SPEED = 165;      // km/h top speed
export const MAX_SPEED_REVERSE = 42;

// Detachable part catalogue ------------------------------------------------
export const DETACH_SPECS = {
  bumperFront:  { half: [0.84, 0.15, 0.17], mass: 26, weight: 0.07 },
  hood:         { half: [0.67, 0.10, 0.73], mass: 32, weight: 0.09 },
  headlightL:   { half: [0.24, 0.09, 0.05], mass: 3,  weight: 0.02 },
  headlightR:   { half: [0.24, 0.09, 0.05], mass: 3,  weight: 0.02 },
  bumperRear:   { half: [0.84, 0.15, 0.17], mass: 26, weight: 0.07 },
  trunk:        { half: [0.67, 0.10, 0.61], mass: 30, weight: 0.08 },
  doorL:        { half: [0.06, 0.27, 0.63], mass: 24, weight: 0.05 },
  doorR:        { half: [0.06, 0.27, 0.63], mass: 24, weight: 0.05 },
};

// Build a mesh (box) helper -------------------------------------------------
function _box(parent, w, h, d, x, y, z, mat, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(
    _geoms.box(w, h, d),
    mat
  );
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

const _geoms = {
  boxCache: {},
  cylCache: {},
  box(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!this.boxCache[key]) this.boxCache[key] = new THREE.BoxGeometry(w, h, d);
    return this.boxCache[key];
  },
  cyl(rTop, rBottom, h, seg = 18) {
    const key = `${rTop}|${rBottom}|${h}|${seg}`;
    if (!this.cylCache[key]) this.cylCache[key] = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    return this.cylCache[key];
  },
};

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.base = {};        // part -> {pos, quat, scale, color}
    this.parts = {};       // part -> Mesh
    this.detached = [];    // {body, mesh}
    this.detachedKeys = new Set();
    this.wheelMeshes = [];
    this.glassState = {};  // kind -> 'intact'|'cracked'|'broken'

    // Damage factors (computed by damage manager)
    this.damageFactor = { engine: 1, steer: 1, pull: 0 };

    this._buildVisual();
    this._buildPhysics();
  }

  _snap(name, mesh) {
    this.base[name] = {
      pos: mesh.position.clone(),
      quat: mesh.quaternion.clone(),
      scale: mesh.scale.clone(),
      color: mesh.material && mesh.material.color ? mesh.material.color.clone() : null,
    };
  }

  _buildVisual() {
    const g = this.group;
    const paint = makePaint(0xd63031);

    const body = this.parts.body = _box(g, 1.64, 0.5, 4.1, 0, 0.06, 0, paint.clone());
    this._snap('body', body);

    const cabin = this.parts.cabin = _box(g, 1.32, 0.46, 1.7, 0, 0.30, -0.2, paint.clone());
    this._snap('cabin', cabin);

    const hood = this.parts.hood = _box(g, 1.32, 0.18, 1.44, 0, 0.10, 1.28, paint.clone());
    this._snap('hood', hood);

    const trunk = this.parts.trunk = _box(g, 1.32, 0.18, 1.2, 0, 0.10, -1.32, paint.clone());
    this._snap('trunk', trunk);

    const fL = this.parts.doorL = _box(g, 0.1, 0.54, 1.26, -0.86, 0.12, -0.15, paint.clone());
    this._snap('doorL', fL);
    const fR = this.parts.doorR = _box(g, 0.1, 0.54, 1.26, 0.86, 0.12, -0.15, paint.clone());
    this._snap('doorR', fR);

    const fenderL = this.parts.fenderL = _box(g, 0.1, 0.24, 1.4, -0.83, -0.2, 0, matDarkPlastic.clone());
    this._snap('fenderL', fenderL);
    const fenderR = this.parts.fenderR = _box(g, 0.1, 0.24, 1.4, 0.83, -0.2, 0, matDarkPlastic.clone());
    this._snap('fenderR', fenderR);

    const bF = this.parts.bumperFront = _box(g, 1.68, 0.3, 0.34, 0, -0.12, 2.16, matDarkPlastic.clone());
    this._snap('bumperFront', bF);
    const bR = this.parts.bumperRear = _box(g, 1.68, 0.3, 0.34, 0, -0.12, -2.16, matDarkPlastic.clone());
    this._snap('bumperRear', bR);

    const grill = this.parts.grill = _box(g, 1.2, 0.26, 0.08, 0, 0.02, 2.1, matDarkPlastic.clone());
    this._snap('grill', grill);

    const hL = this.parts.headlightL = _box(g, 0.48, 0.18, 0.08, -0.5, -0.04, 2.26, makeEmissive(0xfff4c2, 1.2));
    this._snap('headlightL', hL);
    const hR = this.parts.headlightR = _box(g, 0.48, 0.18, 0.08, 0.5, -0.04, 2.26, makeEmissive(0xfff4c2, 1.2));
    this._snap('headlightR', hR);

    const tL = this.parts.taillightL = _box(g, 0.48, 0.18, 0.08, -0.5, -0.04, -2.26, makeEmissive(0xff2020, 0.5));
    this._snap('taillightL', tL, );
    const tR = this.parts.taillightR = _box(g, 0.48, 0.18, 0.08, 0.5, -0.04, -2.26, makeEmissive(0xff2020, 0.5));
    this._snap('taillightR', tR);

    // Glass
    const makeGlassPart = (name, mat) => {
      const m = _box(g, 0, 0, 0, 0, 0, 0, mat);
      this.glassState[name] = 'intact';
      this.parts[name] = m;
      this._snap(name, m);
      return m;
    };
    const ws = makeGlassPart('windshield', makeGlass());
    ws.geometry = _geoms.box(1.2, 0.5, 0.08);
    ws.position.set(0, 0.3, 1.02);
    ws.rotation.x = -0.5;
    this.base.windshield.pos = ws.position.clone();
    this.base.windshield.quat = ws.quaternion.clone();

    const rw = makeGlassPart('rearGlass', makeGlass());
    rw.geometry = _geoms.box(1.2, 0.42, 0.08);
    rw.position.set(0, 0.28, -1.02);
    rw.rotation.x = 0.5;
    this.base.rearGlass.pos = rw.position.clone();
    this.base.rearGlass.quat = rw.quaternion.clone();

    const wl = makeGlassPart('windowL', makeGlass());
    wl.geometry = _geoms.box(0.09, 0.36, 1.0);
    wl.position.set(-0.66, 0.32, -0.2);
    this.base.windowL.pos = wl.position.clone();

    const wr = makeGlassPart('windowR', makeGlass());
    wr.geometry = _geoms.box(0.09, 0.36, 1.0);
    wr.position.set(0.66, 0.32, -0.2);
    this.base.windowR.pos = wr.position.clone();

    // Mirrors
    const mL = _box(g, 0.16, 0.12, 0.06, -0.95, 0.4, 1.05, matDarkPlastic);
    const mR = _box(g, 0.16, 0.12, 0.06, 0.95, 0.4, 1.05, matDarkPlastic);
    g.add(mL); g.add(mR);

    // Wheels
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(_geoms.cyl(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20), matTire);
      tire.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(_geoms.cyl(0.17, 0.17, WHEEL_WIDTH * 0.98, 12), matHub);
      hub.rotation.z = Math.PI / 2;
      w.add(tire, hub);
      this.scene.add(w);           // world-space (physics wheel transform)
      this.wheelMeshes.push(w);
    }
  }

  _buildPhysics() {
    const chassis = this.chassis = new CANNON.Body({ mass: CHASSIS_MASS });
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.4, 2.15)));
    this.chassisMaterial = new CANNON.Material('carChassis');
    chassis.material = this.chassisMaterial;
    chassis.allowSleep = false;
    chassis.linearDamping = 0.0;
    chassis.angularDamping = 0.1;
    physics.addBody(chassis);

    const vehicle = this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const wheelOption = (x, z) => ({
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: 60,
      suspensionRestLength: 0.4,
      maxSuspensionTravel: 0.3,
      dampingRelaxation: 2.4,
      dampingCompression: 4.6,
      frictionSlip: 5.0,
      rollInfluence: 0.06,
      maxSuspensionForce: 150000,
      chassisConnectionPointLocal: new CANNON.Vec3(x, 0.17, z),
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    });

    const fx = 0.85, fz = 1.35;
    this.wheelIndex = [
      vehicle.addWheel(wheelOption(-fx, fz)),
      vehicle.addWheel(wheelOption(fx, fz)),
      vehicle.addWheel(wheelOption(-fx, -fz)),
      vehicle.addWheel(wheelOption(fx, -fz)),
    ];
    vehicle.addToWorld(physics.world);
  }

  applyControls(input) {
    const n = this.wheelIndex.length;
    const sp = this.speedKmh;
    const steerRed = this.damageFactor.steer;

    // Steering
    const speedFactor = 1 / (1 + Math.pow(Math.max(0, sp) / 55, 2));
    const targetSteer = input.steer * 0.55 * steerRed * speedFactor + this.damageFactor.pull;
    this.steerCur = this.steerCur || 0;
    const k = 1 - Math.exp(-5 * (this.dtCur || 0.016));
    this.steerCur += (targetSteer - this.steerCur) * k;
    for (let i = 0; i < 2; i++) this.vehicle.setSteeringValue(this.steerCur, this.wheelIndex[i]);

    const eng = this.damageFactor.engine;
    const handbrake = input.handbrake;
    let engineForce = 0;
    let brakeF = 0;

    if (input.throttle > 0) {
      if (sp < MAX_SPEED) {
        let f = input.throttle * 3200 * eng;
        if (sp > MAX_SPEED - 8) f *= (MAX_SPEED - sp) / 8;
        engineForce = -f; // wheel-forward axis is +Z; force sign is inverted here
      }
    } else if (input.reverse > 0) {
      if (sp > 0.8) {
        brakeF = 40;
      } else if (sp >= -MAX_SPEED_REVERSE) {
        engineForce = input.reverse * 2100 * eng;
      } else {
        brakeF = 30;
      }
    }

    this.engineTarget = engineForce;
    this.brakeTarget = brakeF;
    this.handbrake = handbrake;

    for (let i = 0; i < n; i++) {
      this.vehicle.applyEngineForce(engineForce, this.wheelIndex[i]);
      const rear = i >= 2;
      const b = handbrake ? (rear ? 28 : 0) : brakeF;
      this.vehicle.setBrake(b, this.wheelIndex[i]);
    }
  }

  update(dt) {
    this.dtCur = dt;
    // Sync chassis visuals
    syncC(this.chassis, this.group);
    // Sync wheels (update transform first, as recommended by cannon-es)
    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.getWheelTransformWorld(i);
      const m = this.wheelMeshes[i];
      m.position.set(t.position.x, t.position.y, t.position.z);
      m.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
    // Sync detached parts
    for (const d of this.detached) syncC(d.body, d.mesh);
  }

  get speedKmh() {
    const v = this.vehicle.currentVehicleSpeedKmHour;
    return Number.isFinite(v) ? v : 0;
  }

  get gear() {
    const s = this.speedKmh;
    if (s > 3) return 'D';
    if (s < -3) return 'R';
    return 'N';
  }

  getWorldPosition() {
    return this.group.position;
  }

  getWorldForward(out = new THREE.Vector3()) {
    out.set(0, 0, 1).applyQuaternion(this.group.quaternion);
    return out;
  }

  getWorldQuaternion() {
    return this.group.quaternion;
  }

  setBrakeLights(on) {
    const horn = on ? 1.6 : 0.5;
    this.parts.taillightL.material.emissiveIntensity = horn;
    this.parts.taillightR.material.emissiveIntensity = horn;
  }

  reset(position, quaternion) {
    this.chassis.position.copy(position);
    this.chassis.quaternion.copy(quaternion);
    this.chassis.velocity.setZero();
    this.chassis.angularVelocity.setZero();
    this.chassis.force.setZero();
    this.chassis.torque.setZero();
    this.steerCur = 0;
    const w = this.vehicle.wheelInfos;
    for (let i = 0; i < w.length; i++) {
      w[i].steering = 0;
      w[i].rotation = 0;
      w[i].deltaRotation = 0;
      w[i].engineForce = 0;
      w[i].brake = 0;
      w[i].suspensionLength = w[i].suspensionRestLength;
    }
    this.group.updateMatrixWorld(true);
  }

  repair() {
    for (const key of Object.keys(this.parts)) {
      this._restorePart(key);
    }
    this.glassState = {};
    for (const key of ['windshield', 'rearGlass', 'windowL', 'windowR']) {
      this.glassState[key] = 'intact';
      const p = this.parts[key];
      p.visible = true;
    }
    this.clearDetached();
  }

  clearDetached() {
    for (const d of this.detached) {
      physics.removeBody(d.body);
      this.scene.remove(d.mesh);
    }
    this.detached = [];
    for (const _ of this.detachedKeys) { /* noop */ }
    this.detachedKeys.clear();
  }

  _restorePart(key) {
    const b = this.base[key];
    const m = this.parts[key];
    if (!b || !m) return;
    m.position.copy(b.pos);
    m.quaternion.copy(b.quat);
    m.scale.copy(b.scale);
    m.visible = true;
    if (m.material && b.color) m.material.color.copy(b.color);
    m.material.needsUpdate = true;
  }

  // ---- visual damage -----------------------------------------------------
  renderDamage(z) {
    const f = z.front, r = z.rear, l = z.left, rt = z.right;
    this._deformZoneFront(f);
    this._deformZoneRear(r);
    this._deformZoneSide('doorL', 'fenderL', -1, l);
    this._deformZoneSide('doorR', 'fenderR', 1, rt);
  }

  _deformZoneFront(d) {
    if (!this._tint('bumperFront', d)) return;
    const bf = this.parts.bumperFront, bb = this.base.bumperFront;
    bf.position.z = bb.pos.z - d * 0.3;
    bf.scale.z = 1 - d * 0.35;
    this._tintColor(bf, d);

    const hd = this.parts.hood, hb = this.base.hood;
    hd.position.y = hb.pos.y - d * 0.1;
    hd.rotation.x = hb.quat.x - d * 0.1;
    hd.scale.z = 1 - d * 0.25;
    this._tintColor(hd, d);

    const gr = this.parts.grill;
    gr.position.z = this.base.grill.pos.z - d * 0.2;
    gr.scale.z = 1 - d * 0.3;

    const hl = this.parts.headlightL;
    hl.position.z = this.base.headlightL.pos.z - d * 0.3;
    const hr = this.parts.headlightR;
    hr.position.z = this.base.headlightR.pos.z - d * 0.3;
    this._tintColor(this.parts.body, d * 0.5);
  }

  _deformZoneRear(d) {
    if (!this._tint('bumperRear', d)) return;
    const br = this.parts.bumperRear, bb = this.base.bumperRear;
    br.position.z = bb.pos.z + d * 0.3;
    br.scale.z = 1 - d * 0.35;
    this._tintColor(br, d);

    const tk = this.parts.trunk, tb = this.base.trunk;
    tk.position.y = tb.pos.y - d * 0.1;
    tk.rotation.x = tb.quat.x + d * 0.1;
    tk.scale.z = 1 - d * 0.25;
    this._tintColor(tk, d);

    const tl = this.parts.taillightL;
    tl.position.z = this.base.taillightL.pos.z + d * 0.3;
    const tr = this.parts.taillightR;
    tr.position.z = this.base.taillightR.pos.z + d * 0.3;
  }

  _deformZoneSide(doorKey, fenderKey, sign, d) {
    const door = this.parts[doorKey];
    if (!this._tint(doorKey, d)) return;
    door.position.x = this.base[doorKey].pos.x + sign * d * 0.08;
    door.rotation.z = this.base[doorKey].quat.z + sign * d * 0.08;
    door.scale.y = 1 - d * 0.3;
    this._tintColor(door, d);

    const fd = this.parts[fenderKey];
    fd.position.x = this.base[fenderKey].pos.x + sign * d * 0.05;
    fd.scale.y = 1 - d * 0.35;
    this._tintColor(fd, d);

    if (d > 0.45) this._tintColor(this.parts.cabin, d * 0.45);
  }

  _tint(key, d) {
    return this.parts[key] && this.parts[key].visible;
  }

  _tintColor(mesh, d) {
    if (!mesh || !mesh.material || !mesh.material.color) return;
    const b = this.baseByMesh(mesh);
    if (!b || !b.color) return;
    mesh.material.color.copy(b.color).multiplyScalar(1 - 0.55 * d);
    mesh.material.needsUpdate = true;
  }

  baseByMesh(mesh) {
    for (const key of Object.keys(this.parts)) {
      if (this.parts[key] === mesh && this.base[key] && this.base[key].color) return this.base[key];
    }
    return null;
  }

  // ---- glass damage ------------------------------------------------------
  crackGlass(kind) {
    if (this.glassState[kind] === 'broken') return;
    const p = this.parts[kind];
    if (!p || !p.material) return;
    this.glassState[kind] = 'cracked';
    p.material.color.set(0xe8eef7);
    p.material.opacity = 0.6;
    p.material.roughness = 0.4;
    p.material.needsUpdate = true;
  }

  breakGlass(kind) {
    if (this.glassState[kind] === 'broken') return;
    this.glassState[kind] = 'broken';
    this.parts[kind].visible = false;
  }

  // ---- part detachment ----------------------------------------------------
  detachPart(key, _impactPoint = null) {
    if (this.detachedKeys.has(key) || !this.parts[key] || !this.parts[key].visible) return;
    const spec = DETACH_SPECS[key];
    if (!spec) return;
    const mesh = this.parts[key];
    this.group.updateMatrixWorld(true);
    const worldPos = this.group.localToWorld(mesh.position.clone());
    const worldQuat = this.group.getWorldQuaternion(new THREE.Quaternion());

    const body = physics.makeBox(spec.mass, spec.half, [worldPos.x, worldPos.y, worldPos.z]);
    body.velocity.set(
      this.chassis.velocity.x + (Math.random() - 0.5) * 1.2,
      this.chassis.velocity.y + Math.random() * 1.5 + 0.5,
      this.chassis.velocity.z + (Math.random() - 0.5) * 1.2
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );
    body.allowSleep = true;

    const clone = mesh.clone();
    clone.position.copy(worldPos);
    clone.quaternion.copy(worldQuat);
    clone.scale.copy(mesh.scale);
    this.scene.add(clone);

    mesh.visible = false;
    this.detached.push({ body, mesh: clone, key });
    this.detachedKeys.add(key);
  }
}

function syncC(body, mesh) {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
}

// Simple non-player car (target vehicle) ------------------------------------
export function createSimpleCar(scene, color = 0x2f81f7, position, yaw = 0) {
  const group = new THREE.Group();
  const paint = makePaint(color);
  const half = [0.9, 0.55, 2.2];
  _box(group, 1.8, 1.0, 4.4, 0, 0.55, 0, paint.clone());
  _box(group, 1.5, 0.7, 1.8, 0, 1.12, 0, paint.clone());
  _box(group, 1.6, 0.2, 3.4, 0, 0.05, 0, matDarkPlastic);
  for (let i = 0; i < 4; i++) {
    const x = i === 0 || i === 1 ? -0.85 : 0.85;
    const z = i === 0 || i === 2 ? 1.35 : -1.35;
    const w = new THREE.Mesh(_geoms.cyl(0.36, 0.36, 0.32, 16), matTire);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    group.add(w);
  }
  _box(group, 0.9, 0.15, 0.06, -0.4, 0.75, 2.22, makeEmissive(0xfff4c2, 1.0));
  _box(group, 0.9, 0.15, 0.06, 0.4, 0.75, 2.22, makeEmissive(0xfff4c2, 1.0));

  const body = physics.makeBox(1150, half, [position.x, 0.55 + position.y, position.z]);
  body.quaternion.setFromEuler(0, yaw, 0);
  body.linearDamping = 0.15;
  body.angularDamping = 0.35;
  body.allowSleep = true;

  scene.add(group);
  syncC(body, group);

  return {
    group,
    body,
    sync() { syncC(body, group); },
    remove() {
      physics.removeBody(body);
      scene.remove(group);
      body.shapes = [];
    },
  };
}
