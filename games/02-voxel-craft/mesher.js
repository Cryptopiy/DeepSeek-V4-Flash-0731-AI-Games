import { AIR, WATER, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, WORLD_H, CHUNK } from "./world.js";

const FACES = [
  { dir: [1, 0, 0], norm: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], norm: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], norm: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], norm: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], norm: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], norm: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const COLORS = {
  grassTop: [0x8e, 0xc9, 0x6a],
  dirt: [0x9a, 0x6b, 0x38],
  stone: [0x8c, 0x8e, 0x96],
  sand: [0xe4, 0xd3, 0x9c],
  woodSide: [0x8c, 0x5d, 0x38],
  woodTop: [0xb5, 0x8b, 0x4e],
  leaf: [0x6f, 0xc0, 0x4e],
  water: [0x44, 0x8b, 0xc9],
};

function hashInt(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = (h * 1274126177) | 0;
  h ^= h >> 14;
  return h;
}

function jitter(x, y, z) {
  return 0.88 + ((hashInt(x, y, z) >>> 0) % 1000) / 1000 * 0.24;
}

function hexToComp(h) {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

function lerpComp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function faceColor(id, face, x, y, z, fy) {
  let c;
  switch (id) {
    case GRASS:
      if (face === 2) c = COLORS.grassTop;
      else if (face === 3) c = COLORS.dirt;
      else {
        let t = (fy - 0.1) / 0.32;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        c = lerpComp(COLORS.dirt, COLORS.grassTop, t);
      }
      break;
    case DIRT: c = COLORS.dirt; break;
    case STONE: c = COLORS.stone; break;
    case SAND: c = COLORS.sand; break;
    case WOOD:
      c = (face === 2 || face === 3) ? COLORS.woodTop : COLORS.woodSide;
      break;
    case LEAVES: c = COLORS.leaf; break;
    case WATER: c = COLORS.water; break;
    default: c = [255, 0, 255];
  }
  const j = jitter(x, y, z);
  return [clamp255(c[0] * j), clamp255(c[1] * j), clamp255(c[2] * j)];
}

function emitFace(acc, x, y, z, face, id, blockJndx) {
  const F = FACES[face];
  const base = acc.pos.length / 3;
  for (let v = 0; v < 4; v++) {
    const c = F.corners[v];
    const px = x + c[0];
    const py = y + c[1];
    const pz = z + c[2];
    acc.pos.push(px, py, pz);
    acc.nor.push(F.norm[0], F.norm[1], F.norm[2]);
    const col = faceColor(id, face, blockJndx[0], blockJndx[1], blockJndx[2], c[1]);
    acc.col.push(col[0] / 255, col[1] / 255, col[2] / 255);
  }
  acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function buildChunkMesh(world, cx, cz) {
  const baseX = cx * CHUNK;
  const baseZ = cz * CHUNK;
  const solid = { pos: [], nor: [], col: [], idx: [] };
  const water = { pos: [], nor: [], col: [], idx: [] };

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      for (let y = 0; y < WORLD_H; y++) {
        const id = world.getBlock(wx, y, wz);
        if (id === AIR) continue;
        if (id === WATER) {
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nid = world.getBlock(wx + F.dir[0], y + F.dir[1], wz + F.dir[2]);
            if (nid === AIR) emitFace(water, lx, y, lz, f, WATER, [wx, y, wz]);
          }
        } else {
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nid = world.getBlock(wx + F.dir[0], y + F.dir[1], wz + F.dir[2]);
            if (nid === AIR || nid === WATER) emitFace(solid, lx, y, lz, f, id, [wx, y, wz]);
          }
        }
      }
    }
  }

  return {
    solid: solid.idx.length ? solid : null,
    water: water.idx.length ? water : null,
  };
}