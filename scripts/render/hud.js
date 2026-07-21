import { getBlockFaceColor } from "../core/block-stats.js";

export default class Hud {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    draw(player, camera, fps, paused = false) {
        const ctx = this.ctx;
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;

        //clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (paused) {
            //pause text
            ctx.textAlign = "center";
            ctx.font = "bold 40px Tahoma";
            ctx.textBaseline = "top";
            ctx.fillText('Click anywhere to unpause game', cx, cy);
        } else {
            //draw crosshair
            const size = 10;
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.moveTo(cx - size, cy); ctx.lineTo(cx + size, cy);
            ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy + size);
            ctx.stroke();
            ctx.fill();

            ctx.strokeStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(cx - size, cy); ctx.lineTo(cx + size, cy);
            ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy + size);
            ctx.stroke();
            ctx.fill();
        }

        //player debug info
        ctx.lineWidth = 1;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = "bold 20px Tahoma"
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.fillText(`${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`, 10, 10);

        ctx.textBaseline = "alphabetic";
        ctx.font = "bold 16px Tahoma";
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.fillText(`FPS: ${fps}`, 10, 50);
        ctx.fillText(`Mode: ${player.mode}`, 10, 70);
        ctx.fillText(`FOV: ${camera.fov}`, 10, 90);
        ctx.fillText(`Yaw: ${Math.round(camera.yaw * 100) / 100}`, 10, 110);
        ctx.fillText(`Pitch: ${Math.round(camera.pitch * 100) / 100}`, 10, 130);
        ctx.fillText(`On block: ${player.onBlock}`, 10, 150);

        //inventory
        for (var n = 0; n < 9; n++) {
            const item = player.inventory[n];
            if (!item) continue;
            if (!item.amount) continue; // skip empty slots

            const boxSize = 80;
            var x = n * (boxSize + 10) + cx - boxSize / 2 - (player.inventory.length - 1) * (boxSize + 10) / 2;
            var y = this.canvas.height - boxSize - 50;

            //draw block icon
            var rgbs = (typeof getBlockFaceColor == 'function') ? getBlockFaceColor(item.type, [0, 1, 0]) : [1, 0, 0];
            ctx.fillStyle = `rgb(${rgbs[0] * 255}, ${rgbs[1] * 255}, ${rgbs[2] * 255})`;
            ctx.fillRect(x + 10, y + 10, boxSize - 20, boxSize - 20);

            // draw item outline
            ctx.lineWidth = (n == player.selected) ? 4 : 2;
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.roundRect(x, y, boxSize, boxSize, 10);
            ctx.stroke();

            // draw item text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 1;
            ctx.fillStyle = 'white';
            ctx.font = "bold 16px Tahoma";
            ctx.fillText(`${item.type}`, x + boxSize * 0.5, y - 10);
            ctx.fillText(`${n + 1}`, x + boxSize * 0.5, y + boxSize + 20);

            ctx.textAlign = 'right';
            ctx.font = "bold 20px Tahoma";
            ctx.fillText(item.amount, x + boxSize - 15, y + boxSize - 20);
        }
    }
}