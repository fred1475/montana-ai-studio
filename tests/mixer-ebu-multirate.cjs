'use strict';
/* Montana Music Production LLC — independent multirate R128 regression.
 * These are synthetic engineering checks, NOT official EBU conformance signals.
 * Requires FFmpeg with ebur128 available on CI.
 */
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const meter=require('../mixer-loudness.js');
const TWO_PI=2*Math.PI;

function tone(rate,seconds,hz,dbfs,phase=0){
 const n=Math.round(rate*seconds),out=new Float32Array(n);
 const amplitude=Math.pow(10,dbfs/20);
 for(let i=0;i<n;i++)out[i]=amplitude*Math.sin(TWO_PI*hz*i/rate+phase);
 return out;
}
function sections(rate){
 const n=rate*9,out=new Float32Array(n),db=[-32,-18,-27];
 for(let i=0;i<n;i++){
  const a=Math.pow(10,db[Math.min(2,Math.floor(i/(3*rate)))]/20);
  out[i]=a*Math.sin(TWO_PI*1000*i/rate);
 }
 return out;
}
function ffmpegR128(left,right,rate){
 const bytes=Buffer.allocUnsafe(left.length*8);
 for(let i=0;i<left.length;i++){
  bytes.writeFloatLE(left[i],8*i);bytes.writeFloatLE(right[i],8*i+4);
 }
 const p=spawnSync('ffmpeg',[
  '-hide_banner','-nostats','-f','f32le','-ar',String(rate),'-ac','2',
  '-i','pipe:0','-filter_complex','ebur128=peak=true','-f','null','-'
 ],{input:bytes,encoding:'utf8',maxBuffer:16*1024*1024,timeout:45000});
 assert.equal(p.status,0,'FFmpeg reference failed: '+(p.stderr||'').slice(-600));
 const summary=(p.stderr||'').split('Summary:').at(-1);
 const i=summary.match(/Integrated loudness:\s*I:\s*([-\d.]+) LUFS/);
 const lra=summary.match(/Loudness range:\s*LRA:\s*([-\d.]+) LU/);
 const tp=summary.match(/True peak:\s*Peak:\s*([-\d.]+) dBFS/);
 assert(i&&lra&&tp,'FFmpeg ebur128 summary missing fields');
 return {i:+i[1],lra:+lra[1],tp:+tp[1]};
}
function approx(value,reference,tolerance,message){
 assert(Number.isFinite(value)&&Number.isFinite(reference),message+' must be finite');
 const error=Math.abs(value-reference);
 assert(error<tolerance,message+' deviation '+error.toFixed(3)+' exceeds '+tolerance);
 return error;
}
(async()=>{
 const cases=[
  {name:'44.1 kHz asymmetric stereo 1 kHz',rate:44100,
   left:tone(44100,6,1000,-21),right:tone(44100,6,1000,-26,Math.PI/3),tpTolerance:.7},
  {name:'48 kHz one-sided 200 Hz',rate:48000,
   left:tone(48000,5,200,-24),right:new Float32Array(48000*5),tpTolerance:.7},
  {name:'96 kHz asymmetric stereo 1 kHz',rate:96000,
   left:tone(96000,5,1000,-21),right:tone(96000,5,1000,-26,Math.PI/3),tpTolerance:.7},
  {name:'44.1 kHz sections with gating',rate:44100,
   left:sections(44100),right:sections(44100),tpTolerance:.7}
 ];
 for(const fixture of cases){
  const actual=await meter.measure(fixture.left,fixture.right,fixture.rate);
  const expected=ffmpegR128(fixture.left,fixture.right,fixture.rate);
  const iError=approx(actual.integratedLufs,expected.i,.22,fixture.name+' integrated LUFS');
  const lraError=approx(actual.loudnessRangeLu,expected.lra,.8,fixture.name+' LRA');
  const tpError=approx(actual.truePeakDbtp,expected.tp,fixture.tpTolerance,fixture.name+' 4x estimated TP');
  assert(actual.truePeakDbtp>=actual.samplePeakDbfs-.01,'true-peak estimate must not miss a sample peak');
  assert(actual.totalBlocks>0&&actual.gatedBlocks>0);
  assert.equal(actual.lraStable,false,'short reference programs must be marked provisional');
  console.log(JSON.stringify({case:fixture.name,sampleRate:fixture.rate,deltaIntegratedLU:iError,deltaLraLU:lraError,deltaEstimatedTPdB:tpError}));
 }
 // Negative tests: reject non-finite PCM, mismatched channels, unsupported sample rates.
 const valid=tone(44100,1,1000,-23),broken=valid.slice();broken[50]=NaN;
 await assert.rejects(meter.measure(broken,valid,44100),/inválidos/);
 await assert.rejects(meter.measure(valid,new Float32Array(valid.length-1),44100),/inválido/);
 await assert.rejects(meter.measure(valid,valid,4000),/muestreo/);
 await assert.rejects(meter.measure(new Float32Array(100),new Float32Array(100),44100),/400 ms/);
 console.log('PASS independent FFmpeg R128 cross-rate, channel asymmetry, gate, estimated TP and invalid-input checks.');
 console.log('NOT CERTIFIED: this does not demonstrate official EBU Mode or 4x true-peak conformance.');
})().catch(e=>{console.error(e);process.exit(1)});
