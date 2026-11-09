import physics from '../systems/physics.js';
import terrain from '../core/terrain.js';
import Inventory from '../ui/inventory.js';
import { raycast } from '../systems/raycast.js';
import { getBlockMaxHealth } from '../core/block-stats.js';
import { getViewBasis, rotateLocal } from '../systems/view-basis.js';

export default class Player {
    constructor(world) {
        this.type = 'player';
        this.mode = 'creative';

        this.pos = [0, 0, 0];
        this.spawnPos = [0, 0, 0];

        this.size = { x: 0.6, y: 0.6, z: 0.6 };
        this.orientation = [1, 0, 0, 0];
        this.head = {
            pos: this.spawnPos,
        };

        this.attackReload = 0;
        this.interactReload = 0;
        this.inputs = {
            keys: {},
            mouse: {
                inBox: function () { return false; },
                buttons: [],
            }
        }

        this.dead = false;
        this.vitals = {
            health: 100, maxHealth: 100,
        }

        this.perspectiveMode = 0;

        this.onBlock = false;

        this.reach = 5;
        this.outlinedBlock = null;

        this.inventory = new Inventory(this, 'default');
        this.menuOpen = false;

        this.respawn(world);
    }

    update(inputs, world, canvas, deltaScale = 1) {
        this.inputs = inputs;

        //move player
        if (!this.menuOpen && !this.dead) this.updateAcceleration(deltaScale);
        physics.moveEntity(this, world, deltaScale);

        if (!this.dead) {
            this.updateBody();
            this.interact(world, deltaScale);
            this.updateVitals();
        }

        this.inventory.update(canvas, deltaScale);

        const keys = inputs.keys;

        //change perspective mode
        if (keys['r']) {
            this.perspectiveMode = (this.perspectiveMode + 1) % 3;
            keys['r'] = false;
        }

        //respawn player
        if (keys['enter']) this.respawn(world);

        //change mode
        if (keys['\u{005c}']) {
            const modes = ['survival', 'creative'];
            const index = modes.indexOf(this.mode);
            const newIndex = (index + 1) % modes.length;
            this.mode = modes[newIndex];
            keys['\u{005c}'] = false;
        }
    };

    respawn(world, matchTerrainHeight = true) {
        this.inventory.items = [];

        this.velocity = [0, 0, 0];
        this.pos = this.spawnPos;

        this.dead = false;
        this.vitals.health = this.vitals.maxHealth;

        if (matchTerrainHeight) {
            const height = terrain.getHeightAt(this.pos[0], this.pos[2], world.seed);
            this.pos[1] = height + 2;
        }
    };

    updateBody() {
        // Player position is the center of the cube and the camera origin.
        this.head.pos = [...this.pos];
    };

    rotateView(mouseX, mouseY, roll = false) {
        const sensitivity = 0.002;
        const horizontalAxis = roll ? [0, 0, -1] : [0, 1, 0];
        const horizontalAngle = roll ? mouseX * sensitivity : -mouseX * sensitivity;
        this.orientation = rotateLocal(this.orientation, horizontalAxis, horizontalAngle);
        this.orientation = rotateLocal(this.orientation, [1, 0, 0], -mouseY * sensitivity);
    }

    updateVitals() {
        this.vitals.health = Math.max(0, Math.min(this.vitals.health, this.vitals.maxHealth));
        if (this.vitals.health == 0) this.dead = true;
    }

    interact(world, deltaScale = 1) {
        if (this.attackReload > 0) this.attackReload = Math.max(0, this.attackReload - deltaScale);
        if (this.interactReload > 0) this.interactReload = Math.max(0, this.interactReload - deltaScale);

        if (this.inventory.open) return;

        // get the block the player is looking at
        const { forward } = getViewBasis(this.orientation);
        const hit = raycast(this.head.pos, forward, world, this.reach);
        if (!hit) {
            this.outlinedBlock = null;
            return false
        }

        // update the outlined block to be the block the player is looking at
        const differentBlock = !this.outlinedBlock ? true : JSON.stringify(this.outlinedBlock.pos) == JSON.stringify(hit.position) ? false : true;
        if (differentBlock) {
            const health = this.mode == 'creative' ? 1 : getBlockMaxHealth(hit.block.type);
            this.outlinedBlock = {
                pos: hit.position, type: hit.block.type,
                health, maxHealth: health
            }
        }

        //interact with the world
        if (this.inputs.mouse.buttons[0] && this.attackReload <= 0) {
            const destroyed = world.breakBlock(hit, this, deltaScale);
            if (destroyed) this.attackReload = 10;
        }
        if (this.inputs.mouse.buttons[2] && this.interactReload <= 0) {
            world.placeBlock(hit, this);
            this.interactReload = 8;
        }
    };

    closeMenu() {
        this.menuOpen = false;
        if (this.inventory.open) this.inventory.open = false;
    }

    updateAcceleration(deltaScale = 1) {
        const keys = this.inputs.keys;
        const movementSpeed = keys['q'] ? 0.0325 : 0.02;

        const surfaceTraction = physics.getSurfaceTraction(this);
        const fluidTraction = physics.getFluidTraction(this);
        const traction = Math.max(surfaceTraction, fluidTraction);

        const speed = movementSpeed * traction;

        // All movement axes come from the same unrestricted camera frame.
        const { forward, right, up } = getViewBasis(this.orientation);

        let target = [0, 0, 0];
        var accel = [0, 0, 0];

        if (keys['w']) target = target.map((v, i) => v + forward[i]);
        if (keys['s']) target = target.map((v, i) => v - forward[i]);
        if (keys['a']) target = target.map((v, i) => v - right[i]);
        if (keys['d']) target = target.map((v, i) => v + right[i]);
        const jumping = keys[' '] && this.mode !== 'creative' && this.onBlock;
        if (keys[' '] && this.mode === 'creative') {
            target = target.map((v, i) => v + up[i]);
        }
        if (keys['shift']) target = target.map((v, i) => v - up[i]);

        // Normalize the complete direction so pitching up or down keeps the
        // same movement speed and works even when looking straight vertically.
        const targetLength = Math.hypot(...target);
        if (targetLength > 0) {
            for (let axis = 0; axis < 3; axis++) {
                accel[axis] += (target[axis] / targetLength) * speed * deltaScale;
            }
        }

        // Jump impulse remains strong enough to clear blocks, but follows local
        // up; the normalized movement vector keeps diagonal input from boosting speed.
        if (jumping) {
            for (let axis = 0; axis < 3; axis++) this.velocity[axis] += up[axis] * 0.2 * deltaScale;
        }

        //accelerate player
        this.velocity = this.velocity.map((v, i) => v + accel[i]);
    };
}
