import Entity from '../../server/entities/entity.js';
import { createCubeGeometry } from '../../server/core/entity-geometry.js';

// Retains the moving cube that was previously created during main.js startup.
export function createTestEntity() {
    const entity = new Entity({
        geometry: createCubeGeometry([0, 0, 0]),
        scale: [0.6, 0.6, 0.6],
        material: { color: [0, 0, 0] },
    });
    entity.velocity = [0.5, 0, 0];
    return entity;
}
