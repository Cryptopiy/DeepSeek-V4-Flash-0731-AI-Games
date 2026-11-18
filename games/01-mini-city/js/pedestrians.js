// pedestrians.js -----------------------------------------------------------
// Simple FSM pedestrians (idle / walking / fleeing / down). They wander around
// local home zones (plazas + sidewalk lines), stop to idle, flee when a vehicle
// comes close and can be knocked down by the player's car. Shared geometry/
// materials, fixed population count for stable performance.
import * as THREE from './three.js';
import { collideCircle, clampBoundary, mulberry32, ROADS, ROAD_RW, PLAZA_CENTERS } from './world.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SHIRT = [0xe05d3c, 0x3aa0a8, 0x8a5fc0, 0xd9a441, 0x4c9c58, 0xe86aa8];
const PANTS = [0x3a3f4a, 0x555b66, 0x2e2e36, 0x6b6b7a];

export class PedestrianManager {
  constructor(scene, colliders, count) {
    this.scene = scene;
    this.colliders = colliders;
    this.peds = [];
    this.rng = mulberry32(777);
    this.homes = this._generateHomes();
    for (let i = 0; i < count; i++) {
      this.peds.push(this._create(i));
    }
  }

  _generateHomes() {
    const homes = [];
    // plazas
    for (const p of PLAZA_CENTERS) {
      for (let k = 0; k < 3; k++) {
        homes.push({ x: p.x + (this.rng() - 0.5) * 8, z: p.z + (this.rng() - 0.5) * 8, r: 7 });
      }
    }
    // sidewalks along roads
    for (const c of ROADS) {
      for (const s of [-1, 1]) {
        const off = c + s * (ROAD_RW + 1.2);
        for (let t = -50; t <= 50; t += 12) {
          if (this.rng() < 0.4) homes.push({ x: t + (this.rng() - 0.5) * 4, z: off + (this.rng() - 0.5) * 2, r: 9 });
          if (this.rng() < 0.4) homes.push({ x: off + (this.rng() - 0.5) * 2, z: t + (this.rng() - 0.5) * 4, r: 9 });
        }
      }
    }
    return homes;
  }

  _create(i) {
    const home = this.homes[i % this.homes.length];
    const shirt = new THREE.MeshLambertMaterial({ color: SHIRT[i % SHIRT.length] });
    const pants = new THREE.MeshLambertMaterial({ color: PANTS[(i * 3) % PANTS.length] });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
    const g = new THREE.Group();
    const torso = new THREE.Mesh(BOX, shirt); torso.scale.set(0.42, 0.55, 0.24); torso.position.y = 0.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMat); head.position.y = 1.32;
    const legs = new THREE.Mesh(BOX, pants); legs.scale.set(0.22, 0.5, 0.2); legs.position.y = 0.27;
    g.add(torso); g.add(head); g.add(legs);
    const x = home.x + (this.rng() - 0.5) * 3;
    const z = home.z + (this.rng() - 0.5) * 3;
    g.position.set(x, 0, z);
    this.scene.add(g);
    return {
      i, g, x, z, speed: 0, heading: 0, state: 'idle',
      home, target: { x, z }, timer: 0, down: 0, shirt,
    };
  }

  threatPositions() {
    // filled by main.js: list of {x, z} for cars/police
    return this._threats || [];
  }
  setThreats(list) { this._threats = list; }

  update(dt) {
    const threats = this._threats || [];
    for (const p of this.peds) {
      if (p.down > 0) {
        p.down -= dt;
        p.g.position.y = -0.6; // lying flat
        if (p.down <= 0) { p.g.position.y = 0; p.state = 'idle'; this._respawn(p); }
        continue;
      }

      // threat detection -> flee
      let nearest = null, nd = 5.0;
      for (const t of threats) {
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d < nd) { nd = d; nearest = t; }
      }

      if (nearest) {
        p.state = 'fleeing';
        p.timer = Math.max(p.timer, 1.2);
        const dx = p.x - nearest.x, dz = p.z - nearest.z;
        const dd = Math.hypot(dx, dz) || 1;
        const sp = 3.1;
        p.x += (dx / dd) * sp * dt;
        p.z += (dz / dd) * sp * dt;
        p.heading = Math.atan2(-dx / dd, -dz / dd);
        this._finalize(p, dt, sp);
        continue;
      }

      switch (p.state) {
        case 'idle':
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = 'walking';
            p.target = this._pickTarget(p);
          }
          break;
        case 'walking': {
          const dx = p.target.x - p.x, dz = p.target.z - p.z;
          const d = Math.hypot(dx, dz);
          const sp = 1.2 + p.i * 0.02;
          if (d < 0.6) {
            p.state = 'idle';
            p.timer = 1.0 + this.rng() * 3.5;
          } else {
            p.x += (dx / d) * sp * dt;
            p.z += (dz / d) * sp * dt;
            p.heading = Math.atan2(-dx / d, -dz / d);
            this._finalize(p, dt, sp);
          }
          break;
        }
        case 'fleeing':
          p.timer -= dt;
          if (p.timer <= 0) { p.state = 'idle'; p.timer = 0.5 + this.rng(); }
          break;
      }

      // loose separation between pedestrians
      let moved = false;
      for (let j = 0; j < this.peds.length; j++) {
        if (p.i === this.peds[j].i) continue;
        const q = this.peds[j];
        const dx = p.x - q.x, dz = p.z - q.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 0.001) {
          const push = (0.7 - d) * 0.5;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
          moved = true;
        }
      }
      if (moved && p.state !== 'fleeing') {
        const [x, z] = collideCircle(p.x, p.z, 0.25, this.colliders);
        const [cx, cz] = clampBoundary(x, z, 0.25);
        p.x = cx; p.z = cz;
        p.g.position.set(p.x, 0, p.z);
      }
    }
  }

  _pickTarget(p) {
    const h = p.home;
    for (let tries = 0; tries < 6; tries++) {
      const x = h.x + (this.rng() - 0.5) * h.r * 2;
      const z = h.z + (this.rng() - 0.5) * h.r * 2;
      if (!isBlockedHere(x, z, this.colliders, 0.25)) return { x, z };
    }
    return { x: h.x, z: h.z };
  }

  _respawn(p) {
    const h = p.home;
    p.x = h.x + (this.rng() - 0.5) * 2;
    p.z = h.z + (this.rng() - 0.5) * 2;
    p.state = 'idle'; p.timer = 1 + this.rng() * 2;
  }

  _finalize(p, dt, sp) {
    const [x, z] = collideCircle(p.x, p.z, 0.25, this.colliders);
    const [cx, cz] = clampBoundary(x, z, 0.25);
    p.x = cx; p.z = cz;
    p.g.position.set(p.x, 0, p.z);
    p.g.rotation.y = p.heading;
  }

  // knock this pedestrian down (hit by the car)
  hit(i) {
    const p = this.peds[i];
    p.down = 3.0;
  }

  // returns index of the closest pedestrian overlapping the given circle
  // (used to detect the player's car running someone over)
  hitPlayerCar(cx, cz, radius) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (p.down > 0) continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < radius && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  getCount() { return this.peds.length; }

  // world-space positions for radar + threats
  positions() {
    return this.peds.map(p => ({ x: p.x, z: p.z }));
  }
}

function isBlockedHere(x, z, boxes, r) {
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
