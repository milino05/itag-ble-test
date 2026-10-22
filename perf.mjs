/** Small, framework-independent BLE read-performance monitor.
 * Records only timestamps and durations, never the content of a read.
 * The rolling window makes an actual fall in reads/second visible.
 */
export class ReadPerformance {
  constructor(windowMs = 10000) {
    this.windowMs = windowMs;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.total = 0;
    this.failures = 0;
    this.startedAt = null;
    this.lastEndedAt = null;
    this.maxLatency = 0;
    this.lastLatency = 0;
  }
  start(time) {
    if (this.startedAt === null) this.startedAt = time;
  }
  add(time, latency, succeeded = true) {
    this.start(time);
    if (succeeded) this.total++;
    else this.failures++;
    this.lastEndedAt = time;
    this.lastLatency = latency;
    this.maxLatency = Math.max(this.maxLatency, latency);
    this.samples.push({time, latency, succeeded});
    this.prune(time);
  }
  prune(time) {
    const cutoff = time - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].time < cutoff) this.samples.shift();
  }
  snapshot(time) {
    this.prune(time);
    const successes = this.samples.filter(s => s.succeeded);
    const n = successes.length;
    // Use the full observation duration when collecting < windowMs of samples.
    const observedMs = this.startedAt === null ? 0 : Math.min(this.windowMs, Math.max(1, time - this.startedAt));
    const readsPerSecond = observedMs > 0 ? n * 1000 / observedMs : 0;
    const meanLatency = n > 0 ? successes.reduce((sum, s) => sum + s.latency, 0) / n : 0;
    return { readsPerSecond, meanLatency, lastLatency: this.lastLatency,
      maxLatency: this.maxLatency, total: this.total, failures: this.failures,
      ageMs: this.lastEndedAt === null ? Infinity : time - this.lastEndedAt,
      warmedUp: observedMs >= 6500, samples: n };
  }
}
