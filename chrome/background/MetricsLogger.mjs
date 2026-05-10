const STORAGE_KEY = 'metrics_log';
const MAX_ENTRIES = 500;
const FLUSH_INTERVAL = 30000;

class MetricsLogger {
  constructor() {
    this._buffer = [];
    this._timer = null;
    this._flushing = false;
  }

  static log(category, event, data = {}) {
    instance._push(category, event, data);
  }

  static flush() {
    return instance._flush();
  }

  static getLogs() {
    return instance._getLogs();
  }

  static start() {
    instance._startAutoFlush();
  }

  static recordMemory() {
    return instance._recordMemory();
  }

  _push(category, event, data) {
    this._buffer.push({
      ts: Date.now(),
      cat: category,
      evt: event,
      ...data,
    });
  }

  _startAutoFlush() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this._flush().catch(() => {});
    }, FLUSH_INTERVAL);
  }

  async _flush() {
    if (this._flushing || this._buffer.length === 0) return;
    this._flushing = true;
    const batch = this._buffer.splice(0, this._buffer.length);
    try {
      const stored = await this._readStorage();
      const merged = stored.concat(batch);
      if (merged.length > MAX_ENTRIES) {
        merged.splice(0, merged.length - MAX_ENTRIES);
      }
      await this._writeStorage(merged);
    } catch (e) {
      // re-buffer failed entries
      this._buffer.unshift(...batch);
    }
    this._flushing = false;
  }

  async _getLogs() {
    await this._flush();
    return this._readStorage();
  }

  _readStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result[STORAGE_KEY] || []);
      });
    });
  }

  _writeStorage(entries) {
    return new Promise((resolve) => {
      chrome.storage.local.set({[STORAGE_KEY]: entries}, resolve);
    });
  }

  _recordMemory() {
    const iframeCount = document.querySelectorAll?.('iframe')?.length || 0;
    this._push('memory', 'snapshot', {iframeCount});
  }
}

const instance = new MetricsLogger();

export {MetricsLogger};
