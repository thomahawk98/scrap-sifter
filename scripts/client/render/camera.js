export default class Camera {
    // Keep projection settings and the player's current camera transform together.
    constructor(player, fov = 90, near = 0.1, far = 100, { getViewBasis, reverseView } = {}) {
        this.player = player;
        this.pos = [...player.pos];
        this.orientation = [...player.orientation];

        this.fov = fov;
        this.near = near;
        this.far = far;

        this.viewDistance = 3;
        this.getViewBasis = getViewBasis;
        this.reverseView = reverseView;

    }

    // Position and orient the camera for the selected first- or third-person mode.
    update() {
        // The player position is also the camera origin in first-person mode.
        const pos = this.player.pos;
        const orientation = this.player.orientation;
        const mode = this.player.perspectiveMode;

        //direction the player is facing
        const { forward } = this.getViewBasis(orientation);
        const dist = this.viewDistance;

        //update camera position based on mode
        if (mode == 0) {
            this.pos = pos;
        } else if (mode == 1) {
            this.pos = [
                pos[0] - forward[0] * dist,
                pos[1] - forward[1] * dist,
                pos[2] - forward[2] * dist,
            ];
        } else if (mode == 2) {
            this.pos = [
                pos[0] + forward[0] * dist,
                pos[1] + forward[1] * dist,
                pos[2] + forward[2] * dist,
            ];
        }

        // The rear-facing perspective turns around local up and preserves roll.
        this.orientation = mode === 2 ? this.reverseView(orientation) : [...orientation];
    }

    // Build a view matrix from the camera basis or an explicit eye/target pair.
    getView(eyePos = this.pos, target = null, up = [0, 1, 0]) {
        let x, y, z;
        if (target === null) {
            const basis = this.getViewBasis(this.orientation);
            x = basis.right;
            y = basis.up;
            z = basis.forward.map(component => -component);
        } else {
            z = Math.normalize(Math.sub(eyePos, target));
            const viewUp = Math.abs(Math.dot(up, z)) > 0.9999 ? [0, 0, 1] : up;
            x = Math.normalize(Math.cross(viewUp, z));
            y = Math.cross(z, x);
        }
        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -Math.dot(x, eyePos), -Math.dot(y, eyePos), -Math.dot(z, eyePos), 1
        ]);
    }

    // Build a perspective projection matrix from the current field of view.
    getProjection(aspect) {
        const fovRad = 1 / Math.tan(this.fov * 0.5 * (Math.PI / 180));
        const rangeInv = 1 / (this.near - this.far);

        return new Float32Array([
            fovRad / aspect, 0, 0, 0,
            0, fovRad, 0, 0,
            0, 0, (this.near + this.far) * rangeInv, -1,
            0, 0, this.near * this.far * rangeInv * 2, 0
        ]);
    }
}
