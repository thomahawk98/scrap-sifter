import { getViewBasis } from '../shared/view-basis.js';

const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 32;
const TILE_WIDTH = 256;
const TILE_HEIGHT = 32;
const MAX_NAMETAGS = ATLAS_COLUMNS * ATLAS_ROWS;
const TAG_HEIGHT = 0.375;

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec2 textureUV;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vTextureUV;
void main() {
    vTextureUV = textureUV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uNametagAtlas;
varying vec2 vTextureUV;
void main() {
    gl_FragColor = texture2D(uNametagAtlas, vTextureUV);
}`;

// Text is rasterized once into a small atlas, then each name is a camera-facing
// world-space quad. This keeps labels subject to perspective without HUD projection.
export default class NametagRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        this.positionAttribute = gl.getAttribLocation(this.program, 'position');
        this.uvAttribute = gl.getAttribLocation(this.program, 'textureUV');
        this.viewUniform = gl.getUniformLocation(this.program, 'modelViewMatrix');
        this.projectionUniform = gl.getUniformLocation(this.program, 'projectionMatrix');
        this.samplerUniform = gl.getUniformLocation(this.program, 'uNametagAtlas');
        this.vertexBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();

        this.canvas = document.createElement('canvas');
        this.canvas.width = ATLAS_COLUMNS * TILE_WIDTH;
        this.canvas.height = ATLAS_ROWS * TILE_HEIGHT;
        this.context = this.canvas.getContext('2d');
        this.labels = new Map();
        this.freeSlots = Array.from({ length: MAX_NAMETAGS }, (_, index) => MAX_NAMETAGS - index - 1);
        this.atlasDirty = false;

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    render(entities, localPlayer, camera, view, projection, maxDistance) {
        const maxDistanceSquared = maxDistance * maxDistance;
        const visible = [];
        const activeIds = new Set();
        const cameraRightUp = getViewBasis(camera.orientation);

        for (const entity of entities) {
            if (entity.type !== 'player' || !entity.visible || !entity.name) continue;
            if (entity.id === localPlayer.id && localPlayer.perspectiveMode === 0) continue;

            const dx = entity.pos[0] - localPlayer.pos[0];
            const dy = entity.pos[1] - localPlayer.pos[1];
            const dz = entity.pos[2] - localPlayer.pos[2];
            const distanceSquared = dx * dx + dy * dy + dz * dz;
            if (distanceSquared > maxDistanceSquared) continue;

            const label = this.getLabel(entity.id, entity.name);
            if (!label) continue;
            activeIds.add(entity.id);
            visible.push({ entity, label, distanceSquared });
        }

        this.releaseInactiveLabels(activeIds);
        if (this.atlasDirty) this.uploadAtlas();
        if (!visible.length) return;

        // With block depth testing disabled so labels show through terrain, draw
        // far-to-near so a nearer player's label wins when two labels overlap.
        visible.sort((a, b) => b.distanceSquared - a.distanceSquared);
        const vertices = [];
        const indices = [];
        for (const entry of visible) {
            this.appendBillboard(vertices, indices, entry.entity, entry.label, cameraRightUp);
        }

        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.viewUniform, false, view);
        gl.uniformMatrix4fv(this.projectionUniform, false, projection);
        gl.uniform1i(this.samplerUniform, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);
        const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(this.positionAttribute);
        gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.uvAttribute);
        gl.vertexAttribPointer(this.uvAttribute, 2, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        // Draw after opaque world geometry, with alpha for the label card and glyphs.
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
    }

    getLabel(id, name) {
        let label = this.labels.get(id);
        if (label?.name === name) return label;
        if (!label) {
            const slot = this.freeSlots.pop();
            if (slot === undefined) return null;
            label = { slot, name: null, width: 0 };
            this.labels.set(id, label);
        }

        const column = label.slot % ATLAS_COLUMNS;
        const row = Math.floor(label.slot / ATLAS_COLUMNS);
        const x = column * TILE_WIDTH;
        const y = row * TILE_HEIGHT;
        const ctx = this.context;
        ctx.clearRect(x, y, TILE_WIDTH, TILE_HEIGHT);
        ctx.font = 'bold 16px Tahoma';
        const textWidth = Math.min(TILE_WIDTH - 16, ctx.measureText(name).width);
        label.width = Math.ceil(textWidth + 16);
        label.name = name;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x, y + 2, label.width, TILE_HEIGHT - 4, 5);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x + label.width * 0.5, y + TILE_HEIGHT * 0.5, TILE_WIDTH - 16);
        this.atlasDirty = true;
        return label;
    }

    releaseInactiveLabels(activeIds) {
        for (const [id, label] of this.labels) {
            if (activeIds.has(id)) continue;
            const column = label.slot % ATLAS_COLUMNS;
            const row = Math.floor(label.slot / ATLAS_COLUMNS);
            this.context.clearRect(column * TILE_WIDTH, row * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
            this.labels.delete(id);
            this.freeSlots.push(label.slot);
            this.atlasDirty = true;
        }
    }

    uploadAtlas() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
        this.atlasDirty = false;
    }

    appendBillboard(vertices, indices, entity, label, basis) {
        const { right, up } = basis;
        const height = TAG_HEIGHT;
        const width = height * label.width / TILE_HEIGHT;
        // Keep the label 0.75 world units above the player's position.
        const above = 0.75;
        const center = [
            entity.pos[0] + up[0] * above,
            entity.pos[1] + up[1] * above,
            entity.pos[2] + up[2] * above,
        ];
        const corners = [
            [-1, -1], [1, -1], [1, 1], [-1, 1],
        ];
        const column = label.slot % ATLAS_COLUMNS;
        const row = Math.floor(label.slot / ATLAS_COLUMNS);
        const u0 = (column * TILE_WIDTH + 0.5) / this.canvas.width;
        const u1 = (column * TILE_WIDTH + label.width - 0.5) / this.canvas.width;
        const vTop = 1 - (row * TILE_HEIGHT + 0.5) / this.canvas.height;
        const vBottom = 1 - ((row + 1) * TILE_HEIGHT - 0.5) / this.canvas.height;
        const uvs = [[u0, vBottom], [u1, vBottom], [u1, vTop], [u0, vTop]];
        const firstVertex = vertices.length / 5;

        for (let i = 0; i < corners.length; i++) {
            const [horizontal, vertical] = corners[i];
            vertices.push(
                center[0] + right[0] * horizontal * width * 0.5 + up[0] * vertical * height * 0.5,
                center[1] + right[1] * horizontal * width * 0.5 + up[1] * vertical * height * 0.5,
                center[2] + right[2] * horizontal * width * 0.5 + up[2] * vertical * height * 0.5,
                uvs[i][0], uvs[i][1],
            );
        }
        indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
    }
}

function createProgram(gl, vertexSource, fragmentSource) {
    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Nametag shader compilation failed: ${message}`);
        }
        return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Nametag shader link failed: ${message}`);
    }
    return program;
}
