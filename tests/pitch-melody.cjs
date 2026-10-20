'use strict';
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const melody=require('../pitch-melody.js');
const rate=44100,n=Math.round(rate*1.4),split=Math.round(rate*.7);
const input=new Float32Array(n);
let phase=0;
for(let i=0;i<n;i++){
 const hz=i<split?224.5:266.2;
 phase+=2*Math.PI*hz/rate;
 input[i]=.35*Math.sin(phase);
}
const result=melody.processMelody([input],rate,{key:'C',scale:'chromatic',strength:100});
assert.equal(result.channels[0].length,input.length,'Duration is unchanged');
assert.equal(result.segments.length,2,'The two notes must yield two stable note regions');
assert.deepEqual(result.segments.map(s=>s.targetNote),['A3','C4'],'Correct chromatic targets');
const p1=pitch.detectPitch(result.channels[0],rate,.26)?.frequency;
const p2=pitch.detectPitch(result.channels[0],rate,.78)?.frequency;
assert(p1&&p2,'Both corrected note regions must remain detectable');
function cents(a,b){return Math.abs(1200*Math.log2(a/b))}
assert(cents(p1,220)<15,'First corrected region should be A3, got '+p1);
assert(cents(p2,261.625565)<15,'Second corrected region should be C4, got '+p2);
assert.notDeepEqual(result.channels[0].subarray(7000,10000),input.subarray(7000,10000),'Audio samples must change');
assert.equal(melody.processMelody([input],rate,{strength:0}).channels[0][10000],input[10000],'Zero-strength bypass');
assert.throws(()=>melody.processMelody([new Float32Array(n)],rate),/silencios|sonidos/);
assert.throws(()=>melody.processMelody([input],rate,{strength:120}),/Intensidad inválida/);
console.log('PASS melody lab: two detuned notes corrected in separate regions, PCM changed, correct frequencies, original duration, bypass and silence guard.');
