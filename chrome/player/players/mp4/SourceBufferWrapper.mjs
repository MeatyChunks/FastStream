import {EventEmitter} from '../../modules/eventemitter.mjs';
import {EnvUtils} from '../../utils/EnvUtils.mjs';

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
          if (EnvUtils.isFirefox()) {
            try {
              const buffered = this.sourceBuffer.buffered;
              if (buffered.length > 0) {
                const firstStart = buffered.start(0);
                const lastEnd = buffered.end(buffered.length - 1);
                
                // Try past-eviction relative to current playhead first
                if (this.getCurrentTime) {
                  const playhead = this.getCurrentTime();
                  if (playhead - firstStart > 15) {
                    const removeEnd = playhead - 10;
                    if (removeEnd > firstStart) {
                      this.sourceBuffer.remove(firstStart, removeEnd);
                      this.updating = true;
                      return;
                    }
                  }
                }

                // Fallback to absolute span eviction if buffer span exceeds 60 seconds
                if (lastEnd - firstStart > 60) {
                  const removeEnd = lastEnd - 30;
                  if (removeEnd > firstStart) {
                    this.sourceBuffer.remove(firstStart, removeEnd);
                    this.updating = true;
                    // Re-queue the append to run after eviction finishes
                    return;
                  }
                }
              }
            } catch (_) {}
          }
          this.sourceBuffer.appendBuffer(current.buffer);
          this.updating = true;
          current.resolve();
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            // Firefox throws QuotaExceededError earlier than Chrome due to stricter
            // SourceBuffer memory limits. Evict oldest buffer to recover.
            try {
              const buffered = this.sourceBuffer.buffered;
              if (buffered.length > 0 && buffered.end(0) > 30) {
                this.sourceBuffer.remove(0, buffered.end(0) - 30);
              }
            } catch (_) { /* ignore */ }
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
