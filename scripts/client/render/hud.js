import { ChunkMap } from '../ui/maps.js';
export default class Hud {
    constructor(canvas, { getViewBasis }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.maps = [new ChunkMap()];
        this.getViewBasis = getViewBasis;
    }

    draw(paused, debugTexts, player, inputs) {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;

        //clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        //draw player inventory
        player.inventory.draw(ctx, canvas, inputs);

        ctx.globalAlpha = 1;
        if (paused) {
            ctx.textAlign = "center";
            ctx.textBaseline = 'middle';

            //pause text
            ctx.fillStyle = 'white';
            ctx.font = "bold 40px Tahoma";
            ctx.fillText('Click anywhere to unpause game', cx, cy);
        } else {
            //draw crosshair
            this.drawCrosshair(ctx, cx, cy);
        }

        this.drawDebugTexts(ctx, debugTexts);
        this.drawMaps(ctx, player);
    }

    drawCrosshair(ctx, cx, cy) {
        const size = 10;
        ctx.save();
        ctx.translate(cx, cy);

        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, size);
        ctx.stroke();
        ctx.fill();

        ctx.strokeStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, size);
        ctx.stroke();
        ctx.fill();

        ctx.restore();
    }

    drawDebugTexts(ctx, debugTexts) {
        //debug info
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = 'bold 15px Tahoma';
        ctx.fillStyle = 'white';
        for (let i = 0; i < debugTexts.length; i++) {
            const text = debugTexts[i];
            ctx.fillText(text, 10, 10 + i * 20);
        }
    }

    drawMaps(ctx, player) {
        //display maps
        for (let i = 0; i < this.maps.length; i++) {
            const map = this.maps[i];
            //draw temperature map
            const mapWidth = 175, mapHeight = 175;
            const x = 10 + i * (mapWidth + 10), y = this.canvas.height - mapHeight - 10;
            ctx.drawImage(
                map.canvas,
                x, y,
                mapWidth, mapHeight
            );

            //draw player direction arrow on map
            const arrow = {
                x: x + mapWidth * 0.5,
                y: y + mapHeight * 0.5,
            };

            ctx.save();
            ctx.translate(arrow.x, arrow.y);
            const { forward } = this.getViewBasis(player.orientation);
            ctx.rotate(Math.atan2(forward[0], -forward[2]));

            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(5, 2);
            ctx.lineTo(-5, 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }
}
