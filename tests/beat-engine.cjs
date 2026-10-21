'use strict';
const assert=require('node:assert/strict');
const beat=require('../beat-engine.js');
const {preset,validate,events,midi,wav}=beat;
for(const name of ['trap','reggaeton','dembow','hiphop','empty']){
 const p=preset(name),copy=JSON.parse(JSON.stringify(p));
 assert.deepEqual(validate(p),p,'Roundtrip preset '+name);
 const ev=events(p),bytes=midi(p),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 assert.equal(Buffer.from(bytes.subarray(0,4)).toString(),'MThd');
 assert.equal(dv.getUint32(4),6);assert.equal(dv.getUint16(8),0);
 assert.equal(dv.getUint16(10),1);assert.equal(dv.getUint16(12),480);
 assert.equal(Buffer.from(bytes.subarray(14,18)).toString(),'MTrk');
 assert.equal(dv.getUint32(18),bytes.length-22);
 assert.deepEqual(p,copy,'No input mutation');
 assert(ev.every(e=>e.tick>=0&&e.tick<p.bars*16*120));
}
const p=preset('empty');p.bpm=120;p.bars=2;p.swing=30;
p.drums.kick[0]=1;p.drums.hat[1]=1;p.bass[1]=48;
const ev=events(p);
assert.equal(ev.length,6,'2-bar repetition of three sounds');
assert.equal(ev[0].tick,0);assert.equal(ev[1].tick,156);assert.equal(ev[2].tick,156);
assert.equal(ev[3].tick,1920);assert.equal(ev[4].tick,2076);
const buf=midi(p);
assert(buf.includes(0x99),'MIDI percussion channel 10 note-on');
assert(buf.includes(0x90),'MIDI bass channel 1 note-on');
assert(buf.includes(0xff)&&buf.includes(0x51));
assert.deepEqual(buf.slice(-4),new Uint8Array([0,255,47,0]),'MIDI end of track');
const view=new DataView(buf.buffer);assert.equal(view.getUint32(18),buf.length-22);
const stereo=wav([new Float32Array([0,.5,-1,1]),new Float32Array([0,-.5,1,-1])],44100);
const v=new DataView(stereo.buffer);
assert.equal(Buffer.from(stereo.slice(0,4)).toString(),'RIFF');assert.equal(v.getUint16(22,true),2);
assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),16);
assert.equal(v.getInt16(48,true),16384);assert.equal(v.getInt16(50,true),-16384);
assert.equal(v.getInt16(52,true),-32768);assert.equal(v.getInt16(54,true),32767);
assert.throws(()=>wav([new Float32Array([NaN]),new Float32Array([0])],44100),/no finito/);
for(const bad of [null,{},[],{...p,bpm:201},{...p,bpm:60.5},{...p,swing:-1},{...p,bars:16},
 {...p,drums:{...p.drums,kick:Array(15).fill(0)}},
 {...p,bass:Array(16).fill(200)},
 {...p,drums:{...p.drums,hat:Array(16).fill(true)}}])
 assert.throws(()=>validate(bad),/inválid/);
console.log('PASS beat engine: five presets, deterministic notes, swing MIDI, format-0 header, exact WAV PCM16, invalid patterns.');
