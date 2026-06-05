/**
 * Browser-specific adapter that centralises all behavioural differences
 * between Chrome, Firefox, and Safari. Resolved once at import time.
 *
 * Callers use properties (e.g. `BrowserAdapter.maxPlaybackRate`) instead of
 * inline `EnvUtils.isFirefox()` checks. Adding a new browser = one new
 * branch here, zero caller changes.
 */
import {EnvUtils} from './EnvUtils.mjs';

const isChrome = EnvUtils.isChrome();
const isFirefox = EnvUtils.isFirefox();

/**
 * Attempt to evict buffered data from a SourceBuffer before appending new data.
 * Firefox has stricter SourceBuffer memory limits than Chrome and needs active
 * eviction to avoid QuotaExceededError.
 *
 * @param {SourceBuffer} sourceBuffer - The native SourceBuffer to manage.
 * @param {function|null} getCurrentTime - Returns the current playhead time.
 * @returns {boolean} True if an eviction was triggered (caller should re-queue the append).
 */
function evictBeforeAppend(sourceBuffer, getCurrentTime) {
  try {
    const buffered = sourceBuffer.buffered;
    if (buffered.length === 0) return false;

    const firstStart = buffered.start(0);
    const lastEnd = buffered.end(buffered.length - 1);

    // Try past-eviction relative to current playhead first
    if (getCurrentTime) {
      const playhead = getCurrentTime();
      if (playhead - firstStart > 15) {
        const removeEnd = playhead - 10;
        if (removeEnd > firstStart) {
          sourceBuffer.remove(firstStart, removeEnd);
          return true;
        }
      }
    }

    // Fallback to absolute span eviction if buffer span exceeds 60 seconds
    if (lastEnd - firstStart > 60) {
      const removeEnd = lastEnd - 30;
      if (removeEnd > firstStart) {
        sourceBuffer.remove(firstStart, removeEnd);
        return true;
      }
    }
  } catch (_) { /* eviction failure is non-fatal */ }

  return false;
}

/**
 * Handle QuotaExceededError from SourceBuffer by evicting oldest data.
 * Firefox throws this earlier than Chrome due to stricter memory limits.
 *
 * @param {SourceBuffer} sourceBuffer - The native SourceBuffer that threw.
 */
function handleQuotaExceeded(sourceBuffer) {
  try {
    const buffered = sourceBuffer.buffered;
    if (buffered.length > 0 && buffered.end(0) > 30) {
      sourceBuffer.remove(0, buffered.end(0) - 30);
    }
  } catch (_) { /* ignore */ }
}

export const BrowserAdapter = {
  /** Maximum playback rate for background analyzers and silence skipping. */
  maxPlaybackRate: isChrome ? 16 : 8,

  /** Chrome has a desync bug when changing playback rate rapidly. */
  needsDesyncFix: isChrome,

  /** Chrome can offload blob data to disk automatically. */
  canOffloadBlobs: isChrome,

  /** Firefox needs proactive MSE buffer eviction to avoid quota errors. */
  needsBufferEviction: isFirefox,

  /** Firefox IndexedDB retains blob references differently; orphan entries after save to avoid quota accumulation. */
  needsIDBBlobOrphaning: isFirefox,

  /** Chrome has a bug with 7.1 audio requiring an explicit channel merger. */
  needsChannelMergerBug: isChrome,

  /** SponsorBlock extension ID differs between Chrome and Firefox. */
  sponsorBlockID: isChrome
    ? 'mnjggcdmjocbbbhaepdhchncahnbgone'
    : 'sponsorBlocker@ajay.app',

  /** Chrome supports extraHeaders in webRequest; Firefox does not. */
  supportsExtraHeaders: isChrome,

  /** Review URL for the current browser's extension store. */
  storeReviewURL: isChrome
    ? 'https://chromewebstore.google.com/u/1/detail/faststream-video-player/kkeakohpadmbldjaiggikmnldlfkdfog/reviews'
    : 'https://addons.mozilla.org/en-US/firefox/addon/faststream/reviews/',

  evictBeforeAppend,
  handleQuotaExceeded,
};
