import './systems/math-patch.js';
import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';
import Player from './entities/player.js';
import Target from './entities/target.js';

const TARGET_CHUNK_SPAWN_CHANCE = 0.2;
const TARGETS_PER_SPAWN_CHUNK = 3;
const MAX_ACTIVE_TARGETS = 96;

// In-process server boundary. It owns world state and generation; callers use
// this small API so a network transport can replace direct references later.
export default class ServerRuntime {
    constructor({ onChunkReady = () => {}, onBlockChanged = () => {}, spawnInitialPlayer = true } = {}) {
        this.world = new World();
        this.world.onBlockChanged = onBlockChanged;
        if (spawnInitialPlayer) this.addPlayer();
        this.hasSpawnedInitialTarget = false;
        this.chunkManager = new ChunkManager(this.world, onChunkReady, chunk => this.spawnTargetForChunk(chunk));
        this.playerInputs = new Map();
    }

    // Route player creation through the player registry and all other entities through the manager.
    addEntity(entity) {
        if (entity.type === 'player') return this.addPlayer(entity);
        return this.world.entities.add(entity);
    }

    // Add a supplied player or create the default local simulation player.
    addPlayer(player) {
        player ??= new Player(this.world);
        return this.world.addPlayer(player);
    }

    // Populate generated regions with a bounded number of nearby targets.
    spawnTargetForChunk(chunk) {
        const activeTargets = this.pruneDistantTargets();
        if (activeTargets >= MAX_ACTIVE_TARGETS) return;

        // Always place the first target in the first generated chunk with
        // usable space; later chunks add a sparse population across the world.
        if (this.hasSpawnedInitialTarget && Math.random() >= TARGET_CHUNK_SPAWN_CHANCE) return;

        for (let count = 0; count < TARGETS_PER_SPAWN_CHUNK && activeTargets + count < MAX_ACTIVE_TARGETS; count++) {
            const target = Target.createForChunk(chunk);
            if (!target) break;
            if (!this.world.isEntityInsideBorder(target)) continue;
            this.world.entities.add(target);
            this.hasSpawnedInitialTarget = true;
        }
    }

    // Remove targets far from every player so exploration can keep spawning new ones.
    pruneDistantTargets() {
        const players = [...this.world.getPlayers()];
        const activeTargets = [];

        for (const entity of this.world.entities.values()) {
            if (entity.type !== 'target') continue;

            // Keep the bounded target population near connected players. This
            // frees slots for newly generated regions as players explore.
            const nearPlayer = players.some(player => {
                const dx = entity.pos[0] - player.pos[0];
                const dy = entity.pos[1] - player.pos[1];
                const dz = entity.pos[2] - player.pos[2];
                const radius = ((player.renderDistance ?? this.world.renderDistance) + 1) * this.world.CHUNK_SIZE;
                return dx * dx + dy * dy + dz * dz <= radius * radius;
            });

            if (nearPlayer || players.length === 0) activeTargets.push(entity);
            else this.world.entities.remove(entity);
        }
        return activeTargets.length;
    }

    // Clear pending input before removing a player from world state.
    removePlayer(playerOrId) {
        const id = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        this.playerInputs.delete(id);
        return this.world.removePlayer(playerOrId);
    }

    // Expose entity lookup without leaking entity storage details to the transport.
    findEntity(predicate) {
        return this.world.entities.findFirst(predicate);
    }

    // Return a requested player or the first connected player when no ID is given.
    getPlayer(playerId = null) {
        if (playerId !== null) return this.world.players.get(playerId) ?? null;
        return this.world.getPlayers().next().value ?? null;
    }

    // Provide the live player iterator used by network and chunk coordination.
    getPlayers() {
        return this.world.getPlayers();
    }

    // Store the latest validated input snapshot for the next simulation step.
    setPlayerInput(playerId, input) {
        if (!this.world.players.has(playerId)) throw new Error(`Unknown player entity: ${playerId}`);
        this.playerInputs.set(playerId, input);
    }

    // Drop queued input when its source disconnects.
    removePlayerInput(playerId) { this.playerInputs.delete(playerId); }

    // Advance world clocks and other world-level timers.
    updateWorld(deltaSeconds) {
        this.world.update(deltaSeconds);
    }

    // Tick entities with server input and defer movement until spawn terrain exists.
    updateEntities(deltaScale) {
        this.world.entities.update(deltaScale, { world: this.world }, (entity, scale, context) => {
            if (this.world.players.has(entity.id)) {
                if (entity.needsSafeSpawn && !entity.ensureSafeSpawn(this.world)) return;
                const inputs = this.playerInputs.get(entity.id);
                if (!inputs) return;
                // Do not let a newly connected player fall through terrain
                // while their spawn chunk is still being generated.
                const centerChunk = this.world.getChunkCoords(...entity.pos);
                if (!this.world.getChunk(...centerChunk)) return;
                entity.update(scale, { ...context, inputs });
                return;
            }
            entity.update(scale, context);
        });
        // Clamp every entity after its update, including projectiles.
        for (const entity of this.world.entities.values()) this.world.clampEntityPosition(entity);
        this.world.updatePlayerTrackers();
    }

    // Refresh chunk-generation priorities from current player positions.
    updateChunks() {
        this.chunkManager.setPlayerPositions([...this.world.getPlayers()].map(player => player.pos));
        this.chunkManager.update();
    }

    // Keep the simulation's shared render distance inside its supported range.
    clampRenderDistance() {
        this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);
    }
}
