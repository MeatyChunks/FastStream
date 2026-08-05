import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../miniglob.mjs', import.meta.url), 'utf8');

test('Windows cleanGlobPath calls the module volumeNameLen helper', () => {
  assert.match(source, /WIN32\s*\?\s*\(path\)\s*=>/);
  assert.match(source, /let\s+vollen\s*=\s*volumeNameLen\(path\)/);
  assert.doesNotMatch(source, /\(path,\s*volumeNameLen\)\s*=>/);
});
