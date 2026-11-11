import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import ServerRuntime from './runtime.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clientRoot = path.join(projectRoot, 'scripts', 'client');
const FIXED_STEP = 1 / 60;
const SNAPSHOT_INTERVAL = 3;

// Serve the browser game and its Socket.IO transport from one LAN origin.
export function createNetworkServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0' } = {}) {
    const app = express();
    app.get('/asset-manifest', async (_request, response) => {
        try {
            response.set('Cache-Control', 'no-store');
            response.json(await buildAssetManifest());
        } catch (error) {
            console.error('Could not build the asset manifest:', error);
            response.status(500).json({ error: 'Could not load game assets.' });
        }
    });
    // Expose only the browser application and its assets from the web root.
    app.use(express.static(clientRoot));
    const httpServer = createServer(app);
    const io = new Server(httpServer, { maxHttpBufferSize: 5e6 });
    const connectedPlayers = new Map();
    const runtime = new ServerRuntime({
        spawnInitialPlayer: false,
        onChunkReady: (playerId, chunk) => io.to(String(playerId)).emit('chunk:data', chunk),
        onBlockChanged: change => {
            const key = change.chunkPos.join(',');
            for (const [playerId, socket] of connectedPlayers) {
                if (runtime.chunkManager.requestedBy.get(key)?.has(playerId)) {
                    socket.emit('block:update', change);
                }
            }
        },
    });
    let tick = 0;

    // Create a server-owned player and initialize its client session on connect.
    io.on('connection', socket => {
        const player = runtime.addPlayer();
        player.name = socket.id;
        player.spawnPos = [connectedPlayers.size * 1.5, 0, 0];
        player.pos = [...player.spawnPos];
        // The constructor may have found a clear position before this network
        // spawn offset was assigned, so validate the actual join location too.
        player.needsSafeSpawn = true;
        player.spawnSearchCooldown = 0;
        player.ensureSafeSpawn(runtime.world);
        connectedPlayers.set(player.id, socket);
        socket.join(String(player.id));
        socket.emit('session:ready', {
            playerId: player.id,
            world: { seed: runtime.world.seed, renderDistance: runtime.world.renderDistance, chunkSize: runtime.world.CHUNK_SIZE },
            players: [...runtime.world.getPlayers()].map(serializeEntity),
            entities: [...runtime.world.entities.values()].map(serializeEntity),
        });
        socket.broadcast.emit('player:joined', serializeEntity(player));

        // Accept only finite, complete action snapshots before changing simulation input.
        socket.on('player:input', input => {
            const controlledPlayer = runtime.getPlayer(player.id);
            if (!controlledPlayer || !validInput(input)) return;
            const orientationLength = Math.hypot(...input.orientation);
            if (orientationLength < 1e-6) return;
            controlledPlayer.orientation = input.orientation.map(value => value / orientationLength);
            controlledPlayer.menuOpen = !!input.menuOpen;
            if (input.inventory) {
                controlledPlayer.inventory.open = !!input.inventory.open;
                if (Number.isInteger(input.inventory.selectedSlot)) {
                    controlledPlayer.inventory.selectedSlot = input.inventory.selectedSlot;
                }
            }
            runtime.setPlayerInput(player.id, createServerInput(input));
        });

        // Inventory clicks are resolved against server-owned item stacks.
        socket.on('inventory:click', slot => {
            const controlledPlayer = runtime.getPlayer(player.id);
            controlledPlayer?.inventory.clickSlot(slot);
        });

        // Serve bounded chunk requests only when they are near this player's position.
        socket.on('chunks:request', positions => {
            if (!Array.isArray(positions)) return;
            const playerNow = runtime.getPlayer(player.id);
            for (const position of positions.slice(0, 512)) {
                if (!validChunkPosition(position)) continue;
                const [cx, cy, cz] = position;
                const [px, py, pz] = runtime.world.getChunkCoords(...playerNow.pos);
                if (Math.hypot(cx - px, cy - py, cz - pz) > (player.renderDistance ?? runtime.world.renderDistance) + 2) {
                    socket.emit('chunk:reject', `${cx},${cy},${cz}`);
                    continue;
                }
                runtime.chunkManager.request(player.id, cx, cy, cz);
            }
        });

        // Release validated chunk subscriptions as the client moves its view window.
        socket.on('chunks:release', keys => {
            if (!Array.isArray(keys)) return;
            for (const key of keys.slice(0, 1024)) {
                if (typeof key === 'string' && /^-?\d+,-?\d+,-?\d+$/.test(key)) runtime.chunkManager.release(player.id, key);
            }
        });

        // Clamp client preference before it affects visibility and event ranges.
        socket.on('render-distance:set', distance => {
            if (Number.isInteger(distance)) player.renderDistance = Math.max(2, Math.min(12, distance));
        });

        // Drop all player-owned subscriptions and state on disconnect.
        socket.on('disconnect', () => {
            connectedPlayers.delete(player.id);
            runtime.chunkManager.releaseAll(player.id);
            runtime.removePlayer(player.id);
            io.emit('player:left', { id: player.id });
        });
    });

    // Run fixed simulation steps, dispatch transient events, and send periodic snapshots.
    setInterval(() => {
        runtime.updateWorld(FIXED_STEP);
        runtime.updateEntities(1);
        runtime.updateChunks();

        const audioEvents = runtime.world.audio.drainEvents();
        const particleEvents = runtime.world.drainParticleEvents();
        dispatchAudioEvents(audioEvents, runtime, connectedPlayers, io);
        dispatchParticleEvents(particleEvents, runtime, connectedPlayers);

        if (++tick % SNAPSHOT_INTERVAL === 0) {
            const entities = [...runtime.world.entities.values()];
            for (const [playerId, socket] of connectedPlayers) {
                const player = runtime.getPlayer(playerId);
                if (!player) continue;
                const radius = ((player.renderDistance ?? runtime.world.renderDistance) + 1) * runtime.world.CHUNK_SIZE;
                const radiusSquared = radius * radius;
                const nearbyEntities = entities.filter(entity => {
                    if (entity.id === playerId) return true;
                    const dx = entity.pos[0] - player.pos[0];
                    const dy = entity.pos[1] - player.pos[1];
                    const dz = entity.pos[2] - player.pos[2];
                    return dx * dx + dy * dy + dz * dz <= radiusSquared;
                });
                socket.emit('world:snapshot', {
                    entities: nearbyEntities.map(serializeEntity),
                    daylight: runtime.world.daylight,
                    time: runtime.world.time,
                });
            }
        }
    }, FIXED_STEP * 1000);

    // Bind the single-origin game server and print reachable LAN addresses.
    httpServer.listen(port, host, () => {
        console.log(`LAN server listening on port ${port}:`);
        for (const addresses of Object.values(networkInterfaces())) {
            for (const address of addresses ?? []) {
                if ((address.family === 'IPv4' || address.family === 4) && !address.internal) {
                    console.log(`  http://${address.address}:${port}`);
                }
            }
        }
    });
    return { app, httpServer, io, runtime };
}

// Discover browser assets recursively so preload manifests follow the asset tree.
async function buildAssetManifest() {
    const assetsRoot = path.join(clientRoot, 'assets');
    const manifest = { images: [], audios: [], fonts: [] };
    const categories = [
        { key: 'images', extensions: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']) },
        { key: 'audios', extensions: new Set(['.ogg', '.mp3', '.wav', '.webm', '.m4a']) },
        { key: 'fonts', extensions: new Set(['.ttf', '.otf', '.woff', '.woff2']) },
    ];

    // Walk nested asset folders and include only browser-loadable media types.
    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(fullPath);
                continue;
            }
            if (!entry.isFile()) continue;

            const extension = path.extname(entry.name).toLowerCase();
            const category = categories.find(candidate => candidate.extensions.has(extension));
            if (!category) continue;
            const relativePath = path.relative(clientRoot, fullPath);
            const url = `/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
            manifest[category.key].push({ name: entry.name, url });
        }
    }

    await visit(assetsRoot);
    for (const assets of Object.values(manifest)) assets.sort((a, b) => a.name.localeCompare(b.name));
    return manifest;
}

// Route each sound according to its world, global, or player-only scope.
function dispatchAudioEvents(events, runtime, connectedPlayers, io) {
    let deliveries = 0;
    for (const event of events) {
        if (event.scope === 'global') {
            io.emit('audio:play', event);
            deliveries += connectedPlayers.size;
            continue;
        }

        if (event.scope === 'player') {
            const player = runtime.getPlayer(event.playerId);
            if (!player) continue;
            const playerEvent = event.position
                ? { ...event, distance: distanceBetween(event.position, player.pos) }
                : event;
            io.to(String(event.playerId)).emit('audio:play', playerEvent);
            deliveries++;
            continue;
        }

        if (event.scope !== 'world') continue;
        for (const [playerId, socket] of connectedPlayers) {
            const player = runtime.getPlayer(playerId);
            if (!player) continue;
            const distance = distanceBetween(event.position, player.pos);
            if (distance > event.maxDistance) continue;
            socket.emit('audio:play', { ...event, distance });
            deliveries++;
        }
    }
    return deliveries;
}

// Send transient particle effects only to players within their view range.
function dispatchParticleEvents(events, runtime, connectedPlayers) {
    let deliveries = 0;
    for (const event of events) {
        for (const [playerId, socket] of connectedPlayers) {
            const player = runtime.getPlayer(playerId);
            if (!player) continue;
            const maxDistance = ((player.renderDistance ?? runtime.world.renderDistance) + 1) * runtime.world.CHUNK_SIZE;
            if (distanceBetween(event.position, player.pos) > maxDistance) continue;
            socket.emit('particle:spawn', event);
            deliveries++;
        }
    }
    return deliveries;
}

// Measure a 3D source-to-listener distance for event range filtering.
function distanceBetween(first, second) {
    return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

// Copy only network-safe entity state, including plain inventory item data.
function serializeEntity(entity) {
    return {
        id: entity.id, type: entity.type ?? 'entity', name: entity.name ?? null, pos: [...entity.pos],
        orientation: [...entity.orientation], scale: [...entity.scale], velocity: [...entity.velocity],
        health: entity.health, maxHealth: entity.maxHealth,
        material: entity.material, visible: entity.visible,
        outlinedBlock: entity.outlinedBlock,
        perspectiveMode: entity.perspectiveMode,
        inventory: entity.inventory ? {
            items: entity.inventory.items.map(item => item?.toJSON?.() ?? item),
            cursorItem: entity.inventory.cursorItem?.toJSON?.() ?? entity.inventory.cursorItem ?? null,
            WIDTH: entity.inventory.WIDTH, HEIGHT: entity.inventory.HEIGHT,
        } : undefined,
    };
}

// Validate integer coordinates before a chunk key reaches server storage.
function validChunkPosition(position) {
    return Array.isArray(position) && position.length === 3 && position.every(Number.isInteger);
}

// Reject incomplete or non-finite client input before it is used in simulation.
function validInput(input) {
    return input && Array.isArray(input.orientation) && input.orientation.length === 4 &&
        input.orientation.every(Number.isFinite) && input.actions && typeof input.actions === 'object' &&
        Array.isArray(input.buttons);
}

// Adapt the wire snapshot to the named-action interface expected by Player.
function createServerInput(input) {
    const actions = { ...input.actions };
    const buttons = [...input.buttons];
    return {
        paused: !!input.paused,
        keys: {}, mouse: { buttons, inBox: () => false },
        isDown: action => !!actions[action],
        consumePress: action => { const pressed = !!actions[`pressed:${action}`]; actions[`pressed:${action}`] = false; return pressed; },
        isMouseDown: action => buttons[action === 'shoot' ? 0 : action === 'roll' ? 1 : 2] === true,
    };
}
