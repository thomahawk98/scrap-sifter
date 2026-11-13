import Chunk from './shared/chunk-data.js';

// Client replica contains the data needed for view, collision queries, and meshing.
// The server remains authoritative for world mutations.
export default class ClientWorld {
    // Allocate client-owned world replicas and default visibility settings.
    constructor() {
        this.seed = 0;
        this.daylight = 1;
        this.renderDistance = 5;
        this.maxRenderDistance = 12;
        this.borderDistance = null;
        this.CHUNK_SIZE = 16;
        this.chunks = new Map();
        this.entities = new Map();
        // Retain map positions separately from nearby, rendered entity replicas.
        this.mapPlayers = new Map();
    }

    // Build the same coordinate key used by chunk storage and socket payloads.
    getChunkKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }
    // Convert global coordinates to their containing chunk coordinates.
    getChunkCoords(x, y, z) { return [x, y, z].map(value => Math.floor(value / this.CHUNK_SIZE)); }
    // Return an already resident client chunk by coordinate.
    getChunk(cx, cy, cz) { return this.chunks.get(this.getChunkKey(cx, cy, cz)) ?? null; }
    // Create the local player replica with client-side controls and inventory view state.
    createLocalPlayer() {
        const player = createEntityReplica({
            id: -1, type: 'player', pos: [0, 0, 0], orientation: [1, 0, 0, 0],
            scale: [0.6, 0.6, 0.6], velocity: [0, 0, 0], material: { color: [1, 0, 0] },
            perspectiveMode: 0, health: 100, maxHealth: 100,
        });
        player.inventory = createInventory();
        player.menuOpen = false;
        player.inputs = { keys: {}, mouse: { buttons: [], inBox: () => false } };
        this.entities.set(player.id, player);
        return player;
    }
    // Resolve any block coordinate from the local chunk cache, defaulting unknown data to air.
    getBlock(x, y, z) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk?.blocks) return { pos: [x, y, z], type: 'air' };
        const block = chunk.getBlock(modulo(x, 16), modulo(y, 16), modulo(z, 16));
        return block ? { pos: [x, y, z], ...block } : { pos: [x, y, z], type: 'air' };
    }
    // Expose the known solidity state for collision, meshing, and audio queries.
    isSolidBlock(x, y, z) {
        return this.getVoxelState(x, y, z) === true;
    }
    // Return true/false for known voxels and null when their chunk is not loaded.
    getVoxelState(x, y, z) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk?.blocks) return null;
        const index = chunk.getIndex(modulo(x, 16), modulo(y, 16), modulo(z, 16));
        return chunk.blocks[index] !== 0;
    }
    // Apply a server block update and invalidate nearby meshes at chunk boundaries.
    setBlock(x, y, z, block) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk?.blocks) return false;
        const lx = modulo(x, 16), ly = modulo(y, 16), lz = modulo(z, 16);
        const changed = chunk.setBlock(lx, ly, lz, block);
        const offsets = [lx, ly, lz].map(v => v === 0 ? [-1, 0] : v === 15 ? [0, 1] : [0]);
        for (const dx of offsets[0]) for (const dy of offsets[1]) for (const dz of offsets[2]) {
            if (!dx && !dy && !dz) continue;
            this.getChunk(cx + dx, cy + dy, cz + dz)?.invalidateMesh();
        }
        return changed;
    }

    // Install server voxel data and invalidate meshes that share its borders.
    receiveChunk(data) {
        const [cx, cy, cz] = data.chunkPos;
        const chunk = this.getChunk(cx, cy, cz) ?? new Chunk(cx, cy, cz);
        this.chunks.set(this.getChunkKey(cx, cy, cz), chunk);
        chunk.setBlockData(data.voxels, data.empty);
        chunk.residency = 'active';
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            if (!dx && !dy && !dz) continue;
            this.getChunk(cx + dx, cy + dy, cz + dz)?.invalidateMesh();
        }
    }

    // Merge a network entity snapshot while preserving local-only player controls.
    upsertEntity(data, localEntityId = null) {
        let entity = this.entities.get(data.id);

        // Create a local replica when this entity has not been seen before.
        if (!entity) {
            entity = createEntityReplica(data);
            this.entities.set(data.id, entity);
        }

        if (data.id === localEntityId) {
            const inventoryData = data.inventory ?? {};
            // The local camera owns its orientation to avoid network snapshots
            // pulling mouse look back to an older server tick.
            const localOrientation = entity.orientation;
            const currentPosition = entity.pos;
            const hasServerPosition = entity.hasServerPosition;
            // Menu state is changed immediately by local input. Older network
            // snapshots must not undo a just-pressed open/close toggle or
            // restore an older hotbar selection over the current client choice.
            const localMenuOpen = entity.menuOpen;
            const localInventoryOpen = entity.inventory?.open;
            const localSelectedSlot = entity.inventory?.selectedSlot;
            Object.assign(entity, data);
            entity.menuOpen = localMenuOpen ?? data.menuOpen ?? false;
            entity.orientation = localOrientation;
            entity.targetPos = [...data.pos];
            entity.pos = hasServerPosition ? currentPosition : [...data.pos];
            entity.hasServerPosition = true;
            // Snapshots contain plain data, so merge them into the client model
            // instead of replacing methods used by InventoryView.
            entity.inventory = Object.assign(createInventory(), entity.inventory ?? {}, inventoryData);
            entity.inventory.open = localInventoryOpen ?? inventoryData.open ?? false;
            entity.inventory.selectedSlot = localSelectedSlot ?? inventoryData.selectedSlot ?? 0;
            entity.inputs = entity.inputs ?? { keys: {}, mouse: { buttons: [], inBox: () => false } };
            entity.geometry = entity.geometry ?? createCubeGeometry();
            return entity;
        }
        entity.targetPos = [...data.pos];
        Object.assign(entity, data, { pos: entity.pos ?? [...data.pos], geometry: entity.geometry ?? createCubeGeometry() });
        return entity;
    }

    // Remove a replica that left the world or is outside the latest visibility set.
    removeEntity(id) { this.entities.delete(id); }

    // Keep lightweight positions for every connected player, outside render range.
    upsertMapPlayer(data) {
        let player = this.mapPlayers.get(data.id);
        if (!player) {
            player = { id: data.id, pos: [...data.pos], targetPos: [...data.pos] };
            this.mapPlayers.set(data.id, player);
        }
        player.targetPos = [...data.pos];
        return player;
    }
}

// Create the client-side inventory shape required by the HUD and local controls.
function createInventory() {
    return {
        items: [], cursorItem: null, selectedSlot: 0, WIDTH: 8, HEIGHT: 4, open: false,
        cleanupDeletedItems() { this.items = this.items.filter(item => !item.delete && item.amount > 0); },
        swapItemsBySlot(a, b) {
            const first = this.items.find(item => item.slot === a);
            const second = this.items.find(item => item.slot === b);
            if (first) first.slot = b;
            if (second) second.slot = a;
        },
    };
}

const CUBE_GEOMETRY = createCubeGeometry();

// Attach presentation helpers and defaults to a plain server entity snapshot.
function createEntityReplica(data) {
    return {
        ...data, pos: [...data.pos], targetPos: [...data.pos],
        orientation: [...(data.orientation ?? [1, 0, 0, 0])],
        scale: [...(data.scale ?? [1, 1, 1])], velocity: [...(data.velocity ?? [0, 0, 0])],
        health: data.health ?? 100, maxHealth: data.maxHealth ?? 100,
        material: data.material ?? { color: [0, 0, 0] }, geometry: CUBE_GEOMETRY,
        rotateView(mouseX, mouseY, roll = false) {
            const sensitivity = 0.002;
            this.orientation = rotateLocal(this.orientation, roll ? [0, 0, -1] : [0, 1, 0],
                roll ? mouseX * sensitivity : -mouseX * sensitivity);
            this.orientation = rotateLocal(this.orientation, [1, 0, 0], -mouseY * sensitivity);
        },
        closeMenu() {
            this.menuOpen = false;
            if (this.inventory?.open) this.inventory.open = false;
        },
    };
}

// Keep negative world coordinates mapped into local chunk coordinates.
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

// Rotate a client-owned quaternion around a local camera axis.
function rotateLocal(q, axis, angle) {
    const length = Math.hypot(...axis) || 1;
    const [x, y, z] = axis.map(value => value / length);
    const half = angle * 0.5, s = Math.sin(half), delta = [Math.cos(half), x*s, y*s, z*s];
    const [aw, ax, ay, az] = q, [bw, bx, by, bz] = delta;
    const out = [aw*bw-ax*bx-ay*by-az*bz, aw*bx+ax*bw+ay*bz-az*by,
        aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw];
    const norm = Math.hypot(...out) || 1;
    return out.map(value => value / norm);
}

// Build one shared cube mesh for client-side entity replicas.
function createCubeGeometry() {
    const vertices = [];
    const faces = [
        [[0,0,1], [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]], 0],
        [[0,0,-1], [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]], 1],
        [[1,0,0], [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]], 4],
        [[-1,0,0], [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]], 5],
        [[0,1,0], [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]], 2],
        [[0,-1,0], [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]], 3],
    ];
    const indices = [];
    let offset = 0;
    const faceUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const [normal, corners, textureFace] of faces) {
        for (let index = 0; index < corners.length; index++) {
            vertices.push(...corners[index], ...normal, 1, 1, 1, ...faceUvs[index], textureFace, 1);
        }
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
        offset += 4;
    }
    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
