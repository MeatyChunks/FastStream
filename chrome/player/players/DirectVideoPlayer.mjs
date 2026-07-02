import {EmitterRelay, EventEmitter} from '../modules/eventemitter.mjs';
import {VideoUtils} from '../utils/VideoUtils.mjs';
import PlayerBase from './PlayerBase.mjs';

export default class DirectVideoPlayer extends PlayerBase {
  constructor(client, config) {
    super();
    this.client = client;

    this.video = document.createElement(config?.isAudioOnly ? 'audio' : 'video');
  }


  async setup() {
    const preEvents = new EventEmitter();
    const emitterRelay = new EmitterRelay([preEvents, this]);
    VideoUtils.addPassthroughEventListenersToVideo(this.video, emitterRelay);
  }


  async setSource(source) {
    this.source = source;
    this.video.src = source.url;
  }

  get buffered() {
    return this.video.buffered;
  }

  async play() {
    return this.video.play();
  }

  async pause() {
    return this.video.pause();
  }


  get levels() {
    return null;
  }

  get currentFragment() {
    return null;
  }

  async saveVideo(options) {


  }
}
