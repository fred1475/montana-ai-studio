'use strict';
/* Exact bytes from PCM16/24 WAV; reference checks, not certified EBU R128. */
const assert=require('node:assert/strict');
const codec=require('../mixer-wav-export.js');
const audit=require('../mixer-master-audit.js');
const rate=44100,n=rate;
const measure=async()=>({
 integratedLufs:null,momentaryLufs:null,shortTermLufs:null,
 maximumMomentaryLufs:null,maximumShortTermLufs:null,
 loudnessRangeLu:null,lraStable:false,truePeakDbtp:null
});
const sine=Float32Array.from({length:n},(_,i)=>.25*Math.sin(2*Math.PI*220*i/rate));
const opposite=Float32Array.from(sine,v=>-v);
const double=Float32Array.from(sine,v=>v);
const almostSilent=Float32Array.from(sine,v=>v*.005);
async function inspect(l,r,bits=16){
 const wav=codec.encode(l,r,rate,{bits});
 const exact=new Uint8Array(await wav.arrayBuffer());
 const result=await audit.analyzeWav(wav,measure);
 assert.equal(result.file.bitsPerSample,bits);
 assert.equal(result.file.crc32,audit.crc32(exact).toString(16).padStart(8,'0'));
 return result;
}
(async()=>{
 for(const bits of [16,24]){
  const inPhase=await inspect(sine,double,bits);
  assert(inPhase.metrics.stereoCorrelation>.99999,'Identical channels must be correlated');
  assert(Math.abs(inPhase.metrics.monoFoldDownDeltaDb)<.01,'Mono fold-down of identical channels must not lose level');
  assert.equal(inPhase.checks.find(c=>c.id==='stereo_phase').status,'clear');
  assert.equal(inPhase.checks.find(c=>c.id==='mono_compatibility').status,'clear');
  assert.equal(inPhase.metrics.monoFoldDownSilent,false);
  const outOfPhase=await inspect(sine,opposite,bits);
  assert(outOfPhase.metrics.stereoCorrelation<-.99999,'Anti-phase must be detected');
  assert.equal(outOfPhase.metrics.monoFoldDownSilent,true,'Anti-phase WAV cancels in mono');
  assert.equal(outOfPhase.metrics.monoFoldDownDeltaDb,null,'Silent fold-down has no finite dB');
  assert.equal(outOfPhase.checks.find(c=>c.id==='stereo_phase').status,'warning');
  const check=outOfPhase.checks.find(c=>c.id==='mono_compatibility');
  assert.equal(check.status,'warning');
  assert.equal(check.completeCancellation,true);
  assert.equal(outOfPhase.checks.find(c=>c.id==='dc_offset').status,'clear');
  const imbalance=await inspect(sine,almostSilent,bits);
  assert.equal(imbalance.checks.find(c=>c.id==='stereo_channel_balance').status,'warning');
  assert(imbalance.metrics.channelLevelDifferenceDb>40);
  assert.equal(imbalance.checks.find(c=>c.id==='stereo_phase').status,'clear');
  assert.equal(imbalance.checks.find(c=>c.id==='mono_compatibility').status,'clear');
  const dc=Float32Array.from(sine,x=>x+.035);
  const shifted=await inspect(dc,dc,bits);
  assert.equal(shifted.checks.find(c=>c.id==='dc_offset').status,'warning');
  assert(Math.abs(shifted.metrics.dcOffsetLeft-.035)<1e-4);
  assert(Math.abs(shifted.metrics.dcOffsetRight-.035)<1e-4);
  assert.equal(shifted.checks.find(c=>c.id==='mono_compatibility').status,'clear');
  const zeros=new Float32Array(n);
  const silence=await inspect(zeros,zeros,bits);
  assert.equal(silence.metrics.stereoCorrelation,null);
  assert.equal(silence.metrics.monoFoldDownDeltaDb,null);
  assert.equal(silence.metrics.monoFoldDownSilent,false);
  assert.equal(silence.metrics.channelLevelDifferenceDb,null);
  for(const c of silence.checks.filter(x=>['stereo_phase','mono_compatibility','stereo_channel_balance','dc_offset'].includes(x.id)))
   assert.equal(c.status,'clear','Silence must not generate fabricated stereo alarms');
  const fullScale=Float32Array.from(sine,(x,i)=>i===30?1:x);
  const clipping=await inspect(fullScale,sine,bits);
  assert.equal(clipping.checks.find(c=>c.id==='pcm_clipping').status,'warning');
 }
 assert.deepEqual(sine,Float32Array.from({length:n},(_,i)=>.25*Math.sin(2*Math.PI*220*i/rate)),'Source PCM not mutated');
 console.log('PASS master stereo QA: exact WAV PCM16/24 CRC, polarity, mono cancellation, DC, imbalance, silence, clipped samples and safe nulls.');
})().catch(e=>{console.error(e);process.exit(1)});
