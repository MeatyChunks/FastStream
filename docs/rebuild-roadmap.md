# FastStream Rebuild Roadmap

This branch starts from upstream FastStream `V1.3.77` (`d5fe931`) and intentionally excludes the existing fork performance experiments.

The old fork remains the evidence archive. Changes should only be reintroduced when they are isolated, measured, and independently revertible.

## Goals

1. Fix videos unexpectedly starting or becoming stuck at 2× playback speed.
2. Reduce retained memory across navigation, source changes, preview playback, analysis, and audio synchronisation.
3. Improve interface responsiveness by removing measured main-thread hot paths.
4. Keep every behavioural and performance change small enough to benchmark, review, bisect, and revert independently.

## Working branches

- `rebuild/from-upstream`: clean integration baseline and roadmap.
- `fix/playback-rate-ownership`: authoritative playback-rate state and regression tests.
- `perf/player-lifecycle`: player, media element, timer, listener, and object URL teardown.
- `perf/audio-lifecycle`: AudioContext and Web Audio node ownership.
- `perf/cache-bounds`: bounded downloads, blobs, preview frames, analyzer samples, and histories.
- `perf/background-analysis`: decoded-frame scheduling and real analysis throttling.
- `perf/ui-responsiveness`: timeline, subtitles, equalizer, menus, and pointer hot paths.
- `perf/scheduler`: replace the monolithic polling loop with event-driven or responsibility-specific scheduling.

Create each work branch from the latest validated `rebuild/from-upstream` state. Merge only after its focused tests and benchmark scenario pass.

## Phase 1: Playback-rate ownership

### Reproduce first

Cover at least these scenarios before implementing the fix:

- Fresh playback at the default 1× rate.
- Previously selected 2× followed by selecting 1× and reloading.
- Buffering, pause, resume, seeking, and tab suspension.
- Video quality and audio-track changes.
- Positive and negative video delay.
- Source replacement and playlist navigation.
- Preview and intro/outro analyzer players running concurrently.

### Implementation rules

- The main client owns one desired playback rate.
- Route all main-player rate changes through one controller or method.
- Preview, analyzer, and synchronized-audio players must not mutate main-player rate state.
- Reapply the desired rate when a media element is created or replaced.
- Observe unexpected `ratechange` events and record their source while preventing feedback loops.
- Do not silently clamp valid user rates beyond browser and application limits.

### Regression tests

- Main video starts at 1× unless another rate was intentionally selected.
- Saved playback rate is restored intentionally.
- Quality and audio-level changes preserve the chosen rate.
- Audio resynchronisation preserves the chosen rate.
- Analyzer playback at an elevated rate cannot affect the main video.
- Destroyed players cannot mutate a replacement player's rate.

## Phase 2: Baseline measurements

Capture the same workloads in Firefox and Chromium before each performance series:

- Playback only.
- Playback with subtitles and seek preview.
- Playback with intro/outro analysis.
- Ten sequential source or page navigations.
- Thirty-minute steady-state playback.

Record:

- Process and JavaScript heap memory.
- DOM node count.
- Live media element count.
- Live AudioContext count.
- Active timers and animation-frame loops where observable.
- Idle CPU and analyzer-active CPU.
- Long tasks over 16 ms.
- Interaction latency while scrubbing, dragging controls, and opening menus.

Store reproducible steps and results under `docs/performance/`.

## Phase 3: Memory lifecycle

Audit all owners and make teardown idempotent:

- Main, preview, analyzer, and synchronized-audio players.
- HLS, DASH, MP4, direct, and YouTube adapters.
- MediaSource instances, SourceBuffers, blob URLs, and fragment references.
- Video and audio DOM elements.
- AudioContexts and connected Web Audio nodes.
- EventEmitter contexts, DOM listeners, observers, intervals, timeouts, and animation callbacks.

A component must only destroy resources it owns. Shared AudioContexts and nodes require explicit ownership metadata.

After teardown, media elements should be paused, detached from sources, asked to release resources, and removed from the DOM.

## Phase 4: Bound caches and retained collections

Every growing collection needs an explicit count, byte, or age limit:

- Download metadata and blob storage.
- Downloaded fragments retained outside the active buffer window.
- Preview frames and analyzer samples.
- Subtitle editing and rendered cue structures.
- Seek undo and redo history.
- Progress records and temporary IndexedDB databases.
- Source, tab, frame, and diagnostic records.

Limits must be justified by observed workloads rather than chosen solely for convenience.

## Phase 5: Background analysis

- Prefer `requestVideoFrameCallback` when supported.
- Ensure the actual background analyzer, not only the foreground sampling hook, is rate limited.
- Avoid resetting timers on every display frame.
- Throttle marker updates separately from frame analysis.
- Reuse canvases and buffers.
- Stop analyzer players immediately after completion or cancellation.
- Pause unnecessary work while hidden unless background analysis is explicitly required.
- Chunk expensive calculations to avoid long main-thread tasks.

## Phase 6: UI responsiveness

Profile before changing:

- Timeline scrubbing and fine-time controls.
- Seek previews.
- Subtitle display and editing.
- Equalizer dragging.
- Menu opening and closing.
- Fullscreen transitions.
- Quality, language, and source changes.

Preferred techniques:

- Batch layout reads before DOM or canvas writes.
- Cache geometry for one interaction and invalidate with `ResizeObserver` where appropriate.
- Coalesce pointer events into one animation-frame update.
- Update text and attributes only when values change.
- Avoid rebuilding complete menus for isolated value changes.
- Keep fragment scans, storage estimation, and persistence out of pointer handlers.

## Phase 7: Scheduling

Replace the single periodic work bundle with separate responsibilities:

- Playback state: player events.
- Quality state: level-change events.
- Fragment scheduling: download and playback events with a guarded fallback timer.
- Storage estimates: infrequent or dirty-triggered calculation.
- Analyzer persistence: debounced dirty writes.
- Audio drift: active only when delayed separate audio is in use.
- UI clock: animation-frame updates while visible, reduced cadence while hidden.

## Change acceptance criteria

A performance change is accepted only when:

- It has a reproducible before-and-after scenario.
- It does not bundle unrelated refactoring.
- Behavioural tests pass.
- The measured result improves or removes demonstrable work.
- Any trade-off in latency, memory, accuracy, battery, or complexity is documented.
- The change remains independently revertible.

## Definition of done

- Main playback never starts at 2× unless 2× was intentionally selected.
- Analyzer and preview rates cannot leak into the main player.
- Repeated source changes do not accumulate media elements, AudioContexts, listeners, or timers.
- Long playback does not show unbounded retained-memory growth.
- Idle CPU remains low after analysis completes or is disabled.
- Analyzer CPU is lower than the upstream baseline without breaking matching behaviour.
- Scrubbing and control dragging avoid repeated long tasks.
- Performance claims are backed by committed benchmark evidence.
