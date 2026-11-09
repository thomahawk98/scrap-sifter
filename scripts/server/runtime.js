import './systems/math-patch.js';
import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';

// In-process server boundary. It owns world state and generation; callers use
// this small API so a network transport can replace direct references later.
export default class ServerRuntime {
    constructor() {
        this.world = new World();
        this.chunkManager = new ChunkManager(this.world);
    }

    addEntity(entity) {
        return this.world.entities.add(entity);
    }

    findEntity(predicate) {
        return this.world.entities.findFirst(predicate);
    }

    updateWorld(deltaSeconds) {
        this.world.update(deltaSeconds);
    }

    updateEntities(deltaScale, context, routeUpdate) {
        this.world.entities.update(deltaScale, context, routeUpdate);
    }

    updateChunks(viewEntity, renderer, crossedChunkBorder, deltaScale) {
        this.chunkManager.update(viewEntity, renderer, crossedChunkBorder, deltaScale);
    }

    clearChunks(renderer) {
        this.chunkManager.clear(renderer);
    }

    clampRenderDistance() {
        this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);
    }
}
