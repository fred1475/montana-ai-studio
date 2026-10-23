'use strict';
/* WAV PCM chunk boundary equivalence regression.
 * Byte-for-byte comparisons against the previous contiguous encoder path:
 * header, sign, PCM16 TPDF state, PCM24 and frames crossing 32768 boundaries.
 * This is NOT an EBU R128 certification or hardware benchmark.
 */
const assert=require('node:assert/strict');
const codec=require('../mixer-wav-export.js');
const {crc32}=require('../mixer-master-audit.js');
function reference(left,right,rate,bits,dither=false){
 const bytesPerSample=bits/8,stride=bytesPerSample*2;
 const length=44+left.length*stride;
 const array=new ArrayBuffer(length),bytes=new Uint8Array(array),dv=new DataView(array);
 const fourcc=(at,text)=>{for(let j=0;j<4;j++)bytes[at+j]=text.charCodeAt(j)};
 fourcc(0,'RIFF');dv.setUint32(4,length-8,true);fourcc(8,'WAVE');
 fourcc(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);
 dv.setUint16(22,2,true);dv.setUint32(24,rate,true);
 dv.setUint32(28,rate*stride,true);dv.setUint16(32,stride,true);
 dv.setUint16(34,bits,true);fourcc(36,'data');dv.setUint32(40,length-44,true);
 let state=0x49ae1985;
 const uniform=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
 for(let i=0;i<left.length;i++)for(let ch=0;ch<2;ch++){
  let value=ch===0?left[i]:right[i];
  if(dither)value+=(uniform()-uniform())/32768;
  value=Math.max(-1,Math.min(1,value));
  const q=Math.round(value*(value<0?(bits===16?32768:8388608):(bits===16?32767:8388607)));
  const p=44+i*stride+ch*bytesPerSample;
  if(bits===16)dv.setInt16(p,q,true);
  else{bytes[p]=q&255;bytes[p+1]=(q>>8)&255;bytes[p+2]=(q>>16)&255}
 }
 return bytes;
}
function sampleData(n){
 const left=new Float32Array(n),right=new Float32Array(n);
 for(let i=0;i<n;i++){
  const v=i%8191===0?-1:i%9973===0?1:
   .405*Math.sin(i*.0213)+.33*Math.cos(i*.0037)+.000002*Math.sin(i*.21);
  left[i]=v;
  right[i]=i%3===0?-v*.62:i%5===0?0:v*.075;
 }
 return [left,right];
}
(async()=>{
 const nativeBlob=global.Blob;
 let observed=null;
 class TrackingBlob extends nativeBlob{
  constructor(parts,options){
   observed=parts.map(p=>p.byteLength===undefined?p.size:p.byteLength);
   super(parts,options);
  }
 }
 let comparisons=0;
 try{
  global.Blob=TrackingBlob;
  for(const frames of [1,32,32767,32768,32769,65539,131073]){
   const [left,right]=sampleData(frames);
   const leftOriginal=left.slice(),rightOriginal=right.slice();
   for(const bits of [16,24])for(const rate of [44100,48000]){
    for(const dither of bits===16?[false,true]:[false]){
     const old=reference(left,right,rate,bits,dither);
     const encoded=codec.encode(left,right,rate,{bits,dither});
     assert.equal(encoded.size,old.byteLength);
     assert.equal(encoded.type,'audio/wav');
     assert.equal(observed[0],44);
     assert.equal(observed.length,1+Math.ceil(frames/32768));
     const largest=Math.max(...observed.slice(1));
     assert(largest<=32768*2*(bits/8),'No full-size temporary PCM allocation allowed');
     assert.equal(observed.reduce((a,b)=>a+b,0),old.byteLength);
     const bytes=new Uint8Array(await encoded.arrayBuffer());
     assert.deepEqual(bytes,old,'Chunked WAV must be bit-identical to contiguous reference: '+JSON.stringify({frames,bits,rate,dither}));
     assert.equal(crc32(bytes),crc32(old));
     comparisons++;
    }
   }
   assert.deepEqual(left,leftOriginal,'Source left PCM stays immutable');
   assert.deepEqual(right,rightOriginal,'Source right PCM stays immutable');
  }
  const [l,r]=sampleData(65539);
  l[40000]=NaN;
  assert.throws(()=>codec.encode(l,r,44100),/valores inválidos/,'Late-block NaN must never yield partial file');
  l[40000]=Infinity;
  assert.throws(()=>codec.encode(l,r,44100,{bits:24}),/valores inválidos/);
  const zeros=new Float32Array(2);
  assert.throws(()=>codec.encode(zeros,zeros,44100,{bits:24,dither:true}),/solo/);
  console.log('PASS WAV chunk encoder: '+comparisons+' byte-identical references at 44.1/48k, PCM16/24, continuous TPDF, 32768-frame boundaries, original safety, bounded part allocations.');
 }finally{global.Blob=nativeBlob;}
})().catch(e=>{console.error(e);process.exit(1)});
