import { WORLD_W, WORLD_H, WORLD_D, WATER } from "./world.js";

const HALF = 0.3;
const HEIGHT = 1.8;

function approach(a, b, t) {
  if (a < b) return a + t >= b ? b : a + t;
  return a - t <= b ? b : a - t;
}

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: WORLD_W / 2, y: WORLD_H - 1, z: WORLD_D / 2 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.eyeH = 1.62;
    this.dead = false;
  }

  spawn() {
    const cy = Math.floor(WORLD_W / 2);
    const cz = Math.floor(WORLD_D / 2);
    let top = WORLD_H - 1;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      if (this.world.isSolid(cy, y, cz)) { top = y; break; }
    }
    this.pos.x = cy + 0.5;
    this.pos.z = cz + 0.5;
    this.pos.y = top + 0.2;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.onGround = false;
  }

  eye() {
    return { x: this.pos.x, y: this.pos.y + this.eyeH, z: this.pos.z };
  }

  collidesAt(x, y, z) {
    const minx = Math.floor(x - HALF);
    const maxx = Math.floor(x + HALF);
    const miny = Math.floor(y);
    const maxy = Math.floor(y + HEIGHT);
    const minz = Math.floor(z - HALF);
    const maxz = Math.floor(z + HALF);
    for (let iy = miny; iy <= maxy; iy++) {
      for (let ix = minx; ix <= maxx; ix++) {
        for (let iz = minz; iz <= maxz; iz++) {
          if (this.world.isSolid(ix, iy, iz)) return true;
        }
      }
    }
    return false;
  }

  resolveAxis(axis, d) {
    const start = [this.pos.x, this.pos.y, this.pos.z];
    const mins = [start[0] - HALF, start[1], start[2] - HALF];
    const maxs = [start[0] + HALF, start[1] + HEIGHT, start[2] + HALF];
    const hi = axis === 1 ? HEIGHT : HALF;
    const lo = axis === 1 ? 0 : HALF;

    let lead;
    if (d > 0) lead = maxs[axis] + d;
    else lead = mins[axis] + d;

    let limit = start[axis] + d;
    let blocked = false;

    const sMin = mins.slice();
    const sMax = maxs.slice();
    if (d > 0) sMax[axis] = lead;
    else sMin[axis] = lead;

    const x0 = Math.floor(sMin[0]), x1 = Math.floor(sMax[0]);
    const y0 = Math.floor(sMin[1]), y1 = Math.floor(sMax[1]);
    const z0 = Math.floor(sMin[2]), z1 = Math.floor(sMax[2]);

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (!this.world.isSolid(bx, by, bz)) continue;
          const bmin = [bx, by, bz];
          const bmax = [bx + 1, by + 1, bz + 1];
          if (d > 0) {
            const cand = bmin[axis] - hi;
            if (cand < limit) { limit = cand; blocked = true; }
          } else {
            const cand = bmax[axis] + lo;
            if (cand > limit) { limit = cand; blocked = true; }
          }
        }
      }
    }
    return { value: limit, blocked };
  }

  tryStep(axis, d) {
    if (!this.onGround) return false;
    if (this.stepLatched) return false;
    if (this.collidesAt(this.pos.x, this.pos.y + 1, this.pos.z)) return false;
    const sy = this.pos.y;
    this.pos.y += 1;
    const r = this.resolveAxis(axis, d);
    if (r.blocked) {
      this.pos.y = sy;
      return false;
    }
    this.pos[axis === 0 ? "x" : "z"] = r.value;
    this.pos.y = sy + 1;
    this.stepLatched = true;
    return true;
  }

  update(dt, input, snd) {
    const p = this.pos;
    this.stepLatched = false;
    this.inWater = this.world.getBlock(
      Math.floor(p.x),
      Math.floor(p.y + 0.4),
      Math.floor(p.z)
    ) === WATER;

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.left) { mx += rx; mz += rz; }
    if (input.right) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    const speed = input.sprint ? 9 : 5.5;
    const accel = 14;
    this.vel.x = approach(this.vel.x, mx * speed, accel * dt);
    this.vel.z = approach(this.vel.z, mz * speed, accel * dt);

    if (this.inWater) {
      this.vel.y -= 24 * dt;
      if (this.vel.y < -4.5) this.vel.y = -4.5;
    } else {
      this.vel.y -= 30 * dt;
      if (this.vel.y < -48) this.vel.y = -48;
    }

    if (input.jump) {
      if (this.inWater) {
        this.vel.y = 6;
        if (snd) snd.jump();
      } else if (this.onGround) {
        this.vel.y = 8.8;
        this.onGround = false;
        if (snd) snd.jump();
      }
    }

    const maxMove = 0.42;
    const n = Math.max(
      1,
      Math.ceil(
        Math.max(
          Math.abs(this.vel.x * dt),
          Math.abs(this.vel.y * dt),
          Math.abs(this.vel.z * dt)
        ) / maxMove
      )
    );
    const h = dt / n;

    for (let s = 0; s < n; s++) {
      if (this.vel.x !== 0) {
        const r = this.resolveAxis(0, this.vel.x * h);
        if (r.blocked) {
          if (!this.tryStep(0, this.vel.x * h)) {
            this.pos.x = r.value;
            this.vel.x = 0;
          }
        } else {
          this.pos.x = r.value;
        }
      }

      if (this.vel.z !== 0) {
        const r = this.resolveAxis(2, this.vel.z * h);
        if (r.blocked) {
          if (!this.tryStep(2, this.vel.z * h)) {
            this.pos.z = r.value;
            this.vel.z = 0;
          }
        } else {
          this.pos.z = r.value;
        }
      }

      const ry = this.resolveAxis(1, this.vel.y * h);
      this.pos.y = ry.value;
      if (ry.blocked) this.vel.y = 0;
    }

    this.onGround = this.collidesAt(p.x, p.y - 0.001, p.z);

    const min = HALF + 0.01;
    const max = WORLD_W - HALF - 0.01;
    if (p.x < min) { p.x = min; this.vel.x = 0; }
    if (p.x > max) { p.x = max; this.vel.x = 0; }
    if (p.z < min) { p.z = min; this.vel.z = 0; }
    if (p.z > WORLD_D - HALF - 0.01) { p.z = WORLD_D - HALF - 0.01; this.vel.z = 0; }

    if (p.y < -24) {
      this.spawn();
      this.dead = true;
    } else {
      this.dead = false;
    }
  }
}