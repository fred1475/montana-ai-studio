'use strict';
/* Conservative periodicity guard for experimental offline pitch correction.
 * A short consonant-like broadband burst should survive PSOLA unmodified
 * while surrounding pitched notes still tune. Synthetic benchmark only.
 */
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const melody=require('../pitch-melody.js');
const tau=2*Math.PI;
function signal(rate=44100,seconds=1.4){
 const n=Math.round(rate*seconds),a=new Float32Array(n);
 let state=0x1234abed;
 for(let i=0;i<n;i++){
  const t=i/rate;
  state^=state<<13;state^=state>>>17;state^=state<<5;
  const noise=(state>>>0)/2147483648-1;
  a[i]=t>.48&&t<.66?.065*noise:.29*Math.sin(tau*224.5*t);
 }
 return a;
}
function rmsDiff(a,b,from,to){
 let power=0;for(let i=from;i<to;i++)power+=(a[i]-b[i])**2;
 return Math.sqrt(power/(to-from));
}
function stereoExact(channels,scale,tolerance=5e-6){
 const [left,right]=channels;let e=0,d=0;
 for(let i=0;i<left.length;i++){
  assert(Number.isFinite(left[i])&&Number.isFinite(right[i]));
  e+=left[i]**2;d+=(right[i]-scale*left[i])**2;
 }
 assert(Math.sqrt(d/Math.max(1e-12,e))<tolerance,'Stereo relation changed');
}
for(const rate of [44100,48000]){
 const original=signal(rate),saved=original.slice(),n=original.length;
 const result=pitch.process([original],rate,{strength:100});
 assert.equal(result.unvoicedGuardApplied,true);
 assert.equal(result.target.note,'A3');
 assert.equal(result.channels[0].length,n);
 const out=result.channels[0];
 const midA=Math.round(.56*rate),midB=Math.round(.60*rate);
 const burstError=rmsDiff(out,original,midA,midB);
 assert(burstError<.0025,'Noise burst altered by PSOLA despite guard: '+burstError);
 const voicedA=Math.round(.78*rate),voicedB=Math.round(.90*rate);
 const voicedDelta=rmsDiff(out,original,voicedA,voicedB);
 assert(voicedDelta>.012,'Voiced region must still be corrected: '+voicedDelta);
 const frequency=pitch.detectPitch(out,rate,.82)?.frequency;
 assert(frequency&&Math.abs(1200*Math.log2(frequency/220))<12,'Pitch must still target A3: '+frequency);
 const antiphase=Float32Array.from(original,x=>-x);
 const stereo=pitch.process([original,antiphase],rate,{strength:100});
 stereoExact(stereo.channels,-1,2e-7);
 const scaled=Float32Array.from(original,x=>x*.4);
 const balanced=pitch.process([original,scaled],rate,{strength:100});
 stereoExact(balanced.channels,.4);
 assert.deepEqual(pitch.process([original],rate,{strength:0}).channels[0],original);
 assert.deepEqual(original,saved,'No mutation to original mono source');
 assert.deepEqual(antiphase,Float32Array.from(original,x=>-x));
 assert.deepEqual(scaled,Float32Array.from(original,x=>x*.4));
}
{
 const rate=44100,n=Math.floor(1.4*rate),split=Math.floor(.7*rate);
 const original=new Float32Array(n);let phase=0;
 for(let i=0;i<n;i++){phase+=tau*(i<split?224.5:266.2)/rate;original[i]=.3*Math.sin(phase)}
 const anti=Float32Array.from(original,x=>-x);
 const result=melody.processMelody([original,anti],rate,{strength:100});
 assert.deepEqual(result.segments.map(x=>x.targetNote),['A3','C4']);
 stereoExact(result.channels,-1,2e-7);
 assert.deepEqual(anti,Float32Array.from(original,x=>-x));
}
assert.throws(()=>pitch.preserveUnvoiced([new Float32Array(10)],[new Float32Array(10)],new Float32Array(10),44100,220),/Período/);
assert.throws(()=>pitch.preserveUnvoiced([new Float32Array(1)],[new Float32Array(2)],new Float32Array(1),44100,220),/incompatibles/);
console.log('PASS voiced guard: 44.1/48k noise burst restored, surrounding tone corrected, stereo antiphase/ratio, melody compatibility, immutable input.');
