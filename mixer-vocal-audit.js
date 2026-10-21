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
 function noteSummary(raw){
  if(raw===null||raw===undefined)return null;
  if(!raw||typeof raw!=="object"||!["sustain","melody"].includes(raw.mode)||
     raw.method!=="autocorrelation-f0"||!Array.isArray(raw.segments)||
     raw.segments.length<1||raw.segments.length>12)
   throw Error("Informe de notas inválido");
  const finite=(x,a,b)=>typeof x==="number"&&Number.isFinite(x)&&x>=a&&x<=b;
  const maybe=(x,a,b)=>x===null||finite(x,a,b);
  const notes=raw.segments.map(p=>{
   if(!p||typeof p!=="object"||
     !finite(p.startSeconds,0,15)||!finite(p.endSeconds,p.startSeconds+.15,15.001)||
     !/^[A-G]#?-?\d$/.test(p.originalNote)||
     !/^[A-G]#?-?\d$/.test(p.targetNote)||
     !finite(p.originalHz,60,800)||!finite(p.targetNoteHz,60,800)||
     !finite(p.plannedHz,60,800)||!finite(p.plannedCorrectionCents,-250,250)||
     !maybe(p.measuredOutputHz,60,800)||
     !maybe(p.measuredDeviationCents,-2400,2400)||
     !maybe(p.detectorConfidence,0,1)||
     (p.measuredOutputHz===null)!==(p.measuredDeviationCents===null))
    throw Error("Dato de nota inválido");
   return {startSeconds:p.startSeconds,endSeconds:p.endSeconds,
    originalNote:p.originalNote,originalHz:p.originalHz,
    targetNote:p.targetNote,targetNoteHz:p.targetNoteHz,
    plannedHz:p.plannedHz,plannedCorrectionCents:p.plannedCorrectionCents,
    measuredOutputHz:p.measuredOutputHz,measuredDeviationCents:p.measuredDeviationCents,
    detectorConfidence:p.detectorConfidence};
  });
  return {method:"autocorrelation-f0",mode:raw.mode,segments:notes,
   caveat:"Frecuencias y cents del audio mezclado aproximados. No constituyen prueba de exactitud de afinación, naturalidad ni formantes."};
 }
 function artifactSummary(raw){
  if(raw===undefined||raw===null)return null;
  if(!raw||typeof raw!=="object"||raw.version!==1||raw.windowMs!==25||
     !raw.counts||typeof raw.counts!=="object"||
     !Array.isArray(raw.events)||raw.events.length>24||
     typeof raw.truncated!=="boolean")
   throw Error("Diagnóstico temporal inválido");
  const counts={};
  for(const code of ["dropout","step","peak"]){
   const n=raw.counts[code];
   if(!Number.isInteger(n)||n<0||n>100000)
    throw Error("Conteo temporal inválido");
   counts[code]=n;
  }
  const events=raw.events.map(e=>{
   if(!e||!["dropout","step","peak"].includes(e.code)||
      !Number.isFinite(e.timeSeconds)||e.timeSeconds<0||e.timeSeconds>15||
      !Number.isInteger(e.channel)||e.channel<1||e.channel>2)
    throw Error("Marca temporal inválida");
   return {code:e.code,timeSeconds:e.timeSeconds,channel:e.channel};
  });
  return {version:1,windowMs:25,events,counts,truncated:raw.truncated,
   caveat:"Marcas heurísticas PCM: posibles microcortes, clics y picos a escuchar. No identifica de forma fiable efectos robóticos ni garantiza naturalidad."};
 }
 function create({track,sourceName,pitch,qa,level,timbre,noteAnalysis,artifactTimeline,createdAt}){
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
   noteAnalysis:noteSummary(noteAnalysis),
   artifactTimeline:artifactSummary(artifactTimeline),
   qualification:"Informe PCM heurístico local. No incluye muestras de audio. No certifica formantes, naturalidad vocal, LUFS/EBU R128, mastering ni calidad perceptiva."
  };
  if(JSON.stringify(audit).length>12000)throw Error("Informe vocal demasiado grande");
  return audit;
 }
 return {create};
});
