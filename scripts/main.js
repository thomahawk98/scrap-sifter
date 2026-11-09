// Install the small math helpers used across gameplay systems before startup.
import './systems/math-patch.js';
import Game from './client/game.js';

// Keep the browser entry point intentionally small; composition lives in client/game.js.
// Override named actions here when customizing a project's default controls.
// Example: new Game({ keyBindings: { moveForward: 'i', moveBackward: 'k' } });
const game = new Game();
game.start();
