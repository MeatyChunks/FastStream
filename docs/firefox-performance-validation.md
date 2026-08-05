# Firefox performance validation

This rebuild targets Firefox first. Performance changes are accepted only when they reduce measured work or fix a demonstrated leak.

## Test workloads

Run each workload in a fresh Firefox profile with the same video and quality level.

1. Playback only for 10 minutes.
2. Playback with subtitles, seek previews, and repeated timeline scrubbing.
3. Playback with intro/outro analysis enabled.
4. Ten same-tab navigations between videos.
5. Thirty-minute soak with two quality changes and two audio-track changes.

## Record before and after

- Firefox process resident memory.
- `about:processes` CPU while playing and while paused.
- Main-thread long tasks in the Performance profiler.
- Number of live `HTMLVideoElement` and `HTMLAudioElement` nodes.
- Number and state of `AudioContext` instances.
- DOM node count after each navigation.
- IndexedDB temporary database count.
- Heap growth after forced garbage collection in DevTools.
- Timeline drag and subtitle-edit responsiveness.

## Playback-rate regression matrix

The main player must start at 1x unless the user explicitly selected another rate.

- Fresh source at 1x.
- Persisted 2x preference.
- Reload after changing from 2x back to 1x.
- Buffering and resume.
- Background tab suspension and restore.
- Quality change.
- Audio-track change.
- Positive and negative video delay.
- Analyzer running at its private accelerated rate.
- Same-tab navigation to the next source.

## Memory acceptance gates

- Destroy operations are idempotent.
- Destroyed players cannot complete delayed setup and reattach media nodes.
- Ten navigations do not leave a growing count of media elements or audio contexts.
- Download and analysis caches have explicit finite limits.
- Temporary IndexedDB keepalive writes do not run once per second.
- HLS loading stops before teardown.

## UI acceptance gates

- Pointer handlers do not interleave repeated layout reads and writes.
- Subtitle bounds are recomputed only after layout invalidation.
- Timeline canvases redraw only after their backing dimensions change.
- Equalizer drag geometry is cached and invalidated on resize.
- Analyzer marker updates must be throttled independently from display refresh.

## Release checklist

```bash
npm install
npm test
npm run build
```

Load the generated Firefox extension temporarily, execute the five workloads, and attach measurements to the pull request before merging.
