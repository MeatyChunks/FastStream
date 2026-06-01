(function() {
  let hookedPlayers = new Set();

  let lastSentSourcesStr = '';

  function sendSources(player) {
    try {
      // Retrieve current sources list from VideoJS player instance
      let sources = [];
      if (player.currentSources) {
        sources = player.currentSources();
      } else if (player.options_ && player.options_.sources) {
        sources = player.options_.sources;
      }

      if (sources && sources.length > 0) {
        // Map sources to a standard format
        const formattedSources = sources.map(s => ({
          src: s.src,
          type: s.type || 'video/mp4',
          label: s.label || s.res || s.size || ''
        })).filter(s => s.src && s.src.startsWith('http'));

        if (formattedSources.length > 0) {
          const sourcesStr = JSON.stringify(formattedSources);
          if (sourcesStr === lastSentSourcesStr) {
            return;
          }
          lastSentSourcesStr = sourcesStr;

          window.postMessage({
            type: 'fs_videojs_sources',
            sources: formattedSources
          }, '*');
          console.log('[FastStream VideoJS] Extracted sources:', formattedSources);
        }
      }
    } catch (e) {
      console.error('[FastStream VideoJS] Error extracting sources:', e);
    }
  }

  function hookPlayer(player) {
    if (hookedPlayers.has(player)) return;
    hookedPlayers.add(player);

    // Try to extract sources immediately
    sendSources(player);

    // Listen to source/load changes
    player.on('loadstart', () => sendSources(player));
    player.on('loadedmetadata', () => sendSources(player));
  }

  function scanForPlayers() {
    if (window.videojs && window.videojs.players) {
      Object.values(window.videojs.players).forEach(hookPlayer);
    }
  }

  // Periodically scan the page for any new VideoJS players
  setInterval(scanForPlayers, 1000);

  // Initial scan
  if (window.videojs) {
    scanForPlayers();
  } else {
    // Hook property definition if videojs loads later
    let _videojs = undefined;
    Object.defineProperty(window, 'videojs', {
      get: () => _videojs,
      set: (val) => {
        _videojs = val;
        try {
          setTimeout(scanForPlayers, 100);
        } catch (e) {}
      },
      configurable: true,
      enumerable: true
    });
  }
})();
