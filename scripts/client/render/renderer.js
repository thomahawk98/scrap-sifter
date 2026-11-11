// src/render/Renderer.js
import * as shaders from './shaders.js';
import EntityRenderer from './entity-renderer.js';
import ParticleRenderer from './particle-renderer.js';
import NametagRenderer from './nametag-renderer.js';
import TextureAtlas from './texture-atlas.js';

function getOutlineVertices(x, y, z) {
    const corners = [
        [x, y, z],
        [x + 1, y, z],
        [x + 1, y, z + 1],
        [x, y, z + 1],
        [x, y + 1, z],
        [x + 1, y + 1, z],
        [x + 1, y + 1, z + 1],
        [x, y + 1, z + 1]
    ];

    // Each edge is a pair of corner indices
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
        [4, 5], [5, 6], [6, 7], [7, 4], // top face
        [0, 4], [1, 5], [2, 6], [3, 7]  // vertical edges
    ];

    let vertices = [];
    for (const [a, b] of edges) {
        vertices.push(...corners[a], ...corners[b]);
    }

    return new Float32Array(vertices);
}

export default class Renderer {
    constructor(canvas, assetLoader = null) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        if (!this.gl) throw new Error("WebGL not supported!");

        // Chunk buffers are renderer-owned and keyed by chunk coordinates.
        this.outlineBuffer = this.gl.createBuffer();
        this.chunkBuffers = new Map();
        this.textureAtlas = new TextureAtlas(this.gl, assetLoader);
        this.init();
        this.nametagRenderer = new NametagRenderer(this.gl);
        this.resize();
    }

    // WebGL keeps the old viewport after canvas attributes change unless it is
    // explicitly reset to the new drawing buffer dimensions.
    resize() {
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }

    init() {
        const gl = this.gl;

        // Compile shaders
        this.worldProgram = this.createProgram(shaders.worldVS, shaders.worldFS);
        this.outlineProgram = this.createProgram(shaders.outlineVS, shaders.outlineFS);

        // Get attribute/uniform locations for world program
        this.worldAttribs = {
            position: gl.getAttribLocation(this.worldProgram, 'position'),
            normal: gl.getAttribLocation(this.worldProgram, 'normal'),
            color: gl.getAttribLocation(this.worldProgram, 'color'),
            textureUV: gl.getAttribLocation(this.worldProgram, 'textureUV'),
            textureIndex: gl.getAttribLocation(this.worldProgram, 'textureIndex'),
            shade: gl.getAttribLocation(this.worldProgram, 'shade'),
        };
        this.worldUniforms = {
            modelViewMatrix: gl.getUniformLocation(this.worldProgram, 'modelViewMatrix'),
            projectionMatrix: gl.getUniformLocation(this.worldProgram, 'projectionMatrix'),
            materialColor: gl.getUniformLocation(this.worldProgram, 'uMaterialColor'),
            textureSampler: gl.getUniformLocation(this.worldProgram, 'uTextureAtlas'),
            textureGrid: gl.getUniformLocation(this.worldProgram, 'uTextureGrid'),
            texturesEnabled: gl.getUniformLocation(this.worldProgram, 'uTexturesEnabled'),
            textureTileSize: gl.getUniformLocation(this.worldProgram, 'uTextureTileSize'),
            textureBase: gl.getUniformLocation(this.worldProgram, 'uTextureBase'),

            uChunkFade: gl.getUniformLocation(this.worldProgram, 'uChunkFade'),

            uDaylight: gl.getUniformLocation(this.worldProgram, 'uDaylight'),
            uSkyColor: gl.getUniformLocation(this.worldProgram, 'uSkyColor'),
            uSkyFadeStart: gl.getUniformLocation(this.worldProgram, 'uSkyFadeStart'),
            uSkyFadeEnd: gl.getUniformLocation(this.worldProgram, 'uSkyFadeEnd'),

            uFogColor: gl.getUniformLocation(this.worldProgram, 'uFogColor'),
            uFogFadeStart: gl.getUniformLocation(this.worldProgram, 'uFogFadeStart'),
            uFogFadeEnd: gl.getUniformLocation(this.worldProgram, 'uFogFadeEnd'),
        };
        this.entityRenderer = new EntityRenderer(
            gl,
            this.worldProgram,
            this.worldAttribs,
            {
                modelViewMatrix: this.worldUniforms.modelViewMatrix,
                projectionMatrix: this.worldUniforms.projectionMatrix,
                chunkFade: this.worldUniforms.uChunkFade,
                materialColor: this.worldUniforms.materialColor,
                textureBase: this.worldUniforms.textureBase,
                texturesEnabled: this.worldUniforms.texturesEnabled,
                textureAtlas: this.textureAtlas,
            },
        );
        this.particleRenderer = new ParticleRenderer(gl);

        // Get attribute / uniform locations for outline program
        this.outlineAttribs = {
            position: gl.getAttribLocation(this.outlineProgram, 'position'),
        };
        this.outlineUniforms = {
            modelViewMatrix: gl.getUniformLocation(this.outlineProgram, 'modelViewMatrix'),
            projectionMatrix: gl.getUniformLocation(this.outlineProgram, 'projectionMatrix'),
        };

        // Enable basic WebGL features
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.frontFace(gl.CCW);

        const ext = gl.getExtension('OES_element_index_uint');
        if (!ext) throw new Error("Uint32 indices not supported");
    }

    // -------------------------------
    // SHADER METHODS
    // -------------------------------
    createProgram(vsSource, fsSource) {
        const gl = this.gl;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        if (!vertexShader || !fragmentShader) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program linking failed:", gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compilation failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    // Upload CPU geometry into renderer-owned GPU buffers. Reusing a chunk's
    // buffers lets mesh edits replace their contents without reallocating them.
    uploadChunk(chunk, fadeIn = true) {
        const gl = this.gl;

        if (!chunk.geometry || chunk.residency !== 'active') return;
        const key = `${chunk.cx},${chunk.cy},${chunk.cz}`;
        let buffers = this.chunkBuffers.get(key);
        if (!buffers) {
            buffers = { vertexBuffer: gl.createBuffer(), indexBuffer: gl.createBuffer(), indexCount: 0 };
            this.chunkBuffers.set(key, buffers);
        }

        // Upload vertex data
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertexBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            chunk.geometry.vertices,
            gl.STATIC_DRAW
        );

        // Upload index data
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            chunk.geometry.indices,
            gl.STATIC_DRAW
        );

        buffers.indexCount = chunk.geometry.indices.length;
        if (fadeIn) {
            chunk.fade = 0;
        }
    }

    deleteChunk(key) {
        const buffers = this.chunkBuffers.get(key);
        if (!buffers) return;
        this.gl.deleteBuffer(buffers.vertexBuffer);
        this.gl.deleteBuffer(buffers.indexBuffer);
        this.chunkBuffers.delete(key);
    }

    hasChunk(key) { return this.chunkBuffers.has(key); }

    render(world, camera, player, particleSystem = null) {
        const gl = this.gl;

        const renderDistance = world.renderDistance * world.CHUNK_SIZE;

        const skyColor = [0.375, 0.8, 1].map(a => a * world.daylight);
        const skyFadeStart = renderDistance * 0.5;
        const skyFadeEnd = renderDistance;

        const fogColor = skyColor.map(a => a * 0.25); // Darken the sky color for fog effect
        const fogFadeStart = 0;
        const fogFadeEnd = renderDistance;

        gl.useProgram(this.worldProgram);

        //clear screen
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(...skyColor, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        //set up view matrices
        const [proj, view] = this.setUpViewMatrices(camera);

        this.textureAtlas.bind();
        gl.uniform1i(this.worldUniforms.textureSampler, 0);
        gl.uniform2f(this.worldUniforms.textureGrid, this.textureAtlas.atlasColumns, this.textureAtlas.atlasRows);
        gl.uniform1f(this.worldUniforms.textureTileSize, 32);

        // sky
        gl.uniform1f(this.worldUniforms.uDaylight, world.daylight);
        gl.uniform3f(this.worldUniforms.uSkyColor, ...skyColor);
        gl.uniform1f(this.worldUniforms.uSkyFadeStart, skyFadeStart);
        gl.uniform1f(this.worldUniforms.uSkyFadeEnd, skyFadeEnd);

        // fog
        gl.uniform3f(this.worldUniforms.uFogColor, ...fogColor);
        gl.uniform1f(this.worldUniforms.uFogFadeStart, fogFadeStart);
        gl.uniform1f(this.worldUniforms.uFogFadeEnd, fogFadeEnd);

        //render chunks
        gl.uniform1f(this.worldUniforms.texturesEnabled, this.textureAtlas.blockTexturesEnabled ? 1 : 0);
        for (const chunk of world.chunks.values()) {
            if (chunk.residency === 'active') this.renderChunk(chunk);
        }

        //render entities
        gl.uniform1f(this.worldUniforms.texturesEnabled, this.textureAtlas.entityTexturesEnabled ? 1 : 0);
        for (const entity of world.entities.values()) {
            if (entity.visible && entity.geometry) this.entityRenderer.render(entity, view, proj);
        }

        // Effects are translucent billboards, drawn after opaque world geometry.
        if (particleSystem) this.particleRenderer.render(particleSystem.particles, camera, view, proj);

        // Name labels are world-space billboards, but render after blocks so they
        // remain visible through terrain. Range matches the server's entity snapshots.
        this.nametagRenderer.render(
            world.entities.values(), player, camera, view, proj,
            (world.renderDistance + 1) * world.CHUNK_SIZE,
        );

        //render outlined block
        if (player.outlinedBlock) {
            this.renderOutline(player.outlinedBlock, view, proj);
        }
    }

    setUpViewMatrices(camera) {
        const gl = this.gl;

        //camera view
        const proj = camera.getProjection(this.canvas.width / this.canvas.height);
        const view = camera.getView();

        //set up camera view matrices
        gl.uniformMatrix4fv(this.worldUniforms.projectionMatrix, false, proj);
        gl.uniformMatrix4fv(this.worldUniforms.modelViewMatrix, false, view);

        return [proj, view]
    }

    renderChunk(chunk) {
        const buffers = this.chunkBuffers.get(`${chunk.cx},${chunk.cy},${chunk.cz}`);
        if (!buffers) return false;

        const gl = this.gl;
        const STRIDE = 13 * 4; // position + normal + color + UV + atlas tile index + AO shade

        //set chunk fade
        const fadePercent = chunk.fade / chunk.maxFade;
        gl.uniform1f(this.worldUniforms.uChunkFade, fadePercent);
        gl.uniform3f(this.worldUniforms.materialColor, 1, 1, 1);
        gl.uniform1f(this.worldUniforms.textureBase, 0);

        //bind the buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertexBuffer);

        // Position
        gl.vertexAttribPointer(this.worldAttribs.position, 3, gl.FLOAT, false, STRIDE, 0);
        gl.enableVertexAttribArray(this.worldAttribs.position);

        // Normal
        gl.vertexAttribPointer(this.worldAttribs.normal, 3, gl.FLOAT, false, STRIDE, 3 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.normal);

        // Color
        gl.vertexAttribPointer(this.worldAttribs.color, 3, gl.FLOAT, false, STRIDE, 6 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.color);

        gl.vertexAttribPointer(this.worldAttribs.textureUV, 2, gl.FLOAT, false, STRIDE, 9 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.textureUV);
        gl.vertexAttribPointer(this.worldAttribs.textureIndex, 1, gl.FLOAT, false, STRIDE, 11 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.textureIndex);
        gl.vertexAttribPointer(this.worldAttribs.shade, 1, gl.FLOAT, false, STRIDE, 12 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.shade);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
        gl.drawElements(
            gl.TRIANGLES,
            buffers.indexCount,
            gl.UNSIGNED_INT,
            0
        );
    }

    renderOutline(block, view, proj) {
        const gl = this.gl;
        const outlineVertices = getOutlineVertices(...block.pos);

        gl.useProgram(this.outlineProgram);
        gl.uniformMatrix4fv(this.outlineUniforms.projectionMatrix, false, proj);
        gl.uniformMatrix4fv(this.outlineUniforms.modelViewMatrix, false, view);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, outlineVertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(this.outlineAttribs.position);
        gl.vertexAttribPointer(this.outlineAttribs.position, 3, gl.FLOAT, false, 0, 0);

        gl.lineWidth(1.5);
        gl.drawArrays(gl.LINES, 0, outlineVertices.length / 3);

        // Restore the world shader; the next chunk draw binds its own buffers.
        gl.useProgram(this.worldProgram);
    }

    setTexturesEnabled(enabled) {
        this.setBlockTexturesEnabled(enabled);
        this.setEntityTexturesEnabled(enabled);
    }

    setBlockTexturesEnabled(enabled) {
        this.textureAtlas.blockTexturesEnabled = Boolean(enabled);
    }

    setEntityTexturesEnabled(enabled) {
        this.textureAtlas.entityTexturesEnabled = Boolean(enabled);
    }

    // Nearest filtering keeps pixel art crisp by default; callers can opt into
    // linear filtering when they want softened texture edges.
    setTextureSmoothingEnabled(enabled) {
        this.textureAtlas.setSmoothingEnabled(enabled);
    }

    ensureBlockTexture(type) {
        this.textureAtlas.ensureBlockTexture(type);
    }
}
