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
