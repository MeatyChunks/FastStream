const STORAGE_KEY = 'metrics_log';
const MAX_ENTRIES = 500;
const FLUSH_ALARM_NAME = 'metricsFlush';

class MetricsLogger {
  constructor() {
    this._buffer = [];
    this._cachedStored = null; // loaded lazily on first flush
    this._flushing = false;
    this._started = false;
    this._writeFailCount = 0;
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

  static handleAlarm(alarm) {
    if (alarm.name === FLUSH_ALARM_NAME) {
      instance._flush().catch(() => {});
    }
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
    if (this._started) return;
    this._started = true;
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 0.5 });
    }
  }

  async _ensureCacheLoaded() {
    if (this._cachedStored === null) {
      this._cachedStored = await this._readStorage();
    }
  }

  async _flush() {
    if (this._flushing || this._buffer.length === 0) return;
    this._flushing = true;
    const batch = this._buffer.splice(0, this._buffer.length);
    try {
      await this._ensureCacheLoaded();
      this._cachedStored = this._cachedStored.concat(batch);
      if (this._cachedStored.length > MAX_ENTRIES) {
        this._cachedStored = this._cachedStored.slice(-MAX_ENTRIES);
      }
      await this._writeStorage(this._cachedStored);
      this._writeFailCount = 0;
    } catch (e) {
      this._writeFailCount++;
      if (this._writeFailCount <= 3) {
        console.warn('MetricsLogger write failed:', e);
      }
      this._buffer.unshift(...batch);
    }
    this._flushing = false;
  }

  async _getLogs() {
    await this._flush();
    return this._cachedStored || this._readStorage();
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
