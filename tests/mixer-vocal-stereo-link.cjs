'use strict';
/* Stereo de-ess regression: one gain envelope shared by left/right.
 * Synthetic signal, not a perception/formant or professional DAW test.
 */
const assert=require('node:assert/strict');
const clean=require('../mixer-vocal-dsp.js');
const tau=Math.PI*2;
const opts={...clean.defaults(),deessOn:true,deessThreshold:-36,deessStrength:95};
function voice(rate){
 const n=Math.round(1.1*rate),l=new Float32Array(n);
 for(let i=0;i<n;i++){
  const t=i/rate;
  const sibilance=t>.24&&t<.88?.26*Math.sin(tau*6900*t):0;
  l[i]=.20*Math.sin(tau*220*t)+sibilance;
 }
 return l;
}
function tone(samples,rate,f,start=.40,end=.75){
 let sin=0,cos=0,n=0;
 for(let i=Math.floor(start*rate);i<Math.floor(end*rate);i++){
  const p=tau*f*i/rate;
  sin+=samples[i]*Math.sin(p);cos+=samples[i]*Math.cos(p);n++;
 }
 return 2*Math.hypot(sin,cos)/n;
}
function coherence(left,right,factor){
 let energy=0,err=0;
 for(let i=0;i<left.length;i++){
  const v=left[i],w=right[i];
  assert(Number.isFinite(v)&&Number.isFinite(w),'PCM must stay finite');
  energy+=v*v;err+=(w-factor*v)**2;
 }
 const relative=Math.sqrt(err/Math.max(energy,1e-20));
 assert(relative<2e-6,'Stereo ratio/polarity altered by de-esser: '+relative);
}
const lowRatios=[],hiRatios=[];
for(const rate of [44100,48000]){
 const left=voice(rate),negative=Float32Array.from(left,x=>-x),quiet=Float32Array.from(left,x=>x*.4);
 const saved=left.slice(),negSaved=negative.slice(),quietSaved=quiet.slice();
 const out=clean.process([left,negative],rate,opts);
 coherence(out[0],out[1],-1);
 const balanced=clean.process([left,quiet],rate,opts);
 coherence(balanced[0],balanced[1],.4);
 const inactive=clean.process([left,negative],rate,clean.defaults());
 assert.deepEqual(inactive,[left,negative],'Bypass must not touch source samples');
 const hi=tone(out[0],rate,6900)/tone(left,rate,6900);
 const fundamental=tone(out[0],rate,220)/tone(left,rate,220);
 assert(hi<.6,'HF sibilance attenuation missing: '+hi);
 assert(fundamental>.93,'Low vocal fundamental should remain: '+fundamental);
 hiRatios.push(hi);lowRatios.push(fundamental);
 assert.deepEqual(left,saved,'Original left stays bit exact');
 assert.deepEqual(negative,negSaved,'Original inverted right stays bit exact');
 assert.deepEqual(quiet,quietSaved,'Original proportional right stays bit exact');
 // Noise gate and shared de-ess still preserve exact antiphase.
 const gate=clean.process([left,negative],rate,{...opts,gateOn:true,gateThreshold:-36,gateReduction:-45});
 coherence(gate[0],gate[1],-1);
}
assert(Math.abs(hiRatios[0]-hiRatios[1])<.035,'44.1/48k de-esser response must be close in time');
assert(Math.abs(lowRatios[0]-lowRatios[1])<.02,'44.1/48k fundamental response must be close in time');
const malformed=voice(44100);malformed[20000]=NaN;
assert.throws(()=>clean.process([malformed],44100,opts),/Muestra vocal inválida/);
assert.throws(()=>clean.process([voice(44100),voice(48000)],44100,opts),/incompatibles/);
console.log('PASS linked stereo de-esser: antiphase and proportional L/R, gate+deess, 44.1/48k response, HF attenuation, LF preservation, NaN and original PCM safety.');
