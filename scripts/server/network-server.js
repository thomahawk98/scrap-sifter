import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import ServerRuntime from './runtime.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clientRoot = path.join(projectRoot, 'scripts', 'client');
const FIXED_STEP = 1 / 60;
const SNAPSHOT_INTERVAL = 3;
const MAX_OPEN_LOBBIES = 32;
const MAX_RENDER_DISTANCE = 12;
const scrypt = promisify(scryptCallback);

// Serve the browser game and its Socket.IO transport from one LAN origin.
export function createNetworkServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0' } = {}) {
    const app = express();
    const lobbies = new Map();
    const addLobby = (id, settings) => {
        if (lobbies.has(id)) throw new Error(`Lobby already exists: ${id}`);
        const lobby = createLobby(id, settings);
        lobbies.set(id, lobby);
        return lobby;
    };
    addLobby('main', {
        name: 'Main Lobby', status: 'public', worldSizeChunks: 25,
        maxRenderDistance: MAX_RENDER_DISTANCE, maxPlayers: 16,
    });
    app.get('/asset-manifest', async (_request, response) => {
        try {
            response.set('Cache-Control', 'no-store');
            response.json(await buildAssetManifest());
        } catch (error) {
            console.error('Could not build the asset manifest:', error);
            response.status(500).json({ error: 'Could not load game assets.' });
        }
    });
    // Publish open server worlds for the title screen without creating players.
    app.get('/api/lobbies', (_request, response) => {
        response.json([...lobbies.values()]
            .filter(lobby => lobby.open)
            .map(serializeLobby));
    });
    // Expose only the browser application and its assets from the web root.
    app.use(express.static(clientRoot));
    const httpServer = createServer(app);
    const io = new Server(httpServer, { maxHttpBufferSize: 5e6 });
    let tick = 0;

    // Reject unknown or closed lobby IDs before a socket can create a player.
    io.use((socket, next) => {
        if (socket.handshake.auth?.role === 'menu') return next();
        authorizeLobbySocket(socket, lobbies).then(next, error => next(error));
    });

    // Attach a transport only to the lobby explicitly selected on the title screen.
    io.on('connection', socket => {
        if (socket.handshake.auth?.role === 'menu') {
            // Password checks return only a boolean and never allocate a player.
            socket.on('lobby:verify-password', async (request, acknowledge) => {
                if (typeof acknowledge !== 'function') return;
                const lobby = request && typeof request === 'object' ? lobbies.get(request.lobbyId) : null;
                let valid = false;
                if (lobby?.open && lobby.status === 'private') {
                    try { valid = await lobbyPasswordMatches(lobby, request.password); } catch { valid = false; }
                }
                acknowledge({ valid });
            });
            socket.on('lobby:create', (settings, acknowledge) => {
                createLobbyFromMenu(settings, socket, lobbies, addLobby, acknowledge).catch(error => {
                    if (typeof acknowledge === 'function') acknowledge({ ok: false, message: error.message });
                });
            });
            socket.on('lobby:edit', (request, acknowledge) => {
                editLobbyFromMenu(request, socket, lobbies, acknowledge).catch(error => {
                    if (typeof acknowledge === 'function') acknowledge({ ok: false, message: error.message });
                });
            });
            socket.on('lobby:delete', async (request, acknowledge) => {
                if (typeof acknowledge !== 'function') return;
                const lobby = request && lobbies.get(request.lobbyId);
                if (!lobby?.open || lobby.hostId !== socket.id) {
                    acknowledge({ ok: false, message: 'Only the lobby host can delete it.' });
                    return;
                }
                lobby.open = false;
                lobbies.delete(lobby.id);
                for (const playerSocket of lobby.connectedPlayers.values()) {
                    playerSocket.emit('lobby:closed');
                    playerSocket.disconnect(true);
                }
                await lobby.runtime.chunkManager.generator.terminate();
                acknowledge({ ok: true });
            });
            return;
        }
        const lobby = lobbies.get(socket.handshake.auth?.lobbyId);
        const { runtime, connectedPlayers } = lobby;
        releaseLobbyReservation(socket);
        socket.join(`lobby:${lobby.id}`);
        const player = runtime.addPlayer();
        player.name = socket.id;
        player.spawnPos = [connectedPlayers.size * 1.5, 0, 0];
        player.pos = [...player.spawnPos];
        runtime.world.clampEntityPosition(player);
        player.spawnPos = [...player.pos];
        // The constructor may have found a clear position before this network
        // spawn offset was assigned, so validate the actual join location too.
        player.needsSafeSpawn = true;
        player.spawnSearchCooldown = 0;
        player.ensureSafeSpawn(runtime.world);
        connectedPlayers.set(player.id, socket);
        socket.join(`${lobby.id}:${player.id}`);
        socket.emit('session:ready', {
            playerId: player.id,
            world: {
                seed: runtime.world.seed,
                renderDistance: runtime.world.renderDistance,
                maxRenderDistance: lobby.maxRenderDistance,
                chunkSize: runtime.world.CHUNK_SIZE,
                borderDistance: runtime.world.borderDistance,
            },
            players: [...runtime.world.getPlayers()].map(serializeEntity),
            entities: [...runtime.world.entities.values()].map(serializeEntity),
        });
        socket.to(`lobby:${lobby.id}`).emit('player:joined', serializeEntity(player));

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
            if (Number.isInteger(distance)) {
                player.renderDistance = Math.max(2, Math.min(lobby.maxRenderDistance, distance));
            }
        });

        // Drop all player-owned subscriptions and state on disconnect.
        socket.on('disconnect', () => {
            connectedPlayers.delete(player.id);
            runtime.chunkManager.releaseAll(player.id);
            runtime.removePlayer(player.id);
            io.to(`lobby:${lobby.id}`).emit('player:left', { id: player.id });
        });
    });

    // Run fixed simulation steps, dispatch transient events, and send periodic snapshots.
    setInterval(() => {
        if (++tick % SNAPSHOT_INTERVAL === 0) {
            for (const lobby of lobbies.values()) {
                if (lobby.open) updateLobby(lobby, FIXED_STEP);
            }
        } else {
            for (const lobby of lobbies.values()) {
                if (!lobby.open) continue;
                lobby.runtime.updateWorld(FIXED_STEP);
                lobby.runtime.updateEntities(1);
                lobby.runtime.updateChunks();
                dispatchAudioEvents(lobby.runtime.world.audio.drainEvents(), lobby.runtime, lobby.connectedPlayers);
                dispatchParticleEvents(lobby.runtime.world.drainParticleEvents(), lobby.runtime, lobby.connectedPlayers);
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
    return { app, httpServer, io, runtime: lobbies.get('main').runtime, lobbies, addLobby };
}

// Create an independently simulated lobby and apply its server-owned settings.
function createLobby(id, settings) {
    const connectedPlayers = new Map();
    let runtime;
    runtime = new ServerRuntime({
        spawnInitialPlayer: false,
        onChunkReady: (playerId, chunk) => connectedPlayers.get(playerId)?.emit('chunk:data', chunk),
        onBlockChanged: change => {
            const key = change.chunkPos.join(',');
            for (const [playerId, socket] of connectedPlayers) {
                if (runtime.chunkManager.requestedBy.get(key)?.has(playerId)) {
                    socket.emit('block:update', change);
                }
            }
        },
    });
    runtime.world.borderDistance = settings.worldSizeChunks === null
        ? null : settings.worldSizeChunks * runtime.world.CHUNK_SIZE / 2;
    runtime.world.renderDistance = Math.min(5, settings.maxRenderDistance);
    return {
        id, ...settings, runtime, connectedPlayers, pendingJoins: 0, open: true,
    };
}

// Create a lobby from validated menu input without exposing its password record.
async function createLobbyFromMenu(input, socket, lobbies, addLobby, acknowledge) {
    if (typeof acknowledge !== 'function') return;
    try {
        const settings = validateLobbySettings(input, socket.id);
        const openLobbyCount = [...lobbies.values()].filter(lobby => lobby.open).length;
        if (openLobbyCount >= MAX_OPEN_LOBBIES) throw new Error('The server has reached its lobby limit.');

        if (settings.status === 'private') {
            const passwordRecord = await hashLobbyPassword(settings.password);
            delete settings.password;
            Object.assign(settings, passwordRecord);
        }

        const lobby = addLobby(randomUUID(), settings);
        lobby.hostId = socket.id;
        acknowledge({ ok: true, lobby: serializeLobby(lobby) });
    } catch (error) {
        acknowledge({ ok: false, message: error.message });
    }
}

// Normalize and bound every setting before it can allocate a world runtime.
function validateLobbySettings(input, socketId, existingLobby = null) {
    if (!input || typeof input !== 'object') throw new Error('Invalid lobby settings.');
    const name = String(input.name ?? '').trim() || `${socketId}'s lobby`;
    if (name.length > 64) throw new Error('Lobby names must be 64 characters or fewer.');
    if (input.status !== 'public' && input.status !== 'private') throw new Error('Choose a public or private lobby.');

    const worldSizeChunks = input.worldSizeChunks === null ? null : input.worldSizeChunks;
    if (worldSizeChunks !== null && (!Number.isInteger(worldSizeChunks) || worldSizeChunks < 2 || worldSizeChunks > 62_500)) {
        throw new Error('World size must be blank for infinite or between 2 and 62,500 chunks.');
    }
    const maxRenderDistance = input.maxRenderDistance;
    if (!Number.isInteger(maxRenderDistance) || maxRenderDistance < 2 || maxRenderDistance > MAX_RENDER_DISTANCE) {
        throw new Error(`Maximum render distance must be between 2 and ${MAX_RENDER_DISTANCE} chunks.`);
    }
    const maxPlayers = input.maxPlayers;
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 64) {
        throw new Error('Maximum players must be between 1 and 64.');
    }

    const settings = { name, status: input.status, worldSizeChunks, maxRenderDistance, maxPlayers };
    if (input.status === 'private') {
        if (typeof input.password === 'string' && input.password.trim() && input.password.length <= 128) {
            settings.password = input.password;
        } else if (existingLobby?.status !== 'private') {
            throw new Error('Private lobbies need an access code of 1 to 128 characters.');
        }
    }
    return settings;
}

// Apply host edits while retaining runtime state and keeping credentials private.
async function editLobbyFromMenu(request, socket, lobbies, acknowledge) {
    if (typeof acknowledge !== 'function') return;
    const lobby = request && lobbies.get(request.lobbyId);
    if (!lobby?.open || lobby.hostId !== socket.id) throw new Error('Only the lobby host can edit it.');
    const settings = validateLobbySettings(request.settings, socket.id, lobby);
    if (settings.password) {
        Object.assign(lobby, await hashLobbyPassword(settings.password));
    } else if (settings.status === 'public') {
        delete lobby.passwordSalt;
        delete lobby.passwordHash;
    }
    delete settings.password;
    Object.assign(lobby, settings);
    lobby.runtime.world.borderDistance = settings.worldSizeChunks === null
        ? null : settings.worldSizeChunks * lobby.runtime.world.CHUNK_SIZE / 2;
    lobby.runtime.world.renderDistance = Math.min(5, settings.maxRenderDistance);
    for (const entity of lobby.runtime.world.entities.values()) {
        lobby.runtime.world.clampEntityPosition(entity);
    }
    for (const [playerId, playerSocket] of lobby.connectedPlayers) {
        const player = lobby.runtime.getPlayer(playerId);
        if (!player) continue;
        player.renderDistance = Math.min(player.renderDistance ?? settings.maxRenderDistance, settings.maxRenderDistance);
        playerSocket.emit('lobby:settings', {
            borderDistance: lobby.runtime.world.borderDistance,
            maxRenderDistance: settings.maxRenderDistance,
            renderDistance: player.renderDistance,
        });
    }
    acknowledge({ ok: true, lobby: serializeLobby(lobby) });
}

// Store only a salted scrypt hash so lobby passwords are never retrievable as text.
async function hashLobbyPassword(password) {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    return { passwordSalt: salt.toString('hex'), passwordHash: hash.toString('hex') };
}

// Compare a submitted password in constant time without returning any secret data.
async function lobbyPasswordMatches(lobby, password) {
    if (typeof password !== 'string' || typeof lobby.passwordHash !== 'string') return false;
    const expected = Buffer.from(lobby.passwordHash, 'hex');
    const candidate = await scrypt(password, Buffer.from(lobby.passwordSalt, 'hex'), expected.length);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Authorize one selected lobby and reserve a player slot until socket setup completes.
async function authorizeLobbySocket(socket, lobbies) {
    const auth = socket.handshake.auth ?? {};
    const lobby = lobbies.get(auth.lobbyId);
    if (!lobby?.open) throw new Error('That lobby is no longer available.');

    if (lobby.status === 'private') {
        let passwordMatches = false;
        try {
            passwordMatches = await lobbyPasswordMatches(lobby, auth.password);
        } catch {
            throw new Error('Could not verify private lobby access.');
        }
        if (!passwordMatches) throw new Error('Could not join this private lobby. Check the password or lobby availability.');
    }

    if (lobby.connectedPlayers.size + lobby.pendingJoins >= lobby.maxPlayers) {
        throw new Error('This lobby is full.');
    }
    if (socket.conn.readyState !== 'open') throw new Error('The client disconnected before joining.');
    lobby.pendingJoins++;
    socket.data.pendingLobbyReservation = lobby;
    socket.once('disconnect', () => releaseLobbyReservation(socket));
}

// Release reserved capacity whether a socket joins successfully or disconnects first.
function releaseLobbyReservation(socket) {
    const lobby = socket.data.pendingLobbyReservation;
    if (!lobby) return;
    lobby.pendingJoins = Math.max(0, lobby.pendingJoins - 1);
    delete socket.data.pendingLobbyReservation;
}

// Send only join-safe lobby settings; password hashes and salts stay server-side.
function serializeLobby(lobby) {
    return {
        id: lobby.id,
        name: lobby.name,
        status: lobby.status,
        players: lobby.connectedPlayers.size,
        maxPlayers: lobby.maxPlayers,
        maxRenderDistance: lobby.maxRenderDistance,
        worldSizeChunks: lobby.worldSizeChunks,
        hostId: lobby.hostId ?? null,
        serverUrl: lobby.serverUrl ?? null,
    };
}

// Advance one lobby and emit its effects and player snapshots.
function updateLobby(lobby, deltaSeconds) {
    const { runtime, connectedPlayers } = lobby;
    runtime.updateWorld(deltaSeconds);
    runtime.updateEntities(1);
    runtime.updateChunks();
    dispatchAudioEvents(runtime.world.audio.drainEvents(), runtime, connectedPlayers);
    dispatchParticleEvents(runtime.world.drainParticleEvents(), runtime, connectedPlayers);

    const entities = [...runtime.world.entities.values()];
    const mapPlayers = [...runtime.world.getPlayers()].map(({ id, pos }) => ({ id, pos: [...pos] }));
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
            players: mapPlayers,
            daylight: runtime.world.daylight,
            time: runtime.world.time,
        });
    }
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
function dispatchAudioEvents(events, runtime, connectedPlayers) {
    let deliveries = 0;
    for (const event of events) {
        if (event.scope === 'global') {
            for (const socket of connectedPlayers.values()) socket.emit('audio:play', event);
            deliveries += connectedPlayers.size;
            continue;
        }

        if (event.scope === 'player') {
            const player = runtime.getPlayer(event.playerId);
            if (!player) continue;
            const playerEvent = event.position
                ? { ...event, distance: distanceBetween(event.position, player.pos) }
                : event;
            const socket = connectedPlayers.get(event.playerId);
            if (socket) {
                socket.emit('audio:play', playerEvent);
                deliveries++;
            }
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
        keys: {}, mouse: { buttons, inBox: () => false },
        isDown: action => !!actions[action],
        consumePress: action => { const pressed = !!actions[`pressed:${action}`]; actions[`pressed:${action}`] = false; return pressed; },
        isMouseDown: action => buttons[action === 'shoot' ? 0 : action === 'roll' ? 1 : 2] === true,
    };
}
