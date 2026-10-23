'use strict';
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const rate=44100,N=rate*1;
function tone(f){const a=new Float32Array(N);for(let i=0;i<N;i++)a[i]=.34*Math.sin(2*Math.PI*f*i/rate);return a}
for(const f of [110,196,224.5,440,523.25]) {
 const got=pitch.analyze(tone(f),rate).frequency;
 assert(Math.abs(1200*Math.log2(got/f))<6,`Detector ${f} Hz measured ${got} Hz`)
}
const silence=new Float32Array(N);
assert.throws(()=>pitch.analyze(silence,rate),/No se detectó/);
const target=pitch.nearestNote(224.5,'C','chromatic');
assert.equal(target.note,'A3');
assert(Math.abs(target.frequency-220)<.01);
const input=tone(224.5);
const result=pitch.process([input],rate,{key:'C',scale:'chromatic',strength:100});
assert.equal(result.channels[0].length,input.length,'Timing preservation');
assert.notDeepEqual(result.channels[0].subarray(4000,5500),input.subarray(4000,5500),'Actual audio samples must change');
const corrected=pitch.analyze(result.channels[0],rate).frequency;
assert(Math.abs(1200*Math.log2(corrected/220))<10,`Target must be A3, got ${corrected} Hz`);
assert(Math.abs(input[100]-tone(224.5)[100])<1e-9,'Input remains untouched');
assert.equal(pitch.process([input],rate,{strength:0}).channels[0][900],input[900]);
assert.throws(()=>pitch.process([silence],rate),/No se detectó/);
assert.throws(()=>pitch.process([input],rate,{strength:101}),/Intensidad inválida/);
console.log('PASS pitch: sustained monophonic tone detection and PSOLA correction to A3, duration preserved, bypass and silence rejection.');