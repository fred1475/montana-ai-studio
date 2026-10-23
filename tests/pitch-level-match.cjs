'use strict';
const assert=require('node:assert/strict'),M=require('../pitch-level-match.js');
const rate=44100,n=rate,make=(a,b)=>[
 Float32Array.from({length:n},(_,i)=>a*Math.sin(2*Math.PI*220*i/rate)),
 Float32Array.from({length:n},(_,i)=>b*Math.sin(2*Math.PI*220*i/rate))
];
const dry=make(.3,.1),tuned=make(.18,.06);
const first=M.match(dry,tuned);
assert.equal(first.report.status,'matched');
assert(Math.abs(first.report.appliedGain-5/3)<1e-4);
assert(Math.abs(first.report.appliedGainDb-20*Math.log10(5/3))<1e-4);
assert(Math.abs(first.report.outputRms-first.report.sourceRms)<2e-7);
assert(Math.abs(first.channels[0][5000]/first.channels[1][5000]-3)<1e-6,'Relative L/R balance preserved');
assert.notStrictEqual(first.channels[0],tuned[0],'Fresh PCM arrays');
assert.equal(tuned[0][5000],make(.18,.06)[0][5000],'Never mutate processed input');
assert.equal(dry[0][5000],make(.3,.1)[0][5000],'Never mutate original input');
const capped=M.match(make(.8,.8),make(.02,.02));
assert(capped.report.limited,'Gain needs clamp if original is 40x louder');
assert(Math.abs(capped.report.appliedGain-Math.pow(10,6/20))<1e-7);
const extremeWet=make(1.5,1.5);
const limitedPeak=M.match(make(1.5,1.5),extremeWet);
assert(limitedPeak.report.limited);
assert(limitedPeak.report.appliedGainDb<0);
assert(M.inspect(limitedPeak.channels).peak<=.98+1e-6,'Keep sample peak under .98 even when reduction exceeds -6 dB');
const silent=M.match(make(0,0),tuned);
assert.equal(silent.report.status,'omitted_silent_signal');
assert.notStrictEqual(silent.channels[0],tuned[0]);
assert.equal(M.inspect(silent.channels).peak,M.inspect(tuned).peak);
for(const inputs of [
 [[],tuned],[dry,[]],[dry,[tuned[0]]],[dry,[tuned[0],tuned[1].subarray(1)]],
 [dry,[new Float32Array(n).fill(NaN),tuned[1]]],
 [dry,[new Float32Array(n).fill(Infinity),tuned[1]]]
])assert.throws(()=>M.match(inputs[0],inputs[1]),/inválid|incompatibles|no finita|misma duración/);
const many=[new Float32Array(192000*15+1)];
assert.throws(()=>M.inspect(many),/inválido/);
console.log('PASS vocal level matcher: global RMS, stereo preservation, +/-6dB guard, peak cap, silence bypass, finite PCM and original immutability.');
