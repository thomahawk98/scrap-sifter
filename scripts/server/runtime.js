import './systems/math-patch.js';
import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';
import Player from './entities/player.js';
import { createTestEntity } from './entities/test-entity.js';

// In-process server boundary. It owns world state and generation; callers use
// this small API so a network transport can replace direct references later.
export default class ServerRuntime {
    constructor() {
        this.world = new World();
        this.playerSetChanged = false;
        this.world.entities.add(createTestEntity());
        this.addPlayer();
        this.chunkManager = new ChunkManager(this.world);
        this.playerControllers = new Map();
    }

    addEntity(entity) {
        if (entity.type === 'player') return this.addPlayer(entity);
        return this.world.entities.add(entity);
    }

    addPlayer(player) {
        player ??= new Player(this.world);
        const addedPlayer = this.world.addPlayer(player);
        this.playerSetChanged = true;
        return addedPlayer;
    }

    removePlayer(playerOrId) {
        const id = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        this.playerControllers.delete(id);
        const removed = this.world.removePlayer(playerOrId);
        if (removed) this.playerSetChanged = true;
        return removed;
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

    setPlayerController(playerId, controller) {
        if (!this.world.players.has(playerId)) throw new Error(`Unknown player entity: ${playerId}`);
        this.playerControllers.set(playerId, controller);
    }

    removePlayerController(playerId) {
        this.playerControllers.delete(playerId);
    }

    updateWorld(deltaSeconds) {
        this.world.update(deltaSeconds);
    }

    updateEntities(deltaScale) {
        this.world.entities.update(deltaScale, { world: this.world }, (entity, scale, context) => {
            if (this.world.players.has(entity.id)) {
                const controller = this.playerControllers.get(entity.id);
                if (!controller || controller.isPaused()) return;
                entity.update(scale, { ...context, ...controller });
                return;
            }
            entity.update(scale, context);
        });
        this.world.updatePlayerTrackers();
    }

    updateChunks(renderer, deltaScale) {
        const crossedChunkBorder = this.world.consumePlayerChunkBorderCrossings() || this.playerSetChanged;
        this.playerSetChanged = false;
        this.chunkManager.update([...this.world.getPlayers()], renderer, crossedChunkBorder, deltaScale);
        return crossedChunkBorder;
    }

    clearChunks(renderer) {
        this.chunkManager.clear(renderer);
    }

    clampRenderDistance() {
        this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);
    }
}
