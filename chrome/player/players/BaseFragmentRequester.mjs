import {DefaultPlayerEvents} from '../enums/DefaultPlayerEvents.mjs';
import {DownloadStatus} from '../enums/DownloadStatus.mjs';

export default class BaseFragmentRequester {
  constructor(player) {
    this.player = player;
  }

  destroy() {

  }

  _getDownloadConfig(fragment, config) {
    const context = fragment.getContext();
    return {
      ...context,
      config,
      headers: {
        ...config.headers,
        ...this.player.source.headers,
      },
    };
  }

  _onSuccess(callbacks, entry, data, fragment, context) {
    callbacks.onSuccess(entry, data);
  }

  requestFragment(fragment, callbacks, config, priority) {
    const context = fragment.getContext();
    config = config || {};

    if (fragment.status === DownloadStatus.WAITING) {
      fragment.status = DownloadStatus.DOWNLOAD_INITIATED;
      this.player.emit(DefaultPlayerEvents.FRAGMENT_UPDATE, fragment);
    }

    const downloadConfig = this._getDownloadConfig(fragment, config);

    const loader = this.player.getClient().downloadManager.getFile(downloadConfig, {
      onSuccess: async (entry, xhr) => {
        let data;
        try {
          if (!callbacks.skipProcess) {
            data = await entry.getDataFromBlob();
          }
          fragment.dataSize = entry.dataSize;
        } catch (e) {
          console.error(e);
          fragment.status = DownloadStatus.DOWNLOAD_FAILED;
          this.player.emit(DefaultPlayerEvents.FRAGMENT_UPDATE, fragment);
          callbacks.onFail(entry);
          return;
        }
        if (fragment.status !== DownloadStatus.DOWNLOAD_COMPLETE) {
          fragment.status = DownloadStatus.DOWNLOAD_COMPLETE;
          this.player.emit(DefaultPlayerEvents.FRAGMENT_UPDATE, fragment);
        }
        this._onSuccess(callbacks, entry, data, fragment, context);
      },
      onProgress: (stats, context2, data, xhr) => {
        if (callbacks.onProgress) callbacks.onProgress(stats, context, data, xhr);
      },
      onFail: (entry) => {
        fragment.status = DownloadStatus.DOWNLOAD_FAILED;
        this.player.emit(DefaultPlayerEvents.FRAGMENT_UPDATE, fragment);
        callbacks.onFail(entry);
      },
      onAbort: (entry) => {
        fragment.status = DownloadStatus.WAITING;
        this.player.emit(DefaultPlayerEvents.FRAGMENT_UPDATE, fragment);
        if (callbacks.onAbort) callbacks.onAbort(entry);
      },
    }, priority);

    return loader;
  }
}
