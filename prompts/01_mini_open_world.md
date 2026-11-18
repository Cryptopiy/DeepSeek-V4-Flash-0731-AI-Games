# Project Prompt — Mini Open-World Crime/Driving Game in the Browser

You are an expert browser-game engineer, gameplay programmer, and technical artist.

## Objective

Build a complete, playable **mini open-world driving/action game for the browser**, inspired by the structure of classic open-world city games, but using **entirely original visuals, names, UI, and assets**.

The project should feel like a small but polished technical demo rather than a loose prototype. The player must be able to explore a compact city, drive a car, encounter pedestrians, attract police attention, and escape police pursuit.

Do not merely describe how to build it. **Implement the project and provide all source files needed to run it.**

## Target Platform

- Desktop browser, primarily recent Chrome/Edge/Firefox.
- No backend is required.
- The project must run from a simple local static web server.
- Prefer plain HTML/CSS/JavaScript.
- You may use **Three.js** from a CDN for rendering.
- You may use a lightweight browser physics library such as **cannon-es** from a CDN if it improves vehicle/collision behavior.
- Do not require paid APIs, API keys, account creation, build tools, npm installation, or external art packs.

## Art Direction

Create a stylized **low-poly city** using procedural geometry and simple materials.

The city should include:

- A road network with intersections.
- Sidewalks.
- Simple low-poly buildings with varied heights/colors.
- Street lamps, trees, barriers, or similar props.
- A few parked cars or decorative objects.
- A sky/background and basic lighting.
- Shadows if performance allows.

Do not copy real-world game branding or assets.

## Core Gameplay

### 1. Player Character

The game begins with the player on foot.

Implement:

- Third-person character movement.
- WASD movement.
- Mouse-controlled camera rotation.
- Shift to sprint.
- A visible player avatar made from simple geometry.
- Collision so the player cannot freely walk through large buildings.
- Smooth camera follow.

The player does not need combat mechanics. Focus on movement, driving, police pursuit, and world simulation.

### 2. Entering and Exiting a Car

Place at least one drivable car near the starting position.

Implement:

- The player can approach the car and press **E** to enter.
- While driving, the player avatar is hidden or positioned inside the vehicle.
- Press **E** again when nearly stopped to exit.
- The player should appear beside the car after exiting.
- Show a small context hint such as “Press E to enter vehicle”.

### 3. Vehicle Driving

The car must be controllable and fun.

Controls:

- W — accelerate.
- S — brake/reverse.
- A/D — steer.
- Space — handbrake.
- E — exit vehicle.
- R — reset vehicle if flipped/stuck.

Driving should include:

- Acceleration and deceleration.
- Steering that becomes somewhat less aggressive at high speed.
- Friction/drag.
- Collisions with buildings and major scenery.
- Visible wheel rotation if practical.
- Camera follow with slight lag.
- A speedometer in the HUD.

The physics do not have to be perfectly realistic, but the car should have weight and inertia.

### 4. Pedestrians

Populate the city with at least **15–25 simple pedestrians**.

Each pedestrian should:

- Have a basic low-poly body.
- Walk around sidewalks or wander between local waypoints.
- Pause occasionally.
- Avoid obvious obstacles when possible.
- React when a vehicle comes very close by attempting to move away.
- Be efficiently simulated so performance remains stable.

Use a simple finite-state machine such as:

- idle
- walking
- fleeing

Pedestrians do not need advanced pathfinding if a simpler waypoint system works reliably.

### 5. Wanted Level

Implement a clear **wanted system** with 0–3 stars.

The wanted level should increase when the player:

- Hits a pedestrian with the car.
- Repeatedly crashes into police vehicles.
- Drives recklessly near police for a sustained moment, if practical.

Wanted behavior:

- 0 stars: police ignore the player.
- 1 star: one police car pursues.
- 2 stars: two police cars pursue more aggressively.
- 3 stars: up to three police cars pursue and try to block the player.

The wanted level should decay after the player avoids police line-of-sight / stays sufficiently far away for a period of time.

Display the current wanted level clearly in the HUD.

### 6. Police AI

Create low-poly police cars with clearly original markings/colors.

Police vehicles should:

- Spawn at reasonable road positions rather than directly on top of the player.
- Drive toward the player while wanted.
- Steer using a simple pursuit algorithm.
- Avoid becoming permanently stuck where possible.
- Try to ram or intercept the player at higher wanted levels.
- Despawn after the wanted level returns to zero and they are far away.

A perfect traffic AI system is not required. Prioritize robust, understandable pursuit behavior.

### 7. City Boundaries

The player must not be able to drive infinitely away.

Use one or more of:

- Physical barriers.
- Water.
- Terrain edges.
- Invisible collision boundaries.

Make the boundary visually understandable.

## HUD and UI

Create a clean game-style HUD that includes:

- Current control mode: “On Foot” or “Driving”.
- Speedometer when driving.
- Wanted stars.
- A small mission/objective text.
- Context actions such as “Press E to enter vehicle”.
- A reset/help hint.

Add a simple start overlay:

- Game title.
- Brief controls.
- “Click to Start” button.

Add a pause/help overlay toggled with **Esc** if practical.

## Camera

Implement:

### On Foot
- Third-person follow camera.
- Mouse orbit.
- Sensible min/max pitch.
- Smooth interpolation.

### Driving
- Chase camera behind the vehicle.
- Smooth motion.
- Slight speed-based camera distance/FOV change if practical.

Do not allow the camera to become unusable after collisions.

## Audio

Audio is optional, but if implemented, generate it procedurally or use Web Audio.

Possible sounds:

- Engine pitch changing with speed.
- Crash impact.
- Police siren.
- UI feedback.

The project must still work correctly if browser autoplay restrictions prevent sound before user interaction.

## Performance Requirements

Target smooth performance on a typical modern laptop.

Use sensible optimization:

- Reuse geometries/materials.
- Avoid excessive dynamic shadows.
- Cap the number of police cars and pedestrians.
- Avoid allocating many objects every frame.
- Use simple collision primitives.
- Use delta-time-based animation.

## Technical Structure

Organize the code clearly. A good structure could be:

- `index.html`
- `style.css`
- `main.js`
- optional modules such as:
  - `world.js`
  - `player.js`
  - `vehicle.js`
  - `pedestrians.js`
  - `police.js`
  - `ui.js`

However, choose the structure that is most reliable for direct browser execution.

Include comments for major systems, but do not flood the code with obvious comments.

## Required Game Loop

The project must have a stable main loop that handles:

1. input
2. physics
3. player/vehicle state
4. pedestrian AI
5. wanted system
6. police AI
7. camera
8. UI
9. rendering

Use frame-rate-independent timing.

## Default Scenario

When the game starts:

- Player spawns on a sidewalk.
- A drivable car is nearby.
- Pedestrians are already moving.
- The objective reads: **“Get in the car and explore the city.”**
- After the player drives for a short distance, update the objective to something like: **“Cause trouble, then lose the police.”**

This creates an immediate demonstration flow for a video.

## Polish Features

Add as many of these as reasonable without risking stability:

- Tire skid marks or dust.
- Brake lights.
- Headlights.
- Small collision particles.
- Camera shake on hard impact.
- Simple day/night tone.
- Minimap-style top-down radar.
- Traffic props.
- Floating “+ wanted” feedback.
- Smooth UI transitions.

Treat these as secondary to the core mechanics.

## Robustness

Handle common failure cases:

- Reset a flipped car.
- Prevent NaN/invalid physics states.
- Clamp extreme velocity.
- Keep spawned police inside the playable area.
- Make sure exiting a car does not place the player inside a wall.
- Do not let pedestrian count grow without limit.

## Acceptance Criteria

The project is complete only if all of the following are true:

- The browser loads into a playable 3D city.
- The player can walk around.
- The player can enter and exit a car.
- The car can drive and collide with the environment.
- At least 15 pedestrians move through the world.
- Hitting a pedestrian can trigger a wanted level.
- Police cars spawn and actively pursue the player.
- The player can escape and eventually clear the wanted level.
- HUD elements visibly update.
- The experience can be played for several minutes without a fatal error.
- No external proprietary assets are required.

## Delivery Format

Return the project as complete source code.

For every file:

1. Print the exact filename as a heading.
2. Provide the full file contents in a fenced code block.
3. Do not use placeholders such as “rest of code here”.
4. Do not omit code that is required for the game to run.

At the end, provide:

- A short file tree.
- Exact local run instructions.
- A brief controls list.
- A brief note explaining the main architecture.

Do not spend most of the response explaining theory. **Prioritize producing a complete runnable implementation.**
