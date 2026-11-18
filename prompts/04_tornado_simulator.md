# Project Prompt — Interactive Tornado Destruction Simulator in the Browser

You are an expert WebGL developer, real-time simulation programmer, physics engineer, and technical artist.

## Objective

Create a complete browser-based **3D tornado simulator** in which a powerful tornado moves through a small town and visibly destroys it.

The experience should be interactive and visually dramatic:

- The user can control or guide the tornado.
- Buildings and props react to wind forces.
- Roofs, walls, vehicles, trees, signs, and debris can be pulled toward the vortex.
- Objects can break loose and fly through the air.
- The town transitions from intact to damaged as the tornado passes through.

The simulation can use physically inspired approximations rather than computational fluid dynamics.

Do not only explain how to make it. **Implement the complete runnable project.**

## Target Platform

- Desktop browser.
- Recent Chrome/Edge/Firefox.
- No backend.
- Runs from a local static server.
- Prefer HTML/CSS/JavaScript.
- Use **Three.js**.
- Use **cannon-es** or a comparable lightweight rigid-body library from a CDN if useful.
- No npm/build process.
- No external proprietary models or texture packs.

## Scene

Create a compact low-poly town of roughly 2–4 city blocks.

Include:

- 8–15 small houses/buildings.
- Streets.
- Sidewalks.
- Streetlights.
- Trees.
- Utility poles or signs.
- Parked vehicles.
- Fences, trash bins, crates, roof pieces, or similar props.
- Open area where the tornado can approach.

Everything should use simple original geometry/materials.

The town should initially look intact and peaceful so destruction is clearly visible.

## Tornado Visual

Create a convincing stylized tornado made from multiple layers.

Use a combination of:

- rotating particle spirals,
- semi-transparent funnel geometry,
- dust/debris particles,
- ground dust ring,
- vertical swirling bands,
- cloud/fog effect near the top.

The funnel should:

- be narrower near the ground,
- wider toward the top,
- rotate continuously,
- subtly bend/wobble,
- visibly contain fast-moving debris once destruction begins.

Do not rely on a static tornado image.

## Tornado Controls

Allow the user to move the tornado through the town.

Suggested controls:

- WASD or arrow keys — move tornado over the ground.
- Q/E — adjust strength.
- Shift — temporarily increase movement speed.
- Space — toggle pause.
- R — reset the entire town.
- C — cycle cameras.

The tornado should move smoothly and stay within a defined simulation area.

## Tornado Strength

Implement a strength scale inspired by EF categories, but label it clearly as a **game/simulation approximation**, not a scientific rating.

For example:

- Level 1 — weak.
- Level 2 — moderate.
- Level 3 — strong.
- Level 4 — violent.
- Level 5 — extreme.

Increasing strength should affect:

- vortex radius,
- tangential wind force,
- inward suction,
- upward lift,
- debris speed,
- chance of structural pieces breaking loose.

Display current strength in the HUD.

## Physically Inspired Vortex Model

For dynamic objects near the tornado, calculate wind force based on position relative to the vortex.

For an object at horizontal offset from tornado center:

1. Apply **tangential force** around the tornado axis.
2. Apply **radial inward force** toward the funnel.
3. Apply **vertical lift** that becomes strong near the core.
4. Apply turbulence/noise so motion is not perfectly uniform.
5. Reduce force with distance.

A conceptual force model can use:

- horizontal distance `r`,
- normalized direction toward center,
- perpendicular tangential direction,
- strength-dependent coefficients,
- falloff curve.

Do not simulate air as particles/cells. Use direct forces on rigid bodies.

## Destructible Buildings

Buildings should visibly break apart.

Use modular construction.

A house can contain:

- foundation,
- four wall sections,
- roof panels,
- windows/door as visual pieces.

Use one of these strategies:

### Strategy A — Breakable Rigid Parts
Initially keep structural pieces static or kinematic. When local wind exceeds a threshold:

- convert selected roof/wall pieces into dynamic rigid bodies,
- apply tornado force,
- allow them to fly away.

### Strategy B — Compound + Fracture Approximation
Start with larger structures and replace damaged sections with several debris chunks when a threshold is exceeded.

Whichever method you choose, ensure destruction is stable and visually obvious.

Different elements should have different resistance:

- signs/fences: very weak,
- roof panels: weak,
- trees: medium,
- walls: medium/strong,
- heavy foundations: mostly immovable.

## Trees

Trees should:

- sway or visually react before failure if practical.
- snap or uproot when forces exceed a threshold.
- become debris rigid bodies after failure.

At minimum, trunks or tree objects should be able to break loose at high strength.

## Vehicles

Park several simple low-poly vehicles in town.

Vehicles should:

- remain in place under weak winds.
- slide/roll under strong winds.
- lift and tumble near the tornado core at high strength.
- collide with buildings and debris.

Use simplified rigid bodies.

## Debris System

Debris is central to the visual effect.

Types can include:

- roof panels,
- wood pieces,
- signs,
- fence pieces,
- boxes,
- small wall chunks,
- glass-like particles,
- leaves/dust particles.

Requirements:

- Debris should orbit and rise in the vortex.
- Some debris should be thrown outward.
- Debris must collide with the ground and major objects if physics allows.
- Limit active debris count for performance.
- Remove or recycle debris that travels too far away.

## Progressive Damage

The town should not instantly explode as soon as the tornado approaches.

Use thresholds:

- Weak peripheral wind moves light props.
- Medium wind breaks signs/fences and roof pieces.
- Stronger wind damages walls and trees.
- Core/high strength can move vehicles and large chunks.

This creates a readable destruction progression.

## Ground Interaction

Add dust near the tornado base.

Dust intensity should increase with strength.

Optional:

- small ground debris particles,
- temporary darkened/damaged ground trail,
- scattered debris after tornado passage.

## Cameras

Provide at least three camera modes:

### 1. Follow Tornado
Third-person aerial camera following behind/above the tornado.

### 2. Free Orbit
Mouse-controlled orbit around the tornado/town.

### 3. Town Overview
High cinematic view showing the destruction path.

Use **C** to cycle modes.

Smoothly interpolate camera movement.

## HUD

Show:

- Tornado strength level.
- Approximate wind speed value for presentation.
- Number of destroyed/broken structures.
- Active debris count.
- Camera mode.
- Pause state.
- Controls.

The “wind speed” may be an internal game value mapped to km/h or mph; label it approximate.

## Reset

Pressing **R** should restore:

- all buildings,
- roofs,
- props,
- trees,
- vehicles,
- debris,
- tornado position,
- destruction counter.

The reset must work repeatedly without reloading the page.

## Performance

Target smooth interactive performance.

Use:

- pooled particles/debris when practical,
- shared geometry/materials,
- capped rigid-body count,
- fixed physics timestep,
- sleep for inactive bodies if supported,
- simple collision shapes,
- distance-based update limits.

If too many physics bodies are active, prioritize nearby/destruction-critical objects.

## Visual Polish

Add as many as practical after the core simulation works:

- lightning in clouds.
- darkening sky as strength rises.
- rotating cloud deck.
- camera shake near strong tornado.
- motion streak effect on debris.
- small destruction particles.
- wind audio through Web Audio.
- low-frequency rumble.
- cinematic intro view.

## Scientific Framing

This is a visual/gameplay simulation, not a meteorological CFD model.

Add a small line in the UI or help panel:

> “Vortex forces and damage are simplified for interactive visualization.”

Do not make false claims of scientific accuracy.

## Architecture

Suggested modules:

- `index.html`
- `style.css`
- `main.js`
- `town.js`
- `tornado.js`
- `destruction.js`
- `physics.js`
- `particles.js`
- `ui.js`

Use fewer files if more reliable.

## Acceptance Criteria

The project is complete only when:

- A 3D low-poly town loads in the browser.
- A clearly animated tornado is visible.
- The user can move the tornado.
- Strength can be changed.
- Wind forces affect nearby props.
- Roof/wall pieces can break away.
- Trees and/or signs can become debris.
- Vehicles can move or tumble at high strength.
- Debris visibly swirls upward around the tornado.
- Damage progresses based on distance/strength.
- HUD statistics update.
- The whole town can be reset without page reload.
- Performance remains usable during heavy destruction.
- No proprietary assets are needed.

## Delivery Format

Return a complete runnable source project.

For every source file:

1. Print the exact filename as a heading.
2. Provide full contents in a fenced code block.
3. Do not use placeholders.
4. Do not omit core helper functions.

At the end include:

- File tree.
- Local run instructions.
- Controls.
- Short explanation of the vortex force model.
- Short explanation of the building destruction strategy.

The final result should be **visually dramatic, easy to demonstrate on video, and robust enough for repeated resets and tornado passes through the town**.
