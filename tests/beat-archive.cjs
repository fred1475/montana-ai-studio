'use strict';
const assert=require('node:assert/strict');
const {makeZip,crc32,MAX_ARCHIVE}=require('../beat-archive.js');
const {deflateRawSync}=require('node:zlib');
const encoder=new TextEncoder();
const a=encoder.encode('123456789');
assert.equal(crc32(a),0xcbf43926,'Standard CRC32 reference vector');
const files=[
 {name:'beat.wav',bytes:Uint8Array.from([1,2,3,4,5])},
 {name:'pattern.json',bytes:encoder.encode('{"bpm":120}')},
 {name:'vacia.mid',bytes:new Uint8Array(0)},
 {name:'LEEME.txt',bytes:encoder.encode('Texto sin caracteres especiales')}
];
const frozen=files.map(f=>f.bytes.slice());
const zip=makeZip(files),view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
let at=0;
for(let i=0;i<files.length;i++){
 const file=files[i],name=encoder.encode(file.name);
 assert.equal(view.getUint32(at,true),0x04034b50);
 assert.equal(view.getUint16(at+8,true),0,'ZIP STORE only');
 assert.equal(view.getUint32(at+14,true),crc32(file.bytes),'CRC match');
 assert.equal(view.getUint32(at+18,true),file.bytes.length);
 assert.equal(view.getUint32(at+22,true),file.bytes.length);
 const len=view.getUint16(at+26,true);
 assert.equal(new TextDecoder().decode(zip.subarray(at+30,at+30+len)),file.name);
 const start=at+30+len;
 assert.deepEqual(zip.subarray(start,start+file.bytes.length),file.bytes);
 at=start+file.bytes.length;
}
const centralAt=at;
for(let i=0;i<files.length;i++){
 const file=files[i];
 assert.equal(view.getUint32(at,true),0x02014b50);
 assert.equal(view.getUint32(at+16,true),crc32(file.bytes));
 assert.equal(view.getUint32(at+20,true),file.bytes.length);
 const len=view.getUint16(at+28,true);
 assert.equal(new TextDecoder().decode(zip.subarray(at+46,at+46+len)),file.name);
 assert(view.getUint32(at+42,true)<centralAt);
 at+=46+len;
}
assert.equal(view.getUint32(at,true),0x06054b50);
assert.equal(view.getUint16(at+8,true),files.length);
assert.equal(view.getUint16(at+10,true),files.length);
assert.equal(view.getUint32(at+12,true),at-centralAt);
assert.equal(view.getUint32(at+16,true),centralAt);
assert.equal(view.getUint16(at+20,true),0);
assert.equal(at+22,zip.length);
for(let i=0;i<files.length;i++)assert.deepEqual(files[i].bytes,frozen[i],'Input immutability');
for(const f of [
 [],
 Array.from({length:13},(_,i)=>({name:'f'+i,bytes:new Uint8Array(0)})),
 [{name:'../escape.wav',bytes:a}],
 [{name:'dir/file.wav',bytes:a}],
 [{name:'x..y.wav',bytes:a}],
 [{name:'bad.xyz',bytes:'not a Uint8Array'}],
 [{name:'twice.wav',bytes:a},{name:'twice.wav',bytes:a}],
 [{name:'hello',bytes:a},{name:'HELLO',bytes:null}]
])assert.throws(()=>makeZip(f),/inválid/);
assert.throws(()=>makeZip([{name:'big.wav',bytes:new Uint8Array(MAX_ARCHIVE)}]),/memoria/);
console.log('PASS Beat Lab ZIP: complete STORE central directory, CRC32 vectors, binary/empty files, safe names, memory bound and source immutability.');
