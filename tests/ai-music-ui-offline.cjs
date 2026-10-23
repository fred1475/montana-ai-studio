'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '../ai-music-lab.html'), 'utf8');
const script = readFileSync(join(__dirname, '../ai-music-lab.js'), 'utf8');
const mixer = readFileSync(join(__dirname, '../mixer-8.html'), 'utf8');
const bridge = readFileSync(join(__dirname, '../private-music-import.js'), 'utf8');

test('real music page is financially inert on public static hosting', () => {
  assert.match(html, /id="privateAiConfig" data-api-origin=""/);
  assert.match(html, /id="generateButton" type="submit" disabled/);
  assert.match(html, /id="usageButton" disabled/);
  assert.match(html, /id="listenButton" disabled/);
  assert.match(html, /id="downloadButton" disabled/);
  assert.match(html, /id="copyButton" disabled/);
  assert.match(html, /<script src="private-music-generation\.js"><\/script>/);
  assert.match(html, /<script src="private-music-import\.js"><\/script>/);
  assert.match(script, /fields\.cost\.checked = false/);
  assert.match(script, /new Blob\(\[bytes\]/);
  assert.doesNotMatch(script, /localStorage\.setItem\(/);
});

test('eight-track imported AI audio remains disabled until Worker config is provided', () => {
  assert.match(mixer, /id="privateAiImport" data-api-origin=""/);
  assert.match(mixer, /id="privateAiImportButton" disabled/);
  assert.match(mixer, /window\.montanaTrackBuffer=/);
  assert.match(mixer, /tracks\[i\]!==expectedSource/);
  assert.match(bridge, /credentials: 'include'/);
  assert.match(bridge, /if \(existing && !replace\.checked\)/);
  assert.match(bridge, /root\.montanaTrackBuffer\(channel\) !== existing/);
});

test('neither browser side carries billing tokens nor exposes a direct Google provider call', () => {
  for (const source of [html, script, mixer, bridge]) {
    assert.doesNotMatch(source, /x-goog-api-key/i);
    assert.doesNotMatch(source, /generativelanguage\.googleapis\.com/i);
    assert.doesNotMatch(source, /PRIVATE_GENERATION_ENABLED/);
  }
});
