/* Montana Music Production LLC — opt-in PCM level matching for pitch A/B.
 * Uses one bounded gain for all channels, preserving relative stereo balance.
 * This does NOT align phase, correct formants, certify voice quality, or
 * modify the immutable dry source. Matching compares global RMS only.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPitchLevelMatch=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_GAIN_DB=6,HEADROOM=.98,FLOOR=1e-5;
 const up=Math.pow(10,MAX_GAIN_DB/20),down=1/up;
 function inspect(channels){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
     !(channels[0] instanceof Float32Array)||
     !Number.isSafeInteger(channels[0].length)||channels[0].length<1||
     channels[0].length>192000*15)
   throw Error("Audio de comparación vocal inválido");
  const n=channels[0].length;let energy=0,peak=0;
  for(const c of channels){
   if(!(c instanceof Float32Array)||c.length!==n)
    throw Error("Canales vocales incompatibles");
   for(let i=0;i<n;i++){
    const x=c[i];
    if(!Number.isFinite(x))throw Error("Muestra vocal no finita");
    energy+=x*x;peak=Math.max(peak,Math.abs(x));
   }
  }
  return {rms:Math.sqrt(energy/(n*channels.length)),peak,frames:n};
 }
 function match(source,processed){
  const dry=inspect(source),wet=inspect(processed);
  if(source.length!==processed.length||dry.frames!==wet.frames)
   throw Error("Audio original y afinado no tienen la misma duración");
  if(dry.rms<=FLOOR||wet.rms<=FLOOR){
   return {channels:processed.map(c=>c.slice()),
    report:{appliedGainDb:0,appliedGain:1,sourceRms:dry.rms,
     processedRms:wet.rms,outputRms:wet.rms,limited:false,
     status:"omitted_silent_signal"}};
  }
  const desired=dry.rms/wet.rms;
  const bounded=Math.min(up,Math.max(down,desired));
  // Safety headroom takes precedence over the nominal -6 dB bound
  // if incoming processed PCM already has excessive peak.
  const gain=Math.min(bounded,HEADROOM/wet.peak);
  if(!Number.isFinite(gain)||gain<=0)
   throw Error("No se pudo calcular ganancia de voz segura");
  const output=processed.map(c=>{
   const out=new Float32Array(c.length);
   for(let i=0;i<c.length;i++)out[i]=c[i]*gain;
   return out;
  });
  const result=inspect(output);
  if(result.peak>HEADROOM+1e-6)throw Error("Salida vocal excede margen seguro");
  return {channels:output,report:{
   appliedGainDb:20*Math.log10(gain),appliedGain:gain,
   sourceRms:dry.rms,processedRms:wet.rms,outputRms:result.rms,
   limited:Math.abs(gain-desired)>1e-5,
   status:Math.abs(gain-desired)>1e-5?"bounded":"matched"
  }};
 }
 return {MAX_GAIN_DB,HEADROOM,inspect,match};
});
