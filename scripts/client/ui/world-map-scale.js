const CHUNK_SIZE = 16;
const FRACTAL_FADE_DISTANCE = 15;

// Track nested local map cubes and their continuous boundary transitions.
export default class WorldMapScale {
    constructor() {
        this.baseExtent = null;
        this.level = 0;
    }

    // Return map extents and camera scale for the active world position.
    getViews(world, playerPosition) {
        if (world.borderDistance !== null) {
            return [{ extent: world.borderDistance, cameraExtent: world.borderDistance, opacity: 1 }];
        }

        const baseExtent = Math.max(1, world.renderDistance * CHUNK_SIZE);
        if (baseExtent !== this.baseExtent) {
            this.baseExtent = baseExtent;
            this.level = 0;
        }

        // Scale the local map from the active player; remote markers never resize it.
        const farthestCoordinate = Math.max(...playerPosition.map(Math.abs));
        const currentExtent = baseExtent * (3 ** this.level);
        if (farthestCoordinate >= currentExtent) {
            this.level++;
            return [{ extent: currentExtent * 3, cameraExtent: currentExtent * 3, opacity: 1 }];
        }

        const fadeStart = Math.max(0, currentExtent - FRACTAL_FADE_DISTANCE);
        if (farthestCoordinate >= fadeStart) {
            const progress = (farthestCoordinate - fadeStart) / (currentExtent - fadeStart);
            const cameraExtent = currentExtent / (1 - (2 / 3) * progress);
            return [
                { extent: currentExtent, cameraExtent, opacity: 1 - progress },
                { extent: currentExtent * 3, cameraExtent, opacity: progress },
            ];
        }

        if (this.level > 0) {
            const smallerExtent = currentExtent / 3;
            const inwardFadeStart = Math.max(0, smallerExtent - FRACTAL_FADE_DISTANCE);
            if (farthestCoordinate <= inwardFadeStart) {
                this.level--;
                return [{ extent: smallerExtent, cameraExtent: smallerExtent, opacity: 1 }];
            }
            if (farthestCoordinate < smallerExtent) {
                const progress = (smallerExtent - farthestCoordinate) / (smallerExtent - inwardFadeStart);
                const cameraExtent = currentExtent / (1 + 2 * progress);
                return [
                    { extent: currentExtent, cameraExtent, opacity: 1 - progress },
                    { extent: smallerExtent, cameraExtent, opacity: progress },
                ];
            }
        }

        return [{ extent: currentExtent, cameraExtent: currentExtent, opacity: 1 }];
    }
}
