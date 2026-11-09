import Inventory from './inventory.js';
import { raycast } from '../systems/raycast.js';
import { getViewBasis, rotateLocal } from '../systems/view-basis.js';
import Entity from './entity.js';
import Bullet from './bullet.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const PLAYER_GEOMETRY = createCubeGeometry();

export default class Player extends Entity {
    constructor(world) {
        super({ geometry: PLAYER_GEOMETRY, scale: [0.6, 0.6, 0.6], material: { color: [1, 0, 0] } });
        this.type = 'player';

        this.spawnPos = [0, 0, 0];

        this.head = {
            pos: this.spawnPos,
        };

        this.shootReload = 0;
        this.interactReload = 0;
        this.inputs = {
            keys: {},
            mouse: {
                inBox: function () { return false; },
                buttons: [],
            }
        }

        this.perspectiveMode = 0;

        this.reach = 5;
        this.outlinedBlock = null;

        this.inventory = new Inventory('default');
        this.menuOpen = false;

        this.respawn(world);
    }

    update(deltaScale = 1, { inputs, world, updateInventory } = {}) {
        if (!inputs || !world) return;
        this.inputs = inputs;

        //move player
        if (!this.menuOpen) this.updateAcceleration(deltaScale);
        super.update(deltaScale, { world });

        this.updateBody();
        this.interact(world, deltaScale);

        // User supplies the client view update at the same point in the player
        // tick, while inventory data remains owned by the server entity.
        if (updateInventory) updateInventory(deltaScale);

        //change perspective mode
        if (inputs.consumePress ? inputs.consumePress('togglePerspective') : inputs.keys['r']) {
            this.perspectiveMode = (this.perspectiveMode + 1) % 3;
            if (inputs.keys) inputs.keys['r'] = false;
        }

        //respawn player
        if (inputs.isDown ? inputs.isDown('respawn') : inputs.keys['enter']) this.respawn(world);

    };

    respawn(world) {
        this.inventory.items = [];

        this.velocity = [0, 0, 0];
        this.pos = this.spawnPos;
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

    interact(world, deltaScale = 1) {
        if (this.shootReload > 0) this.shootReload = Math.max(0, this.shootReload - deltaScale);
        if (this.interactReload > 0) this.interactReload = Math.max(0, this.interactReload - deltaScale);

        if (this.inventory.open) return;

        if (this.isMouseDown('shoot') && this.shootReload <= 0) {
            this.shootBullet(world);
            this.shootReload = 8;
        }

        // get the block the player is looking at
        const { forward } = getViewBasis(this.orientation);
        const hit = raycast(this.head.pos, forward, world, this.reach);
        if (!hit) {
            this.outlinedBlock = null;
            return false
        }

        // update the outlined block to be the block the player is looking at
        const differentBlock = !this.outlinedBlock ? true : JSON.stringify(this.outlinedBlock.pos) == JSON.stringify(hit.position) ? false : true;
        if (differentBlock) this.outlinedBlock = { pos: hit.position, type: hit.block.type };

        // Right-click keeps block placement; left-click is handled as shooting above.
        if (this.isMouseDown('place') && this.interactReload <= 0) {
            world.placeBlock(hit, this);
            this.interactReload = 8;
        }
    };

    shootBullet(world) {
        const { forward } = getViewBasis(this.orientation);
        world.entities.add(new Bullet([...this.pos], forward));
    }

    isMouseDown(action) {
        if (this.inputs.isMouseDown) return this.inputs.isMouseDown(action);
        const button = action === 'shoot' ? 0 : 2;
        return this.inputs.mouse.buttons[button];
    }

    closeMenu() {
        this.menuOpen = false;
        if (this.inventory.open) this.inventory.open = false;
    }

    updateAcceleration(deltaScale = 1) {
        const keys = this.inputs.keys;
        const isDown = (action, fallback) => this.inputs.isDown
            ? this.inputs.isDown(action)
            : Boolean(keys[fallback]);
        const movementSpeed = isDown('fastMove', 'q') ? 0.0325 : 0.02;

        const speed = movementSpeed * this.getMovementTraction();

        // All movement axes come from the same unrestricted camera frame.
        const { forward, right, up } = getViewBasis(this.orientation);

        let target = [0, 0, 0];
        var accel = [0, 0, 0];

        if (isDown('moveForward', 'w')) target = target.map((v, i) => v + forward[i]);
        if (isDown('moveBackward', 's')) target = target.map((v, i) => v - forward[i]);
        if (isDown('moveLeft', 'a')) target = target.map((v, i) => v - right[i]);
        if (isDown('moveRight', 'd')) target = target.map((v, i) => v + right[i]);
        if (isDown('moveUp', ' ')) {
            target = target.map((v, i) => v + up[i]);
        }
        if (isDown('moveDown', 'shift')) target = target.map((v, i) => v - up[i]);

        // Normalize the complete direction so pitching up or down keeps the
        // same movement speed and works even when looking straight vertically.
        const targetLength = Math.hypot(...target);
        if (targetLength > 0) {
            for (let axis = 0; axis < 3; axis++) {
                accel[axis] += (target[axis] / targetLength) * speed;
            }
        }

        //accelerate player
        this.applyAcceleration(accel, deltaScale);
    };
}
