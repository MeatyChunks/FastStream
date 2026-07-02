import {DefaultPlayerEvents} from '../enums/DefaultPlayerEvents.mjs';
import {EventEmitter} from '../modules/eventemitter.mjs';
import {VideoUtils} from '../utils/VideoUtils.mjs';

export default class PlayerBase extends EventEmitter {
  load() {

  }

  getClient() {
    return this.client;
  }

  getVideo() {
    return this.video;
  }

  getSource() {
    return this.source;
  }

  destroy() {
    VideoUtils.destroyVideo(this.video);
    this.video = null;

    this.emit(DefaultPlayerEvents.DESTROYED);
  }

  canSave() {
    return {
      cantSave: true,
      canSave: false,
      isComplete: true,
    };
  }

  getVideoLevels() {
    return null;
  }

  getAudioLevels() {
    return null;
  }

  getCurrentVideoLevelID() {
    return null;
  }

  getCurrentAudioLevelID() {
    return null;
  }

  setCurrentVideoLevelID(levelID) {
  }

  setCurrentAudioLevelID(levelID) {
  }

  downloadFragment(fragment, priority) {
    throw new Error('downloadFragment not supported by ' + this.constructor.name);
  }

  get currentTime() {
    return this.video.currentTime;
  }

  set currentTime(value) {
    this.video.currentTime = value;
  }

  get readyState() {
    return this.video.readyState;
  }

  get paused() {
    return this.video.paused;
  }

  get duration() {
    return this.video.duration;
  }

  get volume() {
    return this.video.volume;
  }

  set volume(value) {
    this.video.volume = value;
    if (value === 0) this.video.muted = true;
    else this.video.muted = false;
  }

  get playbackRate() {
    return this.video.playbackRate;
  }

  set playbackRate(value) {
    this.video.playbackRate = value;
  }
}
