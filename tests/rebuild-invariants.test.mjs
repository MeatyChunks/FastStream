import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('synced audio teardown is idempotent and fixes mutable level state', async () => {
  const source = await readSource('chrome/player/players/SyncedAudioPlayer.mjs');
  assert.match(source, /let changed = false;/);
  assert.match(source, /if \(this\.destroyed\) return;/);
  assert.match(source, /next\.playbackRate = this\.playbackRate/);
});

test('HLS stops network loading before teardown without stale PlayerBase refactor', async () => {
  const source = await readSource('chrome/player/players/hls/HLSPlayer.mjs');
  assert.match(source, /this\.hls\.stopLoad\(\)/);
  assert.doesNotMatch(source, /PlayerBase/);
});

test('temporary IndexedDB keepalive is not a one-second write loop', async () => {
  const source = await readSource('chrome/player/network/IndexedDBManager.mjs');
  assert.match(source, /}, 5000\);/);
  assert.doesNotMatch(source, /}, 1000\);/);
});

test('download teardown is asynchronous and does not use blind FIFO eviction', async () => {
  const source = await readSource('chrome/player/network/DownloadManager.mjs');
  assert.match(source, /async destroy\(\)/);
  assert.match(source, /this\._destroyPromise/);
  assert.doesNotMatch(source, /_maxStorageEntries/);
});

test('client teardown owns download cleanup and tracks delayed init work', async () => {
  const source = await readSource('chrome/player/FastStreamClient.mjs');
  assert.match(source, /this\._destroyPromise/);
  assert.match(source, /destroyDownloads/);
  assert.match(source, /this\._initHookInterval/);
  assert.match(source, /if \(this\.destroyed \|\| this\.player !== player\)/);
});

test('timeline keeps smooth frame presentation while caching structural work', async () => {
  const source = await readSource('chrome/player/ui/FineTimeControls.mjs');
  assert.match(source, /_timelineWindowKey/);
  assert.match(source, /_audioDirty/);
  assert.match(source, /FRAME_SOURCE_REFRESH_MS/);
  assert.match(source, /style\.transform/);
  assert.match(source, /renderVideoFrames\(duration, minTime, maxTime, refreshSources\)/);
});

test('interface and subtitle UI clean up lifecycle-heavy resources', async () => {
  const interfaceSource = await readSource('chrome/player/ui/InterfaceController.mjs');
  const subtitleSource = await readSource('chrome/player/ui/subtitles/SubtitlesManager.mjs');
  assert.match(interfaceSource, /_boundListeners/);
  assert.match(interfaceSource, /this\.fineTimeControls\.destroy\(\)/);
  assert.match(subtitleSource, /_layoutDirty/);
  assert.match(subtitleSource, /childrenChanged/);
});


test('seek and replacement UI remain frame-driven while caching layout work', async () => {
  const progressSource = await readSource('chrome/player/ui/ProgressBar.mjs');
  const interfaceSource = await readSource('chrome/player/ui/InterfaceController.mjs');
  const contentSource = await readSource('chrome/content.js');

  assert.match(progressSource, /_progressGeometry/);
  assert.match(progressSource, /renderProgressbarPreview/);
  assert.match(progressSource, /dragFrame = window\.requestAnimationFrame/);
  assert.match(interfaceSource, /_fragmentUpdateFrame/);
  assert.match(contentSource, /replacedPlayersFrame = window\.requestAnimationFrame/);
  assert.match(contentSource, /function querySelectorIncludingShadows/);
});

test('page video source variants flow into the quality picker and preserve playback state', async () => {
  const contentSource = await readSource('chrome/content.js');
  const backgroundSource = await readSource('chrome/background/background.mjs');
  const mainSource = await readSource('chrome/player/main.mjs');
  const videoSource = await readSource('chrome/player/VideoSource.mjs');
  const clientSource = await readSource('chrome/player/FastStreamClient.mjs');
  const qualitySource = await readSource('chrome/player/ui/menus/VideoQualityChanger.mjs');

  assert.match(contentSource, /collectVideoSourceVariants/);
  assert.match(backgroundSource, /videoSourceVariants/);
  assert.match(mainSource, /source\.sourceVariants = videoSourceVariants/);
  assert.match(videoSource, /sourceVariants = this\.sourceVariants\.map/);
  assert.match(clientSource, /async setSourceVariant\(variant\)/);
  assert.match(clientSource, /const currentTime = this\.currentTime/);
  assert.match(qualitySource, /sourceQualityChanged/);
  assert.match(qualitySource, /formatSourceVariantLabel/);
});


test('page source variants respect default quality without overriding explicit picks', async () => {
  const levelSource = await readSource('chrome/player/players/LevelManager.mjs');
  const videoSource = await readSource('chrome/player/VideoSource.mjs');
  const clientSource = await readSource('chrome/player/FastStreamClient.mjs');

  assert.match(levelSource, /pickSourceVariant\(variants, desiredHeight = null, currentURL = null\)/);
  assert.match(levelSource, /this\.getDesiredVideoHeight\(\)/);
  assert.match(clientSource, /applyPreferredSourceVariant\(source\)/);
  assert.match(clientSource, /source\.sourceVariantExplicit/);
  assert.match(clientSource, /source\.sourceVariantExplicit = true/);
  assert.match(videoSource, /newsource\.sourceVariantExplicit = this\.sourceVariantExplicit/);
});

test('static timeline segments are cached while dynamic controls remain frame-driven', async () => {
  const progressSource = await readSource('chrome/player/ui/ProgressBar.mjs');
  const interfaceSource = await readSource('chrome/player/ui/InterfaceController.mjs');

  assert.match(progressSource, /_skipLayoutDirty/);
  assert.match(progressSource, /rebuildSkipLayout\(duration\)/);
  assert.match(progressSource, /rebuildChapterLayout\(duration\)/);
  assert.match(progressSource, /_nextBannerSeconds/);
  assert.match(interfaceSource, /updateSkipSegments\(layoutChanged = false\)/);
  assert.match(interfaceSource, /this\.progressBar\.invalidateSkipLayout\(\)/);
});

test('fine timeline drag is display-frame coalesced and caches width', async () => {
  const source = await readSource('chrome/player/ui/FineTimeControls.mjs');

  assert.match(source, /_timelineDragFrame/);
  assert.match(source, /_timelineWidth/);
  assert.match(source, /this\._timelineDragFrame = window\.requestAnimationFrame/);
  assert.doesNotMatch(source, /delta \/ this\.ui\.timelineTicks\.clientWidth/);
});

test('background preview frame encoding avoids synchronous base64 round trips', async () => {
  const source = await readSource('chrome/player/modules/analyzer/PreviewFrameExtractor.mjs');

  assert.match(source, /extractorCanvas\.toBlob/);
  assert.match(source, /pendingFrameEncodes/);
  assert.doesNotMatch(source, /atob\(/);
});

test('download housekeeping is throttled without changing buffer targets', async () => {
  const clientSource = await readSource('chrome/player/FastStreamClient.mjs');
  const managerSource = await readSource('chrome/player/network/DownloadManager.mjs');

  assert.match(clientSource, /updateHasDownloadSpace\(force = false\)/);
  assert.match(clientSource, /now - lastUpdate < 5000/);
  assert.match(clientSource, /bufferAhead: 300/);
  assert.match(clientSource, /bufferBehind: 20/);
  assert.match(managerSource, /while \(this\.queue\.length > 0 && this\.queue\[0\]\.status !== DownloadStatus\.ENQUEUED\)/);
});

test('HTML source quality example covers preferred resolution choices', async () => {
  const source = await readSource('example/source-qualities.html');

  assert.match(source, /data-quality="1080p"/);
  assert.match(source, /data-quality="720p"/);
  assert.match(source, /data-quality="480p"/);
  assert.match(source, /preferred\/default quality/);
});


test('source variant picker follows explicit and Auto preferred heights', async () => {
  const {LevelManager} = await import('../chrome/player/players/LevelManager.mjs');
  const manager = Object.create(LevelManager.prototype);
  const variants = [
    {url: '480.mp4', height: 480, width: 854},
    {url: '720.mp4', height: 720, width: 1280},
    {url: '1080.mp4', height: 1080, width: 1920},
  ];

  manager.client = {options: {defaultQuality: '1080p'}};
  assert.equal(manager.pickSourceVariant(variants).height, 1080);

  manager.client.options.defaultQuality = '720p';
  assert.equal(manager.pickSourceVariant(variants).height, 720);

  const previousWindow = globalThis.window;
  globalThis.window = {innerHeight: 650, devicePixelRatio: 1};
  manager.client.options.defaultQuality = 'Auto';
  assert.equal(manager.pickSourceVariant(variants).height, 720);

  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
});


test('background thumbnail work is capped independently of visible UI cadence', async () => {
  const extractorSource = await readSource('chrome/player/modules/analyzer/PreviewFrameExtractor.mjs');
  const timelineSource = await readSource('chrome/player/ui/FineTimeControls.mjs');

  assert.match(extractorSource, /BACKGROUND_ANALYZER_STEP_MS = 33/);
  assert.match(extractorSource, /frameNow - lastAnalyzerStep < BACKGROUND_ANALYZER_STEP_MS/);
  assert.match(timelineSource, /Math\.abs\(this\.lastFrameRenderTime - currentTime\) < 0\.0435/);
});

test('speed tracker maintains its sample total incrementally', async () => {
  const source = await readSource('chrome/player/network/SpeedTracker.mjs');

  assert.match(source, /this\.totalData = 0/);
  assert.match(source, /this\.totalData \+= dataSize - this\.lastEntry\.dataSize/);
  assert.match(source, /this\.totalData -= removed\.dataSize/);
  assert.match(source, /return this\.totalData \/ dt/);
});
