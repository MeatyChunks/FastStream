import BaseFragmentRequester from '../BaseFragmentRequester.mjs';

export class MP4FragmentRequester extends BaseFragmentRequester {
  _onSuccess(callbacks, entry, data, fragment, context) {
    if (data) data.fileStart = entry.rangeStart;
    callbacks.onSuccess(entry, data);
  }
}
