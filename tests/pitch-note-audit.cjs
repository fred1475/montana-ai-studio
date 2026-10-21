'use strict';
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js'),A=require('../pitch-note-audit.js');
const rate=44100,n=rate;
const voice=f=>Float32Array.from({length:n},(_,i)=>
 .28*Math.sin(2*Math.PI*f*i/rate));
const original=voice(224.5),old=original.slice();
const processed=pitch.process([original],rate,{key:'C',scale:'chromatic',strength:100});
const q=A.create(processed,'sustain',processed.channels,rate,{key:'C',scale:'chromatic'});
assert.equal(q.method,'autocorrelation-f0');
assert.equal(q.mode,'sustain');assert.equal(q.segments.length,1);
const note=q.segments[0];
assert.equal(note.originalNote,'A3');assert.equal(note.targetNote,'A3');
assert(note.originalHz>223&&note.originalHz<226);
assert(Math.abs(note.plannedCorrectionCents)>15&&Math.abs(note.plannedCorrectionCents)<45);
assert.equal(typeof note.measuredOutputHz,'number');
assert(Number.isFinite(note.measuredDeviationCents));
assert(note.measuredOutputHz>215&&note.measuredOutputHz<225);
assert(Math.abs(note.measuredDeviationCents)<35,
 'Measured output must report actual f0, not planned correction');
assert.deepEqual(original,old,'Auditing never alters original PCM');
const zero=Float32Array.from({length:n},()=>0);
const qSilent=A.create(processed,'sustain',[zero],rate,{key:'C',scale:'chromatic'});
assert.equal(qSilent.segments[0].measuredOutputHz,null);
assert.equal(qSilent.segments[0].measuredDeviationCents,null);
assert.equal(qSilent.segments[0].detectorConfidence,null);
const melody=new Float32Array(n);
for(let i=0;i<n;i++){
 const f=i<n/2?220:246.9416506;
 melody[i]=.26*Math.sin(2*Math.PI*f*i/rate);
}
const manual={
 segments:[
  {startSeconds:0,endSeconds:.5,inputHz:220,targetHz:220,targetNote:'A3',correctionCents:0},
  {startSeconds:.5,endSeconds:1,inputHz:246.9416506,targetHz:246.9416506,targetNote:'B3',correctionCents:0}
 ]
};
const observed=A.create(manual,'melody',[melody],rate,{key:'C',scale:'chromatic'});
assert.deepEqual(observed.segments.map(x=>x.targetNote),['A3','B3']);
assert(observed.segments.every(x=>x.measuredOutputHz!==null),'Both voiced notes should be measurable');
assert(observed.segments.every(x=>Math.abs(x.measuredDeviationCents)<30));
for(const fn of [
 ()=>A.create(manual,'melody',[melody],rate,{key:'C',scale:'blue'}),
 ()=>A.create({...manual,segments:[{...manual.segments[0],targetNote:'C5'}]},'melody',[melody],rate,{key:'C',scale:'chromatic'}),
 ()=>A.create({...manual,segments:[{...manual.segments[0],correctionCents:120}]},'melody',[melody],rate,{key:'C',scale:'chromatic'}),
 ()=>A.create({...manual,segments:[{...manual.segments[0],inputHz:NaN}]},'melody',[melody],rate,{key:'C',scale:'chromatic'}),
 ()=>A.create({...manual,segments:[{...manual.segments[0],endSeconds:2}]},'melody',[melody],rate,{key:'C',scale:'chromatic'})
])assert.throws(fn,/inválid|incompatible|inconsisten/);
console.log('PASS note audit: A3 detection and planned/actually measured cents, real F0 after correction, silence null, two melody segments and strict provenance guards.');
