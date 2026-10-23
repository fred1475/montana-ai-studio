"use strict";
const assert=require("node:assert/strict");
const stretch=require("../time-stretch.js"),pitch=require("../pitch-engine.js");
const rate=44100,n=rate*2;
function tone(f){
 const samples=new Float32Array(n);
 for(let i=0;i<n;i++)samples[i]=.33*Math.sin(2*Math.PI*f*i/rate);
 return samples;
}
const original=tone(220),backup=original.slice();
for(const ratio of [.8,.9,1,1.1,1.25]){
 const result=stretch.stretch([original],rate,ratio);
 assert.equal(result.outputFrames,Math.round(n*ratio));
 assert.equal(result.channels[0].length,result.outputFrames);
 assert.equal(result.rate,rate);
 assert.notStrictEqual(result.channels[0],original);
 const detected=pitch.analyze(result.channels[0],rate).frequency;
 const cents=1200*Math.log2(detected/220);
 assert(Math.abs(cents)<10,"WSOLA frequency drift "+cents+" cents for "+ratio);
 let power=0;for(const x of result.channels[0]){assert(Number.isFinite(x));power+=x*x}
 const rms=Math.sqrt(power/result.outputFrames);
 assert(rms>.19&&rms<.26,"RMS discontinuity for "+ratio+": "+rms);
 if(ratio===1)assert.deepEqual(result.channels[0],original,"Unity bypass is exact");
}
assert.deepEqual(original,backup,"Input source remains byte-identical");
const right=new Float32Array(n);for(let i=0;i<n;i++)right[i]=-original[i];
for(const ratio of [.8,1.2]){
 const result=stretch.stretch([original,right],rate,ratio);
 for(let j=0;j<result.outputFrames;j+=193)
  assert(Math.abs(result.channels[0][j]+result.channels[1][j])<1e-7,
   "Stereo antiphase must remain coherently linked");
}
const silence=new Float32Array(n);
for(const ratio of [.8,1.25]){
 const result=stretch.stretch([silence],rate,ratio);
 assert(result.channels[0].every(v=>v===0),"Silence must remain exact");
}
assert.throws(()=>stretch.stretch([tone(220)],rate,.79),/inválido/);
assert.throws(()=>stretch.stretch([tone(220)],rate,1.26),/inválido/);
assert.throws(()=>stretch.stretch([new Float32Array(10)],rate,1.2),/0.3 a 12/);
assert.throws(()=>stretch.stretch([original],44101.5,1.1),/inválido/);
const invalid=tone(220);invalid[300]=NaN;
assert.throws(()=>stretch.stretch([invalid],rate,1.1),/muestras inválidas/);
console.log("PASS WSOLA beta: exact duration, preserved 220 Hz fundamental, RMS, source bytes, stereo phase, silence, range validation.");
