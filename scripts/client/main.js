import FPSTracker from './systems/fps-tracker.js';
import AssetLoader from './asset-loader.js';
import Game from './game.js';
import './shared/math-patch.js';

// browser entry point; load client assets and start the presentation frame loop.
class ClientUpdateLoop {
    constructor(game) {
        this.game = game;
        this.fpsTracker = new FPSTracker();
    }

    start() {
        requestAnimationFrame(timestamp => this.frame(timestamp));
    }

    frame(timestamp) {
        this.fpsTracker.update(timestamp);

        // tick user
        const user = this.game.user;
        user.update(timestamp);
        user.draw(this.fpsTracker.fps);

        requestAnimationFrame(nextTimestamp => this.frame(nextTimestamp));
    }
}


const assetLoader = new AssetLoader(document.getElementById('hudcanvas'));

// load all assets before starting the game
try {
    await assetLoader.load();
} catch (error) {
    // draw preload failures on the HUD before aborting browser startup
    assetLoader.drawFailure(error.message);
    throw error;
}


// create the game and start the loop
const game = new Game({ assetLoader });
new ClientUpdateLoop(game).start();
