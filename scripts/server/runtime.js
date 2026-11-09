import './systems/math-patch.js';
import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';
import Player from './entities/player.js';
import { createTestEntity } from './entities/test-entity.js';

// In-process server boundary. It owns world state and generation; callers use
// this small API so a network transport can replace direct references later.
export default class ServerRuntime {
    constructor({ onChunkReady = () => {}, onBlockChanged = () => {}, spawnInitialPlayer = true } = {}) {
        this.world = new World();
        this.world.onBlockChanged = onBlockChanged;
        this.world.entities.add(createTestEntity());
        if (spawnInitialPlayer) this.addPlayer();
        this.chunkManager = new ChunkManager(this.world, onChunkReady);
        this.playerInputs = new Map();
    }

    addEntity(entity) {
        if (entity.type === 'player') return this.addPlayer(entity);
        return this.world.entities.add(entity);
    }

    addPlayer(player) {
        player ??= new Player(this.world);
        return this.world.addPlayer(player);
    }

    removePlayer(playerOrId) {
        const id = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        this.playerInputs.delete(id);
        return this.world.removePlayer(playerOrId);
    }

    findEntity(predicate) {
        return this.world.entities.findFirst(predicate);
    }

    getPlayer(playerId = null) {
        if (playerId !== null) return this.world.players.get(playerId) ?? null;
        return this.world.getPlayers().next().value ?? null;
    }

    getPlayers() {
        return this.world.getPlayers();
    }

    setPlayerInput(playerId, input) {
        if (!this.world.players.has(playerId)) throw new Error(`Unknown player entity: ${playerId}`);
        this.playerInputs.set(playerId, input);
    }

    removePlayerInput(playerId) { this.playerInputs.delete(playerId); }

    updateWorld(deltaSeconds) {
        this.world.update(deltaSeconds);
    }

    updateEntities(deltaScale) {
        this.world.entities.update(deltaScale, { world: this.world }, (entity, scale, context) => {
            if (this.world.players.has(entity.id)) {
                const inputs = this.playerInputs.get(entity.id);
                if (!inputs || inputs.paused) return;
                // Do not let a newly connected player fall through terrain
                // while their spawn chunk is still being generated.
                const centerChunk = this.world.getChunkCoords(...entity.pos);
                if (!this.world.getChunk(...centerChunk)) return;
                entity.update(scale, { ...context, inputs });
                return;
            }
            entity.update(scale, context);
        });
        this.world.updatePlayerTrackers();
    }

    updateChunks() {
        this.chunkManager.setPlayerPositions([...this.world.getPlayers()].map(player => player.pos));
        this.chunkManager.update();
    }

    clampRenderDistance() {
        this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);
    }
}
