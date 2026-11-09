import Game from './game.js';

// Keep the browser entry point intentionally small; composition lives in game.js.
// Override named actions here when customizing a project's default controls.
// Example: new Game({ keyBindings: { moveForward: 'i', moveBackward: 'k' } });
const game = new Game();
game.start();
