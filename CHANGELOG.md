# Changelog

Unreleased — changes from the comparison between f31b1f1 and ae0db41

Version: 1.4.0-beta.3 (packaged change set)

Summary
- New telemetry: MetricsLogger added to background to capture startup, player open, player loaded and periodic memory snapshots. Bounded buffer (MAX_ENTRIES = 500) and alarm-based flush.
- Robust lifecycle and memory management across the extension: explicit fragment frees, SourceBuffer eviction on QuotaExceededError, LargeBuffer.destroy(), EventEmitter.destroy(), and DownloadManager eviction logic with a configurable cap.
- DOM cleanup improvements: safer removePlayers(), nulling DOM references, disconnect ResizeObserver, stop orphaned iframes to allow GC, and safer event listener options (passive/capture).
- InterfaceController now tracks and removes bound listeners and disconnects IntersectionObserver on destroy.
- Firefox-specific: FSBlob deletes IDB entries to avoid quota accumulation; SourceBuffer mode and Quota handling improved for cross-browser stability.
- Minor: loop-by-default option plumbing, prioritized analyzer fragment requests, safer audioContext close, manifest and package version bumps.

Memory-related highlights and expected impact
- Explicit fragment freeing and fragmentStore bucket deletion:
  - Expected per-player memory reduction when switching levels or resetting players.
  - Likely range: 15–40 MB saved per player in typical cases (conservative 5–10 MB, optimistic 40–120 MB).

- DOM/iframe cleanup and observer disconnection (content.js):
  - Nulling DOM refs, disconnecting ResizeObservers and deleting iframeMap entries allows GC of large DOM+player objects.
  - Likely range: 5–20 MB saved per removed/replaced player (conservative 1–5 MB, optimistic 20–60 MB).

- DownloadManager & FSBlob eviction:
  - Caps in-memory download entries and deletes old IDB entries on Firefox to avoid quota/disk accumulation.
  - This prevents unbounded memory/disk growth; savings depend on backlog (likely tens to hundreds of MB in heavy usage).

- SourceBuffer eviction and QuotaExceeded recovery:
  - When appends would exceed memory, the code evicts older buffered segments to recover and continue.
  - Prevents crashes and can reduce per-player memory by tens of MB in high-bitrate scenarios.

- Small but cumulative improvements: LargeBuffer.destroy(), EventEmitter cleanup, and centralized removal of event listeners lower leak surface; expect a few MB per client.

Telemetry note
- MetricsLogger enables data-driven measurement (writes to chrome.storage.local under `metrics_log`). Use provided test plan and snippet to collect and compute empirical memory deltas.

Confidence levels
- Estimates are heuristic and workload-dependent. Confidence per category ranged from Medium to High for correctness of behavior (not precise bytes). Use the test plan and metrics script to quantify real-world savings on representative workloads.
