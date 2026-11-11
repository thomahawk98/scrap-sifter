// Transform local entity geometry into world space and cache its GPU buffers.
// Entity motion updates matrices only, so static vertex data is uploaded once.
// Build a world transform from entity scale, quaternion orientation, and position.
function getModelMatrix(entity) {
    const [w, x, y, z] = entity.orientation;
    const [sx, sy, sz] = entity.scale;
    const [px, py, pz] = entity.pos;
    return new Float32Array([
        (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
        (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
        (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        px, py, pz, 1,
    ]);
}

// Multiply two column-major matrices for the entity model-view transform.
function multiplyMatrices(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
            for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
        }
    }
    return out;
}

export default class EntityRenderer {
    // Retain shared geometry and shader handles for all entity draws.
    constructor(gl, program, attributes, uniforms) {
        this.gl = gl;
        this.program = program;
        this.attributes = attributes;
        this.uniforms = uniforms;
        this.textureAtlas = uniforms.textureAtlas;
        this.geometryBuffers = new Map();
    }

    // Upload each immutable geometry object once and reuse its GPU buffers.
    getBuffers(geometry) {
        let buffers = this.geometryBuffers.get(geometry);
        if (buffers) return buffers;

        const gl = this.gl;
        buffers = {
            vertexBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            indexCount: geometry.indices.length,
        };
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
        this.geometryBuffers.set(geometry, buffers);
        return buffers;
    }

    // Apply the entity model transform and issue its indexed mesh draw.
    render(entity, viewMatrix, projectionMatrix) {
        const gl = this.gl;
        const buffers = this.getBuffers(entity.geometry);
        const modelView = multiplyMatrices(viewMatrix, getModelMatrix(entity));
        const stride = 13 * 4; // position + normal + color + UV + face texture index + shade.

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projectionMatrix);
        gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelView);
        gl.uniform1f(this.uniforms.chunkFade, 1);
        gl.uniform3fv(this.uniforms.materialColor, entity.material.color || [1, 1, 1]);
        gl.uniform1f(this.uniforms.textureBase, this.textureAtlas.getEntityTextureBase(entity.type));

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertexBuffer);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.normal, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.enableVertexAttribArray(this.attributes.normal);
        gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, stride, 6 * 4);
        gl.enableVertexAttribArray(this.attributes.color);
        gl.vertexAttribPointer(this.attributes.textureUV, 2, gl.FLOAT, false, stride, 9 * 4);
        gl.enableVertexAttribArray(this.attributes.textureUV);
        gl.vertexAttribPointer(this.attributes.textureIndex, 1, gl.FLOAT, false, stride, 11 * 4);
        gl.enableVertexAttribArray(this.attributes.textureIndex);
        gl.vertexAttribPointer(this.attributes.shade, 1, gl.FLOAT, false, stride, 12 * 4);
        gl.enableVertexAttribArray(this.attributes.shade);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
        gl.drawElements(gl.TRIANGLES, buffers.indexCount, gl.UNSIGNED_INT, 0);
    }
}
