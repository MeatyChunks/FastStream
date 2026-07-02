import {DefaultPlayerEvents} from '../../enums/DefaultPlayerEvents.mjs';
import BaseFragmentRequester from '../BaseFragmentRequester.mjs';
import {HLSDecrypter} from './HLSDecrypter.mjs';

export class HLSFragmentRequester extends BaseFragmentRequester {
  constructor(player) {
    super(player);
    this.decrypter = new HLSDecrypter();
  }

  destroy() {
    this.decrypter.destroy();
  }

  _getDownloadConfig(fragment, config) {
    const context = fragment.getContext();
    const frag = fragment.getFrag();

    if (frag.decryptdata) {
      throw new Error('unexpected decryptdata');
    }
    let keyPromise;

    if (frag.fs_oldcryptdata) {
      const toGet = {
        url: frag.fs_oldcryptdata.uri,
        rangeStart: 0,
        rangeEnd: 0,
        responseType: 'arraybuffer',
        storeRaw: true,
        headers: {
          ...config.headers,
          ...this.player.source.headers,
        },
      };
      keyPromise = new Promise((resolve, reject) => {
        this.player.getClient().downloadManager.getFile(toGet, {
          onSuccess: async (entry) => {
            resolve(await entry.getData());
          },
          onFail: (err) => {
            console.log('failed to get key', err);
            reject(err);
          },
          onAbort: (err) => {
            console.log('key aborted', err);
            reject(err);
          },
        });
      });
    }

    return {
      ...context,
      config,
      headers: {
        ...config.headers,
        ...this.player.source.headers,
      },
      postProcessor: async (entry, response) => {
        if (!frag.fs_oldcryptdata) {
          return response;
        }

        const key = await keyPromise;
        const decryptdata = frag.fs_oldcryptdata;

        if (!decryptdata.iv || !key) {
          console.error('missing decryptdata', decryptdata, key);
          this.player.emit(DefaultPlayerEvents.NEED_KEY);
          return response;
        }

        response.data = await this.decrypter.decryptAES(response.data, decryptdata.iv.buffer, key);

        return response;
      },
    };
  }

  _onSuccess(callbacks, entry, data, fragment, context) {
    callbacks.onSuccess({
      url: entry.url,
      data: data,
    }, entry.stats, context, null);
  }
}
