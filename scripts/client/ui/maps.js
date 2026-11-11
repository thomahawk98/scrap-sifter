const CHUNK_MAP_STATUSES = {
    generating: { color: [168, 85, 247], label: 'Generating data' },
    missing: { color: [110, 116, 128], label: 'No block data' },
    meshPending: { color: [56, 189, 248], label: 'Active, mesh pending' },
    meshReady: { color: [34, 197, 94], label: 'Active, mesh ready' },
    cached: { color: [245, 158, 11], label: 'Cached data' },
};

// Render coordinate-keyed world data into a centered canvas map.
class EnvironmentMap {
    // Allocate the map's offscreen canvas and base pixel scale.
    constructor(width = 128, height = 128) {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.canvas.width = width;
        this.canvas.height = height;

        this.pixelSize = 1;
    }

    // Provide an empty dataset for map variants without a world source.
    getData() {
        const data = new Map();
        return data;
    }

    // Clear, center, and redraw the map around the player's current position.
    uploadData(position, world) {
        const data = this.getData(world);
        if (!data) return;

        //start with an empty black map
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        //translate to the position of the mapwriter
        this.ctx.save();
        this.ctx.translate(this.canvas.width * 0.5, this.canvas.height * 0.5);
        this.ctx.translate(-position[0], -position[2]);

        this.writeData(data, position);

        this.ctx.restore();
    }

    // Draw only map cells visible on the canvas using variant-specific coordinates.
    writeData(dataMap, position) {
        //draw each pixel
        for (const [key, value] of dataMap.entries()) {
            const cors = this.getDrawCors(key, position);
            if(!cors) continue;

            const [x, z] = cors;

            //don't draw the pixel if it is offscreen
            if (Math.abs(x - position[0]) >= this.canvas.width * 0.5 + this.pixelSize) continue;
            if (Math.abs(z - position[2]) >= this.canvas.height * 0.5 + this.pixelSize) continue;

            //determine color
            var color = this.getPixelColor(value);

            //draw pixel
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, z, this.pixelSize, this.pixelSize);
        }
    }

    // Convert a comma-separated coordinate key to numeric map coordinates.
    getDrawCors(key) {
        const cors = key.split(',').map(v => parseInt(v));
        return cors;
    }

    // Render the base map value as a white pixel with value-based alpha.
    getPixelColor(value) {
        const grayAlpha = `rgba(255, 255, 255, ${Math.clamp(value, 0, 1)})`;
        return grayAlpha;
    }
}

export class ChunkMap extends EnvironmentMap {
    // Configure a chunk-sized cell and the visible chunk-status layer.
    constructor(width = 512, height = 512) {
        super(width, height);
        this.pixelSize = 16; // chunk size, 1 pixel per block
        this.type = 'chunk status';
        this.isChunkMap = true;
    }

    // Refresh the map pixels and overlay the status legend.
    uploadData(position, world) {
        super.uploadData(position, world);
        this.drawLegend();
    }

    // Use the client chunk map as the status map's data source.
    getData(world) {
        if (!world) return new Map();
        return world.chunks;
    }

    // Convert a chunk key to map position only on the player's current height layer.
    getDrawCors(key, position) {
        const cy = Math.floor(position[1] / 16);
        const [x, y, z] = key.split(',').map(v => parseInt(v));

        //only draw chunks on same y level as player
        if(y !== cy) return false;

        return [x * 16, z * 16];
    }

    // Map a chunk lifecycle state to its legend color and transparency.
    getPixelColor(chunk) {
        const status = this.getChunkStatus(chunk);
        const [r, g, b] = status.color;
        const alpha = chunk.empty ? 0.35 : 1;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Prioritize the most useful state for display in the chunk pipeline map.
    getChunkStatus(chunk) {
        // Show the furthest useful pipeline milestone while keeping data
        // readiness, mesh readiness, and residency visibly distinct.
        if (chunk.dataStatus === 'generating') return CHUNK_MAP_STATUSES.generating;
        if (chunk.dataStatus !== 'ready') return CHUNK_MAP_STATUSES.missing;
        if (chunk.residency !== 'active') return CHUNK_MAP_STATUSES.cached;
        if (chunk.meshStatus === 'ready') return CHUNK_MAP_STATUSES.meshReady;
        return CHUNK_MAP_STATUSES.meshPending;
    }

    // Draw the status key over the chunk grid for quick pipeline inspection.
    drawLegend() {
        const ctx = this.ctx;
        const entries = Object.values(CHUNK_MAP_STATUSES);
        const panel = { x: 8, y: 8, width: 272, height: 190 };

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
        ctx.font = 'bold 22px Tahoma';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.fillText('Chunk pipeline', panel.x + 12, panel.y + 19);

        entries.forEach((entry, index) => {
            const y = panel.y + 48 + index * 27;
            ctx.fillStyle = `rgb(${entry.color.join(',')})`;
            ctx.fillRect(panel.x + 12, y - 8, 16, 16);
            ctx.fillStyle = 'white';
            ctx.fillText(entry.label, panel.x + 38, y);
        });
        ctx.restore();
    }
}
