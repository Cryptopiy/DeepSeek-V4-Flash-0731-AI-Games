import * as THREE from './three.js';
import * as CANNON from 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class PhysicsEngine {
  constructor(scene) {
    this.scene = scene;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -12.5, 0),
      broadphase: new CANNON.SAPBroadphase(),
    });
    this.world.allowSleep = true;
    this.world.sleepSpeedLimit = 0.4;
    this.world.sleepTimeLimit = 0.45;
    this.world.defaultContactMaterial.friction = 0.55;
    this.world.defaultContactMaterial.restitution = 0.16;

    const gb = new CANNON.Body({ type: CANNON.Body.STATIC });
    gb.addShape(new CANNON.Plane());
    gb.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(gb);
    this.ground = gb;

    this.breakables = [];
    this.dynamics = [];
    this.onBreak = null;
  }

  addStaticBox(size, pos) {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC });
    b.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    b.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
    this.world.addBody(b);
    return b;
  }

  _pose(group) {
    group.updateMatrixWorld(true);
    _p.setFromMatrixPosition(group.matrixWorld);
    _q.setFromRotationMatrix(group.matrixWorld);
    return [_p.clone(), _q.clone()];
  }

  registerBreakable(def) {
    const [p, q] = this._pose(def.group);
    def.initPos = p;
    def.initQuat = q;
    def.resist = def.resist || 1;
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    if (def.shape === 'cyl') {
      body.addShape(new CANNON.Cylinder(def.cylR, def.cylR, def.cylH, 10));
    } else {
      body.addShape(new CANNON.Box(new CANNON.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2)));
    }
    body.position.copy(p);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.allowSleep = true;
    this.world.addBody(body);
    def.body = body;
    def.broken = false;
    this.breakables.push(def);
    return def;
  }

  registerDynamic(def) {
    const [p, q] = this._pose(def.group);
    const body = new CANNON.Body({ type: CANNON.Body.DYNAMIC, mass: def.mass });
    if (def.shape === 'cyl') {
      body.addShape(new CANNON.Cylinder(def.cylR, def.cylR, def.cylH, 10));
    } else {
      body.addShape(new CANNON.Box(new CANNON.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2)));
    }
    body.position.copy(p);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.linearDamping = def.linearDamping ?? 0.04;
    body.angularDamping = def.angularDamping ?? 0.24;
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.4;
    this.world.addBody(body);
    def.body = body;
    def.broken = false;
    this.dynamics.push({ def, body });
    return def;
  }

  breakDef(def, silent) {
    if (!def || def.broken) return;
    def.broken = true;
    const b = def.body;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = def.mass;
    b.updateMassProperties();
    b.linearDamping = 0.035;
    b.angularDamping = 0.22;
    b.wakeUp();
    this.dynamics.push({ def, body: b });
    if (!silent && this.onBreak) this.onBreak(def);
  }

  removeDef(def) {
    const idx = this.dynamics.findIndex((d) => d.def === def);
    if (idx >= 0) this.dynamics.splice(idx, 1);
    const bi = this.breakables.indexOf(def);
    if (bi >= 0) this.breakables.splice(bi, 1);
    this.world.removeBody(def.body);
    this.scene.remove(def.group);
  }

  forEachDynamic(fn) {
    for (let i = 0; i < this.dynamics.length; i++) {
      const d = this.dynamics[i];
      fn(d.body, d.def);
    }
  }

  breakableCount() {
    let n = 0;
    for (const d of this.breakables) if (d.broken) n++;
    return n;
  }

  activeDebris() {
    let n = 0;
    for (const d of this.dynamics) if (d.def.kind !== 'vehicle') n++;
    return n;
  }

  step(dt) {
    const ft = Math.min(1 / 60, dt || 1 / 60);
    this.world.step(ft, dt || ft, 5);
    for (const d of this.dynamics) {
      const b = d.body, g = d.def.group;
      g.position.set(b.position.x, b.position.y, b.position.z);
      g.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
  }

  prune(maxActive, center, maxDist) {
    const removed = [];
    const list = [];
    const maxD2 = maxDist * maxDist;
    for (const d of this.dynamics) {
      if (d.def.kind === 'vehicle') continue;
      const g = d.def.group;
      const dx = g.position.x - center.x;
      const dz = g.position.z - center.z;
      if (dx * dx + dz * dz > maxD2) { removed.push(d.def); continue; }
      list.push({ d, dist2: dx * dx + dz * dz });
    }
    if (this.dynamics.length - removed.length > maxActive) {
      list.sort((a, b) => b.dist2 - a.dist2);
      const over = this.dynamics.length - removed.length - maxActive;
      for (let i = 0; i < over && i < list.length; i++) removed.push(list[i].d);
    }
    for (const def of removed) this.removeDef(def);
    return removed.length;
  }
}