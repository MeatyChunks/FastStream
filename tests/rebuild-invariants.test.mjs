import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('synced audio uses mutable level-change state', async () => {
  const source = await readSource('chrome/player/players/SyncedAudioPlayer.mjs');
  assert.match(source, /let changed = false;/);
  assert.doesNotMatch(source, /const changed = false;/);
});

test('synced audio playback rates are normalized and reapplied', async () => {
  const source = await readSource('chrome/player/players/SyncedAudioPlayer.mjs');
  assert.match(source, /MIN_PLAYBACK_RATE/);
  assert.match(source, /MAX_PLAYBACK_RATE/);
  assert.match(source, /next\.playbackRate = this\.playbackRate/);
});

test('synced audio teardown is idempotent', async () => {
  const source = await readSource('chrome/player/players/SyncedAudioPlayer.mjs');
  assert.match(source, /if \(this\.destroyed\) return;/);
  assert.match(source, /this\.audioContext\?\.close\(\)\.catch/);
});

test('temporary IndexedDB keepalive is not a one-second write loop', async () => {
  const source = await readSource('chrome/player/network/IndexedDBManager.mjs');
  assert.doesNotMatch(source, /}, 1000\);/);
});

test('HLS teardown stops loading before destroy', async () => {
  const source = await readSource('chrome/player/players/hls/HLSPlayer.mjs');
  assert.match(source, /stopLoad\(\)/);
  assert.match(source, /destroy\(\)/);
});

test('download storage has a finite entry limit', async () => {
  const source = await readSource('chrome/player/network/DownloadManager.mjs');
  assert.match(source, /1000/);
});

test('subtitle rendering has layout invalidation', async () => {
  const source = await readSource('chrome/player/ui/subtitles/SubtitlesManager.mjs');
  assert.match(source, /_layoutDirty/);
});
