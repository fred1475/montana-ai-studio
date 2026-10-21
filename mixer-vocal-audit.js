/* Montana Music Production LLC — bounded, source-free portable vocal QA report.
 * Local JSON only. Never includes raw WAV, PCM arrays, internal AudioBuffers,
 * permissions, network data, or undocumented arbitrary objects.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalAudit=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const names=["sourcePeakDbfs","outputPeakDbfs","sourceRmsDbfs","outputRmsDbfs",
  "rmsDeltaDb","peakIncreaseDb","highBandDeltaDb",
  "dropoutWindowCount","firstDropoutSeconds","firstDropoutChannel","newLargeSteps"];
 const allowedModes=["sustain","melody"];
 const value=x=>{
  if(x===null)return null;
  if(typeof x!=="number"||!Number.isFinite(x))
   throw Error("Métrica de voz no finita");
  return x;
 };
 const sanitize=raw=>{
  if(!raw||typeof raw!=="object")throw Error("Diagnóstico vocal no disponible");
  const out={};
  for(const key of names)out[key]=value(raw[key]===undefined?null:raw[key]);
  return out;
 };
 function create({track,sourceName,pitch,qa,level,timbre,createdAt}){
  if(!Number.isInteger(track)||track<2||track>8||
     typeof sourceName!=="string"||!sourceName.trim()||sourceName.length>200||
     /[\u0000-\u001f\u007f]/.test(sourceName)||
     !pitch||!allowedModes.includes(pitch.mode)||typeof pitch.key!=="string"||
     !/^[A-G]#?$/.test(pitch.key)||!["chromatic","major","minor"].includes(pitch.scale)||
     typeof pitch.strength!=="number"||pitch.strength<0||pitch.strength>100||
     typeof pitch.wet!=="number"||pitch.wet<0||pitch.wet>100||
     typeof pitch.enabled!=="boolean"||
     typeof pitch.matchLevel!=="boolean"||typeof pitch.protectTimbre!=="boolean"||
     !qa||qa.version!==1||![1,2].includes(qa.channels)||
     !Number.isInteger(qa.frames)||qa.frames<=0||
     !Number.isFinite(qa.sampleRate)||qa.sampleRate<8000||qa.sampleRate>192000||
     !Array.isArray(qa.warnings)||qa.warnings.length>40||
     typeof createdAt!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(createdAt))
   throw Error("Parámetros para auditoría vocal inválidos");
  const warnings=qa.warnings.map(w=>{
   if(!w||typeof w.id!=="string"||!(/^[a-z_]{1,60}$/).test(w.id))
    throw Error("Aviso de calidad inválido");
   return w.id;
  });
  const extra=(s,kind)=>{
   if(s===null||s===undefined)return null;
   if(!s||typeof s!=="object"||
      !Number.isFinite(s.appliedGainDb)&&kind==="level"||
      !Number.isFinite(s.wetPercent)&&kind==="timbre")
    throw Error("Resumen de protección inválido");
   if(kind==="level")
    return {appliedGainDb:value(s.appliedGainDb),limited:Boolean(s.limited),
      status:typeof s.status==="string"?s.status.slice(0,40):"unknown"};
   return {wetPercent:value(s.wetPercent),
    originalMaxBandShiftDb:value(s.originalMaxBandShiftDb??null),
    outputMaxBandShiftDb:value(s.outputMaxBandShiftDb??null),
    status:typeof s.status==="string"?s.status.slice(0,40):"unknown"};
  };
  const audit={
   schema:"montana-vocal-audit",version:1,createdAt,track,sourceName,
   pitch:{mode:pitch.mode,key:pitch.key,scale:pitch.scale,
    strength:pitch.strength,wet:pitch.wet,enabled:pitch.enabled,
    matchLevel:pitch.matchLevel,protectTimbre:pitch.protectTimbre},
   qa:{channels:qa.channels,sampleRate:qa.sampleRate,frames:qa.frames,
    metrics:sanitize(qa.metrics),warnings},
   levelMatch:extra(level,"level"),
   spectralGuard:extra(timbre,"timbre"),
   qualification:"Informe PCM heurístico local. No incluye muestras de audio. No certifica formantes, naturalidad vocal, LUFS/EBU R128, mastering ni calidad perceptiva."
  };
  if(JSON.stringify(audit).length>12000)throw Error("Informe vocal demasiado grande");
  return audit;
 }
 return {create};
});
