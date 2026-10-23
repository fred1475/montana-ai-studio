'use strict';
const assert=require('node:assert/strict');
const E=require('../mixer-section-envelope.js');
const close=(actual,expected,msg,tolerance=1e-6)=>
 assert(Math.abs(actual-expected)<tolerance,`${msg}: expected ${expected}, got ${actual}`);

const clip={regionStart:2,regionDuration:4,elapsed:1,duration:1};
const fade={fadeIn:2,fadeOut:1};
close(E.gainAt(clip,1,fade,null),.5,'Fade already in progress at section marker');
close(E.gainAt(clip,2,fade,null),1,'Full level after clip fade');
close(E.gainAt(clip,3.5,fade,null),.5,'Original late fade-out');

const incoming={fadeIn:{start:3,duration:2},fadeOut:null};
close(E.gainAt(clip,1,fade,incoming),0,'Crossfade starts on the ORIGINAL timeline');
close(E.gainAt(clip,2,fade,incoming),Math.SQRT1_2,'Equal-power midpoint');
close(E.gainAt(clip,2,fade,incoming,'linear'),.5,'Linear midpoint');
const outgoing={fadeIn:null,fadeOut:{start:4,duration:2}};
close(E.gainAt(clip,3,fade,outgoing),Math.SQRT1_2,'Equal-power exit');
close(E.gainAt(clip,4,fade,outgoing),0,'Clip and crossfade finish');

const selected={regionStart:2,regionDuration:4,elapsed:2.3,duration:.4};
const before=JSON.stringify({selected,fade,incoming});
const curve=E.build(selected,{fadeIn:0,fadeOut:0},incoming);
assert(curve instanceof Float32Array&&curve.length>=65);
close(curve[0],Math.sin(.65*Math.PI/2),'Partial crossfade starts mid-ramp',1e-5);
close(curve.at(-1),Math.sin(.85*Math.PI/2),'Partial crossfade ends mid-ramp',1e-5);
assert.equal(JSON.stringify({selected,fade,incoming}),before,'No mutations to arrangement');

const long={regionStart:0,regionDuration:30,elapsed:0,duration:30};
const sampled=E.build(long,{fadeIn:.05,fadeOut:.05});
assert.equal(sampled.length,E.MAX_POINTS,'Curve size remains bounded');
assert.equal(sampled[0],0);
assert.equal(sampled.at(-1),0);
assert(sampled[Math.floor(sampled.length/2)]>.99);
assert.equal(E.build(clip,{fadeIn:0,fadeOut:0}),null,'Flat gain needs no curve');

const calls=[],param={
 setValueCurveAtTime:(values,at,duration)=>calls.push({values,at,duration}),
 setValueAtTime:(value,at)=>calls.push({value,at})
};
E.schedule(param,10,selected,{fadeIn:0,fadeOut:0},incoming);
assert.equal(calls[0].at,10);assert.equal(calls[0].duration,.4);
E.schedule(param,11,clip,{fadeIn:0,fadeOut:0});
assert.deepEqual(calls[1],{value:1,at:11});

for(const invalid of [
 {...clip,elapsed:NaN},{...clip,elapsed:4},{...clip,regionDuration:0},
 {...clip,duration:Infinity}
])assert.throws(()=>E.build(invalid,fade),/inválida/);
for(const invalid of [
 {fadeIn:-1,fadeOut:0},{fadeIn:6,fadeOut:0},{fadeIn:0,fadeOut:NaN}
])assert.throws(()=>E.build(clip,invalid),/inválida/);
assert.throws(()=>E.build(clip,fade,{fadeIn:{start:1,duration:2}}),/fuera/);
assert.throws(()=>E.build(clip,fade,{fadeOut:{start:3,duration:4}}),/fuera/);
assert.throws(()=>E.schedule(param,-1,clip,fade),/inválido/);
console.log('PASS section envelopes: original-clock fades, equal-power/linear crossfades, partial markers, bounded curves, immutability and validation.');
