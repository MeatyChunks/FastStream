/**
 * Single requestAnimationFrame loop that dispatches to registered tasks.
 * Replaces N independent rAF loops with one, reducing main-thread callback
 * overhead from 60×N/sec to 60/sec total — critical for Firefox single-process
 * extensions where every callback competes for the same main-thread budget.
 *
 * Usage:
 *   const scheduler = FrameBudgetScheduler.instance;
 *   const id = scheduler.register('my-task', (dt) => { ... });
 *   scheduler.unregister(id);
 *
 * Tasks are dispatched in registration order. Each receives the delta time
 * (ms) since the last frame.
 */

/** @type {FrameBudgetScheduler|null} */
let _instance = null;

export class FrameBudgetScheduler {
  constructor() {
    /** @type {Map<string, {callback: function(number): void, active: boolean}>} */
    this._tasks = new Map();
    /** @type {number|null} */
    this._rafId = null;
    /** @type {number} */
    this._lastTime = 0;
    /** @type {number} Counter for generating unique IDs */
    this._nextId = 0;
  }

  /**
   * Global singleton. All consumers share one scheduler (and therefore one rAF loop).
   * @returns {FrameBudgetScheduler}
   */
  static get instance() {
    if (!_instance) {
      _instance = new FrameBudgetScheduler();
    }
    return _instance;
  }

  /**
   * Register a task to run each animation frame.
   * @param {string} label - Human-readable label for debugging.
   * @param {function(number): void} callback - Receives delta time in ms since last frame.
   * @returns {string} Task ID for later unregistration.
   */
  register(label, callback) {
    const id = `${label}-${this._nextId++}`;
    this._tasks.set(id, {callback, active: true});
    this._ensureRunning();
    return id;
  }

  /**
   * Unregister a previously registered task.
   * @param {string} id - Task ID returned by register().
   */
  unregister(id) {
    this._tasks.delete(id);
    if (this._tasks.size === 0) {
      this._stop();
    }
  }

  /**
   * Temporarily pause a task without removing it.
   * @param {string} id
   */
  pause(id) {
    const task = this._tasks.get(id);
    if (task) task.active = false;
  }

  /**
   * Resume a paused task.
   * @param {string} id
   */
  resume(id) {
    const task = this._tasks.get(id);
    if (task) task.active = true;
  }

  /** @returns {number} Number of registered (not necessarily active) tasks. */
  get size() {
    return this._tasks.size;
  }

  /**
   * @private
   */
  _ensureRunning() {
    if (this._rafId === null) {
      this._lastTime = performance.now();
      this._rafId = requestAnimationFrame(this._onFrame);
    }
  }

  /**
   * @private
   */
  _stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * @private
   * @param {number} timestamp - rAF-provided high-res timestamp.
   */
  _onFrame = (timestamp) => {
    if (this._tasks.size === 0) {
      this._rafId = null;
      return;
    }

    const dt = timestamp - this._lastTime;
    this._lastTime = timestamp;

    for (const [, task] of this._tasks) {
      if (task.active) {
        try {
          task.callback(dt);
        } catch (_) { /* prevent one failing task from blocking others */ }
      }
    }

    this._rafId = requestAnimationFrame(this._onFrame);
  };
}
