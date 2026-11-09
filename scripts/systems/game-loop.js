import FPSTracker from './fps-tracker.js';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SIMULATION_STEPS = 5;
const CHUNK_MAP_REFRESH_MILLISECONDS = 100;

// Owns frame timing and coordinates simulation, chunk work, rendering, and HUD.
export default class GameLoop {
    constructor({ world, player, playerTracker, camera, renderer, hud, chunkManager, input }) {
        Object.assign(this, { world, player, playerTracker, camera, renderer, hud, chunkManager, input });
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
        this.renderer.render(this.world, this.camera, this.player);
        this.hud.draw(this.input.paused, this.getDebugTexts(), this.player, this.input);

        requestAnimationFrame(nextTimestamp => this.frame(nextTimestamp));
    }

    updateSimulation(frameSeconds) {
        if (this.input.paused) {
            this.simulationAccumulator = 0;
            return;
        }

        this.simulationAccumulator += frameSeconds;
        let steps = 0;
        while (this.simulationAccumulator >= FIXED_STEP_SECONDS && steps < MAX_SIMULATION_STEPS) {
            this.world.update(FIXED_STEP_SECONDS);
            this.world.entities.update(FIXED_STEP_SECONDS * 60, {
                inputs: this.input,
                world: this.world,
                canvas: this.hud.canvas,
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
        const crossedChunkBorder = this.playerTracker.consumeChunkBorderCrossing();
        this.chunkManager.update(this.player, this.renderer, crossedChunkBorder, frameSeconds * 60);

        const refreshChunkMap = timestamp - this.lastChunkMapRefresh >= CHUNK_MAP_REFRESH_MILLISECONDS;
        for (const map of this.hud.maps) {
            const shouldRefresh = crossedChunkBorder || (map.isChunkMap && refreshChunkMap);
            if (shouldRefresh) map.uploadData(this.player.pos, this.world);
        }
        if (refreshChunkMap) this.lastChunkMapRefresh = timestamp;
    }

    getDebugTexts() {
        const { pos, onBlock } = this.player;
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
