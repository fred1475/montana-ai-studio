'use strict';
const assert=require('node:assert/strict'),blind=require('../mixer-vocal-blind.js');
const rate=44100,n=rate;
function samples(a,b){
 return [Float32Array.from({length:n},(_,i)=>a*Math.sin(i*2*Math.PI*220/rate)),
  Float32Array.from({length:n},(_,i)=>b*Math.sin(i*2*Math.PI*220/rate))];
}
const dry=samples(.4,.2),wet=samples(.2,.1);
const dryBefore=dry.map(c=>c.slice()),wetBefore=wet.map(c=>c.slice());
const first=blind.prepare(dry,wet,rate,()=>0),second=blind.prepare(dry,wet,rate,()=>1);
assert.deepEqual(first.order,['original','processed']);
assert.deepEqual(second.order,['processed','original']);
assert.equal(first.rate,rate);assert.equal(first.frames,n);assert.equal(first.channels,2);
assert(Math.abs(first.match.gainDb-6.0205999)<.05,'Gain is capped at +6 dB');
assert(first.match.limited,'RMS gain limit disclosed');
assert.equal(first.choices[0].length,2);
assert(first.choices[0][0]!==dry[0],'Original input is copied, not shared');
assert(first.choices[1][0]!==wet[0],'Processed input is copied');
assert.deepEqual(dry,dryBefore);assert.deepEqual(wet,wetBefore);
const labels=['A','B'].map(choice=>blind.result(first,choice,{
 naturalidad:4,inteligibilidad:5,timbre:3,notes:'Se oye más claro'
},'2026-10-21T15:00:00.000Z'));
assert.equal(labels[0].chosenType,'original');
assert.equal(labels[1].chosenType,'processed');
assert.deepEqual(labels[0].reveal,{A:'original',B:'processed'});
assert.equal(labels[0].subjectiveRatings.naturalidad,4);
assert(!('choices' in labels[0])&&!('pcm' in labels[0])&&!('buffers' in labels[0]));
const excessive=samples(1.2,1.0);
const guarded=blind.prepare(excessive,excessive,rate,()=>3);
for(const variant of guarded.choices)
 for(const channel of variant)
  assert(Math.max(...Array.from(channel.slice(0,4000),Math.abs))<=.98+1e-5);
assert(guarded.match.commonAttenuationDb<0);
const bypass=blind.prepare(dry,wet,rate,()=>0xffffffff);
assert.deepEqual(bypass.order,['processed','original']);
for(const malformed of [
 ()=>blind.prepare(dry,wet,rate,()=>-1),
 ()=>blind.prepare(dry,wet,rate,()=>.5),
 ()=>blind.prepare(dry,wet,rate,()=>Number.NaN),
 ()=>blind.prepare(dry,wet,rate,null),
 ()=>blind.prepare(dry,wet,0,()=>0),
 ()=>blind.prepare(dry,[wet[0]],rate,()=>0),
 ()=>blind.prepare(dry,samples(.2,.2).map((c,j)=>j?c.subarray(1):c),rate,()=>0),
 ()=>blind.prepare([new Float32Array(44100).fill(NaN)], [new Float32Array(44100)],rate,()=>0)
])assert.throws(malformed,/inválid|incompatib|distinto|duración|no finita|Falta/);
for(const grades of [
 {naturalidad:0,inteligibilidad:5,timbre:5},
 {naturalidad:4,inteligibilidad:6,timbre:3},
 {naturalidad:5,inteligibilidad:3.2,timbre:2},
 {naturalidad:5,inteligibilidad:3,timbre:2,notes:'x'.repeat(501)}
])assert.throws(()=>blind.result(first,'A',grades,'2026-10-21T15:00:00.000Z'),/Valora|inválid/);
assert.throws(()=>blind.result(first,'C',{naturalidad:4,inteligibilidad:4,timbre:4},'2026-10-21T15:00:00.000Z'),/inválido/);
console.log('PASS blind A/B: unbiased parity order, symmetric fresh buffers, RMS limit visibility, safe peak headroom, subjective result validation, source immutability.');
