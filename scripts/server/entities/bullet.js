import Entity from './entity.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const BULLET_GEOMETRY = createCubeGeometry();
const BULLET_SCALE = [0.25, 0.25, 0.25];
const BULLET_DAMAGE = 25;

export default class Bullet extends Entity {
    constructor(pos, direction, owner = null) {
        super({
            pos,
            scale: BULLET_SCALE,
            geometry: BULLET_GEOMETRY,
            material: { color: [0, 0, 0] },
        });
        this.type = 'bullet';
        this.owner = owner;
        this.damage = BULLET_DAMAGE;
        const length = Math.hypot(...direction) || 1;
        const speed = 1;
        this.velocity = direction.map(axis => axis / length * speed);
    }

    update(deltaScale = 1, { world } = {}) {
        super.update(deltaScale, { world });
        if (!world) return;

        // Block hits keep their existing behavior and take priority over entities.
        if (this.collidedBlock) {
            world.setBlock(...this.collidedBlock.pos, { type: 'air' });
            world.entities.remove(this);
            return;
        }

        // EntityManager includes this bullet in its update snapshot, so skip it
        // explicitly and only damage the first overlapping non-bullet entity.
        for (const target of world.entities.values()) {
            if (target === this || target === this.owner || target.type === 'bullet' || !overlaps(this, target)) continue;
            target.takeDamage(this.damage, this);
            world.entities.remove(this);
            return;
        }
    }
}

function overlaps(first, second) {
    return Math.abs(first.pos[0] - second.pos[0]) < (first.size.x + second.size.x) * 0.5 &&
        Math.abs(first.pos[1] - second.pos[1]) < (first.size.y + second.size.y) * 0.5 &&
        Math.abs(first.pos[2] - second.pos[2]) < (first.size.z + second.size.z) * 0.5;
}
