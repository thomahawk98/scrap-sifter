import FPSTracker from './client/systems/fps-tracker.js';
import Game from './game.js';
import './client/shared/math-patch.js';

// The temporary dual entry now drives only browser presentation. Server ticks
// run independently in the Node process and synchronize through Socket.IO.
class DualUpdateLoop {
    constructor(game) {
        this.game = game;
        this.fpsTracker = new FPSTracker();
    }

    start() {
        requestAnimationFrame(timestamp => this.frame(timestamp));
    }

    frame(timestamp) {
        this.fpsTracker.update(timestamp);
        for (const user of this.game.users) {
            user.update(timestamp);
            user.updateMaps(timestamp);
            user.render();
            user.draw(this.fpsTracker.fps);
        }

        requestAnimationFrame(nextTimestamp => this.frame(nextTimestamp));
    }
}

// Temporary in-process driver: this coordinates client presentation and server
// simulation until each side owns its own update transport and scheduler.
const game = new Game();
new DualUpdateLoop(game).start();
