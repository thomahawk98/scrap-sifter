import InputController from './input.js';
import PlayerMovementTracker from './systems/player-movement-tracker.js';
import Camera from './render/camera.js';
import Hud from './render/hud.js';
import { getViewBasis, reverseView } from '../server/systems/view-basis.js';

const CHUNK_MAP_REFRESH_MILLISECONDS = 100;

// A User is the client boundary for local control and presentation. The server
// is accessed through a small runtime API, keeping transport details replaceable.
export default class User {
    constructor({ server, renderer, glCanvas, hudCanvas, controlledEntityId = null, keyBindings = {}, mouseBindings = {} }) {
        this.server = server;
        this.controlledEntityId = controlledEntityId
            ?? server.findEntity(entity => entity.type === 'player')?.id;
        if (!server.world.entities.getById(this.controlledEntityId)) {
            throw new Error('User requires a controlled player entity in the world.');
        }

        this.renderer = renderer;
        this.camera = new Camera(this.player, 90, 0.1, 200, { getViewBasis, reverseView });
        this.hud = new Hud(hudCanvas, { getViewBasis });
        this.playerTracker = new PlayerMovementTracker(this.player, server.world);
        this.lastChunkMapRefresh = 0;

        this.input = new InputController({
            canvas: glCanvas,
            player: this.player,
            camera: this.camera,
            keyBindings,
            mouseBindings,
            onClearChunks: () => server.clearChunks(renderer),
            changeRenderDistance: delta => { server.world.renderDistance += delta; },
            clampRenderDistance: () => server.clampRenderDistance(),
            inspectChunk: position => {
                const coords = server.world.getChunkCoords(...position);
                console.log(server.world.getChunk(...coords));
            },
            inspectChunks: () => console.log(server.world.chunks),
        });
    }

    get player() {
        return this.server.world.entities.getById(this.controlledEntityId);
    }

    get paused() {
        return this.input.paused;
    }

    // Server simulation receives local controls only for this user's entity.
    simulateStep(deltaSeconds, deltaScale) {
        this.server.updateWorld(deltaSeconds);
        const context = { world: this.server.world, canvas: this.hud.canvas };
        this.server.updateEntities(deltaScale, context, (entity, scale, sharedContext) => {
            if (entity.id === this.controlledEntityId) {
                entity.update(scale, { ...sharedContext, inputs: this.input });
            } else {
                entity.update(scale, sharedContext);
            }
        });
        this.playerTracker.update();
        this.camera.update();
    }

    updateChunksAndMaps(timestamp, deltaScale) {
        const player = this.player;
        const crossedChunkBorder = this.playerTracker.consumeChunkBorderCrossing();
        this.server.updateChunks(player, this.renderer, crossedChunkBorder, deltaScale);

        const refreshChunkMap = timestamp - this.lastChunkMapRefresh >= CHUNK_MAP_REFRESH_MILLISECONDS;
        for (const map of this.hud.maps) {
            const shouldRefresh = crossedChunkBorder || (map.isChunkMap && refreshChunkMap);
            if (shouldRefresh) map.uploadData(player.pos, this.server.world);
        }
        if (refreshChunkMap) this.lastChunkMapRefresh = timestamp;
    }

    render() {
        // The renderer sees only the world/view data supplied across this boundary.
        this.renderer.render(this.server.world, this.camera, this.player);
    }

    draw(fps) {
        const player = this.player;
        const world = this.server.world;
        const chunkManager = this.server.chunkManager;
        const debugTexts = [
            `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
            `FPS: ${fps}`, `On block: ${player.onBlock}`, '',
            `FOV: ${this.camera.fov}`, `View: ${this.camera.orientation.map(value => Math.round(value * 100) / 100).join(', ')}`, '',
            `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
            `Resident Chunks: ${world.chunks.size}`, `Active Chunks: ${chunkManager.getActiveChunkCount()}`,
            `Unmeshed Chunks: ${chunkManager.dirtyChunkQueue.length}`,
            `Ungenerated Chunks: ${chunkManager.generator.getPendingCount()}`,
        ];
        this.hud.draw(this.paused, debugTexts, player, this.input);
    }
}
