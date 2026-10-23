'use strict';
/* PCM24 microphone encoder: pure node checks, no device or network involved. */
const assert=require('node:assert/strict');
const pcm=require('../mixer-pcm-record.js');
const rate=8000,n=8000,signal=new Float32Array(n);
signal[0]=1;signal[1]=-1;signal[2]=.25;signal[3]=-.25;
for(let i=4;i<n;i++)signal[i]=.15*Math.sin(2*Math.PI*200*i/rate);
const original=signal.slice();
(async()=>{
 assert.equal(pcm.supported(),false,'Node has no browser capture context');
 const wav=Buffer.from(await pcm.encodeMono([signal.subarray(0,4000),signal.subarray(4000)],rate).arrayBuffer());
 assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.toString('ascii',12,16),'fmt ');
 assert.equal(wav.readUInt16LE(20),1,'WAV must contain integer PCM');
 assert.equal(wav.readUInt16LE(22),1,'Capture must be mono');
 assert.equal(wav.readUInt32LE(24),rate);
 assert.equal(wav.readUInt32LE(28),rate*3);
 assert.equal(wav.readUInt16LE(32),3);
 assert.equal(wav.readUInt16LE(34),24);
 assert.equal(wav.readUInt32LE(40),3*n);
 assert.equal(wav.length,44+3*n);
 const int24=at=>{
  const offset=44+at*3,v=wav[offset]|(wav[offset+1]<<8)|(wav[offset+2]<<16);
  return v&0x800000?v-0x1000000:v;
 };
 assert.equal(int24(0),8388607);
 assert.equal(int24(1),-8388608);
 assert(Math.abs(int24(2)/8388607-.25)<2e-7);
 assert(Math.abs(int24(3)/8388608+.25)<2e-7);
 assert.deepEqual(signal,original,'Recording encoder must never modify input PCM');
 const invalid=signal.slice();invalid[50]=NaN;
 assert.throws(()=>pcm.encodeMono([invalid],rate),/no finita/);
 assert.throws(()=>pcm.encodeMono([new Float32Array(100)],rate),/demasiado corta/);
 assert.throws(()=>pcm.encodeMono([new Float32Array(rate*301)],rate),/cinco minutos/);
 assert.throws(()=>pcm.encodeMono([signal],1),/inválida/);
 console.log('PASS PCM24 capture encoder: RIFF, mono signed samples, short/invalid/oversized limits, immutable source.');
})().catch(e=>{console.error(e);process.exit(1)});
