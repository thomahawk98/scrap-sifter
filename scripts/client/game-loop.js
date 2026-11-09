import FPSTracker from './systems/fps-tracker.js';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SIMULATION_STEPS = 5;

// The frame loop owns time only; User bridges each frame to simulation and view.
export default class GameLoop {
    constructor(user) {
        this.user = user;
        this.fpsTracker = new FPSTracker();
        this.previousFrameTime = null;
        this.simulationAccumulator = 0;
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

        // Cap elapsed time and catch-up steps so a long stall cannot trigger an
        // unbounded burst of simulation work.
        const frameSeconds = Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
        this.updateSimulation(frameSeconds);
        this.user.updateChunksAndMaps(timestamp, frameSeconds * 60);
        this.user.render();
        this.user.draw(this.fpsTracker.fps);

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
            this.user.simulateStep(FIXED_STEP_SECONDS, FIXED_STEP_SECONDS * 60);
            this.simulationAccumulator -= FIXED_STEP_SECONDS;
            steps++;
        }

        // Drop excess catch-up time rather than letting the simulation spiral.
        if (steps === MAX_SIMULATION_STEPS) {
            this.simulationAccumulator = Math.min(this.simulationAccumulator, FIXED_STEP_SECONDS);
        }
    }
}
