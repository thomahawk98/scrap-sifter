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
    hotbar1: '1', hotbar2: '2', hotbar3: '3', hotbar4: '4',
    hotbar5: '5', hotbar6: '6', hotbar7: '7', hotbar8: '8',
    toggleMap: 'm',
};

export const DEFAULT_MOUSE_BINDINGS = { shoot: 0, roll: 1, place: 2, inventoryClick: 0 };

const normalizeKey = key => key.toLowerCase();

export default class InputController {
    // Merge configurable bindings and attach browser input listeners once.
    constructor({
        canvas, player, camera, keyBindings = {}, mouseBindings = {},
        onClearChunks = () => {},
        changeRenderDistance = () => {},
        clampRenderDistance = () => {},
        inspectChunk = () => {},
        inspectChunks = () => {},
        onToggleMap = () => {},
        onToggleMenu = () => this.toggleMenu(),
        isMapPointerOver = () => false,
    }) {
        this.canvas = canvas;
        this.player = player;
        this.camera = camera;

        this.onClearChunks = onClearChunks;
        this.changeRenderDistance = changeRenderDistance;
        this.clampRenderDistance = clampRenderDistance;
        this.inspectChunk = inspectChunk;
        this.inspectChunks = inspectChunks;
        this.onToggleMap = onToggleMap;
        this.onToggleMenu = onToggleMenu;
        this.isMapPointerOver = isMapPointerOver;

        // controls
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
            pressedButtons: [false, false, false, false, false],
            inBox(x, y, width, height) {
                return this.x > x && this.x < x + width && this.y > y && this.y < y + height;
            },
        };
        this.paused = true;

        this.bindEvents();
    }

    // Register pointer, mouse, and keyboard events that feed the action state.
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
        document.addEventListener('mousedown', event => {
            this.mouse.buttons[event.button] = true;
            this.mouse.pressedButtons[event.button] = true;
        });
        document.addEventListener('mouseup', event => { this.mouse.buttons[event.button] = false; });
    }

    // Rotate the view under pointer lock or update the inventory cursor otherwise.
    handleMouseMove(event) {
        if (document.pointerLockElement === this.canvas) {
            this.player.rotateView(event.movementX, event.movementY, this.isMouseDown('roll'));
            return;
        }
        this.mouse.x = event.pageX;
        this.mouse.y = event.pageY;
    }

    // Adjust third-person camera distance while preserving first-person behavior.
    handleWheel(event) {
        if (this.isMapPointerOver(event)) return;
        if (this.player.perspectiveMode === 0) return;
        this.camera.viewDistance = Math.clamp(this.camera.viewDistance + event.deltaY * 0.075, 3, 100);
    }

    // Update held and pressed actions, then apply immediate menu/debug controls.
    handleKeyDown(event) {
        const key = normalizeKey(event.key);
        this.keys[key] = true;
        for (const [action, binding] of Object.entries(this.keyBindings)) {
            if (this.bindingMatches(binding, key)) this.pressedActions[action] = true;
        }

        // FOV and render distance remain keydown-driven, matching the original controls.
        if (this.isDown('fovDown')) this.camera.fov--;
        if (this.isDown('fovUp')) this.camera.fov++;
        if (this.isDown('renderDistanceDown')) this.changeRenderDistance(-1);
        if (this.isDown('renderDistanceUp')) this.changeRenderDistance(1);
        this.clampRenderDistance();

        if (this.consumePress('clearChunks', false)) {
            document.exitPointerLock();
            this.paused = true;
            this.onClearChunks();
        }

        if (this.consumePress('inspectChunk')) {
            this.inspectChunk(this.player.pos);
        }
        if (this.consumePress('inspectChunks')) this.inspectChunks();

        if (this.consumePress('toggleMenu')) this.onToggleMenu();
        if (this.consumePress('toggleMap')) this.onToggleMap();

        if (!this.player.menuOpen) {
            for (let slot = 0; slot < this.player.inventory.WIDTH; slot++) {
                if (this.isDown(`hotbar${slot + 1}`)) this.player.inventory.selectedSlot = slot;
            }
        }
    }

    // Clear held actions and press latches associated with the released key.
    handleKeyUp(event) {
        const key = normalizeKey(event.key);
        this.keys[key] = false;
        for (const [action, binding] of Object.entries(this.keyBindings)) {
            if (this.bindingMatches(binding, key)) this.pressedActions[action] = false;
        }
    }

    // Toggle the inventory panel and pointer-lock state together.
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

    // Check one physical key against a configured binding list.
    bindingMatches(binding, key) {
        return binding.some(candidate => candidate === key);
    }

    // Read a held named action from its configured keyboard bindings.
    isDown(action) {
        return this.keyBindings[action].some(key => this.keys[key] === true);
    }

    // Read a held named action from its configured mouse button.
    isMouseDown(action) {
        return this.mouse.buttons[this.mouseBindings[action]] === true;
    }

    // Consume one mouse press so inventory clicks fire once per button-down.
    consumeMousePress(action) {
        const button = this.mouseBindings[action];
        if (!this.mouse.pressedButtons[button]) return false;
        this.mouse.pressedButtons[button] = false;
        return true;
    }

    // Consume one key action edge and optionally clear its held-key state.
    consumePress(action, clearBoundKeys = true) {
        if (!this.pressedActions[action]) return false;
        this.pressedActions[action] = false;
        if (!clearBoundKeys) return true;
        for (const key of this.keyBindings[action]) this.keys[key] = false;
        return true;
    }

    // send a snapshot of the actions, not the keybindings
    snapshot() {
        const actions = {};
        for (const action of Object.keys(this.keyBindings)) {
            if (action === 'toggleMap') continue;
            actions[action] = !this.paused && this.isDown(action);
            actions[`pressed:${action}`] = !this.paused && !!this.pressedActions[action];
        }
        const snapshot = {
            orientation: [...this.player.orientation],
            actions,
            buttons: this.paused ? [] : [...this.mouse.buttons],
            paused: this.paused,
            menuOpen: this.player.menuOpen,
            inventory: {
                open: this.player.inventory.open,
                selectedSlot: this.player.inventory.selectedSlot,
            },
        };
        this.pressedActions = {};
        return snapshot;
    }
}
