# Scrap Sifter LAN multiplayer

Install dependencies once with `npm install`, then start the host with `npm start`.
The server prints the LAN addresses it detects. Other players on the same network
can open one of those `http://<address>:3000` links in a browser. Set `PORT` to
use another port, or `HOST` to change the listen address.

## Architecture

The browser and Node.js process have separate responsibilities. The browser owns
input, presentation, and client-side caches; the server owns player simulation,
inventory state, block changes, and generated terrain. Socket.IO is the boundary
between those two sides.

### Browser

- `scripts/client/index.html` is the browser entry document served at `/`.
- `scripts/client/main.js` starts the asset preload and the animation-frame loop.
- `scripts/client/game.js` composes the canvas renderer and the local `User` session.
- `scripts/client/user.js` receives world snapshots and events, sends input,
  and coordinates the client's camera, HUD, audio, particles, and chunk view.
- `scripts/client/input.js` converts browser events into named gameplay actions.
- `scripts/client/world.js` stores the local world and entity replicas. Server
  snapshots update those replicas without replacing client-owned controls.
- `scripts/client/chunk-manager.js` requests voxel data and schedules mesh work.
  `scripts/client/chunk-mesher.js` builds CPU geometry; the browser worker runs
  that same mesher off the render thread.
- `scripts/client/render/` owns WebGL drawing, texture atlases, camera matrices,
  particles, and name labels. `scripts/client/ui/` owns the HUD and inventory
  presentation. `scripts/client/audio/` applies listener-specific
  volume, panning, and occlusion to sound events.
- `scripts/client/shared/` contains client-side copies of voxel encodings,
  geometry data, and math helpers needed by browser workers and rendering.

### Server

- `scripts/server/main.js` starts the network server.
- `scripts/server/network-server.js` serves the browser files, validates socket
  messages, serializes snapshots, and distributes chunk, audio, and particle
  events.
- `scripts/server/runtime.js` is the simulation-facing API used by the network
  transport. It coordinates players, entities, and chunks.
- `scripts/server/core/` owns authoritative world state, terrain sampling,
  block encoding and stats, and entity geometry.
- `scripts/server/entities/` implements players, inventory, projectiles, and
  entity lifetime. `scripts/server/items/` defines server-side item actions.
- `scripts/server/chunks/` tracks client subscriptions and generates compact
  voxel buffers in Node worker threads. Only voxel data crosses the network.
- `scripts/server/systems/` contains collision, raycasting, audio event
  collection, movement tracking, and server timing support.

The server world defaults to a cube centered at the origin with a 200-unit edge.
`World.borderDistance` is the distance from the center to each face (100 by
default); set it to `null` to keep terrain and entity positions unbounded.

### Data and performance boundaries

Chunk voxel IDs are stored in typed arrays. Generation and browser meshing are
batched in workers; geometry is built on the client and uploaded to renderer-
owned GPU buffers. Entity snapshots contain plain data, while behavior and
inventory actions remain on the server. The shared block registries must keep
the same ordering because their numeric IDs also identify texture atlas slots.

## Project checks

The package currently defines `start` and `server` commands only. It does not
include a test suite, linter, type checker, or separate production build command.
