'use strict';
const assert=require('node:assert/strict'),S=require('../mixer-section-plan.js');
const range=S.range(.125,2.5);assert.deepEqual(range,{start:.125,end:2.5,duration:2.375});
const tracks=Array.from({length:8},()=>[]);
tracks[0]=[{offset:0,start:.3,duration:3,singleDuration:1,repeat:3}];
tracks[1]=[{offset:1.2,start:0,duration:2,singleDuration:2,repeat:1}];
tracks[2]=[{offset:4,start:0,duration:1,singleDuration:1,repeat:1}];
const plan=S.plan(1.25,2.75,tracks);
assert.equal(plan.window.duration,1.5);
assert.equal(plan.regions,2);
assert.deepEqual(plan.tracks[0],[{track:0,when:0,sourceOffset:.55,duration:1.5,
 loop:true,loopStart:.3,loopEnd:1.3,clipIndex:0,regionStart:0,regionDuration:3,elapsed:1.25}]);
assert(Math.abs(plan.tracks[1][0].when)<1e-8);
assert(Math.abs(plan.tracks[1][0].sourceOffset-.05)<1e-8);
assert.equal(plan.tracks[1][0].duration,1.5);
assert.equal(plan.tracks[1][0].clipIndex,0);
assert(Math.abs(plan.tracks[1][0].elapsed-.05)<1e-8);
assert.deepEqual(plan.tracks[2],[]);
assert.equal(S.plan(0,1,Array.from({length:8},()=>[])).regions,0);
const touching=S.plan(1,2,tracks);
assert(Math.abs(touching.tracks[1][0].when-.2)<1e-8,'Native floating-point timing has sub-sample rounding');
const last=S.plan(2.5,3.5,tracks);
assert.equal(last.tracks[0][0].duration,.5);
assert.equal(last.tracks[0][0].sourceOffset,.8);
assert(Math.abs(last.tracks[1][0].duration-.7)<1e-8,'Durations use sub-sample floating-point tolerance');
const copies=JSON.stringify(tracks);
S.plan(0,2,tracks);
assert.equal(JSON.stringify(tracks),copies,'Planner never mutates clip states');
for(const [a,b] of [
 [-1,2],[0,0],[1,1.04],[0,31],[29,60],[290,301],[NaN,2],[0,Infinity],[2,1],[0,300]
])assert.throws(()=>S.range(a,b),/Preescucha/);
for(const malformed of [
 null,[],Array.from({length:7},()=>[]),
 [...Array.from({length:7},()=>[]),null],
 [Array(25).fill(null),...Array.from({length:7},()=>[])],
 [[{offset:0,start:0,duration:2,singleDuration:1,repeat:1}],...Array.from({length:7},()=>[])],
 [[{offset:0,start:0,duration:1,singleDuration:1,repeat:9}],...Array.from({length:7},()=>[])],
 [[{offset:0,start:NaN,duration:1,singleDuration:1,repeat:1}],...Array.from({length:7},()=>[])]
])assert.throws(()=>S.plan(0,1,malformed),/incompatibles|inválido/);
const split=Array.from({length:8},()=>[]);
split[3]=[
 {offset:.2,start:.1,duration:.4,singleDuration:.4,repeat:1},
 {offset:1.3,start:.5,duration:.4,singleDuration:.4,repeat:1}
];
const sparse=S.plan(.3,1.65,split);
assert.equal(sparse.regions,2);
assert(Math.abs(sparse.tracks[3][0].duration-.3)<1e-8);
assert(Math.abs(sparse.tracks[3][1].when-1)<1e-8);
console.log('PASS marker section planner: bounded ranges, loop wrap, staggered regions, sparse clips, precise offsets and non-destructive validation.');
