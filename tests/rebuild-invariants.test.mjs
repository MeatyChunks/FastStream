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
