import { getViewBasis } from '../shared/view-basis.js';

const PARTICLE_VS = `
attribute vec3 position;
attribute vec4 color;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec4 vColor;
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vColor = color;
}`;

const PARTICLE_FS = `
precision mediump float;
varying vec4 vColor;
void main() {
    gl_FragColor = vColor;
}`;

// Builds camera-facing world-space quads and submits them in one draw call.
export default class ParticleRenderer {
    // Compile the effect shader and allocate reusable dynamic vertex storage.
    constructor(gl) {
        this.gl = gl;
        this.program = this.createProgram(PARTICLE_VS, PARTICLE_FS);
        this.buffer = gl.createBuffer();
        this.vertexCapacity = 0;
        this.gpuCapacity = 0;
        this.vertices = new Float32Array(0);
        this.attributes = {
            position: gl.getAttribLocation(this.program, 'position'),
            color: gl.getAttribLocation(this.program, 'color'),
        };
        this.uniforms = {
            modelViewMatrix: gl.getUniformLocation(this.program, 'modelViewMatrix'),
            projectionMatrix: gl.getUniformLocation(this.program, 'projectionMatrix'),
        };
    }

    // Compile the billboard shaders and fail early if WebGL rejects either stage.
    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(`Particle shader compilation failed: ${message}`);
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
            throw new Error(`Particle shader link failed: ${message}`);
        }
        return program;
    }

    // Expand particles into camera-facing quads and submit one blended draw.
    render(particles, camera, view, projection) {
        if (!particles.length) return;
        const gl = this.gl;
        const { right, up } = getViewBasis(camera.orientation);
        const requiredFloats = particles.length * 6 * 7;
        if (requiredFloats > this.vertexCapacity) {
            this.vertexCapacity = Math.max(requiredFloats, this.vertexCapacity * 2, 256 * 6 * 7);
            this.vertices = new Float32Array(this.vertexCapacity);
        }
        const vertices = this.vertices;
        let offset = 0;
        const append = (particle, sx, sy) => {
            vertices[offset++] = particle.pos[0] + right[0] * sx + up[0] * sy;
            vertices[offset++] = particle.pos[1] + right[1] * sx + up[1] * sy;
            vertices[offset++] = particle.pos[2] + right[2] * sx + up[2] * sy;
            vertices[offset++] = particle.color[0];
            vertices[offset++] = particle.color[1];
            vertices[offset++] = particle.color[2];
            vertices[offset++] = particle.color[3];
        };

        for (const particle of particles) {
            const half = particle.size * 0.5;
            // Two triangles form a viewport-facing quad centered on the particle.
            append(particle, -half, -half); append(particle, half, -half); append(particle, half, half);
            append(particle, -half, -half); append(particle, half, half); append(particle, -half, half);
        }

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, view);
        gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projection);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        if (this.vertexCapacity > this.gpuCapacity) {
            this.gpuCapacity = this.vertexCapacity;
            gl.bufferData(gl.ARRAY_BUFFER, this.gpuCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices.subarray(0, requiredFloats));
        const stride = 7 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.attributes.color);
        gl.vertexAttribPointer(this.attributes.color, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, particles.length * 6);
        gl.enable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}
