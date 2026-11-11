import Entity from './entity.js';
import { getBlockHealth } from '../core/block-stats.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const BOMB_GEOMETRY = createCubeGeometry();
const BOMB_SCALE = [0.35, 0.35, 0.35];

// Server-authoritative projectile that detonates on its first block or entity hit.
export default class Bomb extends Entity {
    constructor(pos, direction, owner = null) {
        super({
            pos,
            scale: BOMB_SCALE,
            geometry: BOMB_GEOMETRY,
            material: { color: [1, 0.35, 0] },
        });
        this.type = 'bomb';
        this.owner = owner;
        this.exploded = false;
        this.BOMB_SPEED = 1;
        this.EXPLOSION_RADIUS = 10;
        this.MAX_EXPLOSION_DAMAGE = 60;
        this.BLAST_KNOCKBACK_STRENGTH = 1;
        this.impactDamageThreshold = Infinity;
        const length = Math.hypot(...direction) || 1;
        this.velocity = direction.map(axis => axis / length * this.BOMB_SPEED);
    }

    update(deltaScale = 1, { world } = {}) {
        if (!world || this.exploded) return;
        super.update(deltaScale, { world });

        if (this.collidedBlock) {
            this.explode(world);
            return;
        }

        for (const entity of world.entities.values()) {
            if (entity === this || entity === this.owner || entity.type === 'bullet' || entity.type === 'bomb') continue;
            if (overlaps(this, entity)) {
                this.explode(world);
                return;
            }
        }
    }

    explode(world) {
        if (this.exploded) return;
        this.exploded = true;
        world.audio?.playWorld('explosion.mp3', this.pos, { volume: 1 });

        const min = this.pos.map(value => Math.floor(value - this.EXPLOSION_RADIUS));
        const max = this.pos.map(value => Math.floor(value + this.EXPLOSION_RADIUS));
        for (let x = min[0]; x <= max[0]; x++) {
            for (let y = min[1]; y <= max[1]; y++) {
                for (let z = min[2]; z <= max[2]; z++) {
                    const blastPower = getBlastPower(
                        x + 0.5 - this.pos[0],
                        y + 0.5 - this.pos[1],
                        z + 0.5 - this.pos[2],
                        this.EXPLOSION_RADIUS,
                    );
                    if (blastPower === 0) continue;

                    const block = world.getBlock(x, y, z);
                    if (block.type !== 'air' && this.MAX_EXPLOSION_DAMAGE * blastPower > getBlockHealth(block.type)) {
                        world.setBlock(x, y, z, { type: 'air' });
                    }
                }
            }
        }

        for (const entity of world.entities.values()) {
            if (entity === this) continue;
            const offset = entity.pos.map((value, axis) => value - this.pos[axis]);
            const blastPower = getBlastPower(...offset, this.EXPLOSION_RADIUS);
            if (blastPower === 0) continue;

            // Apply a radial impulse from the blast center, with a small upward
            // fallback for entities exactly at the center where direction is undefined.
            const distance = Math.hypot(...offset);
            const direction = distance > 0
                ? offset.map(value => value / distance)
                : [0, 1, 0];
            const knockback = this.BLAST_KNOCKBACK_STRENGTH * blastPower;
            entity.velocity = entity.velocity.map((value, axis) => value + direction[axis] * knockback);

            // Players, including the shooter, take blast damage. Projectiles
            // are affected by the impulse but remain intact as projectiles.
            if (entity.type !== 'bullet' && entity.type !== 'bomb') {
                entity.takeDamage(this.MAX_EXPLOSION_DAMAGE * blastPower, this);
            }
        }

        world.entities.remove(this);
    }
}

// Linear falloff: full force at the explosion origin and zero at the outer edge.
function getBlastPower(lx, ly, lz, radius) {
    const distance = Math.hypot(lx, ly, lz);
    return distance >= radius ? 0 : 1 - distance / radius;
}

function overlaps(first, second) {
    return Math.abs(first.pos[0] - second.pos[0]) < (first.size.x + second.size.x) * 0.5 &&
        Math.abs(first.pos[1] - second.pos[1]) < (first.size.y + second.size.y) * 0.5 &&
        Math.abs(first.pos[2] - second.pos[2]) < (first.size.z + second.size.z) * 0.5;
}
