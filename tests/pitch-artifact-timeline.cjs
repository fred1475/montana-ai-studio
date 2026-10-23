'use strict';
const assert=require('node:assert/strict'),A=require('../pitch-artifact-timeline.js');
const rate=44100,n=rate;
const source=Float32Array.from({length:n},(_,i)=>.3*Math.sin(2*Math.PI*220*i/rate));
const unaltered=source.slice(),wet=source.slice();
const baseline=A.analyze([source],[wet],rate);
assert.equal(baseline.version,1);assert.equal(baseline.windowMs,25);
assert.deepEqual(baseline.counts,{dropout:0,step:0,peak:0});
assert.deepEqual(baseline.events,[]);
for(let i=Math.floor(.35*rate);i<Math.floor(.49*rate);i++)wet[i]=0;
wet[Math.floor(.65*rate)]=1.02;
const result=A.analyze([source],[wet],rate);
assert(result.counts.dropout>=1,'Expected a time-coded dropout');
assert(result.counts.step>=1,'Expected a new discontinuity');
assert(result.counts.peak>=1,'Expected new high sample peak');
assert(result.events.some(e=>e.code==='dropout'&&e.timeSeconds>=.30&&e.timeSeconds<=.50));
assert(result.events.some(e=>e.code==='peak'&&e.timeSeconds>=.60&&e.timeSeconds<=.70));
assert(result.events.every(e=>e.timeSeconds>=0&&e.timeSeconds<1&&e.channel===1));
assert.deepEqual(source,unaltered,'Original Float32 source must remain immutable');
assert(Math.abs(wet[Math.floor(.65*rate)]-1.02)<1e-6);
const silent=new Float32Array(n);
const rest=A.analyze([silent],[silent],rate);
assert.deepEqual(rest.counts,{dropout:0,step:0,peak:0});
const stereo=A.analyze([source,Float32Array.from(source,v=>-v)],
 [wet,Float32Array.from(wet,v=>-v)],rate);
assert(stereo.events.some(e=>e.channel===2));
assert(stereo.events.length<=A.MAX_EVENTS);
const many=source.slice();
for(let i=rate*.15|0;i<rate*.85;i+=Math.round(rate*.05))many[i]=1.05;
const crowded=A.analyze([source,source],[many,many],rate);
assert(crowded.events.length<=A.MAX_EVENTS);
assert(crowded.truncated===true,'All event counts retained when list is bounded');
for(const fn of [
 ()=>A.analyze([source],[wet.slice(1)],rate),
 ()=>A.analyze([],[],rate),
 ()=>A.analyze([source],[wet],480),
 ()=>A.analyze([source],[new Float32Array(n).fill(NaN)],rate),
 ()=>A.analyze([source],[new Float32Array(n).fill(Infinity)],rate),
 ()=>A.analyze([source,source,source],[wet,wet,wet],rate)
])assert.throws(fn,/inválid|incompatibles|no finita/);
console.log('PASS vocal artifact timeline: time-coded dropout, peak and click hints, stereo, bounded truncation, safe silence, immutable PCM and invalid-input rejection.');
