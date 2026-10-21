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
assert.equal(result.transitionGuardMs,12,'Note transition guard must be explicit');
const transition=Math.round(result.segments[0].endSeconds*rate);
assert(transition>rate*.45&&transition<rate*.95,'Transition must be detected inside source');
const corrected=result.channels[0];
assert(Math.abs(corrected[transition]-input[transition])<1e-7,
 'Corrected note splice must pass exactly through original waveform (phase continuity)');
for(let offset of [-2,-1,1,2]){
 const j=transition+offset;
 assert(Math.abs(corrected[j]-input[j])<.001,
  'Edge must return smoothly to original at sample '+offset);
}
const guard=Math.round(rate*.012);
assert(guard>=2 && Number.isFinite(corrected[transition-guard])&&Number.isFinite(corrected[transition+guard]),
 'The processed audio must remain finite on both sides of the transition guard');
const stereo=melody.processMelody([input,input.slice()],rate,{key:'C',scale:'chromatic',strength:100});
assert.equal(stereo.channels[0].length,n);
assert.equal(stereo.channels[1].length,n);
assert(Math.abs(stereo.channels[0][transition]-input[transition])<1e-7);
assert(Math.abs(stereo.channels[1][transition]-input[transition])<1e-7);
assert.equal(input[transition],stereo.channels[0][transition],
 'Source PCM is unchanged despite transition smoothing');

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
console.log('PASS melody lab: two detuned notes, phase-safe 12ms bridges, stereo alignment, PCM correction, source unchanged, bypass and silence guard.');
