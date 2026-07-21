import { getBlockFaceColor } from '../core/block-stats.js';
import terrain from '../core/terrain.js';
import biomes from '../core/biomes.js';
class EnvironmentMap {
    constructor(width = 128, height = 128) {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.canvas.width = width;
        this.canvas.height = height;

        this.pixelSize = 1;
    }

    getData() {
        const data = new Map();
        return data;
    }

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

    getDrawCors(key) {
        const cors = key.split(',').map(v => parseInt(v));
        return cors;
    }

    getPixelColor(value) {
        const grayAlpha = `rgba(255, 255, 255, ${Math.clamp(value, 0, 1)})`;
        return grayAlpha;
    }
}

export class BiomeMap extends EnvironmentMap {
    constructor(type, width = 256, height = 256) {
        super(width, height);
        this.type = type;
        this.pixelSize = terrain.biomeResolution;
    }

    getData() {
        const data = terrain[this.type + 'Map'];
        return data;
    }

    getPixelColor(value) {
        const v = Math.clamp(value, 0, 1);
        if (this.type == 'temperature') {
            let r = v * 255;
            let g = (1 - v) * 155;
            let b = (1 - v) * 255;

            if(r > 255) r = 255, g = 0, b = 255;
            if(b > 255) r = 155, g = 255, b = 0;

            //red / blue color
            return `rgb(${r}, ${g}, ${b})`;
        } else if (this.type == 'humidity') {
            const r = v * 255;
            const g = 0;
            const b = v * 100 + 155;

            //blue / green color
            return `rgb(${r}, ${g}, ${b})`;
        } else if (this.type == 'vitality') {
            const r = (1 - v) * 100;
            const g = v * 255;
            const b = 0;

            //green / brown color
            return `rgb(${r}, ${g}, ${b})`;
        } else if (this.type == 'biome') {
            const biome = biomes.getBiomeStats(value);
            const block = biome.layers[0];
            const rgb = getBlockFaceColor(block.type);
            const color = `rgb(${rgb[0] * 255}, ${rgb[1] * 255}, ${rgb[2] * 255})`;
            return color;
        }

        const grayAlpha = `rgba(255, 255, 255, ${Math.clamp(value, 0, 1)})`;
        return grayAlpha;
    }
}

export class ChunkMap extends EnvironmentMap {
    constructor(width = 512, height = 512) {
        super(width, height);
        this.pixelSize = 16; // chunk size, 1 pixel per block
        this.type = 'chunk status';
    }

    getData(world) {
        if (!world) return new Map();

        const data = new Map([
            ...world.chunks,
            ...world.unloadedChunks,
        ])
        return data;
    }

    getDrawCors(key, position) {
        const cy = Math.floor(position[1] / 16);
        const [x, y, z] = key.split(',').map(v => parseInt(v));

        //only draw chunks on same y level as player
        if(y !== cy) return false;
        
        return [x * 16, z * 16];
    }

    getPixelColor(chunk) {
        const alpha = chunk.empty ? 0.25 : 1;
        switch (chunk.state) {
            case 'new':
                return `rgba(100,0,255,${alpha})`;
            case 'data':
                return `rgba(0,100,200,${alpha})`;
            case 'loaded':
                return `rgba(0,255,0,${alpha})`;
            case 'unloaded':
                return `rgba(100,200,0,${alpha})`;
            case 'archived':
                return `rgba(255,125,0,${alpha})`;
            case 'compressed':
                return `rgba(255,0,0,${alpha})`;
            default:
                return `rgba(255,0,255,${alpha})`;
        }
    }
}