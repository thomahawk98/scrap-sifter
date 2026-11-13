import FPSTracker from './systems/fps-tracker.js';
import AssetLoader from './asset-loader.js';
import Game from './game.js';
import MainMenu from './ui/main-menu.js';
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


// Keep a no-player menu socket for lobby creation before anyone joins a world.
const menuSocket = window.io({ auth: { role: 'menu' } });

// Build a game session only after a lobby is selected and accepted by the server.
new MainMenu(document.getElementById('menu-root'), assetLoader, menuSocket, (lobby, password, menu) => {
    const game = new Game({ assetLoader, lobby, password });
    game.socket.once('session:ready', () => {
        menu.onJoined();
        new ClientUpdateLoop(game).start();
    });
    game.socket.on('connect_error', error => {
        game.socket.disconnect();
        const message = error?.message === 'This lobby is full.'
            ? 'This lobby is full.'
            : lobby.status === 'private'
                ? 'Password incorrect or lobby unavailable.'
                : 'Could not connect to the selected lobby.';
        menu.onError(message);
    });
    game.socket.connect();
});
