/**
 * Owns the AudioContext lifecycle. Centralises suspend/resume calls
 * so that multiple modules can request suspension for different reasons
 * (pause, tab hidden, etc.) without racing.
 *
 * Usage:
 *   const mgr = new AudioContextManager();
 *   const ctx = mgr.getContext();  // lazy creation
 *   mgr.suspend('pause');          // tracks reason
 *   mgr.resume('pause');           // only resumes when zero reasons remain
 *   mgr.close();                   // permanent teardown
 */
export class AudioContextManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;
    /** @type {Set<string>} */
    this._suspendReasons = new Set();
    /** @type {boolean} */
    this._closed = false;
  }

  /**
   * Returns the AudioContext, creating it lazily on first access.
   * Returns null after close() has been called.
   * @returns {AudioContext|null}
   */
  getContext() {
    if (this._closed) return null;
    if (!this._ctx) {
      this._ctx = new AudioContext();
    }
    return this._ctx;
  }

  /**
   * Current state of the underlying AudioContext ('running', 'suspended', 'closed').
   * @returns {string}
   */
  get state() {
    if (this._closed) return 'closed';
    if (!this._ctx) return 'suspended';
    return this._ctx.state;
  }

  /**
   * Request suspension for a given reason. Idempotent per reason.
   * The AudioContext is only suspended if it isn't already.
   * @param {string} reason - E.g. 'pause', 'hidden'.
   * @returns {Promise<void>}
   */
  async suspend(reason) {
    if (this._closed) return;
    this._suspendReasons.add(reason);
    if (this._ctx && this._ctx.state === 'running') {
      await this._ctx.suspend().catch(() => {});
    }
  }

  /**
   * Release a suspension reason. The AudioContext is only resumed when
   * zero reasons remain AND no pending suspend is in flight.
   * @param {string} reason - Must match a previously passed reason.
   * @returns {Promise<void>}
   */
  async resume(reason) {
    if (this._closed) return;
    this._suspendReasons.delete(reason);
    if (this._suspendReasons.size === 0 && this._ctx) {
      // Always attempt resume when reasons are clear. The AudioContext
      // handles the idempotency — resume() on a running context is a no-op.
      await this._ctx.resume().catch(() => {});
    }
  }

  /**
   * Permanently close the AudioContext. Cannot be reopened — caller must
   * create a new AudioContextManager.
   * @returns {Promise<void>}
   */
  async close() {
    this._closed = true;
    if (this._ctx) {
      await this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    this._suspendReasons.clear();
  }

  /**
   * Whether the manager has been permanently closed.
   * @returns {boolean}
   */
  get isClosed() {
    return this._closed;
  }

  /**
   * Whether any suspension reasons are currently active.
   * @returns {boolean}
   */
  get isSuspended() {
    return this._suspendReasons.size > 0;
  }
}
