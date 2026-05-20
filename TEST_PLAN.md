# Memory Test Plan — FastStream

Purpose
- Measure real memory impact of the recent changes (fragment freeing, DOM cleanup, download eviction, SourceBuffer eviction) using the included telemetry and a small collection snippet.

Prerequisites
- Chromium-based browser (Chrome 114+ or similar) and Firefox for cross-browser checks.
- Load the MeatyChunks/FastStream extension as an unpacked extension in Developer mode (chrome://extensions -> Load unpacked).
- In the extension's background page DevTools you can run the collection snippet (scripts/collect_metrics_snippet.js).

Overview of measurements
- We will gather snapshots (chrome.storage-local-backed MetricsLogger entries) before and after selected actions.
- Where available, manually log per-player client.getMemoryMetrics() to the MetricsLogger from the player console to get detailed fragment counts.

Key steps

1) Baseline snapshot
- Start with a fresh browser profile, load the extension.
- Open the extension background page DevTools: chrome://extensions -> Inspect views (background page).
- In the background console, run the contents of `scripts/collect_metrics_snippet.js` (paste into console) and then call:

  getMetricsReport()

  - This prints the current metrics_log summary and an estimated baseline.

2) Scenario A — single player playback
- Open a site with a single FastStream-enabled video and start playback at a moderate bitrate.
- Let it play for ~60–90 seconds to accumulate fragments.
- Trigger quality switch or force a reset (e.g., fast seek or reload the player instance).
- In the background console run:

  // capture after scenario
  getMetricsReport()

- In the player iframe console (inspect the player frame) optionally run:

  // if `client` is in scope
  MetricsLogger.log('memory', 'client_snapshot', client.getMemoryMetrics());

3) Scenario B — repeated SPA navigation (orphan cleanup)
- On a site that uses SPA navigation and embeds players, navigate repeatedly between pages that create/destroy players.
- After ~10 navigations, run `getMetricsReport()` in the background console.
- Expected: playerCount and iframeCount snapshots should remain stable (no steady growth) and estimated per-player memory should be lower than baseline.

4) Scenario C — downloads backlog
- Start several downloads in the player (store completed entries) to stress DownloadManager storage.
- After creating many completed entries, run `getMetricsReport()`.
- Expected: DownloadManager eviction will cap entries to 1000 (default). If you create many large entries, you should see higher memory usage removed after eviction.

5) Firefox-specific verification
- In Firefox with a similar flow, verify FSBlob behavior: after playing a video, observe that IDB entries are deleted (orphaning) so disk usage does not grow unbounded.

How to interpret results (use the script's output)
- If fragmentCount metrics are present, the script converts them to estimated bytes using the avgFragmentBytes parameter (default 512 KB). The script prints estimated "fragment memory" in MB.
- The script also provides a conservative "per-player expected savings" estimate (default 30 MB per player) when fine-grained fragment data is missing.

Recommended acceptance criteria
- Typical single-player scenario should show a reduction of ~15–40 MB after resets/level switches compared to baseline (empirical results vary).
- SPA navigation should not cause steady memory growth across repeated navigations; Tab/player counts should remain stable.
- Download backlog should be bounded by the configured cap (default 1000 entries).

Notes
- For highest fidelity, instrument `client.getMemoryMetrics()` to log before/after snapshots for the same player instance and compute deltas in the background console.
- Consider temporarily increasing `MAX_ENTRIES` or `DownloadManager._maxStorageEntries` values for stress testing; revert before production.
