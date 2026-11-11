import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import ServerRuntime from './runtime.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXED_STEP = 1 / 60;
const SNAPSHOT_INTERVAL = 3;

// Serve the browser game and its Socket.IO transport from one LAN origin.
export function createNetworkServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0' } = {}) {
    const app = express();
    app.use(express.static(projectRoot));
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

        socket.on('inventory:click', slot => {
            const controlledPlayer = runtime.getPlayer(player.id);
            controlledPlayer?.inventory.clickSlot(slot);
        });

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

        socket.on('chunks:release', keys => {
            if (!Array.isArray(keys)) return;
            for (const key of keys.slice(0, 1024)) {
                if (typeof key === 'string' && /^-?\d+,-?\d+,-?\d+$/.test(key)) runtime.chunkManager.release(player.id, key);
            }
        });

        socket.on('render-distance:set', distance => {
            if (Number.isInteger(distance)) player.renderDistance = Math.max(2, Math.min(12, distance));
        });

        socket.on('disconnect', () => {
            connectedPlayers.delete(player.id);
            runtime.chunkManager.releaseAll(player.id);
            runtime.removePlayer(player.id);
            io.emit('player:left', { id: player.id });
        });
    });

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

function distanceBetween(first, second) {
    return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function serializeEntity(entity) {
    return {
        id: entity.id, type: entity.type ?? 'entity', name: entity.name ?? null, pos: [...entity.pos],
        orientation: [...entity.orientation], scale: [...entity.scale], velocity: [...entity.velocity],
        health: entity.health, maxHealth: entity.maxHealth,
        material: entity.material, visible: entity.visible,
        outlinedBlock: entity.outlinedBlock,
        perspectiveMode: entity.perspectiveMode, head: entity.head,
        inventory: entity.inventory ? {
            items: entity.inventory.items.map(item => item?.toJSON?.() ?? item),
            cursorItem: entity.inventory.cursorItem?.toJSON?.() ?? entity.inventory.cursorItem ?? null,
            WIDTH: entity.inventory.WIDTH, HEIGHT: entity.inventory.HEIGHT,
        } : undefined,
    };
}

function validChunkPosition(position) {
    return Array.isArray(position) && position.length === 3 && position.every(Number.isInteger);
}

function validInput(input) {
    return input && Array.isArray(input.orientation) && input.orientation.length === 4 &&
        input.orientation.every(Number.isFinite) && input.actions && typeof input.actions === 'object' &&
        Array.isArray(input.buttons);
}

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
