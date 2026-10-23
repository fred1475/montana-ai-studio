'use strict';
const assert = require('node:assert/strict');
const { measure } = require('../mixer-loudness.js');

const rate = 48000;
const n = rate * 6;
const left = new Float32Array(n), right = new Float32Array(n);
for (let i = 0; i < n; i++) {
  left[i] = .09 * Math.sin(2 * Math.PI * 1000 * i / rate);
  right[i] = .06 * Math.sin(2 * Math.PI * 1000 * i / rate);
}
const assertProgress = values => {
  assert.equal(values[0], 0, 'Starts at zero');
  assert.equal(values.at(-1), 1, 'Finishes at one only on successful analysis');
  assert(values.some(x => x > 0 && x < 1), 'Reports actual intermediate chunks');
  for (let i = 1; i < values.length; i++) {
    assert(values[i] > values[i - 1], 'Progress must be strictly monotone');
    assert(values[i] >= 0 && values[i] <= 1, 'Progress must stay in [0, 1]');
  }
};

(async () => {
  const fractions = [];
  const baseline = await measure(left, right, rate);
  const withProgress = await measure(left, right, rate, { onProgress: f => fractions.push(f) });
  assert.deepEqual(withProgress, baseline, 'Reporting must not change DSP measurements');
  assertProgress(fractions);

  const brokenUI = await measure(left, right, rate, { onProgress: () => { throw Error('UI unavailable'); } });
  assert.deepEqual(brokenUI, baseline, 'UI callback failures must not affect analysis');

  const abort = new AbortController(), cancelled = [];
  await assert.rejects(measure(left, right, rate, {
    signal: abort.signal, yieldToBrowser: true,
    onProgress: f => { cancelled.push(f); if (f > 0) abort.abort(); }
  }), /Medición cancelada/);
  assert(cancelled.at(-1) < 1, 'Cancellation cannot falsely report 100%');
  console.log('PASS meter progress: monotonic, exact result preserved, UI errors isolated, cancellation honest.');
})().catch(error => { console.error(error); process.exit(1); });
