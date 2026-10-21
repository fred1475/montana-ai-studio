'use strict';
/* PSOLA stereo timing regression. Synthetic test only: not a formant or
 * perceptual quality certification. The source WAV data must stay intact.
 */
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const melody=require('../pitch-melody.js');
const rate=44100,pi2=Math.PI*2;
function sustained(frequency=224.5,seconds=1.25){
 const n=Math.floor(rate*seconds),a=new Float32Array(n);
 for(let i=0;i<n;i++)a[i]=.32*Math.sin(pi2*frequency*i/rate);
 return a;
}
function stereoCoherence(out,factor,tolerance){
 const [l,r]=out;assert.equal(l.length,r.length);
 let power=0,error=0,peak=0;
 for(let i=0;i<l.length;i++){
  const difference=r[i]-factor*l[i];
  power+=l[i]*l[i];error+=difference*difference;
  peak=Math.max(peak,Math.abs(l[i]));
  assert(Number.isFinite(l[i])&&Number.isFinite(r[i]),'No invalid PCM allowed');
 }
 const relative=Math.sqrt(error/Math.max(power,1e-16));
 assert(peak>.04,'Correction must not erase the voice');
 assert(relative<tolerance,'Stereo sample coherence lost, relative mismatch='+relative);
 return relative;
}
const l=sustained(),negative=Float32Array.from(l,x=>-x),scaled=Float32Array.from(l,x=>x*.4);
const saved=l.slice(),negativeCopy=negative.slice(),scaledCopy=scaled.slice();
const antiphase=pitch.process([l,negative],rate,{strength:100});
assert.equal(antiphase.target.note,'A3');
stereoCoherence(antiphase.channels,-1,1e-7);
const quieter=pitch.process([l,scaled],rate,{strength:100});
stereoCoherence(quieter.channels,.4,3e-6);
assert.equal(quieter.analysis.referenceMode,'stereo-average');
const unchanged=pitch.process([l,negative],rate,{strength:0});
assert.deepEqual(unchanged.channels[0],l);
assert.deepEqual(unchanged.channels[1],negative);
assert.deepEqual(l,saved,'Source left untouched');
assert.deepEqual(negative,negativeCopy,'Source anti-phase right untouched');
assert.deepEqual(scaled,scaledCopy,'Source quieter right untouched');
assert.throws(()=>pitch.correctChannel(l,rate,224.5,220,{frames:3,marks:[],period:1,span:1,first:0}),/Marcas de afinación incompatibles/);
assert.throws(()=>pitch.pitchMarkPlan(new Float32Array(1),rate,224.5),/Período de afinación inválido/);

const n=Math.round(rate*1.4),split=Math.round(.7*rate),ml=new Float32Array(n);
let phase=0;
for(let i=0;i<n;i++){
 phase+=pi2*(i<split?224.5:266.2)/rate;
 ml[i]=.3*Math.sin(phase);
}
const mr=Float32Array.from(ml,x=>-x),unmodified=ml.slice();
const result=melody.processMelody([ml,mr],rate,{strength:100});
assert.deepEqual(result.segments.map(s=>s.targetNote),['A3','C4']);
stereoCoherence(result.channels,-1,2e-7);
assert.deepEqual(ml,unmodified,'Melody source unaffected');
const scaledMr=Float32Array.from(ml,x=>x*.6);
const balanced=melody.processMelody([ml,scaledMr],rate,{strength:100});
stereoCoherence(balanced.channels,.6,3e-6);
console.log('PASS stereo PSOLA: common source/time marks preserve inverted and proportional channels, notes, mono bypass and original PCM.');
