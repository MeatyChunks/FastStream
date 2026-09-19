# Firefox performance validation

This branch keeps smooth presentation work on requestAnimationFrame while moving expensive DOM, layout, storage, and teardown work off the hot path.

## Test workloads

Run each workload in a fresh Firefox profile with the same video and quality level.

1. Playback only for 10 minutes.
2. Playback with subtitles, seek previews, and repeated timeline scrubbing.
3. Playback with the fine timeline open, including subtitle dragging and frame previews.
4. Ten same-tab navigations between videos.
5. Thirty-minute soak with two quality changes, two audio-track changes, and repeated timeline open/close cycles.

## Record before and after

- Firefox process resident memory.
- about:processes CPU while playing and while paused.
- Main-thread long tasks in the Performance profiler.
- Number of live HTMLVideoElement and HTMLAudioElement nodes.
- Number and state of AudioContext instances.
- DOM node count after each navigation.
- IndexedDB temporary database count.
- Timeline animation smoothness while scrubbing and dragging subtitles.
- Frame-preview update cadence with the fine timeline open.

## High-FPS acceptance gates

- Timeline translation remains requestAnimationFrame-driven.
- Fine-timeline render events remain requestAnimationFrame-driven for interactive overlays.
- Current-frame preview drawing keeps its existing approximately 23 fps throttle.
- Background frame-image sources may refresh at 10 Hz because they do not represent pointer motion.
- Tick DOM and audio-canvas structure rebuild only when the visible timeline window or analyzer data changes.
- Pointer handlers do not interleave repeated layout reads and writes.

## Memory and lifecycle gates

- Destroy operations are idempotent.
- HLS loading stops before hls.js teardown.
- Destroyed clients cannot finish delayed main-player, preview-player, or synced-audio setup and reattach media nodes.
- Download teardown aborts synchronously and closes storage before releasing its handles.
- Ten navigations do not leave a growing count of media elements, observers, document listeners, or audio contexts.
- Temporary IndexedDB keepalive writes do not run once per second.
- Freeable fragments continue to use FastStream's existing reference-aware buffer cleanup; there is no blind FIFO eviction.

## Playback-rate regression matrix

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

## Commands

```bash
npm install
npm test
npm run build
```

The source-invariant suite is a regression net, not a substitute for the Firefox profiling workloads above.
