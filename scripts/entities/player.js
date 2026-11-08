import physics from '../systems/physics.js';
import terrain from '../core/terrain.js';
import Inventory from '../ui/inventory.js';
import { raycast } from '../systems/raycast.js';
import { getBlockMaxHealth } from '../core/block-stats.js';

export default class Player {
    constructor(world) {
        this.type = 'player';
        this.mode = 'creative';

        this.pos = [0, 0, 0];
        this.spawnPos = [0, 0, 0];

        this.size = { x: 0.6, y: 1.85, z: 0.6 };
        this.head = {
            yaw: 0,
            pitch: 0,
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
        //make head follow body
        this.head.pos = [
            this.pos[0],
            this.pos[1] + this.size.y - 0.2,
            this.pos[2],
        ];

        this.size.y = this.inputs.keys['shift'] ? 1.5 : 1.8;
    };

    updateVitals() {
        this.vitals.health = Math.max(0, Math.min(this.vitals.health, this.vitals.maxHealth));
        if (this.vitals.health == 0) this.dead = true;
    }

    interact(world, deltaScale = 1) {
        if (this.attackReload > 0) this.attackReload = Math.max(0, this.attackReload - deltaScale);
        if (this.interactReload > 0) this.interactReload = Math.max(0, this.interactReload - deltaScale);

        if (this.inventory.open) return;

        // get the block the player is looking at
        const hit = raycast(this.head.pos, this.head.yaw, this.head.pitch, world, this.reach);
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
        const movementSpeed = keys['shift'] ? 0.0125 : keys['q'] ? 0.0325 : 0.02;

        const surfaceTraction = physics.getSurfaceTraction(this);
        const fluidTraction = physics.getFluidTraction(this);
        const traction = Math.max(surfaceTraction, fluidTraction);

        const speed = movementSpeed * traction;

        const forward = [Math.sin(this.head.yaw), 0, -Math.cos(this.head.yaw)];
        const right = [Math.sin(this.head.yaw - Math.PI / 2), 0, -Math.cos(this.head.yaw - Math.PI / 2)];

        let target = [0, 0, 0];
        var accel = [0, 0, 0];

        if (keys['w']) target = target.map((v, i) => v + forward[i]);
        if (keys['s']) target = target.map((v, i) => v - forward[i]);
        if (keys['a']) target = target.map((v, i) => v + right[i]);
        if (keys['d']) target = target.map((v, i) => v - right[i]);

        // Check if movement is needed in XZ plane
        if (target[0] !== 0 || target[2] !== 0) {
            // Normalize direction in XZ plane
            const length = Math.hypot(target[0], target[2]);
            accel[0] += (target[0] / length) * speed * deltaScale;
            accel[2] += (target[2] / length) * speed * deltaScale;
        }

        // jumping
        if (keys[' '] && this.onBlock) accel[1] += 0.2 * deltaScale;

        // flight
        const flightEnabled = this.mode == 'creative';
        if (flightEnabled) {
            if (keys[' ']) accel[1] += 0.01 * deltaScale;
            if (keys['shift']) accel[1] -= 0.01 * deltaScale;
        }

        //accelerate player
        this.velocity = this.velocity.map((v, i) => v + accel[i]);
    };
}
