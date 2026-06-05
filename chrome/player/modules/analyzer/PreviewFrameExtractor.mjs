import {DefaultPlayerEvents} from '../../enums/DefaultPlayerEvents.mjs';
import {EventEmitter} from '../eventemitter.mjs';
import {RangeTracker} from './RangeTracker.mjs';
import {FrameBudgetScheduler} from '../../utils/FrameBudgetScheduler.mjs';

const AnalyzerStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  FINISHED: 'finished',
  FAILED: 'failed',
};

const SHOULD_STORE_AS_BLOB = true;

export class PreviewFrameExtractor extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.outputRateInv = 2;
    this.frameBuffer = [];

    this.backgroundNeededBy = [];

    this.backgroundAnalyzerStatus = AnalyzerStatus.IDLE;
    this.backgroundDoneRanges = [];
    this.backgroundAnalyzerEnabled = true;

    this.extractorCanvas = document.createElement('canvas');
    this.extractorContext = this.extractorCanvas.getContext('2d');
  }

  getFrameBuffer() {
    return this.frameBuffer;
  }

  getOutputRateInv() {
    return this.outputRateInv;
  }

  addBackgroundDependent(dependent) {
    if (this.backgroundNeededBy.includes(dependent)) return;
    this.backgroundNeededBy.push(dependent);

    this.updateBackground();
  }

  removeBackgroundDependent(dependent) {
    const index = this.backgroundNeededBy.indexOf(dependent);
    if (index !== -1) {
      this.backgroundNeededBy.splice(index, 1);
    }

    this.updateBackground();
  }

  updateBackground() {
    if (this.shouldRunAnalyzerInBackground()) {
      this.startBackgroundAnalyzer();
    } else {
      this.stopBackgroundAnalyzer();
    }
  }

  reset() {
    try {
      if (SHOULD_STORE_AS_BLOB) {
        this.frameBuffer.forEach((frame) => {
          if (frame.url) URL.revokeObjectURL(frame.url);
        });
      }
      this.frameBuffer = [];
      this.backgroundAnalyzerSource = null;
      this.backgroundDoneRanges = [];
      this.stopBackgroundAnalyzer();
      this.backgroundAnalyzerStatus = AnalyzerStatus.IDLE;
    } catch (e) {
      console.error(e);
    }
  }


  async startBackgroundAnalyzer() {
    if (!this.client.player || this.backgroundAnalyzerStatus !== AnalyzerStatus.IDLE) {
      return;
    }

    const video = this.client.player?.getVideo();
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const newSource = this.client.player.getSource();
    if (this.backgroundAnalyzerSource === newSource) {
      return;
    }

    this.backgroundAnalyzerSource = newSource;

    if (this.backgroundAnalyzerPlayer) {
      this.backgroundAnalyzerPlayer.destroy();
      this.backgroundAnalyzerPlayer = null;
    }

    console.log('[FrameExtractor] Starting background analyzer');

    const backgroundAnalyzerPlayer = await this.loadPlayer(this.backgroundAnalyzerSource, this.backgroundDoneRanges, (completed) => {
      if (backgroundAnalyzerPlayer === this.backgroundAnalyzerPlayer) {
        console.log('[FrameExtractor] Background analyzer finished', completed ? 'successfully' : 'with errors');
        this.backgroundAnalyzerStatus = completed ? AnalyzerStatus.FINISHED : AnalyzerStatus.FAILED;
        this.client.interfaceController.updateMarkers();
      }
      this.backgroundAnalyzerPlayer = null;
    });

    if (newSource !== this.backgroundAnalyzerSource) {
      backgroundAnalyzerPlayer.destroy();
      return;
    }

    this.backgroundAnalyzerStatus = AnalyzerStatus.RUNNING;
    this.backgroundAnalyzerPlayer = backgroundAnalyzerPlayer;
  }

  stopBackgroundAnalyzer() {
    this.backgroundAnalyzerSource = null;
    if (this.backgroundAnalyzerPlayer) {
      const player = this.backgroundAnalyzerPlayer;
      this.backgroundAnalyzerPlayer = null;
      player.destroy();
    }
    if (this.backgroundAnalyzerStatus === AnalyzerStatus.RUNNING) {
      this.backgroundAnalyzerStatus = AnalyzerStatus.IDLE;
    }
    this.client.interfaceController.updateMarkers();
  }

  async loadPlayer(source, doneRanges, onDone) {
    const player = await this.client.playerLoader.createPlayer(source.mode, this.client, {
      isAnalyzer: true,
    });

    await player.setup();

    player.on(DefaultPlayerEvents.MANIFEST_PARSED, () => {
      player.setCurrentVideoLevelID(this.client.getCurrentVideoLevelID());
      player.setCurrentAudioLevelID(this.client.getCurrentAudioLevelID());
    });

    const onLoadMeta = () => {
      player.off(DefaultPlayerEvents.LOADEDMETADATA, onLoadMeta);
      this.runAnalyzerInBackground(player, doneRanges, (completed)=>{
        onDone(completed);
      });
    };

    player.on(DefaultPlayerEvents.LOADEDMETADATA, onLoadMeta);

    this.client.attachProcessorsToPlayer(player);

    await player.setSource(source);
    return player;
  }

  runAnalyzerInBackground(player, doneRanges, onDone) {
    const offsetTarget = -35;
    const time = this.client.currentTime;
    let offset = this.client.isRegionBuffered(time + offsetTarget, time) ? offsetTarget : 0;
    player.currentTime = Math.max(time + offset, 0);
    player.volume = 0;
    player.muted = true;

    const video = player.getVideo();
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspect = videoWidth / videoHeight;
    const height = 64;
    const width = Math.round(height * aspect);
    this.extractorCanvas.width = width;
    this.extractorCanvas.height = height;

    let destroyed = false;
    let completed = false;
    const context = player.createContext();
    context.on(DefaultPlayerEvents.DESTROYED, () => {
      context.destroy();
      destroyed = true;
      onDone(completed);
    });

    if (videoWidth === 0 || videoHeight === 0) {
      console.error('[FrameExtractor] Invalid video dimensions');
      player.destroy();
      return;
    }

    let pauseTimeout;

    if (!doneRanges) {
      doneRanges = [];
    }

    const rangeTracker = new RangeTracker();
    rangeTracker.ranges = doneRanges;
    let lastOffsetCalc = Date.now();

    const onEnd = () => {
      completed = true;
      player.destroy();
    };

    context.on(DefaultPlayerEvents.ENDED, ()=>{
      player.currentTime = 0;
    });

    let paused = false;
    const pauseHandler = () => {
      if (!destroyed && !paused ) {
        paused = true;
        console.log('[FrameExtractor] Paused analyzer');
      }
    };

    const onAnimFrame = () => {
      if (destroyed) {
        if (taskId) FrameBudgetScheduler.instance.unregister(taskId);
        return;
      }

      const time = player.currentTime;
      const clientTimeOriginal = this.client.currentTime;

      if (paused) {
        if (player.readyState >= 1 && Math.abs(time - clientTimeOriginal) <= 40) {
          paused = false;
          console.log('[FrameExtractor] Resumed analyzer');
        }
      } else {
        if (Math.abs(time - clientTimeOriginal) > 60) {
          paused = true;
          console.log('[FrameExtractor] Outside of bounds, pausing');
        }
      }

      clearTimeout(pauseTimeout);
      pauseTimeout = setTimeout(pauseHandler, 100);

      if (player.readyState < 2) {
        return;
      }

      const now = Date.now();
      if (now - lastOffsetCalc > 1000) {
        lastOffsetCalc = now;
        offset = this.client.isRegionBuffered(clientTimeOriginal + offsetTarget, clientTimeOriginal) ? offsetTarget : 0;
      }

      const clientTime = Math.max(clientTimeOriginal + offset, 0);

      const frame = Math.floor(time / this.outputRateInv);

      if (!this.frameBuffer[frame]) {
        this.extractorContext.drawImage(video, 0, 0, this.extractorCanvas.width, this.extractorCanvas.height);
        if (SHOULD_STORE_AS_BLOB) {
          // Mark slot pending to prevent duplicate extraction while toBlob encodes off-thread
          this.frameBuffer[frame] = {};
          this.extractorCanvas.toBlob((blob) => {
            if (destroyed) return;
            this.frameBuffer[frame] = blob
              ? {url: URL.createObjectURL(blob)}
              : {url: this.extractorCanvas.toDataURL('image/png')};
          }, 'image/png');
        } else {
          this.frameBuffer[frame] = {
            url: this.extractorCanvas.toDataURL('image/png'),
          };
        }
      }

      const currentRange = rangeTracker.update(time);

      if (rangeTracker.isComplete(player.duration)) {
        onEnd();
        return;
      }

      let timeSet = false;
      if (currentRange.end > time + 10) {
        player.currentTime = Math.floor((currentRange.end - 5) / this.outputRateInv) * this.outputRateInv;
        timeSet = true;
        console.log('[FrameExtractor] Already analyzed range, seeking', player.currentTime, currentRange.end);
      } else if (currentRange.end < time) {
        currentRange.end = time;
      }

      if (clientTime < currentRange.start - 5 || clientTime > currentRange.end + 5) {
        if (!rangeTracker.currentClientRange || Math.min(clientTime + 90, player.duration) > rangeTracker.currentClientRange.end + 5 || clientTime + 5 < rangeTracker.currentClientRange.start) {
          console.log('[FrameExtractor] Client time is outside of analyzed region, seeking', clientTime, currentRange.start, currentRange.end);
          offset = this.client.isRegionBuffered(clientTimeOriginal + offsetTarget, clientTimeOriginal) ? offsetTarget : 0;
          player.currentTime = Math.floor(Math.max(clientTimeOriginal + offset, 0) / this.outputRateInv) * this.outputRateInv;
          timeSet = true;
          rangeTracker.reset();
        }
      } else {
        rangeTracker.currentClientRange = currentRange;
      }

      if (!timeSet && !paused) {
        player.currentTime = (1 + Math.floor(time / this.outputRateInv)) * this.outputRateInv;
      }

      this.client.interfaceController.updateMarkers();
    };

    let taskId = FrameBudgetScheduler.instance.register('frame-extractor', onAnimFrame);

    return doneRanges;
  }

  getMarkerPosition() {
    if (this.backgroundAnalyzerPlayer && this.backgroundAnalyzerStatus === AnalyzerStatus.RUNNING) {
      return this.backgroundAnalyzerPlayer.currentTime;
    }
    return null;
  }

  shouldRunAnalyzerInBackground() {
    if (!this.backgroundAnalyzerEnabled) {
      return false;
    }
    return this.backgroundNeededBy.length > 0;
  }

  enableBackground() {
    this.backgroundAnalyzerEnabled = true;

    this.updateBackground();
  }

  disableBackground() {
    this.backgroundAnalyzerEnabled = false;
    this.updateBackground();
  }

  setLevel(level, audioLevel) {
    if (this.backgroundAnalyzerPlayer) {
      this.backgroundAnalyzerPlayer.setCurrentVideoLevelID(level);
      this.backgroundAnalyzerPlayer.setCurrentAudioLevelID(audioLevel);
    }
  }

  getMarkerPosition() {
    if (this.backgroundAnalyzerPlayer && this.backgroundAnalyzerStatus === AnalyzerStatus.RUNNING) {
      return this.backgroundAnalyzerPlayer.currentTime;
    }
    return null;
  }
}
