# Project Prompt — Interactive Black Hole With Gravitational Lensing in the Browser

You are an expert real-time graphics programmer, GLSL shader developer, WebGL engineer, and scientific-visualization designer.

## Objective

Build a complete interactive **3D black hole visualization in the browser** featuring a convincing real-time approximation of **gravitational lensing**.

The user should be able to orbit the camera around a black hole and observe:

- a dark event-horizon-like central region,
- a bright accretion disk,
- warped/lensed background stars,
- bending and duplication of the apparent accretion disk around the black hole,
- a glowing photon-ring-like region,
- relativistic-looking brightness asymmetry as an artistic approximation.

This should be an impressive real-time visualization suitable for a YouTube model test.

Do not only explain the math. **Implement a runnable project with all source files.**

## Target Platform

- Desktop browser.
- Recent Chrome/Edge/Firefox.
- No backend.
- Runs from a static local server.
- Use HTML/CSS/JavaScript.
- Use **Three.js** for scene/camera setup.
- Use custom **GLSL shaders** for the lensing effect.
- No npm/build step.
- No external paid assets, APIs, or texture packs.

## Scientific Framing

The visualization should be **physically inspired but computationally simplified**.

Do not claim that it is a full general-relativistic ray tracer.

Include a small UI note such as:

> “Real-time artistic approximation of Schwarzschild-like gravitational lensing; not a full GR ray tracer.”

The visual result is more important than exact astrophysical measurement.

## Visual Target

The scene should resemble a cinematic black-hole visualization while remaining original.

Required visible components:

1. Central black silhouette.
2. Bright thin accretion disk around the equatorial plane.
3. Orange/white/yellow thermal glow in the inner disk.
4. Darker/redder outer disk.
5. Lensing that bends the disk behind the black hole so part of the far side appears above and below it.
6. Warped star field behind the black hole.
7. Thin bright photon-ring-like edge near the critical region.
8. Bloom/glow if practical.

Avoid using a pre-rendered black-hole image as the main effect. Generate the appearance procedurally in shaders.

## Rendering Approach

Prefer a **full-screen fragment shader** or ray-marched/ray-bent procedural effect.

A strong practical architecture is:

- Three.js renderer.
- Full-screen quad.
- Fragment shader computes view ray for each pixel.
- The shader traces or approximates the ray through a black-hole gravitational field.
- Accretion disk intersections produce emissive color.
- Background ray direction samples procedural stars.
- Rays near the capture region become black.
- Strongly bent rays create lensing.

If a different GPU approach gives a better reliable result, use it.

## Camera

Implement an orbital camera around the black hole.

Controls:

- Mouse drag — orbit.
- Mouse wheel — zoom.
- Optional right mouse drag — pan, but keep the black hole centered.
- R — reset camera.
- Space — pause/resume accretion animation.

Camera requirements:

- Smooth orbit.
- Clamp minimum distance so the camera cannot cross into invalid geometry.
- Allow both near edge-on and angled disk views.
- Make the effect remain stable over the supported camera range.

## Black Hole Parameters

Expose UI sliders for:

- Black hole visual mass / lensing strength.
- Accretion disk inner radius.
- Accretion disk outer radius.
- Disk brightness.
- Disk temperature/color bias.
- Rotation/animation speed.
- Exposure.
- Optional lensing quality/steps.

Changes should update in real time.

Provide a **Reset Parameters** button.

## Gravitational Lensing Approximation

Implement visible ray bending.

A real-time approximation is acceptable. Possible approaches:

### Option A — Numerical Ray Bending
Step the ray through space and apply a deflection toward the black hole based on inverse distance.

Pseudo-concept:

- Maintain ray position and direction.
- Advance position by small steps.
- At each step, bend direction toward the center.
- Stronger curvature close to the black hole.
- Detect whether the ray:
  - crosses the accretion-disk plane,
  - escapes to background,
  - enters the capture radius.

### Option B — Analytic/Screen-Space Approximation
Use a carefully designed radial lens warp plus a separate accretion-disk projection that creates a convincing Einstein-ring effect.

However, the result must visibly warp both stars and disk in real time.

Prefer the approach that produces the most convincing stable visual at interactive frame rates.

## Accretion Disk

The disk must be procedural.

Model it as a thin annulus in the black hole equatorial plane.

Required visual features:

- Turbulent/noisy radial structure.
- Hot inner edge.
- Cooler/dimmer outer area.
- Bright streaks rotating around the black hole.
- Time-varying turbulence.
- Slight thickness or glow.
- Opacity variation.

Use procedural noise/hash functions in GLSL rather than external textures when possible.

## Relativistic-Looking Doppler Beaming

Add an artistic approximation in which one side of the rotating accretion disk appears brighter/bluer and the receding side appears darker/redder.

This does not need exact relativistic spectroscopy.

The effect should depend on:

- disk rotation direction,
- local orbital tangent,
- camera/view direction.

Expose a toggle:

- **Doppler Beaming: On/Off**

## Background Star Field

Generate the star field procedurally in the shader or with a generated texture/cubemap.

Requirements:

- Dense but not noisy.
- Varied star brightness.
- A subtle Milky-Way-like band or nebula haze if practical.
- Stars must visibly distort when viewed close to the black hole.

The star field must remain visible away from the black hole and clearly bend near the lensing region.

## Photon Ring / Critical Region

Render a narrow bright ring near the apparent boundary of strongly lensed rays.

It should:

- be thin,
- bright,
- subtle enough not to look like a flat UI circle,
- distort naturally with the rest of the effect.

## Event Horizon / Shadow

The central black region should remain nearly pure black.

Requirements:

- No stars or disk drawn through captured rays.
- A clean shadow silhouette.
- Slight surrounding glow can exist, but the interior should be dark.

## Post-Processing

If reliable, add:

- bloom,
- tone mapping,
- subtle vignette.

Use lightweight methods.

If external post-processing modules would complicate CDN execution, implement approximate glow directly in the shader instead.

## Quality Modes

Provide:

- Low
- Medium
- High

The quality mode can adjust:

- ray-marching step count,
- star detail,
- turbulence octaves,
- render resolution scale.

Default to Medium.

The demo should remain interactive on a typical modern laptop.

## HUD / Controls Panel

Create a clean modern UI.

Display:

- FPS.
- Approximate camera distance.
- Current quality mode.
- Pause state.
- Short scientific disclaimer.
- Parameter controls.

Add a **Hide UI** key such as **H** for clean video capture.

## Presets

Provide at least three visual presets:

### Cinematic
High contrast, bright accretion disk, strong glow.

### Scientific
Less bloom, clearer disk structure, neutral exposure.

### Extreme Lens
Stronger lensing for a dramatic demonstration.

Preset buttons should update sliders/state.

## Animation

Animate:

- disk turbulence,
- disk rotation,
- subtle star/background motion only if tasteful,
- glow fluctuation.

Animation must be based on elapsed time and should pause with Space.

## Numerical Stability

Shader code must guard against:

- division by zero,
- NaN values,
- infinite loops,
- unstable step sizes.

Clamp:

- distances,
- maximum lens strength,
- shader loop counts.

WebGL shaders generally require compile-time loop limits, so design loops accordingly.

## Resize and DPR

Support window resizing.

Use device pixel ratio carefully:

- cap DPR around 1.5–2.0 for performance.
- optionally lower internal resolution in Low mode.

Keep UI crisp.

## Architecture

Suggested files:

- `index.html`
- `style.css`
- `main.js`
- `blackhole.vert`
- `blackhole.frag`

Because loading external shader text can complicate local execution, you may embed shader strings inside `main.js` if that is more reliable.

## Visual Debugging

Add an optional debug mode toggled by **D**.

Debug views could include:

- lensing strength heat map,
- number-of-steps visualization,
- accretion disk intersection mask,
- capture region.

Only add this if it does not risk the main effect.

## Acceptance Criteria

The project is finished only when:

- A black hole visualization renders in the browser.
- The user can orbit and zoom around it.
- The background star field visibly bends around the black hole.
- The accretion disk is visibly lensed, including a far-side image wrapping above/below the black region.
- The central captured-ray region remains dark.
- A bright photon-ring-like feature is visible.
- The disk is procedurally animated.
- Brightness/color asymmetry exists when Doppler mode is enabled.
- Sliders update visual parameters live.
- Three presets work.
- Quality modes work.
- UI can be hidden for video capture.
- The visualization maintains interactive performance.
- No pre-rendered black-hole image is required.

## Delivery Format

Return the entire runnable project.

For each file:

1. Print the exact filename as a heading.
2. Provide its full contents in a fenced code block.
3. Do not use placeholders.
4. Do not omit shader code.
5. Do not respond with pseudocode in place of working GLSL/JavaScript.

At the end include:

- File tree.
- Exact local run instructions.
- Controls.
- Brief explanation of the lensing approximation.
- Brief note on performance/quality tradeoffs.

Prioritize **a visually convincing real-time lensing effect and a reliable runnable demo** over mathematical perfection.
