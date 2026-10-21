'use strict';
const assert=require('node:assert/strict');
const automation=require('../mixer-volume-automation.js');
const {parse,format,validate,defaults,at,attach}=automation;
const state=parse('0:100, 10:60, 15:60, 20:100',true);
assert.equal(format(state),'0:100, 10:60, 15:60, 20:100');
assert.equal(at(state,0),1);
assert.equal(at(state,5),.8);
assert.equal(at(state,10),.6);
assert.equal(at(state,12.5),.6);
assert.equal(at(state,17.5),.8);
assert.equal(at(state,150),1);
assert.equal(at(defaults(),12),1);
assert.equal(at(parse('0:20, 1:0',false),.5),1);
assert.equal(at(parse('0:100, 0.29:51, 0.58:100',true),.29),.51);
const original=JSON.parse(JSON.stringify(state));
validate(state).points[1].gain=42;
assert.deepEqual(state,original,'validation is nonmutating');
const events=[],connections=[],ctx={
 createGain(){return {gain:{
  setValueAtTime(value,time){events.push(['set',value,time]);},
  linearRampToValueAtTime(value,time){events.push(['ramp',value,time]);}
 },connect(dest){connections.push(dest);}}}
};
const destination={connect(){}};
attach(ctx,destination,state,2.5);
assert.deepEqual(events,[['set',1,2.5],['ramp',.6,12.5],['ramp',.6,17.5],['ramp',1,22.5]]);
assert.deepEqual(connections,[destination]);
events.length=0;
attach(ctx,destination,defaults(),0);
assert.deepEqual(events,[['set',1,0]],'default automation is inert and unity');
for(const str of [
 '', '1:50','0:100, 0:50','0:20, 3:50, 2:70','0:100, 301:80',
 '0:151','0:-1','0:50.5','0:50, NaN:60','0:50, Infinity:60',
 '0:100,1:80,2:60,3:40,4:30,5:20,6:10,7:5,8:0',
 '0:100;1:50', '<script>', '0:100,0.001:50'
])assert.throws(()=>parse(str,true),/inválid|Escribe|Usa|Formato/,str);
for(const bad of [
 {...state,points:[{time:0,gain:101.2}]},
 {...state,points:[{time:0,gain:200}]},
 {...state,enabled:1},null,{enabled:true,points:[]},
 {...state,points:[{time:0,gain:100},{time:.1,gain:100},{time:.1,gain:80}]}
])assert.throws(()=>validate(bad),/inválid/);
assert.throws(()=>at(state,-1),/inválido/);
assert.throws(()=>attach(null,destination,state),/inválida/);
console.log('PASS automation DSP: interpolated linear gain, WebAudio scheduling, disabled unity, bounds and immutable validation.');
