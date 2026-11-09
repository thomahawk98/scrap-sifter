import Entity from './entity.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const BULLET_GEOMETRY = createCubeGeometry();
const BULLET_SCALE = [0.25, 0.25, 0.25];

export default class Bullet extends Entity {
    constructor(pos, direction) {
        super({
            pos,
            scale: BULLET_SCALE,
            geometry: BULLET_GEOMETRY,
            material: { color: [0, 0, 0] },
        });
        this.type = 'bullet';
        const length = Math.hypot(...direction) || 1;
        this.velocity = direction.map(axis => axis / length * 0.5);
    }

    update(deltaScale = 1, { world } = {}) {
        super.update(deltaScale, { world });
        if (!world || !this.collidedBlock) return;

        // The shared physics step reports the solid block that stopped this bullet.
        world.setBlock(...this.collidedBlock.pos, { type: 'air' });
        world.entities.remove(this);
    }
}
