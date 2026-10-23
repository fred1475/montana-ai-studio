'use strict';
const assert=require('node:assert/strict');
const engine=require('../hardware-loopback.js');
for(const rate of [44100,48000]){
 const probe=engine.createProbe(rate);
 assert(probe instanceof Float32Array&&probe.length>rate&&probe.length<rate*1.2);
 assert(probe.every(Number.isFinite));
 assert(Math.max(...probe.slice(0,100))===0,'Probe starts with silence');
 const nominal=Math.round(rate*.36),limit=750;
 for(const ms of [0,27.25,83.5,215.75,510]){
  const lag=Math.round(ms*rate/1000),maxLag=Math.round(rate*limit/1000);
  const captured=new Float32Array(nominal+probe.length+maxLag+2);
  let seed=913;
  for(let i=0;i<captured.length;i++){
   seed=(1664525*seed+1013904223)>>>0;
   captured[i]=((seed/4294967295)*2-1)*.00023;
  }
  for(let i=0;i<probe.length;i++)captured[nominal+lag+i]+=.42*probe[i];
  const result=engine.estimate(captured,probe,rate,nominal,0,limit);
  assert(Math.abs(result.estimatedRoundTripMs-ms)<.15,'Latency must match known injected time at '+rate+': '+JSON.stringify(result));
  assert(result.matchScore>.9,'Reference match should be high: '+result.matchScore);
  assert(result.caveat.includes('ESTIMACIÓN'));
 }
 const captured=new Float32Array(Math.round(rate*3));
 assert.throws(()=>engine.estimate(captured,probe,rate,nominal,0,limit),/No se detectó/);
 assert.throws(()=>engine.estimate(new Float32Array(rate),probe,rate,nominal,0,limit),/Grabación incompleta/);
 assert.throws(()=>engine.estimate(captured,probe,rate,-1,0,limit),/inválidos/);
 assert.throws(()=>engine.createProbe(0),/inválida/);
 console.log('PASS loopback at '+rate+' Hz: 0–510ms injected delay recovered, noisy return, silence rejected, truncated and invalid captures rejected.');
}
