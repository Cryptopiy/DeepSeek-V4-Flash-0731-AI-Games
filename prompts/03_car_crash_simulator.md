# Project Prompt — Browser Car Crash Physics Simulator

You are an expert real-time physics programmer, browser graphics engineer, and vehicle-simulation developer.

## Objective

Create a complete **3D car crash simulator that runs in the browser**.

The user should be able to drive a car around a compact crash-test arena, accelerate to meaningful speeds, collide with walls, barriers, ramps, and other vehicles, and see a convincing visual/physical reaction.

This does not need production-grade finite-element vehicle deformation. Instead, build a robust real-time approximation that clearly demonstrates:

- vehicle mass and momentum,
- suspension-like motion,
- impacts,
- debris,
- visible vehicle damage,
- collision energy,
- replay/reset functionality.

Do not merely provide an implementation plan. **Build the runnable project and output all source files.**

## Target Platform

- Desktop browser.
- Recent Chrome/Edge/Firefox.
- No backend.
- Runs from a static local server.
- Prefer HTML/CSS/JavaScript.
- Use **Three.js** for rendering.
- Use **cannon-es** or another browser-compatible rigid-body physics library from a CDN.
- Do not require npm, bundlers, API keys, or proprietary assets.

## Core Scene

Create a crash-test facility containing:

- Flat test ground.
- Concrete wall.
- Strong barrier.
- Ramp.
- A line of lightweight barrels/cones/boxes.
- At least one parked target vehicle.
- Optional narrow corridor or slalom section.

Use low-poly procedural geometry.

Add:

- Directional lighting.
- Shadows if practical.
- Sky/background.
- Clear ground markings.
- Visual sense of scale.

## Main Vehicle

Create one player-controlled car with a recognizable original low-poly design.

The vehicle should have:

- Main chassis.
- Four wheels.
- Bumpers.
- Hood.
- Trunk/rear panel.
- Doors represented visually.
- Glass-like windshield/windows.
- Headlights and brake lights if practical.

The model can be built from primitive geometry.

## Vehicle Physics

Use a practical real-time vehicle model.

Preferred options:

- raycast vehicle,
- rigid chassis + raycast wheels,
- or a well-structured simplified suspension model.

Required behavior:

- acceleration,
- braking,
- reverse,
- steering,
- vehicle mass,
- friction,
- gravity,
- wheel suspension feel,
- body roll/pitch,
- believable collisions.

Controls:

- W — accelerate.
- S — brake/reverse.
- A/D — steer.
- Space — handbrake.
- R — reset current vehicle.
- C — cycle camera.
- Enter or another clear key — spawn/reset test scenario if needed.

Prevent unrealistic unlimited speed. A top speed around 120–180 km/h is enough for the demo.

## Crash Damage System

The simulator must show **persistent visible damage** after impacts.

Because real deformable-body simulation is too expensive, use a layered approximation.

Implement at least three of the following:

### A. Deformable Visual Zones
Divide the car into damage zones:

- front,
- rear,
- left side,
- right side.

When a collision exceeds a threshold:

- squash/offset the corresponding visual body mesh,
- slightly rotate local panels,
- darken or alter damaged material,
- accumulate damage over repeated impacts.

### B. Detachable Parts
Allow selected parts to detach in sufficiently strong collisions:

- bumper,
- hood,
- trunk panel,
- doors,
- headlights,
- wheels only at very high impact energy if stable.

Detached parts become physics bodies.

### C. Glass Damage
Windshield/windows can:

- become cracked using a procedural material change,
- become more opaque,
- or disappear/emit glass-like fragments after a severe crash.

### D. Debris Particles
Spawn a limited number of small debris pieces at strong impacts.

### E. Alignment Damage
After severe side/front impacts:

- slightly reduce steering effectiveness,
- introduce steering pull,
- reduce max acceleration,
- or misalign a wheel visually.

Keep these effects understandable and not excessively punishing.

## Impact Calculation

Estimate crash severity using data such as:

- relative collision velocity,
- vehicle mass,
- contact impulse if exposed by the physics engine.

Compute and display an approximate:

- impact speed,
- collision severity,
- energy estimate in kJ.

A simplified estimate such as kinetic energy from relative speed is acceptable as long as the UI labels it as an approximation.

## Crash Severity Categories

Show a readable result after a significant collision:

- Minor
- Moderate
- Severe
- Critical

Base the category on approximate impact energy or impulse.

After a major crash, briefly show an overlay with:

- Impact speed.
- Approximate energy.
- Damage percentage.
- Severity.

Do not completely pause the simulation unless the user chooses replay mode.

## Damage Percentage

Maintain a vehicle condition score from 100% down toward 0%.

Damage should accumulate from:

- strong impacts,
- repeated impacts,
- wheel/panel detachment.

Display:

- Vehicle condition: 0–100%.
- Front/rear/side damage bars if practical.

## Secondary Vehicle

Add at least one non-player vehicle for crashes.

It may be:

- parked,
- placed at a test marker,
- or optionally moved by a simple constant-speed AI.

Provide an easy test scenario such as:

- player car facing target car with a long acceleration lane.

## Test Scenarios

Include buttons or keyboard shortcuts for at least three setups:

1. **Wall Test** — car aligned with concrete wall.
2. **Two-Car Test** — player car aligned toward a stationary target vehicle.
3. **Ramp Test** — car aligned toward a ramp and obstacles.

When a scenario is selected:

- reset the player vehicle,
- repair all damage,
- clear old debris,
- place relevant objects.

This is important for repeatedly demonstrating crashes in a video.

## Cameras

Provide multiple cameras:

### Chase Camera
- follows behind the car,
- smooth damping.

### Hood / Driver-Like Camera
- close forward view.

### Orbit / Crash Camera
- mouse orbit around the vehicle,
- useful after impact.

Use **C** to cycle camera modes.

Optional:
- temporary slow-motion crash camera after severe impact.

## Slow Motion

Implement a slow-motion toggle:

- **T** toggles 0.25× or 0.35× simulation speed.
- UI clearly indicates slow motion.
- Physics should remain stable.

Optionally trigger a very short automatic slow-motion effect for critical crashes, but do not make it annoying.

## HUD

Display:

- Speed in km/h.
- Gear/direction if available.
- Vehicle condition %.
- Current test scenario.
- Slow-motion state.
- Camera mode.
- Latest impact speed.
- Latest impact energy.
- Latest severity.

Add a concise controls panel.

## Visual Effects

Add polished but lightweight feedback:

- sparks on metal impacts,
- dust,
- glass particles,
- skid marks if practical,
- brief camera shake,
- brake lights,
- debris.

Cap all particle/debris counts to protect performance.

## Physics Stability

This is critical.

Use:

- fixed physics timestep,
- limited substeps,
- speed clamping if required,
- cleanup of detached debris that falls far away,
- reasonable collision shapes.

Avoid:

- exploding physics bodies,
- endless jitter,
- cars falling through the floor,
- wheel bodies behaving chaotically.

## Reset and Cleanup

Reset must:

- restore car position/rotation,
- zero velocity/angular velocity,
- restore visual shape,
- restore attached parts,
- restore condition to 100%,
- remove debris,
- reset crash UI.

The user should be able to perform many crash tests in one session.

## Technical Organization

Suggested files:

- `index.html`
- `style.css`
- `main.js`
- `physics.js`
- `vehicle.js`
- `damage.js`
- `scenarios.js`
- `ui.js`

Use whichever structure is most reliable.

## Optional Advanced Features

Only add these after the required simulator is working:

- Wheel detachment.
- AI traffic vehicle.
- Replay of previous 5 seconds.
- Graph of speed over time.
- G-force meter.
- Collision heatmap on the vehicle.
- Adjustable vehicle mass.
- Adjustable gravity.
- Multiple camera replay angles.

## Acceptance Criteria

The simulator is finished only when:

- The browser shows a 3D crash-test environment.
- The player can drive a physics-based car.
- The car collides reliably with walls/objects/another car.
- Strong crashes create persistent visual damage.
- At least one part can detach under severe impact.
- Crash severity is calculated and shown.
- Speed and damage are shown in the HUD.
- Wall, two-car, and ramp scenarios can be reset quickly.
- Slow motion works.
- Multiple cameras work.
- Resetting restores the test cleanly.
- The demo can survive repeated crashes without fatal errors.

## Delivery Format

Output all source code necessary to run the project.

For every file:

1. Show the exact filename as a heading.
2. Include the complete contents in a fenced code block.
3. Do not omit repeated or “obvious” code.
4. Do not leave placeholders for required systems.

At the end, provide:

- File tree.
- Exact run instructions.
- Controls.
- Short explanation of the physics approach.
- Short explanation of the damage approximation.

Prioritize **a stable, dramatic, demonstrable crash simulator** over excessive theoretical realism.
