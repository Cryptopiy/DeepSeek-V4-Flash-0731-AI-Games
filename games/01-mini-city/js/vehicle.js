// vehicle.js ---------------------------------------------------------------
// DrivableVehicle: an arcade-style car driven through a cannon-es dynamic box.
// The box is used purely for collision against the static city, while heading,
// speed and steering are integrated in 2D each frame (stable, never flips).
// VehicleManager owns every car: parked cars are visual-only; the car the
// player is driving becomes the single active physics vehicle.
import * as THREE from './three.js';
import { CANNON } from './cannon.js';
import { createCarMesh } from './carMesh.js';
import { clampBoundary } from './world.js';

const Y_UP = new CANNON.Vec3(0, 1, 0);

export class DrivableVehicle {
  constructor(scene, physics, x, z, heading, bodyColor, accent) {
    this.physics = physics;
    this.heading = heading || 0;
    this.speed = 0;
    this.steerVisual = 0;
    this.ram = { x: 0, z: 0 };
    this.bodyColor = bodyColor || 0xd03a32;
    this.accent = accent || 0x20242a;

    this.body = new CANNON.Body({
      mass: 1200,
      shape: new CANNON.Box(new CANNON.Vec3(0.95, 0.5, 2.2)),
      position: new CANNON.Vec3(x, 0.6, z),
    });
    this.body.allowSleep = false;
    physics.addBody(this.body);

    // collision events (walls/buildings) used for crash sound + particles
    this.lastImpact = 0;
    this.body.addEventListener('collide', (e) => {
      const im = e.contact.getImpactVelocityAlongNormal();
      if (im < -1) this.lastImpact = Math.max(this.lastImpact, -im);
    });

    const parts = createCarMesh({ color: this.bodyColor, accent: this.accent });
    this.mesh = parts.group;
    this.wheels = parts.wheels;
    this.steerWheels = parts.steering;
    this.brakeMat = parts.brakeMat;
    scene.add(this.mesh);
    this.syncMesh(0);
  }

  update(dt, ctrl) {
    const MAX = 32, REV = 7, ACC = 14, BRAKE = 22, REVACC = 7, DRAG = 2.4, HAND = 26;
    if (ctrl.throttle > 0 && this.speed < MAX) this.speed += ACC * dt;
    if (ctrl.brake > 0) {
      if (this.speed > 0.5) this.speed -= BRAKE * dt;
      else if (this.speed > -REV) this.speed -= REVACC * dt;
    }
    if (ctrl.handbrake) {
      const d = HAND * dt;
      this.speed = this.speed > 0 ? Math.max(0, this.speed - d) : Math.min(0, this.speed + d);
    }
    if (!ctrl.throttle && !ctrl.brake && !ctrl.handbrake) {
      const d = DRAG * dt * (0.5 + Math.abs(ctrl.steer) * 1.2);
      this.speed = this.speed > 0 ? Math.max(0, this.speed - d) : Math.min(0, this.speed + d);
    }

    const sp = Math.abs(this.speed);
    const sf = sp < 0.5 ? 1 : 1 / (1 + sp * 0.05);
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += ctrl.steer * 2.3 * sf * dir * dt;
    this.steerVisual += (ctrl.steer * 0.5 - this.steerVisual) * Math.min(1, dt * 8);

    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.ram.x *= Math.exp(-2.5 * dt);
    this.ram.z *= Math.exp(-2.5 * dt);
    const vx = fx * this.speed + this.ram.x;
    const vz = fz * this.speed + this.ram.z;

    this.body.velocity.set(vx, 0, vz);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.y = 0.6;
    this.body.position.x += vx * dt;
    this.body.position.z += vz * dt;
    this.body.quaternion.setFromAxisAngle(Y_UP, this.heading);

    const [cx, cz] = clampBoundary(this.body.position.x, this.body.position.z, 1.2);
    this.body.position.x = cx; this.body.position.z = cz;
    this.body.updateAABB();

    const braking = ctrl.brake > 0 && sp > 0.5;
    for (let i = 0; i < this.brakeMat.length; i++) this.brakeMat[i].color.setHex(braking ? 0xff2a2a : 0x771111);
    this.syncMesh(sp / MAX);
  }

  syncMesh(sp01) {
    this.mesh.position.copy(this.body.position);
    this.mesh.position.y -= 0.1;
    this.mesh.rotation.y = this.heading;
    const spin = sp01 * 28;
    for (let i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.x += spin;
    for (let i = 0; i < this.steerWheels.length; i++) this.steerWheels[i].rotation.y = this.steerVisual;
  }

  applyRam(dirX, dirZ, mag) {
    this.ram.x += dirX * mag;
    this.ram.z += dirZ * mag;
  }

  resetAt(x, z, h) {
    this.speed = 0;
    this.ram.x = 0; this.ram.z = 0;
    this.body.position.set(x, 0.6, z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.heading = h;
    this.body.quaternion.setFromAxisAngle(Y_UP, h);
    this.body.updateAABB();
  }

  detach(scene) {
    scene.remove(this.mesh);
    this.physics.removeBody(this.body);
    return this.mesh;
  }
}

export class VehicleManager {
  constructor(scene, physics, spots) {
    this.scene = scene;
    this.physics = physics;
    this.spots = spots;
    this.parked = [];
    this.active = null;

    for (const s of spots) {
      this._parkCar(s.x, s.z, s.h, s.color || null);
    }
  }

  _parkCar(x, z, h, color) {
    const parts = createCarMesh({ color: color || 0x3a6ea8, accent: 0x20242a });
    parts.group.position.set(x, -0.05, z);
    parts.group.rotation.y = h;
    this.scene.add(parts.group);
    this.parked.push({ x, z, h, group: parts.group, color: color || 0x3a6ea8 });
  }

  getActive() { return this.active; }

  nearbyParked(px, pz, maxDist) {
    let best = null, bd = maxDist;
    for (let i = 0; i < this.parked.length; i++) {
      const p = this.parked[i];
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  enter(obj) {
    const idx = this.parked.indexOf(obj);
    if (idx >= 0) {
      this.parked.splice(idx, 1);
      this.scene.remove(obj.group);
    }
    this.active = new DrivableVehicle(this.scene, this.physics, obj.x, obj.z, obj.h, obj.color);
    return this.active;
  }

  // turn the active vehicle back into a parked car near its current position
  exit() {
    const a = this.active;
    if (!a) return null;
    const px = a.body.position.x, pz = a.body.position.z;
    const mesh = a.detach(this.scene);
    let tx = px, tz = pz, th = a.heading;
    const snap = this._nearestFreeSpot(px, pz);
    if (snap && Math.hypot(snap.x - px, snap.z - pz) < 14) { tx = snap.x; tz = snap.z; th = snap.h; }
    mesh.position.set(tx, -0.05, tz);
    mesh.rotation.y = th;
    this.scene.add(mesh);
    this.parked.push({ x: tx, z: tz, h: th, group: mesh, color: a.bodyColor });
    this.active = null;
    return { x: px, z: pz, h: th };
  }

  _nearestFreeSpot(px, pz) {
    let best = null, bd = Infinity;
    for (const s of this.spots) {
      const occupied = this.parked.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 2.5);
      if (occupied) continue;
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < bd) { bd = d; best = s; }
    }
    if (bd > 40) return null;
    return best;
  }

  update(dt, ctrl) {
    if (this.active) this.active.update(dt, ctrl);
    return this.active;
  }

  resetActive(px, pz) {
    const a = this.active;
    if (!a) return;
    a.resetAt(px, pz, a.heading + Math.PI);
  }
}
