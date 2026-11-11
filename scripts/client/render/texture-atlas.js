import { getBlockTypeCount, getBlockTypeIndex } from '../shared/block-registry.js';

const ASSET_ROOT = '/scripts/client/assets/textures/';
const TILE_SIZE = 32;
const ATLAS_COLUMNS = 16;
const MAX_ENTITY_TEXTURES = 64;
const ENTITY_TYPES = ['player', 'target', 'bullet', 'bomb'];

// Face order is +Z, -Z, +Y, -Y, +X, -X throughout the mesh and atlas code.
const FACE_CELLS = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

// One shared texture keeps all block and entity draws on the same WebGL binding.
export default class TextureAtlas {
    constructor(gl) {
        this.gl = gl;
        this.blockSlotCount = getBlockTypeCount();
        this.entitySlots = new Map();
        this.imagePromises = new Map();
        this.loadedAssets = new Set();
        this.atlasColumns = ATLAS_COLUMNS;
        const totalTiles = (this.blockSlotCount + MAX_ENTITY_TEXTURES) * 6;
        this.atlasRows = Math.ceil(totalTiles / this.atlasColumns);
        this.blockTexturesEnabled = true;
        this.entityTexturesEnabled = true;
        this.smoothingEnabled = false;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.atlasColumns * TILE_SIZE;
        this.canvas.height = this.atlasRows * TILE_SIZE;
        this.context = this.canvas.getContext('2d', { alpha: true });
        // Keep any resize into the fixed atlas tiles pixel-sharp as well as the
        // final WebGL sampling; Canvas smoothing is enabled by default.
        this.context.imageSmoothingEnabled = false;
        // Transparent white cells tell the shader to keep its solid-color fallback.
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.texture = gl.createTexture();
        this.upload();

        for (const type of ENTITY_TYPES) this.getEntityTextureBase(type);
    }

    getBlockTextureBase(type) {
        const index = getBlockTypeIndex(type);
        return index < 0 ? -1 : index * 6;
    }

    getEntityTextureBase(type) {
        let slot = this.entitySlots.get(type);
        if (slot === undefined) {
            slot = this.entitySlots.size;
            if (slot >= MAX_ENTITY_TEXTURES) return -1;
            this.entitySlots.set(type, slot);
            this.loadObjectTexture(`${type}-entity`, (this.blockSlotCount + slot) * 6);
        }
        return (this.blockSlotCount + slot) * 6;
    }

    ensureBlockTexture(type) {
        const base = this.getBlockTextureBase(type);
        if (base < 0 || this.loadedAssets.has(`block:${type}`)) return;
        this.loadedAssets.add(`block:${type}`);
        this.loadObjectTexture(`${type}-block`, base);
    }

    bind() {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    setSmoothingEnabled(enabled) {
        this.smoothingEnabled = Boolean(enabled);
        this.applyFiltering();
    }

    getObjectImage(assetName) {
        if (!this.imagePromises.has(assetName)) {
            this.imagePromises.set(assetName, this.fetchImage(assetName));
        }
        return this.imagePromises.get(assetName);
    }

    async loadObjectTexture(assetName, firstTile) {
        const image = await this.getObjectImage(assetName);
        if (!image) return;
        if (image.width % 3 !== 0 || image.height % 2 !== 0 || image.width / 3 !== image.height / 2) {
            console.warn(`Texture ${assetName} must be a 3 by 2 sheet of square faces.`);
            return;
        }

        const sourceFaceSize = image.width / 3;
        for (let face = 0; face < 6; face++) {
            const [column, row] = FACE_CELLS[face];
            const tile = firstTile + face;
            const [atlasX, atlasY] = this.getTileOrigin(tile);
            this.context.drawImage(
                image,
                column * sourceFaceSize, row * sourceFaceSize,
                sourceFaceSize, sourceFaceSize,
                atlasX, atlasY, TILE_SIZE, TILE_SIZE,
            );
            const facePixels = this.context.getImageData(atlasX, atlasY, TILE_SIZE, TILE_SIZE);
            for (let alpha = 3; alpha < facePixels.data.length; alpha += 4) facePixels.data[alpha] = 255;
            this.context.putImageData(facePixels, atlasX, atlasY);
        }
        this.upload();
    }

    async fetchImage(assetName) {
        try {
            const response = await fetch(`${ASSET_ROOT}${encodeURIComponent(`${assetName}.png`)}`);
            if (!response.ok) return null;
            return await createImageBitmap(await response.blob());
        } catch (error) {
            // Missing optional assets are a normal fallback case; keep rendering
            // the existing solid-color material without producing console noise.
            return null;
        }
    }

    getTileOrigin(tile) {
        return [
            (tile % this.atlasColumns) * TILE_SIZE,
            Math.floor(tile / this.atlasColumns) * TILE_SIZE,
        ];
    }

    upload() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // Canvas rows start at the top; flip during upload so face UV (0, 0)
        // addresses the bottom-left of each image cell as expected by WebGL.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
        this.applyFiltering();
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    applyFiltering() {
        const gl = this.gl;
        const filter = this.smoothingEnabled ? gl.LINEAR : gl.NEAREST;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
}

export { TILE_SIZE };
