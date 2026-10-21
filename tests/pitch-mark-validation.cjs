'use strict';
/* Defensive validation of externally supplied PSOLA marks. Valid shared
 * stereo marks must still correct the sustained tone. No real voice tested.
 */
const assert=require('node:assert/strict');
const pitch=require('../pitch-engine.js');
const rate=44100,n=rate,sourceHz=224.5,targetHz=220;
const source=Float32Array.from({length:n},(_,i)=>.32*Math.sin(2*Math.PI*sourceHz*i/rate));
const original=source.slice();
const marks=pitch.pitchMarkPlan(source,rate,sourceHz);
const output=pitch.correctChannel(source,rate,sourceHz,targetHz,marks);
assert.equal(output.length,n);
const detected=pitch.detectPitch(output,rate,.58);
assert(detected&&Math.abs(1200*Math.log2(detected.frequency/targetHz))<12);
assert.deepEqual(source,original);
let last=-1;
for(const m of marks.marks){
 assert(Number.isInteger(m)&&m>=0&&m<n&&m>last);
 last=m;
}
function invalid(change){
 const plan={...marks,marks:marks.marks.slice()};
 change(plan);
 assert.throws(()=>pitch.correctChannel(source,rate,sourceHz,targetHz,plan),/Marcas de afinación incompatibles/);
}
invalid(p=>p.marks[5]=NaN);
invalid(p=>p.marks[4]=p.marks[3]);
invalid(p=>p.marks[7]=p.marks[8]);
invalid(p=>p.marks[0]=-1);
invalid(p=>p.marks[p.marks.length-1]=n);
invalid(p=>p.marks[1]+=0.5);
invalid(p=>p.first=NaN);
invalid(p=>p.first=-1);
invalid(p=>p.period=marks.period*1.02);
invalid(p=>p.span=0);
invalid(p=>p.span=marks.span+1);
invalid(p=>p.frames=n-1);
invalid(p=>p.marks=[]);
assert.throws(()=>pitch.correctChannel(source,0,sourceHz,targetHz,marks),/Frecuencias/);
assert.throws(()=>pitch.correctChannel(source,rate,NaN,targetHz,marks),/Frecuencias/);
assert.throws(()=>pitch.correctChannel(source,rate,sourceHz,Infinity,marks),/Frecuencias/);
const broken=source.slice();broken[n-100]=NaN;
assert.throws(()=>pitch.correctChannel(broken,rate,sourceHz,targetHz,marks),/Muestra vocal inválida/);
const nonFinite=source.slice();nonFinite[n-1]=Infinity;
assert.throws(()=>pitch.correctChannel(nonFinite,rate,sourceHz,targetHz,marks),/Muestra vocal inválida/);
assert.deepEqual(source,original,'Mark validation never changes source');
console.log('PASS PSOLA safety: valid pitch shift and strict mark order/period/frame/finite PCM guards.');
