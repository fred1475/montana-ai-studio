'use strict';
const assert=require('node:assert/strict'),M=require('../mixer-pan-automation.js');
const raw=M.parse('0:-100, 0.5:-100, 1.5:100, 2:100',true);
assert.equal(M.format(raw),'0:-100, 0.5:-100, 1.5:100, 2:100');
assert.equal(M.at(raw,0),-1);assert.equal(M.at(raw,.5),-1);
assert.equal(M.at(raw,1),0);assert.equal(M.at(raw,1.5),1);
assert.equal(M.at(raw,220),1);
assert.equal(M.at({...raw,enabled:false},.3,-.4),-.4,'Disabled automation follows fixed pan');
assert.deepEqual(M.validate(raw),raw);
const validated=M.validate(raw);validated.points[0].pan=5;assert.equal(raw.points[0].pan,-100);
const events=[],node={pan:{
 setValueAtTime(value,time){events.push(['set',value,time])},
 linearRampToValueAtTime(value,time){events.push(['ramp',value,time])}
}};
assert.equal(M.schedule(node,raw,-.3,1.25),node);
assert.deepEqual(events,[['set',-1,1.25],['ramp',-1,1.75],['ramp',1,2.75],['ramp',1,3.25]]);
events.length=0;M.schedule(node,M.defaults(),.25,0);
assert.deepEqual(events,[['set',.25,0]],'Default pan must preserve fixed fader slider');
for(const input of [
 '', '1:0','0:0, 0:10','0:30, .5:-10','0:0, 301:30',
 '0:-101','0:101','0:50.4','0:NaN','0:Infinity','0:20;1:-20',
 '0:0,1:10,2:10,3:10,4:10,5:10,6:10,7:10,8:10',
 '<script>','0:0, 0.003:20', '0:20,2:20,1:30'
])assert.throws(()=>M.parse(input,true),/inválid|Formato|Hasta/);
for(const bad of [null,{enabled:1,points:[{time:0,pan:0}]},
 {enabled:true,points:[]},{enabled:true,points:[{time:0,pan:15.5}]},
 {enabled:true,points:[{time:0,pan:-101}]}])
 assert.throws(()=>M.validate(bad),/inválid/);
assert.throws(()=>M.at(raw,-3),/inválido/);
assert.throws(()=>M.schedule({},raw,0),/incompatible/);
assert.throws(()=>M.schedule(node,raw,2),/incompatible/);
console.log('PASS stereo pan automation: left/right/center interpolation, WebAudio scheduling, fixed-pan fallback and strict validation.');
