// One binding table maps named actions to physical keys, keeping controls
// configurable without scattering key strings through gameplay code.
export const DEFAULT_KEY_BINDINGS = {
    moveForward: 'w', moveBackward: 's', moveLeft: 'a', moveRight: 'd',
    moveUp: ' ', moveDown: 'shift', fastMove: 'q',
    togglePerspective: 'r', toggleMenu: 'e',
    respawn: 'enter',
    fovDown: 'z', fovUp: 'x',
    renderDistanceDown: '-', renderDistanceUp: '=',
    clearChunks: 'backspace', inspectChunk: ']', inspectChunks: '[',
    quickMove: 'shift',
    hotbar1: '1', hotbar2: '2', hotbar3: '3', hotbar4: '4',
    hotbar5: '5', hotbar6: '6', hotbar7: '7', hotbar8: '8',
};

export const DEFAULT_MOUSE_BINDINGS = { shoot: 0, roll: 1, place: 2, inventoryClick: 0 };

const normalizeKey = key => key.toLowerCase();

export default class InputController {
    constructor({ canvas, player, camera, world, chunkManager, renderer, keyBindings = {}, mouseBindings = {} }) {
        this.canvas = canvas;
        this.player = player;
        this.camera = camera;
        this.world = world;
        this.chunkManager = chunkManager;
        this.renderer = renderer;
        const configuredBindings = { ...DEFAULT_KEY_BINDINGS, ...keyBindings };
        this.keyBindings = Object.fromEntries(Object.entries(configuredBindings).map(([action, binding]) => [
            action,
            (Array.isArray(binding) ? binding : [binding]).map(normalizeKey),
        ]));
        this.mouseBindings = { ...DEFAULT_MOUSE_BINDINGS, ...mouseBindings };
        this.keys = {};
        this.pressedActions = {};
        this.mouse = {
            x: 0,
            y: 0,
            buttons: [false, false, false, false, false],
            inBox(x, y, width, height) {
                return this.x > x && this.x < x + width && this.y > y && this.y < y + height;
            },
        };
        this.paused = true;

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('click', () => {
            if (this.player.menuOpen) return;
            this.canvas.requestPointerLock();
            this.paused = false;
        });

        document.addEventListener('mousemove', event => this.handleMouseMove(event));
        document.addEventListener('wheel', event => this.handleWheel(event));
        document.addEventListener('keydown', event => this.handleKeyDown(event));
        document.addEventListener('keyup', event => this.handleKeyUp(event));
        document.addEventListener('mousedown', event => { this.mouse.buttons[event.button] = true; });
        document.addEventListener('mouseup', event => { this.mouse.buttons[event.button] = false; });
    }

    handleMouseMove(event) {
        if (document.pointerLockElement === this.canvas) {
            this.player.rotateView(event.movementX, event.movementY, this.isMouseDown('roll'));
            return;
        }
        this.mouse.x = event.pageX;
        this.mouse.y = event.pageY;
    }

    handleWheel(event) {
        if (this.player.perspectiveMode === 0) return;
        this.camera.viewDistance = Math.clamp(this.camera.viewDistance + event.deltaY * 0.075, 3, 100);
    }

    handleKeyDown(event) {
        const key = normalizeKey(event.key);
        this.keys[key] = true;
        for (const [action, binding] of Object.entries(this.keyBindings)) {
            if (this.bindingMatches(binding, key)) this.pressedActions[action] = true;
        }

        // FOV and render distance remain keydown-driven, matching the original controls.
        if (this.isDown('fovDown')) this.camera.fov--;
        if (this.isDown('fovUp')) this.camera.fov++;
        if (this.isDown('renderDistanceDown')) this.world.renderDistance--;
        if (this.isDown('renderDistanceUp')) this.world.renderDistance++;
        this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);

        if (this.consumePress('clearChunks', false)) {
            document.exitPointerLock();
            this.paused = true;
            this.chunkManager.clear(this.renderer);
        }

        if (this.consumePress('inspectChunk')) {
            const chunkCoords = this.world.getChunkCoords(...this.player.pos);
            console.log(this.world.getChunk(...chunkCoords));
        }
        if (this.consumePress('inspectChunks')) console.log(this.world.chunks);

        if (this.consumePress('toggleMenu')) this.toggleMenu();

        if (!this.player.menuOpen) {
            for (let slot = 0; slot < this.player.inventory.WIDTH; slot++) {
                if (this.isDown(`hotbar${slot + 1}`)) this.player.inventory.selectedSlot = slot;
            }
        }
    }

    handleKeyUp(event) {
        const key = normalizeKey(event.key);
        this.keys[key] = false;
        for (const [action, binding] of Object.entries(this.keyBindings)) {
            if (this.bindingMatches(binding, key)) this.pressedActions[action] = false;
        }
    }

    toggleMenu() {
        if (this.player.menuOpen) {
            this.player.closeMenu();
            this.canvas.requestPointerLock();
            return;
        }

        this.player.inventory.open = true;
        this.player.menuOpen = true;
        document.exitPointerLock();
    }

    bindingMatches(binding, key) {
        return binding.some(candidate => candidate === key);
    }

    isDown(action) {
        return this.keyBindings[action].some(key => this.keys[key] === true);
    }

    isMouseDown(action) {
        return this.mouse.buttons[this.mouseBindings[action]] === true;
    }

    consumePress(action, clearBoundKeys = true) {
        if (!this.pressedActions[action]) return false;
        this.pressedActions[action] = false;
        if (!clearBoundKeys) return true;
        for (const key of this.keyBindings[action]) this.keys[key] = false;
        return true;
    }
}
