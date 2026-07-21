// src/render/Renderer.js
import * as shaders from './shaders.js';

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
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        if (!this.gl) throw new Error("WebGL not supported!");

        this.stride = 9 * 4; // 3 floats for pos + 3 normal + 3 color

        // Buffers
        this.worldBuffer = this.gl.createBuffer();
        this.indexBuffer = this.gl.createBuffer();
        this.outlineBuffer = this.gl.createBuffer();

        this.init();
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
        };
        this.worldUniforms = {
            modelViewMatrix: gl.getUniformLocation(this.worldProgram, 'modelViewMatrix'),
            projectionMatrix: gl.getUniformLocation(this.worldProgram, 'projectionMatrix'),

            uChunkFade: gl.getUniformLocation(this.worldProgram, 'uChunkFade'),

            uDaylight: gl.getUniformLocation(this.worldProgram, 'uDaylight'),
            uSkyColor: gl.getUniformLocation(this.worldProgram, 'uSkyColor'),
            uSkyFadeStart: gl.getUniformLocation(this.worldProgram, 'uSkyFadeStart'),
            uSkyFadeEnd: gl.getUniformLocation(this.worldProgram, 'uSkyFadeEnd'),

            uFogColor: gl.getUniformLocation(this.worldProgram, 'uFogColor'),
            uFogFadeStart: gl.getUniformLocation(this.worldProgram, 'uFogFadeStart'),
            uFogFadeEnd: gl.getUniformLocation(this.worldProgram, 'uFogFadeEnd'),
        };

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

    // -------------------------------
    // MESH UPLOAD
    // -------------------------------
    uploadMeshData(cubesData) {
        const gl = this.gl;

        // Vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.worldBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, cubesData.vertices, gl.STATIC_DRAW);

        // Index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubesData.indices, gl.STATIC_DRAW);

        // Setup attributes
        gl.enableVertexAttribArray(this.worldAttribs.position);
        gl.vertexAttribPointer(this.worldAttribs.position, 3, gl.FLOAT, false, this.stride, 0);

        gl.enableVertexAttribArray(this.worldAttribs.normal);
        gl.vertexAttribPointer(this.worldAttribs.normal, 3, gl.FLOAT, false, this.stride, 12);

        gl.enableVertexAttribArray(this.worldAttribs.color);
        gl.vertexAttribPointer(this.worldAttribs.color, 3, gl.FLOAT, false, this.stride, 24);

        this.lastMesh = cubesData;
    }

    uploadChunk(chunk, fadeIn = true) {
        const gl = this.gl;

        if (!chunk.geometry) {
            chunk.dirty = true;
            return;
        };

        // Create buffers (once)
        if (!chunk.vertexBuffer) {
            chunk.vertexBuffer = gl.createBuffer();
            chunk.indexBuffer = gl.createBuffer();
        }

        // Upload vertex data
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.vertexBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            chunk.geometry.vertices,
            gl.STATIC_DRAW
        );

        // Upload index data
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, chunk.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            chunk.geometry.indices,
            gl.STATIC_DRAW
        );

        chunk.indexCount = chunk.geometry.indices.length;
        if (fadeIn) {
            chunk.fade = 0;
            chunk.isFading = true;
        }
    }

    render(world, camera, player) {
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
        for (const chunk of world.chunks.values()) {
            this.renderChunk(chunk);
        }

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
        if (!chunk.vertexBuffer) return false;
        if (!chunk.indexBuffer) return false;

        const gl = this.gl;
        const STRIDE = 9 * 4; // 3 pos + 3 normal + 3 color

        //set chunk fade
        const fadePercent = chunk.fade / chunk.maxFade;
        gl.uniform1f(this.worldUniforms.uChunkFade, fadePercent);

        //bind the buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.vertexBuffer);

        // Position
        gl.vertexAttribPointer(this.worldAttribs.position, 3, gl.FLOAT, false, STRIDE, 0);
        gl.enableVertexAttribArray(this.worldAttribs.position);

        // Normal
        gl.vertexAttribPointer(this.worldAttribs.normal, 3, gl.FLOAT, false, STRIDE, 3 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.normal);

        // Color
        gl.vertexAttribPointer(this.worldAttribs.color, 3, gl.FLOAT, false, STRIDE, 6 * 4);
        gl.enableVertexAttribArray(this.worldAttribs.color);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, chunk.indexBuffer);
        gl.drawElements(
            gl.TRIANGLES,
            chunk.indexCount,
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

        // Switch back to main program
        gl.useProgram(this.worldProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.worldBuffer);
        gl.enableVertexAttribArray(this.worldAttribs.position);
        gl.vertexAttribPointer(this.worldAttribs.position, 3, gl.FLOAT, false, this.stride, 0);
    }
}
