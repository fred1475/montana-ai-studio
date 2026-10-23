'use strict';
/* Long digital silence must not turn true-peak analysis into a UI freeze.
 * The DSP fast path skips ONLY windows consisting entirely of exact zeros.
 * This regression is synthetic, not EBU conformance or a real-session benchmark.
 */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const meter = require('../mixer-loudness.js');
const rate = 48000;

function note(seconds) {
  const n = Math.round(rate * seconds), data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.pow(10, -23 / 20) * Math.sin(2 * Math.PI * 1000 * i / rate);
  return data;
}

(async () => {
  const twelve = note(12);
  const signal = new Float32Array(rate * 120);
  signal.set(twelve);
  const start = performance.now();
  const baseline = await meter.measure(twelve, twelve, rate);
  const long = await meter.measure(signal, signal, rate);
  const elapsedMs = performance.now() - start;
  assert(Math.abs(long.integratedLufs - baseline.integratedLufs) < .12,
    'Relative gating ignores digital silence after the program');
  assert(Math.abs(long.truePeakDbtp - baseline.truePeakDbtp) < .001,
    'Exact-zero shortcut does not alter nonzero true-peak reconstruction');
  assert.equal(long.samplePeakDbfs, baseline.samplePeakDbfs);
  assert.equal(long.lraStable, true);
  assert(elapsedMs < 30000,
    `120-second PCM silence-tail test took ${elapsedMs.toFixed(0)}ms; performance regression`);

  // The 40-tap kernel crosses the two-second processing boundary. A short
  // high-frequency burst must still be detected by the optimized path.
  const sparse = new Float32Array(rate * 5);
  for (let i = 2 * rate - 15; i < 2 * rate + 15; i++) {
    sparse[i] = .85 * Math.sin(2 * Math.PI * 12000 * (i - 2 * rate) / rate + Math.PI / 4);
  }
  const boundary = await meter.measure(sparse, sparse, rate);
  assert(boundary.truePeakDbtp >= boundary.samplePeakDbfs - .001);
  assert(boundary.truePeak > .6);

  const blocked = new AbortController();
  blocked.abort();
  await assert.rejects(meter.measure(twelve, twelve, rate, { signal: blocked.signal }), /Medición cancelada/);
  const later = new AbortController();
  const pending = meter.measure(signal, signal, rate, { signal: later.signal, yieldToBrowser: true });
  setTimeout(() => later.abort(), 0);
  await assert.rejects(pending, /Medición cancelada/);

  console.log('PASS exact-zero true-peak fast path, 120s silence tail, chunk boundary, cancellation.');
  console.log(`Internal synthetic elapsed: ${elapsedMs.toFixed(0)}ms; NOT an EBU certification.`);
})().catch(error => { console.error(error); process.exit(1); });
