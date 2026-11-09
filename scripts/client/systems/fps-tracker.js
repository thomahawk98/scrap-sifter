// Reports rendered frames per second over a one-second sampling window.
export default class FPSTracker {
    constructor(windowMilliseconds = 1000) {
        this.windowMilliseconds = windowMilliseconds;
        this.windowStart = null;
        this.frameCount = 0;
        this.fps = 0;
    }

    update(timestamp) {
        if (this.windowStart === null) {
            this.windowStart = timestamp;
            this.frameCount = 1;
            return this.fps;
        }

        this.frameCount++;
        const elapsed = timestamp - this.windowStart;
        if (elapsed >= this.windowMilliseconds) {
            this.fps = Math.round(this.frameCount * 1000 / elapsed);
            this.windowStart = timestamp;
            this.frameCount = 0;
        }
        return this.fps;
    }
}
