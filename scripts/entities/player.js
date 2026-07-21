import physics from '../systems/physics.js';
import { raycast } from '../systems/raycast.js';
import { getBlockMaxHealth } from '../core/block-stats.js';

export default class Player {
    constructor() {
        this.pos = [0, 32, 0];
        this.velocity = [0, 0, 0];
        this.size = { x: 0.6, y: 1.85, z: 0.6 };
        this.head = {
            yaw: 0,
            pitch: 0,
            pos: [0, 100, 0],
        };

        this.type = 'player';
        this.mode = 'survival';

        this.attackReload = 0;
        this.interactReload = 0;

        this.perspectiveMode = 0;

        this.onBlock = false;

        this.reach = 5;
        this.outlinedBlock = null;

        this.selected = 0;
        this.inventory = [
            /*{ type: 'wood', amount: 999 },
            { type: 'grass', amount: 999 },
            { type: 'rock', amount: 999 },
            { type: 'concrete', amount: 999 },
            { type: 'stone', amount: 999 },
            { type: 'red wool', amount: 999 },*/
        ];
    }
    update(inputs, world) {
        this.updateInventory(inputs);
        this.updateControls(inputs);
        this.updateAcceleration(inputs);
        physics.moveEntity(this, world);
        this.checkIfCrossedChunkBoundary(world);

        this.updateBody();
        this.interact(inputs, world);
    };

    respawn() {
        this.pos = this.spawnPos || [0, 100, 0];
        this.inventory = [];
        this.selected = 0;
    };

    updateBody() {
        this.head.pos = [
            this.pos[0],
            this.pos[1] + this.size.y - 0.2,
            this.pos[2],
        ];
    };

    interact(inputs, world) {
        if (this.attackReload > 0) this.attackReload--;
        if (this.interactReload > 0) this.interactReload--;

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
            this.outlinedBlock = {
                pos: hit.position, type: hit.block.type,
                health: getBlockMaxHealth(hit.block.type),
                maxHealth: getBlockMaxHealth(hit.block.type)
            }
        }

        if (inputs.mouse[0] && this.attackReload <= 0) {
            const destroyed = world.breakBlock(hit, this);
            if (destroyed) this.attackReload = 10;
        }
        if (inputs.mouse[2] && this.interactReload <= 0) {
            world.placeBlock(hit, this);
            this.interactReload = 10;
        }
    };

    updateInventory(inputs) {
        const keys = inputs.keys;
        //clear inventory of items with amount <= 0
        this.inventory = this.inventory.filter(item => item.amount > 0);
        for (var n = 1; n < 9; n++) {
            if (keys[n.toString()]) {
                if (this.inventory.length >= n) {
                    this.selected = n - 1;
                } else {
                    this.selected = this.inventory.length - 1; // reset to last item if out of bounds
                }
            }
        }
    };
    updateControls(inputs) {
        const keys = inputs.keys;
        if (keys['r']) {
            //change perspective
            this.perspectiveMode = (this.perspectiveMode + 1) % 3;
            keys['r'] = false;
        }

        //player crouching
        if (keys['shift']) this.size.y = 1.65;
        else this.size.y = 1.85;

        //respawn player
        if (inputs.keys['enter']) {
            this.respawn();
        }
    };
    updateAcceleration(inputs) {
        const keys = inputs.keys;
        let speed =
            keys['shift'] ? 0.0125 :
                keys['q'] ? 0.0325 :
                    0.02;
        if (!this.onBlock) speed *= 0.1;

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

        //jumping / flying / crouching
        if (keys[' ']) {
            if (this.mode == 'creative') {
                accel[1] += speed;
            } else if (this.onBlock) {
                accel[1] += 0.225;
            }
        }
        if (keys['shift']) {
            accel[1] -= speed;
        }

        //make player fall
        if (this.mode !== "creative") {
            const GRAVITY = 0.015;
            this.velocity[1] -= GRAVITY;
        }

        //accelerate player
        this.velocity = this.velocity.map((v, i) => v + accel[i]);
    };

    checkIfCrossedChunkBoundary(world) {
        const CHUNK_SIZE = 16;

        //previous chunk coords
        const prevChunkX = Math.floor((this.pos[0] - this.velocity[0]) / CHUNK_SIZE);
        const prevChunkY = Math.floor((this.pos[1] - this.velocity[1]) / CHUNK_SIZE);
        const prevChunkZ = Math.floor((this.pos[2] - this.velocity[2]) / CHUNK_SIZE);

        //current chunk coords
        const currentChunkX = Math.floor(this.pos[0] / CHUNK_SIZE);
        const currentChunkY = Math.floor(this.pos[1] / CHUNK_SIZE);
        const currentChunkZ = Math.floor(this.pos[2] / CHUNK_SIZE);

        //if crossed chunk boundary, evaluate loaded chunks
        if (prevChunkX !== currentChunkX ||
            prevChunkY !== currentChunkY ||
            prevChunkZ !== currentChunkZ) {
            world.evaluateLoadedChunks(this);
        }
    }
}