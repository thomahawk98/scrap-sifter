import FPSTracker from './client/systems/fps-tracker.js';
import Game from './game.js';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SIMULATION_STEPS = 5;

// The frame loop owns time only; User bridges each frame to simulation and view.
class DualUpdateLoop {
    constructor(game) {
        this.game = game;
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
        const crossedChunkBorder = this.game.server.updateChunks(this.game.renderer, frameSeconds * 60);
        for (const user of this.game.users) {
            user.updateMaps(timestamp, crossedChunkBorder);
            user.render();
            user.draw(this.fpsTracker.fps);
        }

        requestAnimationFrame(nextTimestamp => this.frame(nextTimestamp));
    }

    updateSimulation(frameSeconds) {
        const activeUsers = this.game.users.filter(user => !user.paused);
        if (activeUsers.length === 0) {
            this.simulationAccumulator = 0;
            return;
        }

        this.simulationAccumulator += frameSeconds;
        let steps = 0;
        while (this.simulationAccumulator >= FIXED_STEP_SECONDS && steps < MAX_SIMULATION_STEPS) {
            this.game.server.updateWorld(FIXED_STEP_SECONDS);
            this.game.server.updateEntities(FIXED_STEP_SECONDS * 60);
            for (const user of activeUsers) user.updateView();
            this.simulationAccumulator -= FIXED_STEP_SECONDS;
            steps++;
        }

        // Drop excess catch-up time rather than letting the simulation spiral.
        if (steps === MAX_SIMULATION_STEPS) {
            this.simulationAccumulator = Math.min(this.simulationAccumulator, FIXED_STEP_SECONDS);
        }
    }
}

// Temporary in-process driver: this coordinates client presentation and server
// simulation until each side owns its own update transport and scheduler.
const game = new Game();
new DualUpdateLoop(game).start();
