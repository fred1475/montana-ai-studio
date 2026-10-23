"use strict";
/* Regression comparison against independent FFmpeg ebur128.
 * This is NOT an official EBU certification suite.
 * Explicit tolerance for 4x true-peak estimator stays wider because current
 * 12-tap windowed-sinc filters differ from the ITU true-peak reference.
 */
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const meter=require('../mixer-loudness.js');
const rate=48000,twoPi=2*Math.PI;
function reference(left,right){
 const bytes=Buffer.allocUnsafe(left.length*8);
 for(let i=0;i<left.length;i++){
  bytes.writeFloatLE(left[i],i*8);
  bytes.writeFloatLE(right[i],i*8+4);
 }
 const p=spawnSync('ffmpeg',[
  '-hide_banner','-nostats','-f','f32le','-ar',String(rate),
  '-ac','2','-i','pipe:0','-filter_complex','ebur128=peak=true','-f','null','-'
 ],{input:bytes,encoding:'utf8',maxBuffer:16e6,timeout:45000});
 if(p.status!==0)throw Error('FFmpeg ebur128 reference failed: '+p.stderr?.slice(-1000));
 const report=p.stderr.match(/Summary:[\s\S]*?Integrated loudness:\s*I:\s*([-\d.]+) LUFS[\s\S]*?Loudness range:\s*LRA:\s*([-\d.]+) LU[\s\S]*?True peak:\s*Peak:\s*([-\d.]+) dBFS/);
 if(!report)throw Error('Cannot parse FFmpeg ebur128 summary: '+p.stderr.slice(-1000));
 return {integratedLufs:Number(report[1]),lra:Number(report[2]),truePeakDbtp:Number(report[3])};
}
function tone(duration,frequency,volume){
 const n=Math.round(duration*rate),a=new Float32Array(n);
 for(let i=0;i<n;i++)a[i]=volume*Math.sin(twoPi*frequency*i/rate);
 return a;
}
function dynamic(){
 const a=tone(24,1000,1);
 const levels=[-33,-20,-27].map(db=>Math.pow(10,db/20));
 for(let i=0;i<a.length;i++)a[i]*=levels[Math.floor(i/(rate*8))]||levels[2];
 return a;
}
function noise(){
 const n=rate*11,a=new Float32Array(n);let seed=0x1985ab;
 for(let i=0;i<n;i++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  a[i]=((seed>>>0)/4294967295*2-1)*.08;
 }
 return a;
}
const cases=[
 {name:'EBU 1kHz −23dBFS, 12 seconds',left:tone(12,1000,Math.pow(10,-23/20)),toleranceTP:.35},
 {name:'Three changing levels, 24 seconds',left:dynamic(),toleranceTP:.35},
 {name:'Bass low-frequency weighting 70Hz, 14 seconds',left:tone(14,70,.2),toleranceTP:.35},
 {name:'Deterministic noise, 11 seconds',left:noise(),toleranceTP:.5},
 {name:'High-frequency intersample tone, 7 seconds',left:(()=>{
  const a=tone(7,12000,.75);
  for(let i=0;i<a.length;i++)a[i]=.75*Math.sin(twoPi*12000*i/rate+Math.PI/4);
  return a;
 })(),toleranceTP:.8}
];
(async()=>{
 const result=[];
 for(const fixture of cases){
  const measured=await meter.measure(fixture.left,fixture.left,rate);
  const expected=reference(fixture.left,fixture.left);
  const deltaI=Math.abs(measured.integratedLufs-expected.integratedLufs);
  const deltaL=Math.abs(measured.loudnessRangeLu-expected.lra);
  const deltaTP=Math.abs(measured.truePeakDbtp-expected.truePeakDbtp);
  assert(deltaI<.16,fixture.name+': LUFS differs from FFmpeg by '+deltaI+' LU');
  assert(deltaL<.65,fixture.name+': LRA differs from FFmpeg by '+deltaL+' LU');
  assert(deltaTP<fixture.toleranceTP,fixture.name+': true peak differs by '+deltaTP+' dBTP');
  assert(Number.isFinite(measured.maxMomentaryLufs)&&Number.isFinite(measured.maxShortTermLufs));
  assert(measured.maxMomentaryLufs>=measured.momentaryLufs-.01);
  assert(measured.maxShortTermLufs>=measured.shortTermLufs-.01);
  result.push({case:fixture.name,ffmpeg:expected,measured:{I:measured.integratedLufs,LRA:measured.loudnessRangeLu,TP:measured.truePeakDbtp},deltaI,deltaL,deltaTP});
 }
 const signal=cases[0].left;
 const ref=await meter.measure(signal,signal,rate);
 assert(Math.abs(ref.integratedLufs+23)<.10,'EBU 1 kHz −23 dBFS sine standard minimum requirement: '+ref.integratedLufs);
 assert(ref.loudnessRangeLu<.1);
 const silent=new Float32Array(rate*4);
 const empty=await meter.measure(silent,silent,rate);
 assert.equal(empty.integratedLufs,-Infinity);
 assert.equal(empty.maxMomentaryLufs,-Infinity);
 assert.equal(empty.loudnessRangeLu,null);
 console.log('PASS independent FFmpeg ebur128 comparison (5 stereo signal families), including I / LRA / true-peak estimates:');
 for(const x of result)console.log(JSON.stringify(x));
 console.log('LIMITATION: wide TP allowance for high frequencies; does not establish EBU R128 certification.');
})().catch(e=>{console.error(e);process.exit(1)});
