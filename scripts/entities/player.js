import physics from '../systems/physics.js';
import terrain from '../core/terrain.js';
import Inventory from '../ui/inventory.js';
import { raycast } from '../systems/raycast.js';
import { getBlockMaxHealth } from '../core/block-stats.js';

export default class Player {
    constructor(world) {
        this.spawnPos = [0, 100, 0];
        this.cx = 0;
        this.cy = 0;
        this.cz = 0;

        this.size = { x: 0.6, y: 1.85, z: 0.6 };
        this.head = {
            yaw: 0,
            pitch: 0,
            pos: this.spawnPos,
        };

        this.type = 'player';
        this.mode = 'creative';

        this.attackReload = 0;
        this.interactReload = 0;
        this.inputs = {
            keys: {},
            mouse: {
                inBox: function () { return false; },
                buttons: [],
            }
        }

        this.perspectiveMode = 0;

        this.onBlock = false;

        this.reach = 5;
        this.outlinedBlock = null;

        this.inventory = new Inventory(this, 'default');
        this.menuOpen = false;

        this.respawn(world);
    }

    update(inputs, world, canvas) {
        this.inputs = inputs;

        if (!this.menuOpen) this.updateAcceleration();
        physics.moveEntity(this, world);

        this.updateBody();
        this.interact(world);
        this.inventory.update(canvas);

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
    };

    interact(world) {
        if (this.attackReload > 0) this.attackReload--;
        if (this.interactReload > 0) this.interactReload--;

        if (!this.inventory.open) {
            const hit = raycast(this.head.pos, this.head.yaw, this.head.pitch, world, this.reach);
            if (!hit) {
                this.outlinedBlock = null;
                return false;
            }

            //check if the player is looking at a different block than before
            let differentBlock = false;
            if (this.outlinedBlock) {
                if (this.outlinedBlock.pos[0] !== hit.position[0] ||
                    this.outlinedBlock.pos[1] !== hit.position[1] ||
                    this.outlinedBlock.pos[2] !== hit.position[2]) {
                    differentBlock = true;
                }
            } else {
                differentBlock = true;
            }

            //update the outlined block to be the block the player is looking at
            if (differentBlock) {
                const health = (this.mode == 'creative' ? 1 : getBlockMaxHealth(hit.block.type));
                this.outlinedBlock = {
                    pos: hit.position, type: hit.block.type,
                    health, maxHealth: health
                }
            }

            if (this.inputs.mouse.buttons[0] && this.attackReload <= 0) {
                const destroyed = world.breakBlock(hit, this);
                if (destroyed) this.attackReload = 10;
            }
            if (this.inputs.mouse.buttons[2] && this.interactReload <= 0) {
                world.placeBlock(hit, this);
                this.interactReload = 8;
            }
        }
    };

    closeMenu() {
        this.menuOpen = false;
        if (this.inventory.open) this.inventory.open = false;
    }

    updateAcceleration() {
        const keys = this.inputs.keys;
        let speed =
            keys['shift'] ? 0.0125 :
                keys['q'] ? 0.0325 :
                    0.02;
        if (!this.onBlock) speed *= 0.1;
        if (this.mode == 'creative') speed = 0.01;

        //handle player movement
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
            //only add motion if less than max speed
            const currentSpeed = Math.distTo(0, 0, this.velocity[0], this.velocity[2]);
            // Normalize direction in XZ plane
            const length = Math.hypot(target[0], target[2]);
            if (currentSpeed < 0.25) {
                accel[0] += (target[0] / length) * speed;
                accel[2] += (target[2] / length) * speed;
            }
        }

        //jumping / flying
        if (keys[' ']) {
            if (this.mode == 'creative') {
                accel[1] += speed;
            } else if (this.onBlock) {
                accel[1] += 0.225;
            }
        }

        //player crouching / falling faster
        if (keys['shift']) {
            accel[1] -= speed;
            this.size.y = 1.65;
        } else {
            this.size.y = 1.85;
        }

        //accelerate player
        this.velocity = this.velocity.map((v, i) => v + accel[i]);
    };

    updateChunkCoords(world) {
        const [cx, cy, cz] = world.getChunkCoords(...this.pos);
        const crossed = (cx !== this.cx || cy !== this.cy || cz !== this.cz);

        this.cx = cx;
        this.cy = cy;
        this.cz = cz;

        return crossed;
    }
}