'use strict';
/* Synthetic stereo-cancellation regression for experimental monophonic vocal tuning.
 * This protects detection only; it does not claim preservation of real vocal formants.
 */
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const melody=require('../pitch-melody.js');
const rate=44100,tau=2*Math.PI;
function tone(hz,seconds=1.1,amp=.30){
 const n=Math.round(rate*seconds),pcm=new Float32Array(n);
 for(let i=0;i<n;i++)pcm[i]=amp*Math.sin(tau*hz*i/rate);
 return pcm;
}
const left=tone(224.5),inverse=Float32Array.from(left,x=>-x),copy=left.slice();
const phase=pitch.vocalReference([left,inverse]);
assert.equal(phase.mode,'phase-safe-channel');
assert(phase.correlation<-.999);
assert.deepEqual(phase.samples,left,'Anti-phase stereo must choose intact reference channel');
assert.deepEqual(pitch.vocalReference([left,left]).samples,left,'In-phase stereo remains unchanged');
assert.equal(pitch.vocalReference([left,left]).mode,'stereo-average');
const quiet=new Float32Array(left.length);
const singleSide=pitch.vocalReference([left,quiet]);
assert.equal(singleSide.mode,'stronger-channel');
assert.deepEqual(singleSide.samples,left);
const stronger=pitch.vocalReference([quiet,inverse]);
assert.equal(stronger.mode,'stronger-channel');
assert.deepEqual(stronger.samples,inverse);

const tuned=pitch.process([left,inverse],rate,{key:'C',scale:'chromatic',strength:100});
assert.equal(tuned.analysis.referenceMode,'phase-safe-channel');
assert.equal(tuned.target.note,'A3');
assert.equal(tuned.channels.length,2);
assert.equal(tuned.channels[0].length,left.length);
assert.equal(tuned.channels[1].length,left.length);
assert(Math.abs(tuned.correctionCents)>10);
assert.deepEqual(left,copy,'Original channels must remain immutable');
assert.deepEqual(inverse,Float32Array.from(copy,x=>-x),'Antiphase source unchanged');
const correctedFrequency=pitch.detectPitch(tuned.channels[0],rate,.5)?.frequency;
assert(correctedFrequency&&Math.abs(1200*Math.log2(correctedFrequency/220))<18,
 'One corrected stereo side must reach A3; measured '+correctedFrequency);

const n=Math.round(rate*1.4),split=Math.round(rate*.7),melodyLeft=new Float32Array(n);
let phaseAccumulator=0;
for(let i=0;i<n;i++){
 phaseAccumulator+=tau*(i<split?224.5:266.2)/rate;
 melodyLeft[i]=.35*Math.sin(phaseAccumulator);
}
const melodyRight=Float32Array.from(melodyLeft,v=>-v),untouched=melodyLeft.slice();
const changed=melody.processMelody([melodyLeft,melodyRight],rate,{key:'C',scale:'chromatic',strength:100});
assert.equal(changed.referenceMode,'phase-safe-channel');
assert.deepEqual(changed.segments.map(s=>s.targetNote),['A3','C4']);
assert.equal(changed.channels[0].length,n);
assert.equal(changed.channels[1].length,n);
assert.deepEqual(melodyLeft,untouched,'Melody source cannot be modified');
for(const ch of changed.channels){for(let i=0;i<n;i++)assert(Number.isFinite(ch[i]));}
const a3=pitch.detectPitch(changed.channels[0],rate,.26)?.frequency;
const c4=pitch.detectPitch(changed.channels[0],rate,.78)?.frequency;
assert(a3&&Math.abs(1200*Math.log2(a3/220))<20);
assert(c4&&Math.abs(1200*Math.log2(c4/261.625565))<20);
const damaged=left.slice();damaged[100]=NaN;
assert.throws(()=>pitch.vocalReference([damaged,inverse]),/Muestra vocal inválida/);
assert.throws(()=>pitch.process([left,inverse],0),/Frecuencia de muestreo inválida/);
assert.throws(()=>melody.processMelody([damaged,inverse],rate),/Muestra vocal inválida/);
assert.throws(()=>pitch.vocalReference([left,new Float32Array(left.length-1)]),/Canales vocales/);
console.log('PASS pitch stereo reference: opposite-phase, isolated-channel, melody and sustained detection, unchanged original PCM, invalid inputs.');
