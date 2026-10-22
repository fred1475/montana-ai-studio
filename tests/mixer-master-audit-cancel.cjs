'use strict';
const assert = require('node:assert/strict');
const { analyzeWav } = require('../mixer-master-audit.js');

// PCM16 stereo, deliberately long enough for multiple asynchronous chunks.
const rate = 44100;
const frames = rate * 5;
const bytes = Buffer.alloc(44 + frames * 4);
bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write('WAVE', 8); bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28);
bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34);
bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
const master = new Blob([bytes], { type: 'audio/wav' });

(async () => {
  let calls = 0;
  const dummyMeter = async () => { calls++; return { integratedLufs: -23, truePeakDbtp: -2, lraStable: false }; };

  const pre = new AbortController(); pre.abort();
  await assert.rejects(analyzeWav(master, dummyMeter, { signal: pre.signal }), /Medición cancelada/);
  assert.equal(calls, 0, 'Pre-cancelled audit must not parse PCM or start meter');

  const during = new AbortController();
  setTimeout(() => during.abort(), 0);
  await assert.rejects(analyzeWav(master, dummyMeter, { signal: during.signal, yieldToBrowser: true }), /Medición cancelada/);
  assert.equal(calls, 0, 'Cancelled PCM decoding must never launch meter');

  const afterward = new AbortController();
  let forwarded = false;
  await assert.rejects(analyzeWav(master, async (_left, _right, _rate, opts) => {
    assert.equal(opts.signal, afterward.signal, 'Signal must propagate to loudness engine');
    forwarded = true;
    afterward.abort();
    return { integratedLufs: -23, truePeakDbtp: -2, lraStable: false };
  }, { signal: afterward.signal }), /Medición cancelada/);
  assert.equal(forwarded, true, 'The audit must refuse a report cancelled during measurement');

  const okay = await analyzeWav(master, dummyMeter, { yieldToBrowser: true });
  assert.equal(okay.file.frames, frames);
  assert.equal(calls, 1);
  console.log('PASS audit cancellation before PCM, during decode, after meter, and normal report.');
})().catch(error => { console.error(error); process.exitCode = 1; });
