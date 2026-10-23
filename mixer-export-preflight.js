/* Montana Music Production LLC — deterministic, non-rendering export planning.
 * Predicts PCM/ZIP payload and a LOWER BOUND on working buffers before an
 * expensive OfflineAudioContext render. Browser memory usage is not certified.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaExportPreflight=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MiB=1024*1024,MAX_WAV=150*MiB,MAX_STEM=145*MiB,MAX_ZIP=145*MiB,AUDIT_LIMIT=56*MiB;
 const mb=n=>(n/MiB).toFixed(1);
 function estimate({frames,rate,bits,kind="master",stemCount=1,audit=false}={}){
  if(!Number.isSafeInteger(frames)||frames<1||frames>2147483647)
   throw Error("Duración de audio inválida para renderizar");
  if(rate!==44100&&rate!==48000)throw Error("Frecuencia de exportación inválida");
  if(bits!==16&&bits!==24)throw Error("Profundidad de exportación inválida");
  if(!["master","stem","stems"].includes(kind))throw Error("Formato de exportación inválido");
  if(typeof audit!=="boolean")throw Error("Preferencia de auditoría inválida");
  if(!Number.isInteger(stemCount)||stemCount<1||stemCount>8)throw Error("Número de pistas inválido");
  const wavBytes=44+frames*2*(bits/8);
  if(!Number.isSafeInteger(wavBytes))throw Error("Archivo WAV demasiado grande");
  const zipUpperBound=kind==="stems"?stemCount*wavBytes+10240:null;
  const budget=kind==="master"?MAX_WAV:MAX_STEM;
  if(wavBytes>budget)throw Error(kind==="master"?
   "La duración supera el tamaño máximo de WAV. Reduce las repeticiones o exporta stems breves.":
   "La pista excede el límite de exportación de 145 MB");
  if(kind==="stems"&&zipUpperBound>MAX_ZIP)
   throw Error("El ZIP de stems superaría 145 MB. Exporta las pistas individualmente.");
  // Lower bound: 2ch offline float buffer + encoded PCM, plus per-stem data
  // held until download; audit additionally decodes 2ch and copies WAV bytes.
  // Excludes WebAudio graph, JS engine, input audio, base64 backups and OS RAM.
  const offlineBytes=frames*2*4;
  const minimumWorkingBytes=offlineBytes+wavBytes+
   (kind==="stems"?zipUpperBound+wavBytes:0)+
   (kind==="master"&&audit?offlineBytes+wavBytes:0);
  const warnings=[];
  if(minimumWorkingBytes>256*MiB)
   warnings.push("Reserva mínima de buffers alta; el navegador podría necesitar considerablemente más RAM");
  else if(kind==="stems"&&stemCount>=6&&zipUpperBound>80*MiB)
   warnings.push("ZIP multicanal grande; el navegador puede requerir bastante más RAM que los bytes del archivo");
  if(kind==="master"&&audit&&wavBytes>AUDIT_LIMIT)
   warnings.push("La auditoría PCM exacta no admite este WAV (>56 MiB); el archivo WAV sí puede exportarse");
  return {
   frames,rate,bits,kind,stemCount,durationSeconds:frames/rate,
   wavBytes,zipUpperBound,minimumWorkingBytes,
   auditWithinLimit:wavBytes<=AUDIT_LIMIT,
   warnings,
   summary:kind==="master"?
     "Master WAV PCM"+bits+" · "+(rate/1000).toFixed(1)+" kHz · "+mb(wavBytes)+" MiB":
     kind==="stem"?
     "Stem WAV PCM"+bits+" · "+(rate/1000).toFixed(1)+" kHz · "+mb(wavBytes)+" MiB":
     "ZIP de "+stemCount+" stems PCM"+bits+" · "+(rate/1000).toFixed(1)+" kHz · hasta "+mb(zipUpperBound)+" MiB"
  };
 }
 return {estimate,MiB,MAX_WAV,MAX_STEM,MAX_ZIP,AUDIT_LIMIT};
});
