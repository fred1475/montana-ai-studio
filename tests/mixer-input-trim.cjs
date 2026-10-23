'use strict';
const assert=require('node:assert/strict'),trim=require('../mixer-input-trim.js');
assert.equal(trim.amplitude(0),1);
assert(Math.abs(trim.amplitude(-6)-0.5011872336)<1e-8);
assert(Math.abs(trim.amplitude(6)-1.995262315)<1e-8);
assert(Math.abs(trim.amplitude(12)-3.981071706)<1e-8);
assert(Math.abs(trim.amplitude(-24)-0.0630957344)<1e-8);
for(const invalid of [-24.1,12.1,3.3,'-6',Infinity,-Infinity,NaN,null,undefined,{},true])
 assert.throws(()=>trim.amplitude(invalid),/rango/);
const links=[];
const fake={createGain:()=>({gain:{value:NaN},connect(dest){links.push(dest)}})};
const destination={connect(){}};
const node=trim.attach(fake,destination,-6);
assert(Math.abs(node.gain.value-.5011872336)<1e-8);
assert.deepEqual(links,[destination]);
assert.throws(()=>trim.attach(null,destination,0),/inválid/);
assert.throws(()=>trim.attach(fake,null,0),/inválid/);
console.log('PASS input trim: 0 dB unity, precise dB conversion, -24/+12 boundaries, rejects malformed inputs, precedes fader.');
