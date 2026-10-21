'use strict';
/* Byte-level Beat Lab handoff preflight and malformed Inbox record rejection. */
const assert=require('node:assert/strict');
const {inspect,validate,LIMIT,AGE_MS}=require('../beat-bridge.js');
function wave(rate=44100,frames=320){
 const u=new Uint8Array(44+frames*4),v=new DataView(u.buffer);
 const tag=(at,x)=>{for(let i=0;i<x.length;i++)u[at+i]=x.charCodeAt(i);};
 tag(0,'RIFF');v.setUint32(4,u.length-8,true);tag(8,'WAVE');
 tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,2,true);v.setUint32(24,rate,true);
 v.setUint32(28,rate*4,true);v.setUint16(32,4,true);
 v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,u.length-44,true);
 return u;
}
function checksum(bytes){let c=0xffffffff;
 for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;}
 return (c^0xffffffff)>>>0;
}
const bytes=wave(),backup=bytes.slice(),now=Date.now();
assert.deepEqual(inspect(bytes),{rate:44100,frames:320});
assert.deepEqual(inspect(wave(48000)),{rate:48000,frames:320});
const record={id:'beat',format:'montana-beat-transfer',version:1,
 bpm:120,rate:44100,created:now,filename:'montana-beat-lab-44k.wav',
 bytes,crc32:checksum(bytes)};
const valid=validate(record,now);
assert.equal(valid.bpm,120);assert.equal(valid.frames,320);assert.equal(valid.rate,44100);
assert.notStrictEqual(valid.bytes,bytes);valid.bytes[100]=220;
assert.deepEqual(record.bytes,backup,'Validation returns an independent defensive copy');
for(const [name,mutation] of [
 ['bad bpm',r=>r.bpm=240],['bad rate',r=>r.rate=48000],
 ['bad checksum',r=>r.crc32^=1],['wrong filename',r=>r.filename='../escape.wav'],
 ['too old',r=>r.created=now-AGE_MS-1],
 ['future',r=>r.created=now+60001],['version',r=>r.version=9],
 ['byte tampering',r=>r.bytes[100]^=1]
]){
 const item={...record,bytes:record.bytes.slice()};mutation(item);
 assert.throws(()=>validate(item,now),/inválid|caducado|Integridad/,name);
}
for(const [name,mutation] of [
 ['RIFF',a=>a[0]=88],['format',a=>a[8]=88],
 ['PCM format',a=>new DataView(a.buffer).setUint16(20,3,true)],
 ['24 bits',a=>new DataView(a.buffer).setUint16(34,24,true)],
 ['mono',a=>new DataView(a.buffer).setUint16(22,1,true)],
 ['byte rate',a=>new DataView(a.buffer).setUint32(28,1,true)],
 ['block align',a=>new DataView(a.buffer).setUint16(32,2,true)],
 ['RIFF length',a=>new DataView(a.buffer).setUint32(4,1,true)],
 ['data length',a=>new DataView(a.buffer).setUint32(40,1,true)]
]){
 const item=bytes.slice();mutation(item);
 assert.throws(()=>inspect(item),/WAV|inválido/,name);
}
assert.throws(()=>inspect(new Uint8Array(LIMIT+1)),/demasiado grande/);
assert.deepEqual(bytes,backup);
console.log('PASS Beat bridge preflight: RIFF stereo PCM16, 44.1/48 kHz, CRC32, expiry, metadata, invalid formats, memory and input immutability.');
