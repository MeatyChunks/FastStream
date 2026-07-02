import BaseFragmentRequester from '../BaseFragmentRequester.mjs';

export class DashFragmentRequester extends BaseFragmentRequester {
  _getDownloadConfig(fragment, config) {
    const context = fragment.getContext();
    return {
      ...context,
      config,
      headers: {
        ...config.headers,
        ...this.player.source.headers,
      },
      preProcessor: async (entry, request) => {
        if (this.player.preProcessFragment) {
          const startTime = fragment.start;
          const isInit = fragment.sn === -1;
          return await this.player.preProcessFragment(entry, request, startTime, isInit);
        }
        return request;
      },
      postProcessor: async (entry, response) => {
        if (this.player.postProcessFragment) {
          const startTime = fragment.start;
          const isInit = fragment.sn === -1;
          return await this.player.postProcessFragment(entry, response, startTime, isInit);
        }
        return response;
      },
    };
  }
}
