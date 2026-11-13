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
        this.lastMouseMoveTimestamp = null;
        this.lastPointerLockChangeTimestamp = null;
        this.pointerLockChangedTo = null;
        this.pointerLockMovementMode = 'unknown';

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
        this.bindEvents();
    }

    // Register pointer, mouse, and keyboard events that feed the action state.
    bindEvents() {
        this.canvas.addEventListener('click', () => {
            if (this.player.menuOpen) return;
            this.requestPointerLock();
        });

        document.addEventListener('mousemove', event => this.handleMouseMove(event));
        document.addEventListener('pointerlockchange', event => {
            this.lastPointerLockChangeTimestamp = event.timeStamp;
            this.pointerLockChangedTo = document.pointerLockElement === this.canvas ? 'locked' : 'unlocked';
        });
        document.addEventListener('wheel', event => this.handleWheel(event));
        document.addEventListener('keydown', event => this.handleKeyDown(event));
        document.addEventListener('keyup', event => this.handleKeyUp(event));
        document.addEventListener('mousedown', event => {
            this.mouse.buttons[event.button] = true;
            this.mouse.pressedButtons[event.button] = true;
        });
        document.addEventListener('mouseup', event => { this.mouse.buttons[event.button] = false; });
    }

    // Prefer raw movement to bypass OS acceleration, then fall back if unsupported.
    requestPointerLock() {
        const useAdjustedFallback = error => {
            this.pointerLockMovementMode = 'adjusted-fallback';
            console.warn('[InputController] unadjusted pointer lock unavailable; using adjusted movement', error);
            try {
                const fallbackRequest = this.canvas.requestPointerLock();
                fallbackRequest?.catch?.(fallbackError => {
                    console.warn('[InputController] pointer lock request failed', fallbackError);
                });
            } catch (fallbackError) {
                console.warn('[InputController] pointer lock request failed', fallbackError);
            }
        };

        try {
            const request = this.canvas.requestPointerLock({ unadjustedMovement: true });
            if (!request || typeof request.then !== 'function') {
                this.pointerLockMovementMode = 'unadjusted-request-unconfirmed';
                console.info('[InputController] requested unadjusted pointer lock; browser confirmation unavailable');
                return;
            }
            request.then(() => {
                this.pointerLockMovementMode = 'unadjusted';
                console.info('[InputController] unadjusted pointer lock active');
            }, useAdjustedFallback);
        } catch (error) {
            useAdjustedFallback(error);
        }
    }

    // Rotate the view under pointer lock or update the inventory cursor otherwise.
    handleMouseMove(event) {
        const pointerLocked = document.pointerLockElement === this.canvas;
        const eventTimestamp = event.timeStamp;
        const distance = Math.hypot(event.movementX, event.movementY);
        const movement = {
            source: pointerLocked ? 'game-look' : 'unlocked-cursor',
            timestamp: performance.now(),
            eventTimestamp,
            timeSincePreviousMouseMove: this.lastMouseMoveTimestamp === null
                ? null : eventTimestamp - this.lastMouseMoveTimestamp,
            timeSincePointerLockChange: this.lastPointerLockChangeTimestamp === null
                ? null : eventTimestamp - this.lastPointerLockChangeTimestamp,
            pointerLockChangedTo: this.pointerLockChangedTo,
            pointerLockMovementMode: this.pointerLockMovementMode,
            movementX: event.movementX,
            movementY: event.movementY,
            distance,
            buttons: event.buttons,
            button: event.button,
            pointerLocked,
            menuOpen: this.player.menuOpen,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            exceedsJumpThreshold: distance > 20,
        };
        this.lastMouseMoveTimestamp = eventTimestamp;
        if (movement.exceedsJumpThreshold) {
            console.warn('[InputController] large mouse movement', movement);
        }

        if (pointerLocked) {
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
            this.requestPointerLock();
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
        const controlsActive = document.pointerLockElement === this.canvas && !this.player.menuOpen;
        const actions = {};
        for (const action of Object.keys(this.keyBindings)) {
            if (action === 'toggleMap') continue;
            actions[action] = controlsActive && this.isDown(action);
            actions[`pressed:${action}`] = controlsActive && !!this.pressedActions[action];
        }
        const snapshot = {
            orientation: [...this.player.orientation],
            actions,
            buttons: controlsActive ? [...this.mouse.buttons] : [],
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
