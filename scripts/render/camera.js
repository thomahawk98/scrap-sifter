export default class Camera {
    constructor(player, fov = 90, near = 0.1, far = 100) {
        this.player = player;
        this.pos = [
            player.head.pos[0],
            player.head.pos[1] + player.size.y - 0.2,
            player.head.pos[2]
        ]

        this.fov = fov;
        this.near = near;
        this.far = far;

        this.viewDistance = 3;

        this.pitch = 0;
        this.yaw = 0;
    }

    update() {
        //player head position
        const pos = this.player.head.pos;
        const yaw = this.player.head.yaw;
        const pitch = this.player.head.pitch;
        const mode = this.player.perspectiveMode;

        //direction the player is facing
        const forward = [
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch),
            -Math.cos(pitch) * Math.cos(yaw)
        ];
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

        //update camera angles based on mode
        if(mode == 0 || mode == 1) {
            //look in direction player is facing
            this.yaw = yaw;
            this.pitch = pitch;
        } else if(mode == 2){
            //look in opposite direction
            this.yaw = yaw + Math.PI;
            this.pitch = -pitch;
        } else {
            //look at player
            const dx = pos[0] - this.pos[0];
            const dy = pos[1] - this.pos[1];
            const dz = pos[2] - this.pos[2];

            this.yaw = Math.atan2(dx, -dz);
            this.pitch = Math.atan2(
                dy,
                Math.sqrt(dx * dx + dz * dz)
            );
        }
    }

    getView(eyePos = this.pos, target = null, up = [0, 1, 0]) {
        target ??= [
            eyePos[0] + Math.cos(this.pitch) * Math.sin(this.yaw),
            eyePos[1] + Math.sin(this.pitch),
            eyePos[2] - Math.cos(this.pitch) * Math.cos(this.yaw)
        ];

        const z = Math.normalize(Math.sub(eyePos, target));
        const x = Math.normalize(Math.cross(up, z));
        const y = Math.cross(z, x);
        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -Math.dot(x, eyePos), -Math.dot(y, eyePos), -Math.dot(z, eyePos), 1
        ]);
    }

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