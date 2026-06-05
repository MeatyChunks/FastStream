/**
 * Tracks analysed time ranges for background analyzers.
 * Shared by AudioAnalyzer and PreviewFrameExtractor to deduplicate
 * ~50 lines of identical range-finding, inserting, and merging logic.
 *
 * Usage:
 *   const tracker = new RangeTracker();
 *   tracker.update(time);          // finds/creates/merges range for `time`
 *   tracker.currentRange;          // the range containing `time`
 *   tracker.currentClientRange;    // last range the client was inside
 *   tracker.ranges;                // all ranges
 *   tracker.isComplete(duration);  // single range spans nearly full duration
 */
export class RangeTracker {
  constructor() {
    /** @type {{start: number, end: number}[]} */
    this.ranges = [];
    /** @type {{start: number, end: number}|null} */
    this.currentRange = null;
    /** @type {number} */
    this.currentRangeIndex = -1;
    /** @type {{start: number, end: number}|null} */
    this.currentClientRange = null;
  }

  /**
   * Find or create the range containing `time`, then merge adjacent overlaps.
   * @param {number} time
   * @returns {{start: number, end: number}} The range containing `time`.
   */
  update(time) {
    if (!this.currentRange || time < this.currentRange.start || time > this.currentRange.end + 16) {
      this.currentRangeIndex = -1;
      for (let i = 0; i < this.ranges.length; i++) {
        if (this.ranges[i].start <= time && this.ranges[i].end >= time) {
          this.currentRange = this.ranges[i];
          this.currentRangeIndex = i;
          break;
        }
      }

      if (this.currentRangeIndex === -1) {
        this.currentRange = {start: time, end: time};
        this.currentRangeIndex = -1;
        for (let i = 0; i < this.ranges.length; i++) {
          if (this.ranges[i].start > time) {
            this.ranges.splice(i, 0, this.currentRange);
            this.currentRangeIndex = i;
            break;
          }
        }
        if (this.currentRangeIndex === -1) {
          this.ranges.push(this.currentRange);
          this.currentRangeIndex = this.ranges.length - 1;
        }
      }

      // merge with previous range if overlapping
      if (this.currentRangeIndex > 0 && this.currentRange.start - this.ranges[this.currentRangeIndex - 1].end < 0) {
        this.ranges[this.currentRangeIndex - 1].end = Math.max(
          this.ranges[this.currentRangeIndex - 1].end,
          this.currentRange.end,
        );
        this.ranges.splice(this.currentRangeIndex, 1);
        this.currentRangeIndex--;
        this.currentRange = this.ranges[this.currentRangeIndex];
      }
    }

    // merge with next range if overlapping
    if (
      this.currentRangeIndex < this.ranges.length - 1 &&
      this.ranges[this.currentRangeIndex + 1].start - this.currentRange.end < 0
    ) {
      this.currentRange.end = Math.max(this.currentRange.end, this.ranges[this.currentRangeIndex + 1].end);
      this.ranges.splice(this.currentRangeIndex + 1, 1);
    }

    return this.currentRange;
  }

  /**
   * Whether a single range spans nearly the full duration.
   * @param {number} duration
   * @returns {boolean}
   */
  isComplete(duration) {
    return this.currentRange && this.currentRange.end - this.currentRange.start >= duration - 5;
  }

  /**
   * Clear all tracked state. Keeps the `ranges` reference for callers
   * that hold onto it (returned from `runAnalyzerInBackground`).
   */
  reset() {
    this.currentRange = null;
    this.currentRangeIndex = -1;
    this.currentClientRange = null;
  }
}
