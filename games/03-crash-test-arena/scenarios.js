import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { physics } from './physics.js';
import { createSimpleCar } from './vehicle.js';
import { matConcrete, matBarrier, matBarrel, matCone, matDarkPlastic } from './materials.js';

export const SCENARIOS = {
  arena: { id: 'arena', label: 'Open Arena' },
  wall: { id: 'wall', label: 'Wall Test' },
  twocar: { id: 'twocar', label: 'Two-Car Test' },
  ramp: { id: 'ramp', label: 'Ramp Test' },
};

const _bcache = {};
function boxGeom(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!_bcache[k]) _bcache[k] = new THREE.BoxGeometry(w, h, d);
  return _bcache[k];
}
const _cylCache = {};
function cylGeom(r, h, seg = 14) {
  const k = `${r}|${h}|${seg}`;
  if (!_cylCache[k]) _cylCache[k] = new THREE.CylinderGeometry(r, r, h, seg);
  return _cylCache[k];
}

export class ScenarioManager {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.items = [];
    this.statics = [];
    this.targetCar = null;
    this.ramp = null;
    this.current = 'arena';
    this.spawn = new CANNON.Vec3(0, 0, 10);
    this.spawnQuat = new CANNON.Quaternion();
    this.onScenarioChanged = null;
  }

  load(name) {
    this.clearAll();
    this.current = name;
    this._build(name);
    this.player.repair();
    this.player.reset(this.spawn, this.spawnQuat);
    this.player.setBrakeLights(false);
    if (this.onScenarioChanged) this.onScenarioChanged(SCENARIOS[name].label);
    return this.spawn;
  }

  spawnPlayer(x, z, yaw = 0) {
    this.spawn.set(x, 0.5, z);
    this.spawnQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
  }

  clearAll() {
    for (const it of this.items) {
      physics.removeBody(it.body);
      this.scene.remove(it.mesh);
    }
    for (const it of this.statics) {
      physics.removeBody(it.body);
      this.scene.remove(it.mesh);
    }
    if (this.targetCar) { this.targetCar.remove(); this.targetCar = null; }
    this.ramp = null;
    this.items = [];
    this.statics = [];
  }

  _addStatic(body, mesh) {
    this.scene.add(mesh);
    this.statics.push({ body, mesh });
  }

  _addDynamic(body, mesh) {
    this.scene.add(mesh);
    this.items.push({ body, mesh });
    return { body, mesh };
  }

  _addWall(x, z, half = [5, 1.4, 0.6]) {
    const body = physics.makeBox(0, half, [x, half[1], z]);
    const mesh = new THREE.Mesh(boxGeom(half[0] * 2, half[1] * 2, half[2] * 2), matConcrete);
    mesh.position.set(x, half[1], z);
    this._addStatic(body, mesh);
    return body;
  }

  _addBarrier(x, z, half = [3.5, 0.8, 0.6]) {
    const body = physics.makeBox(0, half, [x, half[1], z]);
    const mesh = new THREE.Mesh(boxGeom(half[0] * 2, half[1] * 2, half[2] * 2), matBarrier);
    mesh.position.set(x, half[1], z);
    this._addStatic(body, mesh);
    return body;
  }

  _addBarrel(x, z) {
    const body = physics.makeCylinder(40, 0.35, 0.35, 0.9, [x, 0.45, z]);
    body.allowSleep = true;
    const mesh = new THREE.Mesh(cylGeom(0.35, 0.9, 14), matBarrel.clone());
    mesh.position.set(x, 0.45, z);
    const band = new THREE.Mesh(
      cylGeom(0.352, 0.18, 14),
      matDarkPlastic
    );
    band.position.y = 0.25;
    mesh.add(band);
    const band2 = new THREE.Mesh(cylGeom(0.352, 0.18, 14), matDarkPlastic);
    band2.position.y = -0.22;
    mesh.add(band2);
    return this._addDynamic(body, mesh);
  }

  _addCone(x, z) {
    const body = physics.makeCylinder(3.5, 0.04, 0.24, 0.5, [x, 0.25, z]);
    body.allowSleep = true;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 14), matCone.clone());
    mesh.position.set(x, 0.25, z);
    const base = new THREE.Mesh(cylGeom(0.26, 0.08, 14), matDarkPlastic);
    base.position.y = -0.22;
    mesh.add(base);
    return this._addDynamic(body, mesh);
  }

  _addCrate(x, z) {
    const body = physics.makeBox(14, [0.45, 0.45, 0.45], [x, 0.45, z]);
    body.allowSleep = true;
    body.angularDamping = 0.4;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9 });
    const mesh = new THREE.Mesh(boxGeom(0.9, 0.9, 0.9), mat);
    mesh.position.set(x, 0.45, z);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x5c4528 })
    );
    mesh.add(edge);
    return this._addDynamic(body, mesh);
  }

  _build(name) {
    const spawn = (x, z, yaw = 0) => {
      this.spawnPlayer(x, z, yaw);
    };

    if (name === 'wall' || name === 'arena') {
      // Concrete test wall
      this._addWall(0, 34);
      // Approach cones for scale
      for (let i = 0; i < 4; i++) {
        this._addCone(-6.5, 22 + i * 2.5);
        this._addCone(6.5, 22 + i * 2.5);
      }
      if (name === 'wall') {
        spawn(0, 10, 0);
      }
    }

    if (name === 'twocar') {
      this._addBarrier(0, 42, [4, 1.0, 0.7]);
      this.targetCar = createSimpleCar(this.scene, 0x2f81f7, { x: 0, y: 0, z: 30 }, Math.PI);
      spawn(0, 10, 0);
    }

    if (name === 'ramp') {
      this._buildRamp(31);
      spawn(0, 6, 0);
    }

    if (name === 'arena') {
      // Strong barrier
      this._addBarrier(0, 28, [3.5, 0.8, 0.6]);
      // Line of barrels
      for (let i = 0; i < 5; i++) this._addBarrel(-8 + i * 4.2, 22);
      // Slalom cones (right side)
      const slalom = [[5, 13], [3, 15.5], [5, 18], [3, 20.5], [5, 23]];
      for (const [cx, cz] of slalom) this._addCone(cx, cz);
      // Crates
      this._addCrate(5, 25);
      this._addCrate(6.5, 26.5);
      this._addCrate(4, 27.5);
      // Parked scenery/target car
      this.targetCar = createSimpleCar(this.scene, 0x9aa5b1, { x: -7, y: 0, z: 4 }, -Math.PI / 2);
      if (this.player.group.position.y < -5) { /* safety */ }
      spawn(0, 16, 0);
    }
  }

  _buildRamp(centerZ) {
    const angle = 0.22;
    const halfLen = 3.4;
    const half = [2.0, 0.12, halfLen];
    const cy = halfLen * Math.sin(angle);
    const rampMat = new CANNON.Material('ramp');
    physics.world.addContactMaterial(
      new CANNON.ContactMaterial(rampMat, this.player.chassisMaterial, { friction: 0.02, restitution: 0.08 })
    );

    // Ramp slab
    const body = physics.makeBox(0, half, [0, cy, centerZ]);
    body.quaternion.setFromEuler(-angle, 0, 0);
    body.material = rampMat;
    const mesh = new THREE.Mesh(boxGeom(half[0] * 2, half[1] * 2, half[2] * 2), matBarrier);
    mesh.position.set(0, cy, centerZ);
    mesh.rotation.x = -angle;
    this._addStatic(body, mesh);
    this.ramp = { body, mesh };

    // Support (kept low & inset so the chassis can clear the far end)
    const supTopZ = centerZ + 0.5;
    const supTopY = cy + (supTopZ - centerZ) * Math.tan(angle);
    const supH = Math.max(0.2, supTopY - 0.65);
    const sup = physics.makeBox(0, [1.7, supH, 0.55], [0, supH + 0.05, supTopZ]);
    sup.material = rampMat;
    const supMesh = new THREE.Mesh(boxGeom(3.4, supH * 2 + 0.1, 1.1), matConcrete);
    supMesh.position.set(0, supH + 0.05, supTopZ);
    this._addStatic(sup, supMesh);

    // Landing area objects
    for (let i = 0; i < 3; i++) this._addCone(-3 + i * 3, centerZ + 6.5);
    for (let i = 0; i < 3; i++) this._addBarrel(-2 + i * 2, centerZ + 9);
    this._addBarrier(0, centerZ + 12.5, [3.5, 0.8, 0.6]);
    this._addBarrel(-4, centerZ + 13);
  }

  syncAll() {
    for (const it of this.items) syncB(it.body, it.mesh);
    if (this.targetCar) this.targetCar.sync();
    if (this.ramp) { /* static, no sync needed */ }
  }
}

function syncB(body, mesh) {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
}
