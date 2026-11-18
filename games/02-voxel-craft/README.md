# Voxel Craft — Browser Voxel Sandbox

> **Как запустить готовую сборку / How to run the ready-made build:** см. / see [HOW_TO_PLAY.md](../../HOW_TO_PLAY.md) в корне репозитория / in the repository root. Если ниже упоминаются другие файлы запуска — их в этом репозитории нет / if other launch files are mentioned below, they are not part of this repository.

A complete, playable Minecraft-style sandbox built with **Three.js** (CDN only) —
no npm, no build step, no external art assets. All textures/colors are procedural.

## File tree

```
02_minecraft_clone/
├── 02_minecraft_clone.md   # original task spec
├── index.html              # DOM, import map (Three.js CDN), menu / HUD / overlays
├── style.css               # HUD, menu, hotbar, crosshair styling
├── main.js                 # boot: scene, lights, loop, input, raycast, save/load/reset
├── world.js                # voxel data model, chunks, seeded noise terrain, trees, water
├── mesher.js               # visible-face chunk meshing (solid + water)
├── player.js               # first-person physics: AABB, gravity, collisions, auto-step
└── ui.js                   # hotbar, HUD labels, FPS, toasts, menu logic
```

## Run

Serve the folder from any static server and open in a recent Chrome / Edge / Firefox:

```bash
# option 1: Python
python3 -m http.server 8000
# then open http://localhost:8000

# option 2: Node
npx serve .
```

Requires internet only if the CDN copy is used — the project ships with a local
copy of Three.js (`vendor/three.module.js`), so it works even fully offline once
served over HTTP. `main.js` tries the CDN first and falls back to the local file.

> Chrome blocks ES modules when opening files via `file://`. Always use a local server.

## Controls

| Input | Action |
| --- | --- |
| Click canvas | Lock pointer (start) |
| Mouse | Look around |
| W / A / S / D | Move |
| Space | Jump / swim up (hold) |
| Shift | Sprint |
| Left click | Break targeted block |
| Right click | Place selected block |
| 1 – 6 | Select hotbar slot |
| Mouse wheel | Cycle hotbar slots |
| N | Toggle day/night cycle |
| P | Save edited world to `localStorage` |
| L | Load saved world |
| Shift + R | Regenerate world (R alone prints a hint) |

## Voxel storage / rendering strategy

- **Data model**: a flat `Uint8Array(W×H×D)` with numeric IDs (`0 = air`),
  indexed by `(z·W + x)·H + y`. Helpers: `getBlock(x,y,z)`, `setBlock(x,y,z,id)`,
  `isSolid(x,y,z)`.
- **World gen**: deterministic seeded 2D-value-noise FBM heightmap → rolling hills,
  grass/dirt/stone strata, sandy beaches around water level, water-filled valleys,
  and sparse grid-aligned trees (wood trunk + leaves blob).
- **Chunking**: 16×16×H chunks (4×4 over the 64×64 world). Editing a block marks its
  chunk (plus edge neighbours) dirty; the main loop rebuilds at most 2 chunks/frame.
- **Meshing**: visible-face culling per chunk — a block face is emitted only when its
  neighbour is air or water. Output is one BufferGeometry per chunk (Uint32 indices
  if needed), so draw calls stay ~16 and hidden blocks cost nothing.
- **Collision**: player is an AABB swept axis-by-axis with exact block-face clamping,
  substeps to prevent tunnelling, a one-block automatic step-up, and world bounds
  clamping with respawn on fall-out.
- **Interaction**: Amanatides–Woo voxel DDA raycast from the crosshair up to 6 blocks
  (water is skipped); the targeted block is outlined, left click removes, right click
  inserts the hotbar block unless it would clip the player.

## Acceptance checklist

- [x] Procedural voxel world renders in browser
- [x] First-person movement + jump with terrain collision
- [x] Crosshair highlights targeted block
- [x] Left click breaks, right click places
- [x] 6-selectable hotbar (grass, dirt, stone, sand, wood, leaves)
- [x] Trees generated on the voxel grid
- [x] Geometry updates after edits
- [x] No external art assets
- [x] Deterministic seeds, editable world, tilt–night cycle, save/load/reset