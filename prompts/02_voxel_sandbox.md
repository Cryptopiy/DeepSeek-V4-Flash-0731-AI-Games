# Project Prompt — Browser Voxel Sandbox / Minecraft-Style Clone

You are an expert browser-game engineer specializing in WebGL, voxel rendering, procedural worlds, and first-person controls.

## Objective

Build a complete, playable **voxel sandbox game in the browser** with the essential feel of block-based building games:

- First-person exploration.
- Procedurally generated block terrain.
- Breaking blocks.
- Placing blocks.
- Multiple block types.
- Simple collision and gravity.
- A hotbar/inventory selection.
- A small but polished environment.

The visual identity must be original. Do not use copyrighted textures, logos, names, sounds, or copied assets from Minecraft.

Do not just explain the implementation. **Create the full runnable project.**

## Target Platform

- Desktop browser.
- Recent Chrome/Edge/Firefox.
- No backend.
- Runs from a local static server.
- Prefer HTML/CSS/JavaScript.
- Use **Three.js** from a CDN.
- No npm/build step.
- No external texture pack required.
- Procedural colors/textures are preferred.

## Visual Style

Use a clean, original voxel aesthetic.

Required world materials:

- Grass block.
- Dirt block.
- Stone block.
- Sand block.
- Wood block.
- Leaves block.

You may create block faces using:

- solid colors,
- procedural canvas textures,
- simple noise patterns,

but avoid copying recognizable Minecraft texture art.

Add:

- Sky color or sky gradient.
- Sun/directional light.
- Fog for distance.
- Basic shadows if performance allows.

## World Generation

Generate a finite voxel world of approximately:

- 64×64 blocks horizontally, or another similarly manageable size.
- Height approximately 24–40 blocks.

Use deterministic procedural terrain so refreshes can reproduce the same world when using the same seed.

Terrain should contain:

- Rolling hills.
- Grass surface.
- Dirt layers beneath grass.
- Stone below dirt.
- Sandy patches near low areas.
- Sparse simple trees made from wood/leaves blocks.

Use a noise function or a compact procedural height function.

Display the current world seed somewhere in the UI.

## Rendering Strategy

Performance matters.

Do **not** create an unnecessarily expensive independent full mesh for every hidden cube if you can avoid it.

Prefer one of these approaches:

1. Chunked voxel meshing that emits only visible faces.
2. Instanced meshes grouped by block type, with hidden blocks excluded.
3. Another efficient method appropriate for a small demo.

The project should rebuild affected geometry when blocks are added or removed.

If full greedy meshing is too risky, visible-face chunk meshing is acceptable.

## Player Controller

Implement first-person controls with Pointer Lock.

Controls:

- Click canvas — lock pointer.
- Mouse — look.
- W/A/S/D — move.
- Space — jump.
- Shift — sprint.
- Esc — release pointer.

Player physics:

- Gravity.
- Ground detection.
- Collision with solid voxel blocks.
- Jumping.
- No walking through terrain.
- Basic step handling or reliable movement along block surfaces.
- Clamp the player if they fall outside the world.

Use a player collision volume such as an AABB/capsule approximation.

## Block Interaction

The player must be able to target blocks using a ray from the camera/crosshair.

### Breaking

- Left mouse button breaks the targeted block.
- Maximum interaction distance: approximately 5–6 blocks.
- Show a visible outline/highlight around the targeted block.
- Do not allow accidental breaking when the pointer is not locked.
- Optionally add a short break cooldown.

### Placing

- Right mouse button places the currently selected block on the face adjacent to the targeted block.
- Prevent placement inside the player's collision volume.
- Prevent placement outside world bounds.
- Disable the browser context menu over the game canvas.

## Hotbar

Create a hotbar with at least six selectable block types.

Example slots:

1. Grass
2. Dirt
3. Stone
4. Sand
5. Wood
6. Leaves

Controls:

- Number keys 1–6 select a slot.
- Mouse wheel cycles slots.

The selected slot must be visually highlighted.

When a block is placed, use the selected type.

For this demo, block quantities may be infinite.

## Crosshair and HUD

Include:

- Center crosshair.
- Hotbar.
- Selected block name.
- FPS display or small debug statistics.
- Player coordinates.
- Seed.
- Small controls hint.

Create a start overlay explaining:

- Click to play.
- WASD movement.
- Space jump.
- Left click break.
- Right click place.
- Number keys select blocks.

## Trees

Generate simple trees:

- Vertical wood trunk.
- Cluster of leaves.
- Do not place trees so densely that navigation is difficult.
- Trees should align exactly to the voxel grid.

## Day/Night Atmosphere

Implement a simple optional slow day/night lighting cycle, or provide a toggle such as **N**.

At minimum:

- Smooth daylight.
- Directional light simulating the sun.
- Ambient/hemisphere light.

If implementing a day/night cycle, keep it visually pleasant rather than extremely dark.

## Save/Reset Features

Add useful demo features:

- **P** — save edited block state to `localStorage`.
- **L** — load saved state.
- **R** — regenerate/reset world after a confirmation-like on-screen hint or with Shift+R to avoid accidental reset.

You may store only changed blocks rather than the entire world if that is simpler.

If `localStorage` is unavailable, fail gracefully.

## World Data Model

Use a clear voxel data representation.

For example:

- numeric block IDs,
- `0 = air`,
- arrays or typed arrays,
- mapping from `(x,y,z)` to storage index.

Keep world lookup fast because collision and meshing will call it frequently.

Provide helper functions such as:

- `getBlock(x, y, z)`
- `setBlock(x, y, z, type)`
- `isSolid(x, y, z)`

## Chunking

If using chunks:

- Chunk size around 16×16 horizontally is reasonable.
- Rebuild only the affected chunk plus neighbor chunks when editing an edge block.
- Keep chunk ownership logic straightforward and bug-resistant.

## Collision Details

The player should feel stable.

Avoid:

- sinking into blocks,
- jittering while standing,
- double jumping,
- clipping through blocks at normal movement speed.

Use substeps or axis-separated collision resolution if needed.

## Interaction Highlight

Render a thin box outline around the block currently under the crosshair.

The highlight should:

- disappear when nothing is in range,
- update in real time,
- not interfere with depth too aggressively.

## Audio

Optional. If added, use Web Audio or procedurally generated effects.

Possible feedback:

- block break click/crunch,
- block place sound,
- jump sound.

Do not make audio a dependency for gameplay.

## Performance

Target smooth performance on a modern laptop.

Optimize:

- geometry generation,
- raycasting,
- collision lookups,
- chunk rebuilds,
- repeated allocations.

Do not scan the entire world every frame.

## Code Quality

Organize the project clearly.

Suggested files:

- `index.html`
- `style.css`
- `main.js`
- `world.js`
- `mesher.js`
- `player.js`
- `ui.js`

You may use fewer files if that makes direct execution more reliable.

Use ES modules if served via local HTTP.

## Nice-to-Have Features

Only add these after the core project is stable:

- Water blocks.
- Clouds.
- Simple caves.
- Block-breaking particles.
- Selection animation.
- Footstep sounds.
- Simple ambient fog.
- A screenshot key.
- Seed input before generation.

## Acceptance Criteria

The project is considered finished only when:

- A procedural voxel world appears in the browser.
- The player can move in first person and jump.
- Terrain collision works.
- The crosshair identifies a targeted block.
- Left click removes blocks.
- Right click adds blocks.
- At least six block types can be selected through a hotbar.
- Trees are visible in the generated terrain.
- Edited geometry updates correctly.
- The game does not require external art assets.
- The demo remains usable after many block edits.
- There are no placeholder functions required for core gameplay.

## Delivery Format

Return all code required to run the game.

For each file:

1. Use the exact filename as a heading.
2. Include the entire file in a fenced code block.
3. Do not abbreviate code.
4. Do not leave TODO placeholders for required features.

At the end include:

- File tree.
- Run instructions using a simple static server.
- Controls.
- A short explanation of the voxel storage/rendering strategy.

Focus on **working code first**, explanation second.
