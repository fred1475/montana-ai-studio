"use strict";
// Browser-native time-domain audio meters. These show approximate sample peaks,
// not true peak (intersample), LUFS or a calibrated mastering meter.
(function(){
 const $=id=>document.getElementById(id);
 const trackAnalyzers=Array(8).fill(null);
 let master=null,frame=0;
 const buffers=new WeakMap();
 const setMeter=(id,label,peak)=>{
  const meter=$(id),output=$(label);
  if(!meter||!output)return;
  meter.value=Math.round(Math.min(1,peak)*100);
  output.textContent=peak<.000001?"−∞ dBFS":(20*Math.log10(peak)).toFixed(1)+" dBFS";
 };
 function sample(analyser){
  if(!analyser)return 0;
  let b=buffers.get(analyser);
  if(!b){b=new Float32Array(analyser.fftSize);buffers.set(analyser,b)}
  analyser.getFloatTimeDomainData(b);
  let peak=0;for(let j=0;j<b.length;j++){const s=Math.abs(b[j]);if(s>peak)peak=s}
  return peak;
 }
 function tick(){
  frame=0;
  for(let i=0;i<8;i++)setMeter("meter"+i,"meterDb"+i,sample(trackAnalyzers[i]));
  setMeter("masterMeter","masterDb",sample(master));
  if(master||trackAnalyzers.some(Boolean))frame=requestAnimationFrame(tick);
 }
 function start(){if(!frame)frame=requestAnimationFrame(tick)}
 window.attachTrackMeter=(ctx,node,i)=>{
  const a=ctx.createAnalyser();a.fftSize=2048;a.smoothingTimeConstant=0;
  node.connect(a);trackAnalyzers[i]=a;start();return a;
 };
 window.attachMasterMeter=(ctx,node)=>{
  const a=ctx.createAnalyser();a.fftSize=2048;a.smoothingTimeConstant=0;
  node.connect(a);master=a;start();return a;
 };
 window.resetMeters=()=>{
  if(frame){cancelAnimationFrame(frame);frame=0}
  for(let i=0;i<8;i++){
   try{trackAnalyzers[i]?.disconnect()}catch(e){}
   trackAnalyzers[i]=null;
   setMeter("meter"+i,"meterDb"+i,0);
  }
  try{master?.disconnect()}catch(e){}
  master=null;setMeter("masterMeter","masterDb",0);
 };
})();
