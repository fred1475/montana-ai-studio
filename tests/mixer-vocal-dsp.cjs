'use strict';
const assert=require('node:assert/strict');
const {defaults,check,process}=require('../mixer-vocal-dsp.js');
const rate=44100,n=rate*2,input=new Float32Array(n);
const twopi=2*Math.PI;
for(let i=0;i<n;i++){
 const t=i/rate;
 input[i]=t<1?.25*Math.sin(twopi*220*t)+.26*Math.sin(twopi*7100*t):
   .008*Math.sin(twopi*220*t);
}
const untouched=input.slice();
const baseline=process([input],rate,defaults())[0];
assert.deepEqual(baseline,input,'Disabled processor must be bit-exact to source');
const settings={gateOn:true,gateThreshold:-33,gateReduction:-45,deessOn:true,deessThreshold:-32,deessStrength:90};
const cleaned=process([input],rate,settings)[0];
assert.equal(cleaned.length,n);
assert.deepEqual(input,untouched,'Never mutate source audio');
function rms(data,from,to){
 let e=0;for(let j=from;j<to;j++)e+=data[j]*data[j];
 return Math.sqrt(e/(to-from));
}
function amplitude(data,frequency,start,end){
 let s=0,c=0;for(let j=start;j<end;j++){const a=twopi*frequency*j/rate;s+=data[j]*Math.sin(a);c+=data[j]*Math.cos(a)}
 return 2*Math.hypot(s,c)/(end-start);
}
const tailStart=Math.floor(1.25*rate),tailEnd=Math.floor(1.9*rate);
assert(rms(cleaned,tailStart,tailEnd)<rms(input,tailStart,tailEnd)*.10,'Gate must suppress low-level signal');
const start=Math.round(rate*.20),end=Math.round(rate*.80);
const highRatio=amplitude(cleaned,7100,start,end)/amplitude(input,7100,start,end);
const lowRatio=amplitude(cleaned,220,start,end)/amplitude(input,220,start,end);
assert(highRatio<.65,'De-esser must reduce actual sibilant-band energy: '+highRatio);
assert(lowRatio>.90,'De-esser must preserve fundamental vocal content: '+lowRatio);
const stereo=process([input,input],rate,settings);
assert.deepEqual(stereo[0],stereo[1],'Matched stereo channels must stay synchronized');
assert.throws(()=>check({...settings,gateThreshold:-100}),/Parámetro/);
assert.throws(()=>process([input],rate,{...settings,deessStrength:101}),/Parámetro/);
assert.throws(()=>process([new Float32Array(4),new Float32Array(5)],rate,settings),/incompatibles/);
// Corrupt PCM must never leak through a bypassed effect into the mixer/export.
// The same contract holds when the de-esser is enabled at 0% strength.
for(const invalid of [NaN,Infinity,-Infinity]){
 const damaged=new Float32Array([0.1,invalid,0.05,-0.1]);
 const snapshot=damaged.slice();
 for(const options of [defaults(),{...defaults(),deessOn:true,deessStrength:0},settings]){
  assert.throws(()=>process([damaged],rate,options),/Muestra vocal inválida/,
   'Must reject non-finite mono samples in bypass and active cleanup');
  assert.throws(()=>process([new Float32Array(damaged.length),damaged],rate,options),
   /Muestra vocal inválida/,'Must reject non-finite right-channel samples');
 }
 // Never overwrite the source to hide corruption, including NaN values.
 assert.deepEqual(damaged,snapshot,'Corrupted source must stay unchanged');
}
console.log('PASS voice cleanup: transparent bypass, RMS noise gating, HF sibilance attenuation, vocal preservation, stereo linking, non-destructive inputs.');
