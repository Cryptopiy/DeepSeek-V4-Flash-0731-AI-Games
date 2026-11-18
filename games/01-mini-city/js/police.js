// police.js ----------------------------------------------------------------
// Police AI: low-poly pursuit cars with strobe lights. They spawn on roads away
// from the player, chase via a simple pursuit heading, steer around buildings,
// get extra aggressive (ram/intercept) at higher wanted levels, recover from
// being stuck, and despawn once the player is far away with no wanted level.
import * as THREE from './three.js';
import { createCarMesh } from './carMesh.js';
import { collideCircle, clampBoundary, ROADS, BOUNDARY_R } from './world.js';

const COLORS = [0x1d2740, 0x1f2a45, 0x232e4a];
const SPEED_CAP = [0, 16, 19, 22]; // by wanted level (player max is 32 -> escapable)

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PoliceManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.rngLike = Math.random;
  }

  // ensure `n` active cars (called each frame with current wanted level)
  setWanted(playerX, playerZ, wanted) {
    const n = wanted;
    while (this.cars.length < n) {
      const spawn = this._spawnPoint(playerX, playerZ);
      const parts = createCarMesh({ police: true, color: COLORS[this.cars.length % COLORS.length] });
      const car = {
        x: spawn.x, z: spawn.z, heading: spawn.h, speed: 0,
        group: parts.group, wheels: parts.wheels, steer: parts.steering,
        strobe1: parts.strobe1, strobe2: parts.strobe2,
        tint: 0, stuckT: 0, unstick: 0, unstickDir: 1,
      };
      this.scene.add(parts.group);
      this.cars.push(car);
    }
    // remove extras only when they're far away (graceful fade-out)
    for (let i = this.cars.length - 1; i >= n; i--) {
      const c = this.cars[i];
      const d = Math.hypot(c.x - playerX, c.z - playerZ);
      if (d > 55) {
        this.scene.remove(c.group);
        this.cars.splice(i, 1);
      }
    }
    // when wanted drops to 0, remove cars that are far
    if (wanted === 0) {
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        const d = Math.hypot(c.x - playerX, c.z - playerZ);
        if (d > 50) {
          this.scene.remove(c.group);
          this.cars.splice(i, 1);
        }
      }
    }
  }

  _spawnPoint(px, pz) {
    // pick a point along a random road line, at distance 35-65 from the player
    for (let tries = 0; tries < 20; tries++) {
      const road = ROADS[Math.floor(Math.random() * ROADS.length)];
      const vertical = Math.random() < 0.5;
      let x, z;
      if (vertical) { x = road; z = (Math.random() * 2 - 1) * BOUNDARY_R * 0.8; }
      else { x = (Math.random() * 2 - 1) * BOUNDARY_R * 0.8; z = road; }
      const d = Math.hypot(x - px, z - pz);
      if (d > 32 && d < 65) {
        const h = Math.atan2(px - x, pz - z); // point toward the player
        return { x, z, h };
      }
    }
    // fallback: far corner
    return { x: -60, z: -60, h: 0 };
  }

  update(dt, player, wanted) {
    const cap = SPEED_CAP[wanted] || SPEED_CAP[1];
    for (const c of this.cars) {
      if (c.unstick > 0) {
        c.unstick -= dt;
        c.speed = Math.min(-4, c.speed);
        c.heading += c.unstickDir * 0.7 * dt;
        if (c.unstick <= 0) c.unstick = 0;
      }

      // target := intercept point ahead of the player at high wanted levels
      let tx = player.x, tz = player.z;
      if (wanted >= 3) {
        tx += -Math.sin(player.h) * 12;
        tz += -Math.cos(player.h) * 12;
      }
      const dx = tx - c.x, dz = tz - c.z;
      const dd = Math.hypot(dx, dz);
      const desired = Math.atan2(-dx / dd, -dz / dd);

      // building avoidance: if an obstacle is directly ahead, steer away
      let avoid = 0;
      const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading);
      const probe = 5.5 + c.speed * 0.3;
      const aheadX = c.x + fx * probe, aheadZ = c.z + fz * probe;
      if (this._blocked(aheadX, aheadZ, 1.8)) {
        // pick the side with more clear space
        const lx = c.x + Math.cos(c.heading) * probe, lz = c.z - Math.sin(c.heading) * probe;
        const rx = c.x - Math.cos(c.heading) * probe, rz = c.z + Math.sin(c.heading) * probe;
        const leftClear = !this._blocked(lx, lz, 1.8);
        const rightClear = !this._blocked(rx, rz, 1.8);
        avoid = leftClear && !rightClear ? -1 : (rightClear && !leftClear ? 1 : (Math.random() < 0.5 ? 1 : -1));
      }

      let delta = (desired - c.heading) + avoid * 0.9;
      delta = wrapAngle(delta);
      const turn = Math.max(-1, Math.min(1, delta * 1.5));
      const sf = c.speed < 1 ? 1 : 1 / (1 + c.speed * 0.035);
      c.heading += turn * 2.1 * sf * dt;

      // accelerate toward cap
      const targetSpeed = cap * (avoid === 0 ? 1 : 0.6);
      const accel = 8 * dt;
      c.speed = c.speed < targetSpeed ? Math.min(targetSpeed, c.speed + accel) : Math.max(targetSpeed, c.speed - accel * 2);
      if (dd > 6 && wanted >= 1) c.speed = Math.max(c.speed, Math.min(targetSpeed, 20)); // don't crawl when far

      const vx = fx * c.speed, vz = fz * c.speed;
      c.x += vx * dt;
      c.z += vz * dt;

      const [x, z] = collideCircle(c.x, c.z, 2.0, this.colliders);
      const [bx, bz] = clampBoundary(x, z, 2.0);
      c.x = bx; c.z = bz;

      // stuck detection + recovery
      if (c.speed < 1 && dd > 3) {
        c.stuckT += dt;
        if (c.stuckT > 2.0) {
          c.unstick = 1.0;
          c.unstickDir = Math.random() < 0.5 ? 1 : -1;
          c.stuckT = 0;
        }
      } else { c.stuckT = Math.max(0, c.stuckT - dt * 2); }

      // strobes + wheels + sync
      c.tint += dt;
      const on = Math.floor(c.tint * 3) % 2 === 0;
      if (c.strobe1) c.strobe1.color.setHex(on ? 0xff2233 : 0x552222);
      if (c.strobe2) c.strobe2.color.setHex(on ? 0x5522ff : 0x332266);
      this._sync(c, dt);
    }
  }

  _blocked(x, z, r) {
    for (const b of this.colliders) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if (Math.hypot(x - cx, z - cz) < r) return true;
      }
    }
    return false;
  }

  _sync(c, dt) {
    for (let i = 0; i < c.wheels.length; i++) c.wheels[i].rotation.x += c.speed * 0.16 * dt * 60;
    c.group.position.set(c.x, -0.1, c.z);
    c.group.rotation.y = c.heading;
  }

  closest(x, z) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.x - x, c.z - z));
    return best;
  }

  positions() { return this.cars.map(c => ({ x: c.x, z: c.z })); }

  // any police within ramRange of the player vehicle -> ram it
  checkRams(playerX, playerZ, ramRange, onRam) {
    for (const c of this.cars) {
      const d = Math.hypot(c.x - playerX, c.z - playerZ);
      if (d < ramRange && c.speed > 4) {
        const dx = (playerX - c.x) / (d || 1), dz = (playerZ - c.z) / (d || 1);
        onRam(dx, dz, Math.min(18, c.speed * 0.7));
      }
    }
  }
}
