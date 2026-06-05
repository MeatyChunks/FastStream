import {EventEmitter} from '../../modules/eventemitter.mjs';
import {BrowserAdapter} from '../../utils/BrowserAdapter.mjs';

export class SourceBufferWrapper extends EventEmitter {
  constructor(mediaSource, codec, getCurrentTime = null) {
    super();
    if (!MediaSource.isTypeSupported(codec)) {
      throw new Error('Codec not supported: ' + codec);
    }
    this.sourceBuffer = mediaSource.addSourceBuffer(codec);
    this.getCurrentTime = getCurrentTime;
    try {
      this.sourceBuffer.mode = 'segments';
      // Firefox defaults SourceBuffer.mode to 'sequence' which requires contiguous
      // timestamps. Explicitly set 'segments' for codec-agnostic timestamp handling.
    } catch (_) { /* some browsers reject mode changes after creation */ }
    this.updating = false;
    this.toDo = [];
    this.sourceBuffer.addEventListener('updateend', () => {
      this.updating = false;
      this.emit('updateend');
      this.sourceBufferDo();
    });
  }
  abort() {
    this.sourceBuffer.abort();
  }

  appendBuffer(buffer) {
    return new Promise((resolve, reject) => {
      this.do({
        type: 'append',
        buffer: buffer,
        resolve,
        reject,
      });
    });
  }

  remove(start, end) {
    return new Promise((resolve, reject) => {
      this.do({
        type: 'remove',
        start,
        end,
        resolve,
        reject,
      });
    });
  }

  sourceBufferDo() {
    if (this.updating) return;
    if (this.toDo.length) {
      const current = this.toDo[0];

      if (current.type === 'append') {
        try {
          if (BrowserAdapter.needsBufferEviction) {
            if (BrowserAdapter.evictBeforeAppend(this.sourceBuffer, this.getCurrentTime)) {
              this.updating = true;
              return;
            }
          }
          this.sourceBuffer.appendBuffer(current.buffer);
          this.updating = true;
          current.resolve();
        } catch (e) {
          if (e.name === 'QuotaExceededError' && BrowserAdapter.needsBufferEviction) {
            BrowserAdapter.handleQuotaExceeded(this.sourceBuffer);
          }
          current.reject(e);
          // Synchronous throw: updateend won't fire, skip setting updating
          this.toDo.splice(0, 1);
          return;
        }
      } else if (current.type === 'remove') {
        try {
          this.sourceBuffer.remove(current.start, current.end);
          current.resolve();
        } catch (e) {
          console.log(e);
          current.reject(e);
        }
      }
      this.updating = true;
      this.toDo.splice(0, 1);
    }
  }
  do(obj) {
    this.toDo.push(obj);
    if (!this.updating) this.sourceBufferDo();
  }

  get buffered() {
    return this.sourceBuffer.buffered;
  }
}
