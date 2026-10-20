/* Montana Music Production LLC — offline level diagnostics and peak normalization.
 * Sample-peak and sample RMS only. NOT integrated LUFS or true-peak.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaExportLevels=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function analyze(left,right){
  if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||
     left.length!==right.length||!left.length)throw Error("Canales PCM inválidos");
  let peak=0,energy=0;
  for(let i=0;i<left.length;i++){
   const a=left[i],b=right[i];
   if(!Number.isFinite(a)||!Number.isFinite(b))throw Error("El audio contiene muestras inválidas");
   peak=Math.max(peak,Math.abs(a),Math.abs(b));
   energy+=a*a+b*b;
  }
  const rms=Math.sqrt(energy/(left.length*2));
  const db=x=>x>1e-12?20*Math.log10(x): -Infinity;
  return {peak,rms,peakDb:db(peak),rmsDb:db(rms),crestDb:peak>1e-12&&rms>1e-12?20*Math.log10(peak/rms):0};
 }
 function normalize(left,right,targetDb=-1,maxBoostDb=12){
  if(typeof targetDb!=="number"||!Number.isFinite(targetDb)||targetDb< -6||targetDb>-.5)throw Error("Pico objetivo inválido");
  const before=analyze(left,right),desired=Math.pow(10,targetDb/20);
  if(before.peak<1e-8)return {...before,appliedGainDb:0,after:before,tooQuiet:true};
  // Avoid amplifying barely audible noise by 50+ dB.
  const raw=desired/before.peak,gain=Math.min(raw,Math.pow(10,maxBoostDb/20));
  for(let i=0;i<left.length;i++){left[i]*=gain;right[i]*=gain}
  return {...before,appliedGainDb:20*Math.log10(gain),after:analyze(left,right),tooQuiet:false};
 }
 return {analyze,normalize};
});
