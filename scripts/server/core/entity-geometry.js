// Cube mesh in local space. Entity transforms can move, rotate, and scale this
// reusable geometry without rebuilding or reuploading its vertex buffers.
export function createCubeGeometry(color = [1, 1, 1]) {
    const faces = [
        { normal: [0, 0, 1], corners: [[-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]] },
        { normal: [0, 0, -1], corners: [[0.5,-0.5,-0.5],[-0.5,-0.5,-0.5],[-0.5,0.5,-0.5],[0.5,0.5,-0.5]] },
        { normal: [1, 0, 0], corners: [[0.5,-0.5,0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[0.5,0.5,0.5]] },
        { normal: [-1, 0, 0], corners: [[-0.5,-0.5,-0.5],[-0.5,-0.5,0.5],[-0.5,0.5,0.5],[-0.5,0.5,-0.5]] },
        { normal: [0, 1, 0], corners: [[-0.5,0.5,0.5],[0.5,0.5,0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5]] },
        { normal: [0, -1, 0], corners: [[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,-0.5,0.5],[-0.5,-0.5,0.5]] },
    ];
    const vertices = [];
    const indices = [];

    for (const { normal, corners } of faces) {
        const base = vertices.length / 9;
        for (const position of corners) vertices.push(...position, ...normal, ...color);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), textureCoordinates: null };
}
