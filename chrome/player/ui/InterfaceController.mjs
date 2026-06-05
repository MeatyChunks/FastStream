import {MessageTypes} from '../enums/MessageTypes.mjs';
import {PlayerModes} from '../enums/PlayerModes.mjs';
import {Coloris} from '../modules/coloris.mjs';
import {Localize} from '../modules/Localize.mjs';
import {ClickActions} from '../options/defaults/ClickActions.mjs';
import {MiniplayerPositions} from '../options/defaults/MiniplayerPositions.mjs';
import {VisChangeActions} from '../options/defaults/VisChangeActions.mjs';
import {EnvUtils} from '../utils/EnvUtils.mjs';
import {FrameBudgetScheduler} from '../utils/FrameBudgetScheduler.mjs';
import {InterfaceUtils} from '../utils/InterfaceUtils.mjs';
import {StringUtils} from '../utils/StringUtils.mjs';
import {URLUtils} from '../utils/URLUtils.mjs';
import {Utils} from '../utils/Utils.mjs';
import {WebUtils} from '../utils/WebUtils.mjs';
import {DOMElements} from './DOMElements.mjs';
import {FineTimeControls} from './FineTimeControls.mjs';
import {AudioQualityChanger} from './menus/AudioQualityChanger.mjs';
import {LanguageChanger} from './menus/LanguageChanger.mjs';
import {LoopMenu} from './menus/LoopMenu.mjs';
import {PlaybackRateChanger} from './menus/PlaybackRateChanger.mjs';
import {VideoQualityChanger} from './menus/VideoQualityChanger.mjs';
import {OptionsWindow} from './OptionsWindow.mjs';
import {ProgressBar} from './ProgressBar.mjs';
import {SaveManager} from './SaveManager.mjs';
import {StatusManager, StatusTypes} from './StatusManager.mjs';
import {SubtitlesManager} from './subtitles/SubtitlesManager.mjs';
import {ToolManager} from './ToolManager.mjs';
import {VolumeControls} from './VolumeControls.mjs';

let MiniplayerCooldown = Date.now() + 500;
export class InterfaceController {
  constructor(client) {
    this.client = client;
    this.state = client.state;
    this.hidden = false;
    this.lastTime = 0;
    this.lastSpeed = 0;
    this.mouseOverControls = false;
    this.controlsVisible = true;
    this.mouseActivityCooldown = 0;

    this.failed = false;

    this._boundListeners = [];
    this._boundInteractHandler = (e) => { this.client.userInteracted(); };
    this._boundPlayPauseToggle = this.playPauseToggle.bind(this);
    this._boundUpdateFullScreenButton = this.updateFullScreenButton.bind(this);
    this._boundOnPlayerMouseMove = this.onPlayerMouseMove.bind(this);
    this._boundOnControlsMouseEnter = this.onControlsMouseEnter.bind(this);
    this._boundOnControlsMouseLeave = this.onControlsMouseLeave.bind(this);
    this._boundSkipSegment = this.skipSegment.bind(this);

    this.toolManager = new ToolManager(this.client, this);

    this.toolManager.setupUI();

    this.fineTimeControls = new FineTimeControls(this.client);

    this.subtitlesManager = new SubtitlesManager(this.client);

    this.playbackRateChanger = new PlaybackRateChanger(this.client);
    this.playbackRateChanger.on('rateChanged', (rate) => {
      this.client.playbackRate = rate;
    });
    this.playbackRateChanger.setupUI();

    this.videoQualityChanger = new VideoQualityChanger();
    this.videoQualityChanger.setupUI();
    this.videoQualityChanger.on('qualityChanged', (level, savePriority) => {
      if (savePriority) {
        const mimeType = (level.mimeType || '').split('/');
        if (mimeType.length > 1) {
          this.client.getLevelManager().setPrioritizedVideoContainer(mimeType[1]);
        }

        if (level.videoCodec) {
          this.client.getLevelManager().setPrioritizedVideoCodec(level.videoCodec);
        }
      }
      this.client.setCurrentVideoLevelID(level.id);
    });

    this.audioQualityChanger = new AudioQualityChanger();
    this.audioQualityChanger.setupUI();
    this.audioQualityChanger.on('qualityChanged', (level) => {
      const mimeType = (level.mimeType || '').split('/');
      if (mimeType.length > 1) {
        this.client.getLevelManager().setPrioritizedAudioContainer(mimeType[1]);
      }

      if (level.audioCodec) {
        this.client.getLevelManager().setPrioritizedAudioCodec(level.audioCodec);
      }

      const usesDRC = level.id.includes('-drc');
      this.client.getLevelManager().setShouldPreferDRCAudio(usesDRC);

      this.client.setCurrentAudioLevelID(level.id);
    });

    this.languageChanger = new LanguageChanger();
    this.languageChanger.setupUI();
    this.languageChanger.on('languageChanged', (type, language, tracks) => {
      this.client.changeLanguage(type, language);
    });

    this.loopControls = new LoopMenu(this.client);
    this.loopControls.setupUI();

    this.saveManager = new SaveManager(this.client);
    this.saveManager.setupUI();

    this.playbackRateChanger.on('open', this.closeAllMenus.bind(this));
    this.videoQualityChanger.on('open', this.closeAllMenus.bind(this));
    this.audioQualityChanger.on('open', this.closeAllMenus.bind(this));
    this.languageChanger.on('open', this.closeAllMenus.bind(this));
    this.subtitlesManager.on('open', this.closeAllMenus.bind(this));
    this.loopControls.on('open', this.closeAllMenus.bind(this));

    this.progressBar = new ProgressBar(this.client);
    this.progressBar.on('show-skip', (segment)=>{
      this.showControlBarTemporarily(5000);
    });
    this.progressBar.setupUI();

    this.volumeControls = new VolumeControls(this.client);
    this.volumeControls.on('volume', (volume)=>{
      this.client.setVolume(volume);
    });
    this.volumeControls.setupUI();

    this.statusManager = new StatusManager();
    this.optionsWindow = new OptionsWindow();

    this.setupDOM();
  }

  updateAutoNextIndicator() {
    if (this.client.options.autoplayNext) {
      DOMElements.autoNextIndicator.style.display = '';
    } else {
      DOMElements.autoNextIndicator.style.display = 'none';
    }
  }

  updateToolVisibility() {
    this.toolManager.updateToolVisibility();
  }

  openTimeline() {
    this.progressBar.startPreciseMode(true);
  }

  closeTimeline() {
    this.fineTimeControls.removeAll();
    this.progressBar.endPreciseMode();
    this.subtitlesManager.subtitleSyncer.stop();
    this.playbackRateChanger.closeSilenceSkipperUI();
  }

  closeAllMenus(e) {
    let closedSomething = false;
    if (e !== true && (!e || (e.target && !DOMElements.extraTools.contains(e.target)))) {
      if (DOMElements.extraTools.classList.contains('visible')) {
        DOMElements.extraTools.classList.remove('visible');
        closedSomething = true;
      }
    }
    closedSomething = this.playbackRateChanger.closeUI() || closedSomething;
    closedSomething = this.videoQualityChanger.closeUI() || closedSomething;
    closedSomething = this.audioQualityChanger.closeUI() || closedSomething;
    closedSomething = this.languageChanger.closeUI() || closedSomething;
    closedSomething = this.subtitlesManager.closeUI() || closedSomething;
    closedSomething = this.loopControls.closeUI() || closedSomething;
    return closedSomething;
  }

  setStatusMessage(key, message, type, expiry) {
    this.statusManager.setStatusMessage(key, message, type, expiry);
  }

  tick() {
    if (this.client.player) {
      this.updateFragmentsLoaded();
      this.checkBuffering();
    }

    this.statusManager.updateStatusMessage();
  }

  checkBuffering() {
    const currentVideo = this.client.currentVideo;
    if (this.state.playing) {
      const time = this.client.currentTime;
      if (time === this.lastTime) {
        this.setBuffering(true);
      } else {
        this.setBuffering(false);
      }
      this.lastTime = time;
    } else if (currentVideo) {
      if (currentVideo.readyState === 0) {
        this.setBuffering(true);
      } else if (currentVideo.readyState > 1) {
        this.setBuffering(false);
      }
    }
  }

  reset() {
    DOMElements.videoContainer.replaceChildren();

    this.resetPreviewVideo();
    this.progressBar.reset();
    this.saveManager.reset();
    this.failed = false;
    this.setStatusMessage('error', null, 'error');
    this.setStatusMessage('chapter', null, 'error');
    this.stopProgressLoop();
    this.state.playing = false;
    this.updatePlayPauseButton();
    DOMElements.playPauseButtonBigCircle.style.display = '';
    DOMElements.playerContainer.classList.add('controls_visible');
    this.updateToolVisibility();
    this.fineTimeControls.reset();
    this.playbackRateChanger.reset();
  }

  failedToLoad(reason) {
    this.failed = true;
    this.setStatusMessage('error', reason, 'error');
    this.setBuffering(false);
  }

  setBuffering(isBuffering) {
    if (this.failed) {
      isBuffering = false;
    }

    if (this.state.buffering === isBuffering) {
      return;
    }

    this.state.buffering = isBuffering;

    if (isBuffering) {
      DOMElements.bufferingSpinner.style.display = '';
    } else {
      DOMElements.bufferingSpinner.style.display = 'none';
    }
  }

  dressVideo(video) {
    video.setAttribute('playsinline', 'playsinline');
    video.disableRemotePlayback = true;
  }

  addVideo(video) {
    this.dressVideo(video);
    DOMElements.videoContainer.appendChild(video);
  }

  addPreviewVideo(video) {
    this.dressVideo(video);
    DOMElements.seekPreviewVideo.style.display = '';
    DOMElements.seekPreviewVideo.appendChild(video);
  }

  resetPreviewVideo() {
    DOMElements.seekPreviewVideo.replaceChildren();
    const spinner = document.createElement('div');
    spinner.classList.add('spinner');
    DOMElements.seekPreviewVideo.appendChild(spinner);
    DOMElements.seekPreviewVideo.classList.remove('loading');
    DOMElements.seekPreviewVideo.style.display = 'none';
  }

  updateMarkers() {
    this.progressBar.updateMarkers();
  }

  updateFragmentsLoaded() {
    this.progressBar.updateFragmentsLoaded();
    this.updateDownloadStatus();
  }

  updateDownloadStatus() {
    if (this.client.downloadManager.paused) {
      this.setStatusMessage('download', Localize.getMessage('player_download_paused'), 'warning');
      return;
    }

    const {loaded, total, failed} = this.progressBar.getFragmentCounts();
    if (total === 0) {
      this.setStatusMessage('download', null);
      return;
    }

    const percentDone = total === 0 ? 0 :
        Math.floor((loaded / total) * 1000) / 10;

    const newSpeed = this.client.downloadManager.getSpeed();
    if (newSpeed > 0 && this.lastSpeed > 0) {
      this.lastSpeed = (newSpeed * 0.05 + this.lastSpeed * 0.95) || 0;
    } else {
      this.lastSpeed = newSpeed;
    }

    let speed = this.lastSpeed; // bytes per second
    speed = Math.round(speed / 1000 / 1000 * 10) / 10; // MB per second

    if (total === 0 || loaded < total) {
      this.shownDownloadComplete = false;
      this.setStatusMessage('download', `${this.client.downloadManager.downloaders.length}C ↓${speed}MB/s ${percentDone}%`, 'success');
    } else if (!this.shownDownloadComplete) {
      this.shownDownloadComplete = true;
      this.setStatusMessage('download', Localize.getMessage('player_fragment_allbuffered'), 'success', 2000);
    }

    if (failed > 0) {
      DOMElements.resetFailed.style.display = '';
      DOMElements.resetFailed.textContent = Localize.getMessage(failed === 1 ? 'player_fragment_failed_singular' : 'player_fragment_failed_plural', [failed]);
    } else {
      DOMElements.resetFailed.style.display = 'none';
    }
  }

  updateSkipSegments() {
    this.progressBar.updateSkipSegments();
  }

  _addListener(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    this._boundListeners.push({ element, event, handler, options });
  }

  setupDOM() {
    this._addListener(DOMElements.playerContainer, 'keydown', this._boundInteractHandler, true);
    this._addListener(DOMElements.playerContainer, 'mousedown', this._boundInteractHandler, true);
    this._addListener(DOMElements.playerContainer, 'touchstart', this._boundInteractHandler, true);

    this._addListener(DOMElements.playPauseButton, 'click', this._boundPlayPauseToggle);
    WebUtils.setupTabIndex(DOMElements.playPauseButton);

    this._boundPlayPauseButtonBigCircleClick = (e) => {
      this.hideControlBarOnAction();
      this.playPauseToggle();
      e.stopPropagation();
    };
    this._addListener(DOMElements.playPauseButtonBigCircle, 'click', this._boundPlayPauseButtonBigCircleClick);

    this._boundFullscreenClick = (e)=>{
      if (e.shiftKey) {
        this.pipToggle();
        return;
      } else if (e.altKey) {
        this.toggleWindowedFullscreen();
        return;
      }

      this.fullscreenToggle();
      e.stopPropagation();
    };
    this._addListener(DOMElements.fullscreen, 'click', this._boundFullscreenClick);

    this._boundFullscreenContextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleWindowedFullscreen();
    };
    this._addListener(DOMElements.fullscreen, 'contextmenu', this._boundFullscreenContextmenu);

    WebUtils.setupTabIndex(DOMElements.fullscreen);

    this._boundWindowedFullscreenClick = (e)=>{
      this.toggleWindowedFullscreen();
    };
    this._addListener(DOMElements.windowedFullscreen, 'click', this._boundWindowedFullscreenClick);
    WebUtils.setupTabIndex(DOMElements.windowedFullscreen);

    this._addListener(document, 'fullscreenchange', this._boundUpdateFullScreenButton);

    this._addListener(DOMElements.playerContainer, 'mousemove', this._boundOnPlayerMouseMove);
    this._addListener(DOMElements.controlsContainer, 'mouseenter', this._boundOnControlsMouseEnter);
    this._addListener(DOMElements.controlsContainer, 'mouseleave', this._boundOnControlsMouseLeave);
    this._boundControlsFocusin = ()=>{
      this.focusingControls = true;
      this.showControlBar();
    };
    this._addListener(DOMElements.controlsContainer, 'focusin', this._boundControlsFocusin);
    this._boundControlsFocusout = ()=>{
      this.focusingControls = false;
      this.queueControlsHide();
    };
    this._addListener(DOMElements.controlsContainer, 'focusout', this._boundControlsFocusout);

    this._boundPlayerMouseleave = (e)=>{
      this.queueControlsHide(1);
    };
    this._addListener(DOMElements.playerContainer, 'mouseleave', this._boundPlayerMouseleave);

    let holdTimeout = null;
    let lastSpeed = null;
    let wasPlaying = false;
    this._boundVideoMousedown = (e)=>{
      if (e.button === 0) {
        clearTimeout(holdTimeout);
        holdTimeout = setTimeout(() => {
          if (lastSpeed !== null || !this.client.player) {
            return;
          }
          wasPlaying = this.state.playing;
          lastSpeed = this.client.playbackRate;
          this.client.playbackRate = lastSpeed * 2;

          this.client.play();
        }, 800);
      }
    };
    this._addListener(DOMElements.videoContainer, 'mousedown', this._boundVideoMousedown);

    const stopSpeedUp = () => {
      if (lastSpeed !== null) {
        this.client.playbackRate = lastSpeed;
        lastSpeed = null;

        if (!wasPlaying) {
          this.client.pause();
        }
      }
      clearTimeout(holdTimeout);
    };

    this._boundVideoMouseleave = (e)=>{
      stopSpeedUp();
    };
    this._addListener(DOMElements.videoContainer, 'mouseleave', this._boundVideoMouseleave);

    let clickCount = 0;
    let clickTimeout = null;
    this._boundVideoClick = (e) => {
      clearTimeout(holdTimeout);
      if (lastSpeed !== null) {
        stopSpeedUp();
        return;
      }

      if (this.closeAllMenus(false)) {
        return;
      }

      if (InterfaceUtils.closeWindows()) {
        return;
      }

      if (this.isBigPlayButtonVisible()) {
        this.playPauseToggle();
        return;
      }

      if (clickTimeout !== null) {
        clickCount++;
      } else {
        clickCount = 1;
      }
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        clickTimeout = null;

        let clickAction;
        if (clickCount === 1) {
          clickAction = this.client.options.singleClickAction;
        } else if (clickCount === 2) {
          clickAction = this.client.options.doubleClickAction;
        } else if (clickCount === 3) {
          clickAction = this.client.options.tripleClickAction;
        } else {
          return;
        }

        switch (clickAction) {
          case ClickActions.FULLSCREEN:
            this.fullscreenToggle();
            break;
          case ClickActions.WINDOWED_FULLSCREEN:
            this.toggleWindowedFullscreen();
            break;
          case ClickActions.PIP:
            this.pipToggle();
            break;
          case ClickActions.PLAY_PAUSE:
            this.playPauseToggle();
            break;
          case ClickActions.HIDE_CONTROLS:
            this.focusingControls = false;
            this.mouseOverControls = false;
            this.hideControlBar();
            break;
          case ClickActions.HIDE_PLAYER:
            this.toggleHide();
            break;
        }
      }, clickCount < 3 ? 300 : 0);
    };
    this._addListener(DOMElements.videoContainer, 'click', this._boundVideoClick);

    this._boundHideButtonClick = () => {
      DOMElements.hideButton.blur();
      this.focusingControls = false;
      this.hideControlBar();
    };
    this._addListener(DOMElements.hideButton, 'click', this._boundHideButtonClick);

    WebUtils.setupTabIndex(DOMElements.hideButton);

    this._boundResetFailedClick = (e) => {
      this.client.resetFailed();
      e.stopPropagation();
    };
    this._addListener(DOMElements.resetFailed, 'click', this._boundResetFailedClick);
    WebUtils.setupTabIndex(DOMElements.resetFailed);

    this._addListener(DOMElements.skipButton, 'click', this._boundSkipSegment);

    this._boundPipClick = (e) => {
      this.pipToggle();
    };
    this._addListener(DOMElements.pip, 'click', this._boundPipClick);

    WebUtils.setupTabIndex(DOMElements.pip);

    this._boundDragenter = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    this._addListener(DOMElements.playerContainer, 'dragenter', this._boundDragenter, false);
    this._boundDragover = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    this._addListener(DOMElements.playerContainer, 'dragover', this._boundDragover, false);

    this._boundSettingsClick = (e) => {
      if (e.shiftKey) {
        chrome.runtime.openOptionsPage();
      } else {
        this.optionsWindow.toggleUI();
      }
      e.stopPropagation();
    };
    this._addListener(DOMElements.settingsButton, 'click', this._boundSettingsClick);
    WebUtils.setupTabIndex(DOMElements.settingsButton);

    const welcomeText = Localize.getMessage('player_welcometext', [this.client.version]);
    this.setStatusMessage('welcome', welcomeText, 'info', 3000);

    this._boundControlsContainerClick = (e) => {
      e.stopPropagation();
    };
    this._addListener(DOMElements.controlsContainer, 'click', this._boundControlsContainerClick);

    this._boundVisibilityChange = ()=>{
      if (!document.hidden) {
        this.handleVisibilityChange(true);
      } else {
        this.handleVisibilityChange(false);
      }
    };
    this._addListener(document, 'visibilitychange', this._boundVisibilityChange);

    this._boundSkipForwardClick = (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);
      e.stopPropagation();
    };
    this._addListener(DOMElements.skipForwardButton, 'click', this._boundSkipForwardClick);

    WebUtils.setupTabIndex(DOMElements.skipForwardButton);

    this._boundSkipBackwardClick = (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += -this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);
      e.stopPropagation();
    };
    this._addListener(DOMElements.skipBackwardButton, 'click', this._boundSkipBackwardClick);

    WebUtils.setupTabIndex(DOMElements.skipBackwardButton);

    this._boundMoreButtonClick = (e) => {
      if (!DOMElements.extraTools.classList.contains('visible')) {
        this.closeAllMenus(true);
        DOMElements.extraTools.classList.add('visible');
      } else {
        DOMElements.extraTools.classList.remove('visible');
      }
      e.stopPropagation();
    };
    this._addListener(DOMElements.moreButton, 'click', this._boundMoreButtonClick);
    WebUtils.setupTabIndex(DOMElements.moreButton);

    this._boundDurationClick = (e) => {
      let copyURL = '';
      if (this.client.source) {
        const source = this.client.source;
        if (source.mode === PlayerModes.ACCELERATED_YT) {
          copyURL = `https://youtu.be/${URLUtils.get_yt_identifier(source.url)}`;
          copyURL += `?t=${Math.floor(this.client.currentTime)}`;
        } else {
          try {
            const url = new URL(source.url);
            if (source.countHeaders() > 0) {
              const headers = JSON.stringify(source.headers);
              url.searchParams.set('faststream-headers', headers);
            }
            url.searchParams.set('faststream-mode', source.mode);
            url.searchParams.set('faststream-timestamp', Math.floor(this.client.currentTime).toString());
            copyURL = url.toString();
          } catch (e) {
          }
        }
      }

      const input = document.createElement('input');
      input.value = copyURL;
      DOMElements.playerContainer.appendChild(input);
      input.focus();
      input.select();
      document.execCommand('copy');
      DOMElements.playerContainer.removeChild(input);

      this.setStatusMessage(StatusTypes.COPY, Localize.getMessage('source_copied'), 'info', 2000);
    };
    this._addListener(DOMElements.duration, 'click', this._boundDurationClick);
    WebUtils.setupTabIndex(DOMElements.duration);

    this._boundNextVideoClick = (e) => {
      if (e.shiftKey || e.altKey) {
        this.toggleAutoplayNext();
        return;
      }

      this.client.nextVideo();
      e.stopPropagation();
    };
    this._addListener(DOMElements.nextVideo, 'click', this._boundNextVideoClick);

    this._boundNextVideoContextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAutoplayNext();
    };
    this._addListener(DOMElements.nextVideo, 'contextmenu', this._boundNextVideoContextmenu);

    WebUtils.setupTabIndex(DOMElements.nextVideo);

    this._boundPreviousVideoClick = (e) => {
      this.client.previousVideo();
      e.stopPropagation();
    };
    this._addListener(DOMElements.previousVideo, 'click', this._boundPreviousVideoClick);

    WebUtils.setupTabIndex(DOMElements.previousVideo);

    this._intersectionObserver = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio > 0.25 && !document.hidden) {
        this.handleVisibilityChange(true);
      } else {
        this.handleVisibilityChange(false);
      }
    }, {
      threshold: [0, 0.25, 0.5],
    });

    this._intersectionObserver.observe(document.body);
    try {
      // eslint-disable-next-line new-cap
      Coloris({
        parent: '.mainplayer',
        theme: 'pill',
        themeMode: 'dark',
        formatToggle: true,
        swatches: [
          'rgb(255,255,255)',
          'rgba(10,10,10,0.3)',
          '#067bc2',
          '#ecc30b',
          '#f37748',
          '#d56062',
        ],
        alpha: true,
        focusInput: false,
      });
    } catch (e) {
      console.warn('Coloris failed to initialize', e);
    }

    this._mouseUpHandler = (e) => {
      DOMElements.playerContainer.removeEventListener('mousemove', this._mouseMoveHandler);
      DOMElements.playerContainer.removeEventListener('mouseup', this._mouseUpHandler);
      DOMElements.playerContainer.removeEventListener('mouseleave', this._mouseUpHandler);
    };

    this._mouseMoveHandler = (e) => {
      const currentY = Math.min(Math.max(e.clientY - WebUtils.getOffsetTop(DOMElements.progressContainer), -100), 100);
      const isExpanded = DOMElements.playerContainer.classList.contains('expanded');
      const offset = isExpanded ? 0 : 80;
      if (currentY > 50) {
        this.closeTimeline();
      } else if (currentY <= -5 - offset) {
        this.openTimeline();
      }
    };

    this._boundControlsLeftMousedown = (e) => {
      if (e.button !== 0) {
        return;
      }

      // Ignore if user is over an element contained by .tools_container_left
      if (DOMElements.leftToolsContainer.contains(e.target)) {
        return;
      }


      DOMElements.playerContainer.addEventListener('mousemove', this._mouseMoveHandler);
      DOMElements.playerContainer.addEventListener('mouseup', this._mouseUpHandler, true);
      DOMElements.playerContainer.addEventListener('mouseleave', this._mouseUpHandler);
    };
    this._addListener(DOMElements.controlsLeft, 'mousedown', this._boundControlsLeftMousedown);
  }

  toggleAutoplayNext() {
    this.client.options.autoplayNext = !this.client.options.autoplayNext;
    sessionStorage.setItem('autoplayNext', this.client.options.autoplayNext);
    this.updateAutoNextIndicator();
  }

  toggleVisualFilters() {
    this.client.options.disableVisualFilters = !this.client.options.disableVisualFilters;
    sessionStorage.setItem('disableVisualFilters', this.client.options.disableVisualFilters);
    this.client.updateCSSFilters();
  }

  async handleVisibilityChange(isVisible) {
    if (this.client.needsUserInteraction()) { // Don't do anything if the user needs to interact with the player
      return;
    }

    const action = this.client.options.visChangeAction;

    if (isVisible === this.lastPageVisibility) {
      return;
    }

    if (!isVisible && (this.state.fullscreen || this.isInPip())) {
      return;
    }

    switch (action) {
      case VisChangeActions.NOTHING:
        break;
      case VisChangeActions.PLAY_PAUSE:
        if (!isVisible) {
          this.shouldPlay = this.client.state.playing;
          await this.client.player?.pause();
        } else {
          if (this.shouldPlay) {
            await this.client.player?.play();
          }
        }
        break;
      case VisChangeActions.PIP:
        if (!isVisible) {
          await this.enterPip();
        } else {
          await this.exitPip();
        }
        break;
      case VisChangeActions.MINI_PLAYER:
        if (!this.state.miniplayer && !isVisible && !this.state.windowedFullscreen && Date.now() > MiniplayerCooldown) {
          this.requestMiniplayer(!isVisible);
        }
        break;
    }

    this.lastPageVisibility = isVisible;
  }

  requestMiniplayer(force) {
    if (EnvUtils.isExtension()) {
      // Check if source is vimeo, then dont do miniplayer
      if (this.client.source && this.client.source.mode === PlayerModes.ACCELERATED_VM) {
        return;
      }


      const styles = {};
      switch (this.client.options.miniPos) {
        case MiniplayerPositions.TOP_LEFT:
          styles.top = '0px';
          styles.left = '0px';
          break;
        case MiniplayerPositions.TOP_RIGHT:
          styles.top = '0px';
          styles.right = '0px';
          break;
        case MiniplayerPositions.BOTTOM_LEFT:
          styles.bottom = '0px';
          styles.left = '0px';
          break;
        case MiniplayerPositions.BOTTOM_RIGHT:
          styles.bottom = '0px';
          styles.right = '0px';
          break;
      }


      this.state.miniplayer = !this.state.miniplayer;
      if (force !== undefined) {
        this.state.miniplayer = force;
      }

      chrome.runtime.sendMessage({
        type: MessageTypes.REQUEST_MINIPLAYER,
        size: this.client.options.miniSize,
        force: this.state.miniplayer,
        styles,
        autoExit: true,
      }, (response) => {
        MiniplayerCooldown = Date.now() + 200;
        this.state.miniplayer = response === 'enter';
        DOMElements.playerContainer.classList.toggle('miniplayer', this.state.miniplayer);
      });
    }
  }

  setMiniplayerStatus(isMini) {
    if (isMini) {
      this.requestMiniplayer(true);
    } else {
      this.requestMiniplayer(false);
    }
  }

  toggleHide() {
    if (this.hidden) {
      DOMElements.playerContainer.classList.remove('player-hidden');
      this.hidden = false;
      if (this.shouldPlay) {
        this.client.player?.play();
      }
    } else {
      DOMElements.playerContainer.classList.add('player-hidden');

      this.hidden = true;
      this.shouldPlay = this.client.state.playing;
      this.client.player?.pause();
    }
  }

  pipToggle(force) {
    if (force !== undefined && !!force == this.isInPip()) {
      return;
    }
    if (this.isInPip()) {
      return this.exitPip();
    } else {
      return this.enterPip();
    }
  }

  isInPip() {
    return !!document.pictureInPictureElement || !!window.documentPictureInPicture?.window || this.state.documentPip;
  }

  shouldDoDocumentPip() {
    // Check if in pip
    if (this.state.documentPip) {
      return true;
    }

    if (!window.documentPictureInPicture) {
      return false;
    }

    // Check if top level frame
    if (window !== window.top) {
      return false;
    }

    return true;
  }

  exitPip() {
    if (window.documentPictureInPicture?.window) {
      window.documentPictureInPicture.window.close();
    } else if (this.state.documentPip) {
      window.close();
    }

    if (document.pictureInPictureElement) {
      return document.exitPictureInPicture();
    }
    return Promise.resolve();
  }

  enterPip() {
    if (this.shouldDoDocumentPip()) {
      return this.enterDocumentPip();
    }

    if (!document.pictureInPictureElement && this.client.player) {
      return this.client.player.getVideo().requestPictureInPicture();
    }
    return Promise.resolve();
  }

  async enterDocumentPip() {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: DOMElements.playerContainer.clientWidth,
      height: DOMElements.playerContainer.clientHeight,
    });

    // Copy all except script tags from the current document to the new window
    const children = [...document.body.children].filter((child) => child.tagName.toLowerCase() !== 'script');
    pipWindow.document.body.append(...children);
    this.state.documentPip = true;

    // Copy style sheets over from the initial document
    // so that the player looks the same.
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules]
            .map((rule) => rule.cssText)
            .join('');
        const style = document.createElement('style');

        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {
        const link = document.createElement('link');

        link.rel = 'stylesheet';
        link.type = styleSheet.type;
        link.media = styleSheet.media;
        link.href = styleSheet.href;
        pipWindow.document.head.appendChild(link);
      }
    });

    pipWindow.addEventListener('pagehide', (event) => {
      this.state.documentPip = false;
      document.body.append(...pipWindow.document.body.children);
    });
  }

  destroy() {
    this.stopProgressLoop();
    this._boundListeners.forEach(({ element, event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });
    this._boundListeners = [];
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }
    this.saveManager.destroy();
  }

  durationChanged() {
    const duration = this.client.duration;
    if (duration < (5 * 60 * this.client.playbackRate) || this.fineTimeControls.started) {
      this.runProgressLoop();
    } else {
      this.stopProgressLoop();
    }
    this.timeUpdated();
  }

  runProgressLoop() {
    if (!this.isRunningProgressLoop) {
      this.isRunningProgressLoop = true;
      this.shouldRunProgressLoop = true;
      this._progressTaskId = FrameBudgetScheduler.instance.register('progress-loop', () => {
        if (!this.shouldRunProgressLoop) {
          this.isRunningProgressLoop = false;
          if (this._progressTaskId) {
            FrameBudgetScheduler.instance.unregister(this._progressTaskId);
            this._progressTaskId = null;
          }
          return;
        }
        this.client.updateTime(this.client.currentTime);
      });
    }
  }

  stopProgressLoop() {
    this.shouldRunProgressLoop = false;
    if (this._progressTaskId) {
      FrameBudgetScheduler.instance.unregister(this._progressTaskId);
      this._progressTaskId = null;
      this.isRunningProgressLoop = false;
    }
  }

  skipSegment() {
    this.progressBar.skipSegment();
    this.hideControlBarOnAction();
  }

  onControlsMouseEnter() {
    this.showControlBar();
    this.mouseOverControls = true;
  }
  onControlsMouseLeave() {
    this.mouseOverControls = false;
    if (document.activeElement && DOMElements.controlsContainer.contains(document.activeElement)) document.activeElement.blur();
    this.queueControlsHide();
  }
  onPlayerMouseMove() {
    if (Date.now() < this.mouseActivityCooldown) {
      return;
    }
    this.showControlBar();
    this.queueControlsHide();
  }

  queueControlsHide(time) {
    clearTimeout(this.hideControlBarTimeout);
    this.hideControlBarTimeout = setTimeout(() => {
      if (!this.focusingControls && !this.mouseOverControls && !this.isBigPlayButtonVisible() && this.state.playing && this.toolManager.canHideControls()) {
        this.hideControlBar();
      }
    }, time || 2000);
  }

  hideControlBarOnAction(cooldown) {
    if (!this.mouseOverControls && !this.focusingControls) {
      this.mouseActivityCooldown = Date.now() + (cooldown || 500);
      if (!this.isBigPlayButtonVisible()) {
        this.hideControlBar();
      }
    }
  }

  hideBigPlayButton() {
    DOMElements.playPauseButtonBigCircle.style.display = 'none';
  }

  isBigPlayButtonVisible() {
    return DOMElements.playPauseButtonBigCircle.style.display !== 'none';
  }

  hideControlBar() {
    clearTimeout(this.hideControlBarTimeout);
    this.controlsVisible = false;
    DOMElements.playerContainer.classList.remove('controls_visible');
    DOMElements.controlsContainer.classList.remove('fade_in');
    DOMElements.controlsContainer.classList.add('fade_out');
    DOMElements.progressContainer.classList.remove('freeze');
  }

  toggleControlBar() {
    if (this.controlsVisible) {
      this.hideControlBar();
    } else {
      this.showControlBar();
    }
  }

  showControlBar() {
    this.controlsVisible = true;
    DOMElements.playerContainer.classList.add('controls_visible');
    DOMElements.controlsContainer.classList.remove('fade_out');
    DOMElements.controlsContainer.classList.add('fade_in');
  }

  showControlBarTemporarily(timeout = 1000) {
    this.showControlBar();
    this.queueControlsHide(timeout);
  }

  updatePlaybackRate() {
    this.playbackRateChanger.setPlaybackRate(this.state.playbackRate, true);
    this.durationChanged();
  }

  updateLanguageTracks() {
    this.languageChanger.updateLanguageTracks(this.client);
  }

  updateQualityLevels() {
    this.videoQualityChanger.updateQualityLevels(this.client);
    this.audioQualityChanger.updateQualityLevels(this.client);
  }

  setVolume(volume) {
    this.volumeControls.setVolume(volume);
  }

  timeUpdated() {
    const duration = this.client.duration;
    if (!this.progressBar.isSeeking) {
      DOMElements.currentProgress.style.width = Utils.clamp(this.state.currentTime / duration, 0, 1) * 100 + '%';
    }
    DOMElements.duration.textContent = StringUtils.formatTime(this.state.currentTime) + ' / ' + StringUtils.formatTime(duration);

    const chapters = this.client.chapters;
    if (chapters.length > 0) {
      const time = this.state.currentTime;
      const chapter = chapters.find((chapter) => chapter.startTime <= time && chapter.endTime >= time);
      if (chapter) {
        this.setStatusMessage('chapter', chapter.name, 'info');
      }
    } else {
      this.setStatusMessage('chapter', null, 'info');
    }

    this.subtitlesManager.renderSubtitles();
    this.fineTimeControls.onVideoTimeUpdate();
    this.updateSkipSegments();
  }

  toggleWindowedFullscreen(force) {
    chrome.runtime.sendMessage({
      type: MessageTypes.REQUEST_WINDOWED_FULLSCREEN,
      force,
    }, (response) => {
      this.state.windowedFullscreen = response === 'enter';
    });
  }

  async fullscreenToggle(force) {
    if (document.fullscreenEnabled) {
      const newValue = force === undefined ? !document.fullscreenElement : force;
      if (newValue) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      }

      this.updateFullScreenButton();
    } else {
      if (EnvUtils.isExtension()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: MessageTypes.REQUEST_FULLSCREEN,
            force,
          }, (response) => {
            if (response === 'error') {
              reject(new Error('Fullscreen not supported'));
              return;
            }
            this.setFullscreenStatus(response === 'enter');
            resolve();
          });
        });
      }
    }
  }

  updateFullScreenButton() {
    this.setFullscreenStatus(document.fullscreenElement);
  }

  setFullscreenStatus(status) {
    const fullScreenButton = DOMElements.fullscreen;
    if (status) {
      fullScreenButton.classList.add('out');
      this.state.fullscreen = true;
    } else {
      fullScreenButton.classList.remove('out');
      if (this.state.fullscreen) {
        this.state.fullscreen = false;
        this.fullscreenToggle(false);
      }
    }
  }

  playPauseToggle() {
    if (!this.client.player) return;

    if (!this.state.playing) {
      this.client.play();
    } else {
      this.client.pause();
    }
  }

  play() {
    const previousValue = this.state.playing;
    this.state.playing = true;
    this.hideBigPlayButton();
    this.updatePlayPauseButton();
    if (!previousValue) {
      this.playPauseAnimation();
      this.queueControlsHide();
    }
  }

  pause() {
    const previousValue = this.state.playing;
    this.state.playing = false;
    this.updatePlayPauseButton();
    this.showControlBar();
    if (previousValue) {
      this.playPauseAnimation();
    }
  }

  updatePlayPauseButton() {
    const playButton = DOMElements.playPauseButton;
    const playButtonBig = DOMElements.playPauseButtonBig;
    if (this.state.playing) {
      playButton.classList.add('playing');
      playButtonBig.classList.replace('fluid_initial_play_button', 'fluid_initial_pause_button');
      WebUtils.setLabels(playButton, Localize.getMessage('player_pause_label'));
    } else {
      playButton.classList.remove('playing');
      playButtonBig.classList.replace('fluid_initial_pause_button', 'fluid_initial_play_button');
      WebUtils.setLabels(playButton, Localize.getMessage('player_play_label'));
    }
  }

  isUserSeeking() {
    return this.progressBar.isSeeking || this.fineTimeControls.isSeeking;
  }

  playPauseAnimation() {
    if (this.isUserSeeking()) {
      return;
    }
    DOMElements.playPauseButtonBigCircle.classList.remove('transform-active');
    void DOMElements.playPauseButtonBigCircle.offsetWidth;
    DOMElements.playPauseButtonBigCircle.classList.add('transform-active');
    setTimeout(
        function() {
          DOMElements.playPauseButtonBigCircle.classList.remove('transform-active');
        },
        450,
    );
  }
}
