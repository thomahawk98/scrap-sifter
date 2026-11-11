import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const REPORT_WINDOW_MS = 5000;

// Periodic server-side timing to separate simulation cost from network work.
export default class ServerLagMonitor {
    // Keep timing samples for one server tick interval and enable loop-delay metrics.
    constructor(tickIntervalMs) {
        this.tickIntervalMs = tickIntervalMs;
        this.lastTickStart = null;
        this.windowStart = performance.now();
        this.samples = [];
        this.eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
        this.eventLoopDelay.enable();
        this.previousEventLoopUtilization = performance.eventLoopUtilization();
    }

    // Collect stage and counter samples, reporting when the current window expires.
    record(tickStart, stages, counters = {}) {
        const tickDuration = performance.now() - tickStart;
        const tickGap = this.lastTickStart === null ? this.tickIntervalMs : tickStart - this.lastTickStart;
        this.lastTickStart = tickStart;
        this.samples.push({ tickDuration, scheduledLate: Math.max(0, tickGap - this.tickIntervalMs), stages, counters });

        const now = performance.now();
        if (now - this.windowStart < REPORT_WINDOW_MS) return;
        this.report(now);
    }

    // Summarize tick latency, event-loop delay, work stages, and per-tick counters.
    report(now) {
        const samples = this.samples;
        if (!samples.length) return;
        const durations = samples.map(sample => sample.tickDuration).sort((a, b) => a - b);
        const laggedTicks = samples.filter(sample =>
            sample.tickDuration > this.tickIntervalMs || sample.scheduledLate > 5
        ).length;
        const stageNames = ['simulation', 'chunks', 'events', 'snapshots'];
        const stageAverages = stageNames.map(name => {
            const total = samples.reduce((sum, sample) => sum + (sample.stages[name] ?? 0), 0);
            return `${name} ${(total / samples.length).toFixed(1)}ms`;
        });
        const counterNames = [
            'blockUpdates', 'audioEvents', 'audioDeliveries', 'particleEvents', 'particleDeliveries',
            'workerBatches', 'workerChunks', 'workerApplyMs', 'chunkQueue', 'entities', 'clients',
        ];
        const counterAverages = counterNames.map(name => {
            const total = samples.reduce((sum, sample) => sum + (sample.counters[name] ?? 0), 0);
            return `${name} ${(total / samples.length).toFixed(1)}/tick`;
        });
        const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
        const maxLate = Math.max(...samples.map(sample => sample.scheduledLate));
        const maxWorkerApplyMs = Math.max(...samples.map(sample => sample.counters.workerApplyMaxMs ?? 0));
        const averageGap = samples.reduce((sum, sample) => sum + sample.scheduledLate + this.tickIntervalMs, 0) / samples.length;
        const actualTickRate = 1000 / averageGap;
        const loopDelayMean = Number(this.eventLoopDelay.mean) / 1e6;
        const loopDelayP95 = this.eventLoopDelay.percentile(95) / 1e6;
        const loopDelayMax = this.eventLoopDelay.max / 1e6;
        const loopUtilization = performance.eventLoopUtilization(this.previousEventLoopUtilization);
        this.previousEventLoopUtilization = performance.eventLoopUtilization();
        console.log(
            `[server perf] rate ${actualTickRate.toFixed(1)}/60 ticks/s, late ${((laggedTicks / samples.length) * 100).toFixed(1)}% ` +
            `(${laggedTicks}/${samples.length} ticks >5ms late), tick avg/p95/max ` +
            `${(durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)}/` +
            `${p95.toFixed(1)}/${durations.at(-1).toFixed(1)}ms, max timer late ${maxLate.toFixed(1)}ms; ` +
            `loop delay mean/p95/max ${loopDelayMean.toFixed(1)}/${loopDelayP95.toFixed(1)}/${loopDelayMax.toFixed(1)}ms, ` +
            `busy ${(loopUtilization.utilization * 100).toFixed(1)}%; ` +
            `${stageAverages.join(', ')}; ${counterAverages.join(', ')}, ` +
            `worker apply max ${maxWorkerApplyMs.toFixed(1)}ms`
        );
        this.samples = [];
        this.windowStart = now;
        this.eventLoopDelay.reset();
    }
}
