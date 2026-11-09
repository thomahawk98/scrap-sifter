import FPSTracker from '../systems/fps-tracker.js';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SIMULATION_STEPS = 5;
const CHUNK_MAP_REFRESH_MILLISECONDS = 100;

// Owns frame timing and coordinates simulation, chunk work, rendering, and HUD.
export default class GameLoop {
    constructor({ world, user, playerTracker, camera, renderer, chunkManager }) {
        Object.assign(this, { world, user, playerTracker, camera, renderer, chunkManager });
        this.fpsTracker = new FPSTracker();
        this.previousFrameTime = null;
        this.simulationAccumulator = 0;
        this.lastChunkMapRefresh = 0;
    }

    start() {
        requestAnimationFrame(timestamp => this.frame(timestamp));
    }

    frame(timestamp) {
        this.fpsTracker.update(timestamp);
        const elapsedSeconds = this.previousFrameTime === null
            ? 0
            : (timestamp - this.previousFrameTime) / 1000;
        this.previousFrameTime = timestamp;

        // Cap elapsed time and catch-up steps to prevent a slow frame from
        // causing an unbounded burst of simulation work.
        const frameSeconds = Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
        this.updateSimulation(frameSeconds);
        this.updateChunksAndMaps(timestamp, frameSeconds);
        this.renderer.render(this.world, this.camera, this.user.player);
        this.user.draw(this.getDebugTexts());

        requestAnimationFrame(nextTimestamp => this.frame(nextTimestamp));
    }

    updateSimulation(frameSeconds) {
        if (this.user.paused) {
            this.simulationAccumulator = 0;
            return;
        }

        this.simulationAccumulator += frameSeconds;
        let steps = 0;
        while (this.simulationAccumulator >= FIXED_STEP_SECONDS && steps < MAX_SIMULATION_STEPS) {
            this.world.update(FIXED_STEP_SECONDS);
            this.user.updateEntities(FIXED_STEP_SECONDS * 60, {
                world: this.world,
                canvas: this.user.hud.canvas,
            });
            this.playerTracker.update();
            this.camera.update();
            this.simulationAccumulator -= FIXED_STEP_SECONDS;
            steps++;
        }

        // Drop excess catch-up time rather than letting the simulation spiral.
        if (steps === MAX_SIMULATION_STEPS) {
            this.simulationAccumulator = Math.min(this.simulationAccumulator, FIXED_STEP_SECONDS);
        }
    }

    updateChunksAndMaps(timestamp, frameSeconds) {
        const player = this.user.player;
        const crossedChunkBorder = this.playerTracker.consumeChunkBorderCrossing();
        this.chunkManager.update(player, this.renderer, crossedChunkBorder, frameSeconds * 60);

        const refreshChunkMap = timestamp - this.lastChunkMapRefresh >= CHUNK_MAP_REFRESH_MILLISECONDS;
        for (const map of this.user.hud.maps) {
            const shouldRefresh = crossedChunkBorder || (map.isChunkMap && refreshChunkMap);
            if (shouldRefresh) map.uploadData(player.pos, this.world);
        }
        if (refreshChunkMap) this.lastChunkMapRefresh = timestamp;
    }

    getDebugTexts() {
        const { pos, onBlock } = this.user.player;
        return [
            `${Math.round(pos[0])}, ${Math.round(pos[1])}, ${Math.round(pos[2])}`,
            `FPS: ${this.fpsTracker.fps}`, `On block: ${onBlock}`, '',
            `FOV: ${this.camera.fov}`, `View: ${this.camera.orientation.map(value => Math.round(value * 100) / 100).join(', ')}`, '',
            `Seed: ${this.world.seed}`, `Render Distance: ${this.world.renderDistance}`, '',
            `Resident Chunks: ${this.world.chunks.size}`, `Active Chunks: ${this.chunkManager.getActiveChunkCount()}`,
            `Unmeshed Chunks: ${this.chunkManager.dirtyChunkQueue.length}`,
            `Ungenerated Chunks: ${this.chunkManager.generator.getPendingCount()}`,
        ];
    }
}
