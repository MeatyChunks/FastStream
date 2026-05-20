/*
 * collect_metrics_snippet.js
 *
 * Paste this into the extension background page DevTools console (or run inside the background context)
 * to read `metrics_log` from chrome.storage.local and compute simple memory estimates.
 *
 * Usage examples (in the extension background console):
 *   // default
 *   getMetricsReport();
 *
 *   // override average fragment bytes (e.g., 256 KB)
 *   getMetricsReport({ avgFragmentBytes: 256 * 1024 });
 */

async function getMetricsReport(opts = {}) {
  const cfg = Object.assign({ avgFragmentBytes: 512 * 1024, perPlayerFallbackMB: 30 }, opts);

  function readStorage(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (res) => resolve(res[key] || []));
      } catch (e) {
        console.error('chrome.storage access failed (are you in background context?)', e);
        resolve([]);
      }
    });
  }

  const entries = await readStorage('metrics_log');
  if (!entries || entries.length === 0) {
    console.log('No metrics_log entries found. Use MetricsLogger.log(...) in background or client.getMemoryMetrics() in player console to add snapshots.');
    return { entries: 0 };
  }

  // Basic aggregation
  let totalFragmentCount = 0;
  let fragmentSnapshots = 0;
  let totalPlayerSnapshots = 0;
  let lastPlayerCount = null;

  for (const e of entries) {
    // e shape: { ts, cat, evt, ...data }
    if (e.evt === 'client_snapshot' || e.evt === 'clientMetrics' || e.cat === 'memory') {
      // Prefer fields from client snapshots
      if (e.fragmentCount !== undefined) {
        totalFragmentCount += e.fragmentCount;
        fragmentSnapshots++;
      }
      if (e.playerCount !== undefined) {
        lastPlayerCount = e.playerCount;
        totalPlayerSnapshots++;
      }
    }
    // Some code logs with evt='snapshot' under memory cat
    if (e.cat === 'memory' && e.evt === 'snapshot') {
      if (e.iframeCount !== undefined) lastPlayerCount = e.iframeCount;
    }
  }

  const avgFragmentCount = fragmentSnapshots ? (totalFragmentCount / fragmentSnapshots) : 0;
  const fragBytes = avgFragmentCount * cfg.avgFragmentBytes;
  const fragMB = fragBytes / (1024 * 1024);

  console.log('Metrics log entries:', entries.length);
  console.log('Fragment snapshots found:', fragmentSnapshots);
  if (fragmentSnapshots) {
    console.log(`Average fragmentCount (per snapshot): ${avgFragmentCount.toFixed(1)} fragments -> ~${fragMB.toFixed(1)} MB using avgFragmentBytes=${cfg.avgFragmentBytes} bytes`);
  } else {
    console.log('No fragmentCount snapshots found in metrics. You can manually log client.getMemoryMetrics() from the player console: MetricsLogger.log("memory","client_snapshot", client.getMemoryMetrics())');
  }

  if (lastPlayerCount !== null) {
    console.log('Last player/iframe count snapshot:', lastPlayerCount);
    const estimatedPerPlayerSavingMB = cfg.perPlayerFallbackMB;
    const estimatedTotalSavingsMB = lastPlayerCount * estimatedPerPlayerSavingMB;
    console.log(`Estimated total memory savings (fallback): ${estimatedTotalSavingsMB.toFixed(1)} MB (${estimatedPerPlayerSavingMB} MB * ${lastPlayerCount} players)`);
  }

  // Provide a small summary object for programmatic use
  const report = {
    entries: entries.length,
    fragmentSnapshots: fragmentSnapshots,
    avgFragmentCount: avgFragmentCount,
    avgFragmentBytes: cfg.avgFragmentBytes,
    estimatedFragmentMemoryMB: fragMB,
    lastPlayerCount: lastPlayerCount,
    perPlayerFallbackMB: cfg.perPlayerFallbackMB,
    estimatedTotalSavingsMB: lastPlayerCount ? lastPlayerCount * cfg.perPlayerFallbackMB : null,
  };

  return report;
}

// Expose for interactive use
window.getMetricsReport = getMetricsReport;
console.log('getMetricsReport() is available. Run getMetricsReport() to print a report and return a summary object.');
