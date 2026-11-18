export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const WOOD = 5;
export const LEAVES = 6;
export const WATER = 7;

export const WORLD_W = 64;
export const WORLD_H = 40;
export const WORLD_D = 64;
export const CHUNK = 16;
export const WATER_LEVEL = 15;

export const HOTBAR = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES];

export const BLOCK_DEFS = {
  [GRASS]: { name: "Grass", color: "0x8ec96a" },
  [DIRT]: { name: "Dirt", color: "0x9a6b38" },
  [STONE]: { name: "Stone", color: "0x8c8e96" },
  [SAND]: { name: "Sand", color: "0xe4d39c" },
  [WOOD]: { name: "Wood", color: "0x8c5d38" },
  [LEAVES]: { name: "Leaves", color: "0x6fc04e" },
  [WATER]: { name: "Water", color: "0x448bc9" },
};

export function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 974634443) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = (h * 1274126177) | 0;
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967296;
}

function noise2(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const g00 = hash2(xi, zi, seed);
  const g10 = hash2(xi + 1, zi, seed);
  const g01 = hash2(xi, zi + 1, seed);
  const g11 = hash2(xi + 1, zi + 1, seed);
  const a = g00 + (g10 - g00) * u;
  const b = g01 + (g11 - g01) * u;
  return a + (b - a) * v;
}

export function fbm(x, z, seed, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq, seed + i * 1013) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
}

export class World {
  constructor() {
    this.blocks = new Uint8Array(WORLD_W * WORLD_H * WORLD_D);
    this.baseline = null;
    this.edits = new Map();
    this.seed = 0;
    this.dirtyChunks = new Set();
    this.chunkCountX = Math.floor(WORLD_W / CHUNK);
    this.chunkCountZ = Math.floor(WORLD_D / CHUNK);
  }

  index(x, y, z) {
    return (z * WORLD_W + x) * WORLD_H + y;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && z >= 0 && z < WORLD_D;
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return AIR;
    return this.blocks[this.index(x, y, z)];
  }

  isSolid(x, y, z) {
    const id = this.getBlock(x, y, z);
    return id !== AIR && id !== WATER;
  }

  isOpaque(x, y, z) {
    const id = this.getBlock(x, y, z);
    return id !== AIR && id !== WATER;
  }

  setBlock(x, y, z, id, track = false) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    if (track) this.edits.set(x + "," + y + "," + z, id);
    this.markDirty(x, y, z);
    return true;
  }

  markDirty(x, y, z) {
    if (!this.inBounds(x, y, z)) return;
    const cx = this.chunkX(x);
    const cz = this.chunkZ(z);
    this.dirtyChunks.add(cx + "," + cz);
    if ((x & (CHUNK - 1)) === 0) this.dirtyChunks.add((cx - 1) + "," + cz);
    if ((x & (CHUNK - 1)) === CHUNK - 1) this.dirtyChunks.add((cx + 1) + "," + cz);
    if ((z & (CHUNK - 1)) === 0) this.dirtyChunks.add(cx + "," + (cz - 1));
    if ((z & (CHUNK - 1)) === CHUNK - 1) this.dirtyChunks.add(cx + "," + (cz + 1));
  }

  chunkX(x) {
    return Math.floor(x / CHUNK);
  }

  chunkZ(z) {
    return Math.floor(z / CHUNK);
  }

  takeDirty() {
    const list = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();
    return list;
  }

  generate(seed) {
    this.seed = seed | 0 || 1;
    this.blocks.fill(AIR);

    for (let x = 0; x < WORLD_W; x++) {
      for (let z = 0; z < WORLD_D; z++) {
        const e = fbm(x * 0.05, z * 0.05, this.seed);
        let h = Math.round(13 + Math.pow(e, 1.6) * 28);
        h = Math.min(h, WORLD_H - 8);

        const isBeach = h <= WATER_LEVEL + 1;
        const surface = h;
        for (let y = 0; y < surface; y++) {
          let id;
          if (y === 0) id = STONE;
          else if (y < surface - 3) id = STONE;
          else if (y < surface - 1) id = DIRT;
          else id = isBeach ? SAND : GRASS;
          this.blocks[this.index(x, y, z)] = id;
        }

        if (surface < WATER_LEVEL) {
          for (let y = surface; y <= WATER_LEVEL; y++) {
            this.blocks[this.index(x, y, z)] = WATER;
          }
        }
      }
    }

    this.placeTrees();
    this.baseline = this.blocks.slice();
    this.edits.clear();
    this.dirtyChunks.clear();
    this.declareAllChunksDirty();
  }

  declareAllChunksDirty() {
    for (let cx = 0; cx < this.chunkCountX; cx++) {
      for (let cz = 0; cz < this.chunkCountZ; cz++) this.dirtyChunks.add(cx + "," + cz);
    }
  }

  placeTrees() {
    const center = Math.floor(WORLD_W / 2);
    for (let x = 2; x < WORLD_W - 2; x++) {
      for (let z = 2; z < WORLD_D - 2; z++) {
        let surface = -1;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          if (this.blocks[this.index(x, y, z)] !== AIR) { surface = y; break; }
        }
        if (surface <= 0 || this.blocks[this.index(x, surface, z)] !== GRASS) continue;
        if (surface > WORLD_H - 8) continue;
        const dist = Math.max(Math.abs(x - center), Math.abs(z - center));
        if (dist < 6) continue;

        const r = hash2(x, z, this.seed * 31 + 17);
        if (r > 0.02) continue;

        const trunk = 4 + Math.floor(hash2(x, z, this.seed * 7) * 2);
        for (let t = 1; t <= trunk; t++) {
          this.blocks[this.index(x, surface + t, z)] = WOOD;
        }

        const top = surface + trunk;
        for (let dy = 0; dy <= 2; dy++) {
          const yl = top + dy;
          const rad = dy === 0 ? 2 : dy === 1 ? 2 : 1;
          for (let dx = -rad; dx <= rad; dx++) {
            for (let dz = -rad; dz <= rad; dz++) {
              if (dx === 0 && dz === 0 && dy <= 1) continue;
              const d2 = dx * dx + dz * dz;
              if (d2 > (rad + 0.5) * (rad + 0.5)) continue;
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && hash2(x + dx, z + dz, yl * 131) < 0.5) continue;
              const bx = x + dx, bz = z + dz, by = yl;
              if (!this.inBounds(bx, by, bz)) continue;
              if (this.getBlock(bx, by, bz) === AIR) this.blocks[this.index(bx, by, bz)] = LEAVES;
            }
          }
        }

        const yc = top + 2;
        if (this.inBounds(x, yc, z) && this.getBlock(x, yc, z) === AIR) {
          this.blocks[this.index(x, yc, z)] = LEAVES;
        }
      }
    }
  }

  getEdits() {
    const out = [];
    for (const [k, id] of this.edits) {
      const p = k.split(",");
      out.push({ x: +p[0], y: +p[1], z: +p[2], id });
    }
    return out;
  }

  applyEdits(list) {
    if (!list) return;
    for (const e of list) {
      if (!this.inBounds(e.x, e.y, e.z)) continue;
      this.blocks[this.index(e.x, e.y, e.z)] = e.id;
    }
    this.declareAllChunksDirty();
  }
}