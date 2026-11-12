import { getBlockDropType } from './block-stats.js';
import physics from '../systems/physics.js';
import { getViewBasis } from '../systems/view-basis.js';
import EntityManager from '../entities/entity-manager.js';
import PlayerMovementTracker from '../systems/player-movement-tracker.js';
import WorldAudioSystem from '../systems/world-audio.js';

export default class World {
    // Initialize authoritative state and shared systems before the first tick.
    constructor() {
        this.seed = Math.round(Math.random() * 10000);
        this.time = 0;
        this.daylight = 1;
        this.renderDistance = 5; // in chunks
        this.borderDistance = 200;

        this.CHUNK_SIZE = 16;
        this.DAY_LENGTH_SECONDS = 600; // 10 minutes
        this.BRIGHTNESS_AT_NOON = 2;

        this.chunks = new Map();
        this.entities = new EntityManager();
        this.players = new Map();
        this.playerTrackers = new Map();
        this.audio = new WorldAudioSystem();
        this.particleEvents = [];
        this.onBlockChanged = () => {};

        this.update();
    }

    // Advance world time and publish the current daylight value.
    update(deltaSeconds = 1 / 60) {
        this.time += deltaSeconds;
        this.daylight = 1; // always day

        // update daylight
        /*
        const frequency = this.DAY_LENGTH_SECONDS;
        const amplitude = this.BRIGHTNESS_AT_NOON;
        const light = amplitude * Math.sin(this.time * Math.PI / frequency);
        this.daylight = light;
        */
    }

    // Build the stable coordinate key shared by chunk storage and network messages.
    getChunkKey(cx, cy, cz) {
        return `${cx},${cy},${cz}`;
    }

    // Register a player with entity storage and chunk-boundary tracking.
    addPlayer(player) {
        this.clampEntityPosition(player);
        this.entities.add(player);
        this.players.set(player.id, player);
        this.playerTrackers.set(player.id, new PlayerMovementTracker(player, this));
        return player;
    }

    // Remove player, movement tracking, and entity state by object or ID.
    removePlayer(playerOrId) {
        const playerId = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        this.playerTrackers.delete(playerId);
        this.players.delete(playerId);
        return this.entities.remove(playerId);
    }

    // Expose connected players to simulation and transport consumers.
    getPlayers() {
        return this.players.values();
    }

    // Refresh every tracked player's chunk coordinates after simulation movement.
    updatePlayerTrackers() {
        for (const tracker of this.playerTrackers.values()) tracker.update();
    }

    // Consume the aggregate movement signal while clearing individual latches.
    consumePlayerChunkBorderCrossings() {
        let crossed = false;
        for (const tracker of this.playerTrackers.values()) {
            crossed = tracker.consumeChunkBorderCrossing() || crossed;
        }
        return crossed;
    }

    // Convert world-space block coordinates to their containing chunk coordinates.
    getChunkCoords(x, y, z) {
        return [x, y, z].map(a => Math.floor(a / this.CHUNK_SIZE));
    };

    // Keep a moving entity's full bounds inside the configured centered cube.
    clampEntityPosition(entity) {
        if (this.borderDistance === null) return false;
        if (!Number.isFinite(this.borderDistance) || this.borderDistance < 0) return false;

        let clamped = false;
        for (let axis = 0; axis < 3; axis++) {
            const halfExtent = (entity.size?.[['x', 'y', 'z'][axis]] ?? 0) * 0.5;
            const min = -this.borderDistance + halfExtent;
            const max = this.borderDistance - halfExtent;
            const boundedPosition = min <= max
                ? Math.max(min, Math.min(max, entity.pos[axis]))
                : 0;
            if (boundedPosition === entity.pos[axis]) continue;
            entity.pos[axis] = boundedPosition;
            if (entity.velocity) entity.velocity[axis] = 0;
            clamped = true;
        }
        return clamped;
    }

    // Check whether every face of an entity's bounds fits inside the world cube.
    isEntityInsideBorder(entity) {
        if (this.borderDistance === null) return true;
        if (!Number.isFinite(this.borderDistance) || this.borderDistance < 0) return false;
        return ['x', 'y', 'z'].every((axis, index) => {
            const halfExtent = (entity.size?.[axis] ?? 0) * 0.5;
            return entity.pos[index] - halfExtent >= -this.borderDistance &&
                entity.pos[index] + halfExtent <= this.borderDistance;
        });
    }

    // Return a virtual block hit when movement reaches one of the six border faces.
    getBorderCollisionBlock(axis, axisStart, speed, maxDistance, closestDistance) {
        if (this.borderDistance === null || !Number.isFinite(this.borderDistance)) return null;
        const plane = speed > 0 ? this.borderDistance : -this.borderDistance;
        const travelled = speed > 0 ? plane - axisStart : axisStart - plane;
        const distance = Math.max(0, travelled);
        if (travelled > maxDistance + 1e-8 || distance > closestDistance + 1e-8) return null;
        return { type: 'world-border', isWorldBorder: true, axis, plane };
    }

    // Return chunk data only after generation has fully completed.
    getChunk(cx, cy, cz) {
        const key = this.getChunkKey(cx, cy, cz);

        const chunk = this.chunks.get(key);
        return this.validateChunkData(chunk) ? chunk : null;
    }

    // Keep pending chunks out of collision and block queries.
    validateChunkData(chunk) {
        return !!chunk && chunk.dataStatus === 'ready' && !!chunk.blocks;
    }

    // Resolve a block coordinate and return a decoded air or solid block record.
    getBlock(x, y, z) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);

        //get chunk
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return { pos: [x, y, z], type: 'air' };

        //local cors
        const lx = Math.modulo(x, this.CHUNK_SIZE);
        const ly = Math.modulo(y, this.CHUNK_SIZE);
        const lz = Math.modulo(z, this.CHUNK_SIZE);

        //get block
        const block = chunk.getBlock(lx, ly, lz);
        if (!block) return { pos: [x, y, z], type: 'air' };
        return { pos: [x, y, z], ...block };
    }

    // Update a ready chunk and notify observers about authoritative block changes.
    setBlock(x, y, z, block, { playBreakSound = true } = {}) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return false;

        //local cors
        const lx = Math.modulo(x, this.CHUNK_SIZE);
        const ly = Math.modulo(y, this.CHUNK_SIZE);
        const lz = Math.modulo(z, this.CHUNK_SIZE);

        const previousBlock = this.getBlock(x, y, z);

        //set block
        const success = chunk.setBlock(lx, ly, lz, block);

        if (success) {
            this.onBlockChanged({ chunkPos: [cx, cy, cz], blockPos: [x, y, z], block, previousBlock });
            if (playBreakSound && previousBlock.type !== 'air' && block.type === 'air') {
                this.audio.playWorld(`${previousBlock.type}-broken`, [x + 0.5, y + 0.5, z + 0.5], { volume: 0.7 });
            }
        }

        return success;
    };

    // Break the selected voxel, award its drop, and clear the player's outline.
    breakBlock(hit, player) {
        const block = this.getBlock(...hit.position);
        if (!block) return console.log('no block found at', hit.position);

        this.setBlock(...hit.position, { type: 'air' });

        player.attackReload = 10;
        player.outlinedBlock = null;

        //add block to player inventory
        const dropType = getBlockDropType(block.type);
        const item = { type: dropType, amount: 1 };
        player.inventory.addItem(item);

        return true;
    }

    // Queue a transient visual event for the next network tick.
    emitParticleEvent(event) { this.particleEvents.push(event); }

    // Transfer queued effects to the transport without retaining prior events.
    drainParticleEvents() { return this.particleEvents.splice(0); }


    // Place the selected block adjacent to a ray hit when collision checks pass.
    placeBlock(hit, player) {
        const item = player.inventory.getSelectedItem();
        if (!item || item.kind === 'usable' || item.amount <= 0) return false;

        //find where the new block will go
        const [x, y, z] = hit.position;
        const [nx, ny, nz] = hit.normal;
        const pos = [x + nx, y + ny, z + nz];

        const block = {
            pos, type: item.type,
        };

        const collidesWithSelf = physics.anyEntityCollidesWithBlock(block, [player]);
        if (collidesWithSelf) {
            const { forward } = getViewBasis(player.orientation);
            const dir = [Math.round(forward[0]), 0, Math.round(forward[2])];
            block.pos = [block.pos[0] + dir[0], block.pos[1] - 1, block.pos[2] + dir[2]];
        }

        const valid = this.validateBlockPlacement(block, player);
        if (valid) {
            player.interactReload = 5;
            item.amount--;

            return true;
        }
    }

    // Validate inventory, occupancy, and entity clearance before committing placement.
    validateBlockPlacement(block, player) {
        const [x, y, z] = block.pos;

        // check to make sure player has the block in their inventory
        const item = player.inventory.getSelectedItem();
        if (!item || item.amount <= 0 || item.type !== block.type) return false;

        // check if a block is already at this position
        const existing = this.getBlock(x, y, z);
        if (existing && existing.type !== 'air') return false;

        // check if block is inside other entities
        const entities = [...this.players.values()];
        if (!entities.includes(player)) entities.push(player);
        const collides = physics.anyEntityCollidesWithBlock(block, entities);
        if (collides) return false;

        //add the block to the world
        this.setBlock(x, y, z, block);

        return true;
    }
}
