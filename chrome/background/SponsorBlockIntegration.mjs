import {EnvUtils} from '../player/utils/EnvUtils.mjs';

const SponsorBlockID = EnvUtils.isChrome() ? 'mnjggcdmjocbbbhaepdhchncahnbgone' : 'sponsorBlocker@ajay.app';

export class SponsorBlockIntegration {
  constructor() {

  }

  setup() {
    // chrome.runtime.onMessageExternal.addListener(this.onMessageExternal.bind(this));
    // setTimeout(()=>{ // Wait for SponsorBlock to load
    //   chrome.runtime.sendMessage(SponsorBlockID, {
    //     type: 'hello',
    //     name: 'FastStream',
    //     version: EnvUtils.getVersion(),
    //   });
    // }, 2000);
  }

  onMessageExternal(request, sender, sendResponse) {
    if (sender.id !== SponsorBlockID) {
      return;
    }
  }

  onPlayerMessage(msg, sendResponse) {
    return; // TODO: Integrate with forked version in future
  }

  getSkipSegments(videoID) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(SponsorBlockID, {
        type: 'skipSegments',
        videoID: videoID,
      }, (response) => {
        resolve(response);
      });
    });
  }

  segmentSkipped(UUID) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(SponsorBlockID, {
        type: 'segmentSkipped',
        UUID: UUID,
      }, (response) => {
        resolve(response);
      });
    });
  }
}
