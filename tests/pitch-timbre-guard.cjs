'use strict';
const assert=require('node:assert/strict'),G=require('../pitch-timbre-guard.js');
const rate=44100,n=rate;
function voice(high=1,secondary=.5){
 return new Float32Array(Array.from({length:n},(_,i)=>{
  const time=i/rate;
  return .24*Math.sin(2*Math.PI*220*time)+
   .036*secondary*Math.sin(2*Math.PI*860*time)+
   .025*secondary*Math.sin(2*Math.PI*1900*time)+
   .012*high*Math.sin(2*Math.PI*4200*time);
 }));
}
const dry=voice(),wet=voice(14);
const dryCopy=dry.slice(),wetCopy=wet.slice();
const before=G.inspect([dry],rate),after=G.inspect([wet],rate);
const estimated=G.compare(before,after);
assert(estimated.measurable);
assert(estimated.maxBandShiftDb>6,'Synthetic excessive HF lift must be detected');
const fixed=G.apply([dry],[wet],rate);
assert(fixed.report.enabled);
assert.equal(fixed.report.status,'reduced_correction');
assert(fixed.report.wetPercent<100);
assert(fixed.report.outputMaxBandShiftDb<=G.LIMIT_DB+.02,'Output spectral guardrail');
assert.notStrictEqual(fixed.channels[0],wet);
assert.deepEqual(dry,dryCopy,'Original samples must remain immutable');
assert.deepEqual(wet,wetCopy,'Wet samples must remain immutable');
const bypass=G.apply([dry],[dry.slice()],rate);
assert.equal(bypass.report.status,'unchanged');
assert.equal(bypass.report.wetPercent,100);
assert.deepEqual(bypass.channels[0],dry);
const left=voice(),right=Float32Array.from(left,x=>x*-.35);
const lifted=voice(14),liftedRight=Float32Array.from(lifted,x=>x*-.35);
const stereo=G.apply([left,right],[lifted,liftedRight],rate);
assert(stereo.report.wetPercent<100);
for(let i=0;i<n;i+=113){
 assert(Math.abs(stereo.channels[1][i]+.35*stereo.channels[0][i])<1e-6,
 'One wet fraction must preserve stereo polarity and relative level');
}
const silent=new Float32Array(n);
const silence=G.apply([silent],[silent],rate);
assert.equal(silence.report.status,'insufficient_signal');
assert.equal(silence.report.wetPercent,100);
const nearZero=new Float32Array(n).fill(1e-6);
assert.equal(G.apply([nearZero],[nearZero],rate).report.status,'insufficient_signal');
for(const incorrect of [
 ()=>G.apply([dry],[wet],rate,2),
 ()=>G.apply([dry],[wet],rate,13),
 ()=>G.apply([dry],[wet],rate,NaN),
 ()=>G.apply([dry],[new Float32Array(n-1)],rate),
 ()=>G.apply([dry],[new Float32Array(n).fill(NaN)],rate),
 ()=>G.apply([dry,right],[wet],rate),
 ()=>G.apply([dry],[wet],4000),
 ()=>G.inspect([new Float32Array(1)],Infinity)
])assert.throws(incorrect,/inválid|incompatibles|no finita/);
console.log('PASS vocal spectral character guard: four-band heuristic, bounded dry-blend reduction, stereo phase/level integrity, silence, invalid PCM and source immutability.');
