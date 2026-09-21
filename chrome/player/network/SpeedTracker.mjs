export class SpeedTracker {
  constructor() {
    this.buffer = [];
    this.lastEntry = null;
    this.totalData = 0;
    this.cutoffSize = 10000;
  }

  update(dataSize, start, end) {
    if (this.lastEntry?.start === start) {
      this.totalData += dataSize - this.lastEntry.dataSize;
      this.lastEntry.dataSize = dataSize;
      this.lastEntry.end = end;
      return;
    }

    const entry = {dataSize, start, end};
    this.buffer.push(entry);
    this.totalData += dataSize;
    this.lastEntry = entry;
    this.prune();
  }

  prune() {
    const cutoff = performance.now() - this.cutoffSize;
    while (this.buffer.length > 2 && this.buffer[0].end < cutoff) {
      const removed = this.buffer.shift();
      this.totalData -= removed.dataSize;
    }
  }

  getSpeed() {
    this.prune();
    if (this.buffer.length === 0) return 0;

    const now = performance.now();
    const dt = (now - this.buffer[0].start) / 1000;
    return this.totalData / dt;
  }
}
