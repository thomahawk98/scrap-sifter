import Entity from './entity.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const TARGET_SCALE = [0.5, 0.5, 0.5];
const TARGET_HEALTH = 50;
const TARGET_GEOMETRY = createCubeGeometry();

// A simple shooting target that appears on the generated terrain surface.
export default class Target extends Entity {
    constructor(pos) {
        super({
            pos,
            scale: TARGET_SCALE,
            geometry: TARGET_GEOMETRY,
            material: { color: [1, 0, 0] },
        });
        this.type = 'target';
        this.maxHealth = TARGET_HEALTH;
        this.health = TARGET_HEALTH;
        this.removeAfterHit = false;
    }

    static createForChunk(chunk) {
        let surfaceSpot = null;
        let surfaceSpotCount = 0;
        let airSpot = null;
        let airSpotCount = 0;
        const base = [chunk.cx, chunk.cy, chunk.cz].map(value => value * 16);

        // Sample generated voxel data instead of scanning every cell in the
        // chunk, keeping target spawning cheap during large generation batches.
        for (let sample = 0; sample < 256; sample++) {
            const x = Math.floor(Math.random() * 16);
            const y = Math.floor(Math.random() * 16);
            const z = Math.floor(Math.random() * 16);
            // Chunk.getBlock returns null for air and a voxel ID for solids.
            if (chunk.getBlock(x, y, z, false) !== null) continue;

            airSpotCount++;
            if (Math.random() < 1 / airSpotCount) airSpot = [x, y, z];
            if (y > 0 && chunk.getBlock(x, y - 1, z, false) !== null) {
                surfaceSpotCount++;
                if (Math.random() < 1 / surfaceSpotCount) surfaceSpot = [x, y, z];
            }
        }

        if (airSpotCount === 0) return null;
        // Favor terrain surfaces, while occasionally placing a target in open space.
        const useSurface = surfaceSpot && Math.random() < 0.8;
        const localPos = useSurface ? surfaceSpot : airSpot;
        const pos = localPos.map((value, axis) => base[axis] + value + 0.5);
        // Surface targets sit on the lower voxel face; open-space targets stay centered.
        if (useSurface) pos[1] -= 0.25;
        return new Target(pos);
    }

    die() {
        this.removeAfterHit = true;
    }

    update(deltaScale = 1, { world } = {}) {
        if (this.removeAfterHit) {
            world?.entities.remove(this);
            return;
        }
        super.update(deltaScale, { world });
    }
}
