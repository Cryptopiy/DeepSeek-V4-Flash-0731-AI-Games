# Tornado — Interactive Town Destruction Simulator

> **Как запустить готовую сборку / How to run the ready-made build:** см. / see [HOW_TO_PLAY.md](../../HOW_TO_PLAY.md) в корне репозитория / in the repository root. Если ниже упоминаются другие файлы запуска — их в этом репозитории нет / if other launch files are mentioned below, they are not part of this repository.

A complete runnable browser project: a stylized 3D tornado you can steer through a
low-poly town while roofs rip off, trees snap, cars tumble and debris spirals into
the vortex.

Built with **Three.js r160** and **cannon-es 0.20** loaded from a CDN. No build
step, no backend, no proprietary assets.

> Vortex forces and damage are simplified for interactive visualization.
> This is a gameplay demo, **not** a meteorological simulation.

## Run it locally

Any static file server works (ES modules must be served over http):

```bash
# from this folder
php -S localhost:8080          # or
python3 -m http.server 8080    # or
npx serve .
```

Then open `http://localhost:8080`.

*Requires a recent desktop Chrome / Edge / Firefox.*

## File tree

```
04_tornado_simulator/
├── README.md
├── index.html                 # page, HUD, start/pause overlays
├── style.css                  # HUD / overlay styles
└── js/
    ├── three.js               # re-export of the Three.js CDN module
    ├── main.js                # loop, input, cameras, storm audio, orchestration
    ├── physics.js             # cannon-es world, break/dynamic registry, sync & pruning
    ├── town.js                # procedural town: roads, houses, trees, cars, props
    ├── tornado.js             # funnel visuals, particles, vortex force model, lightning
    ├── particles.js           # pooled GPU shader particles (bursts & vortex leaves)
    └── ui.js                  # HUD / overlay helpers
```

## Controls

| Input | Action |
|---|---|
| `WASD` / Arrow keys | Move the tornado over the ground |
| `Q` / `E` | Lower / raise strength (Level 1…5) |
| `Shift` | Sprint (faster movement) |
| `Space` / `Esc` | Pause / resume |
| `C` | Cycle cameras: Follow → Orbit → Town overview |
| Mouse drag, wheel | Orbit camera: rotate / zoom |
| `R` | Reset the whole town (works without reloading) |
| `M` | Toggle wind / rumble audio |

## Vortex force model

No particle/fluid simulation — the tornado applies **direct forces to rigid bodies**
each physics step. For a body at horizontal offset `r` from the funnel axis:

1. **Tangential force** magnitude `∝ strength · (1 − r/Ry)² · (0.7 + 0.55·core)`
   around the axis (with `Ry` the outer influence radius and `core` peaking
   inside the core radius `R0`).
2. **Radial inward suction** `∝ strength · falloff · (1 − 0.72·heightFactor)`
   — weaker while the object is aloft so high debris gets flung outward.
3. **Vertical lift** `∝ strength · falloff · (0.4 + 0.75·core)` — opposes gravity
   and strengthens near the core.
4. **Turbulence/noise** — time-varying sine terms added to every axis so motion is
   never perfectly uniform.
5. **Distance falloff** `(1 − r/Ry)²` and a hard cutoff at `Ry`.

Forces scale with body mass (so heavy vehicles resist, light panels fly), with a
small random torque added for tumbling. Exposure — the magnitude of this wind —
is compared against **per-part material thresholds** to decide when things break.

## Destruction strategy

Breakable **Buildings** are built from modular parts, each a small rigid body:

- **Walls** (4 per house, with windows/doors parented so they fly off together) — strong
- **Roof panels** (2 gable slopes + ridge cap) — weak
- **Chimney** — weak
- **Trees** — medium (trunks sway before snapping; crown oscillates with exposure)
- **Fences / signs / crates / bins** — very weak
- **Vehicles** — heavy bodies, only slide/lift at extreme force
- **Foundations** — permanent static obstacles (untouched debris bounces off them)

While intact each part is a **static** cannon-es body in the world (so flying debris
collides with still-standing buildings). In `checkDamage()` the local wind exposure
is compared against `threshold · resistFactor`; when exceeded, the part is flipped to
**dynamic**, launched into the air, syncs its visuals with the physics body, spawns a
debris burst, and increments the damage counters. This yields a readable progression:
light props first, then roofs, then walls/trees, only at high strength vehicles
and large chunks. Active debris is capped and far-travelled pieces are recycled.

## Performance notes

- Fixed-timestep physics (`world.step(1/60,…)`), sleeping enabled.
- Shared geomet-mat caches; GPU shader particle pools; frustum-culled rendering.
- Near-constant draw-call count, so heavy destruction stays smooth.