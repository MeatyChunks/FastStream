const sentUrls = new Set();

// Listen for sources posted from the page world
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }

  if (typeof event.data !== 'object' || event.data === null) {
    return;
  }

  if (event.data.type === 'fs_videojs_sources') {
    const sources = event.data.sources;
    if (Array.isArray(sources)) {
      sources.forEach((s) => {
        if (sentUrls.has(s.src)) {
          return;
        }
        sentUrls.add(s.src);

        // Send each quality option to the background script
        chrome.runtime.sendMessage({
          type: 'DETECTED_SOURCE',
          url: s.src,
          ext: 'mp4', // VideoJS direct sources are usually MP4 or direct streams
          label: s.label,
          res: s.label ? s.label.replace(/p/gi, '') : '',
          headers: {
            'Referer': location.href,
            'Origin': location.origin,
          },
        });
      });
    }
  }
});

// Check if the page has a videojs player or element
function inject() {
  const hasVideoJS = document.querySelector('.video-js, video[data-setup]');
  if (hasVideoJS) {
    const sc = document.createElement('script');
    sc.src = chrome.runtime.getURL('custom/videojs_inject.js');
    const target = document.head || document.documentElement;
    target.appendChild(sc);
    sc.remove();
  }
}

// Run injection after DOM loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}
