/* Montana Music Production LLC — measured note corrections, NOT proof of tuning accuracy.
 * Uses already-computed pitch-engine estimates for input and planned correction;
 * independently samples the final wet/dry signal with the same conservative
 * f0 detector. A null output measurement is not silently replaced by a plan.
 */
(function(root,factory){
 const engine=typeof module!=="undefined"&&module.exports?require("./pitch-engine.js"):root.MontanaPitch;
 const api=factory(engine);
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPitchNoteAudit=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(pitch){
 "use strict";
 if(!pitch||typeof pitch.detectPitch!=="function"||typeof pitch.vocalReference!=="function")
  throw Error("Detector de notas no disponible");
 const round=(x,n=2)=>x===null?null:Number(x.toFixed(n));
 const finite=(x,min,max,label)=>{
  if(typeof x!=="number"||!Number.isFinite(x)||x<min||x>max)throw Error("Diagnóstico de nota inválido: "+label);
  return x;
 };
 const cents=(a,b)=>1200*Math.log2(a/b);
 function create(result,mode,finalChannels,rate,settings){
  if(!["sustain","melody"].includes(mode)||!result||typeof result!=="object"||
     !settings||!pitch.notes.includes(settings.key)||!pitch.scales[settings.scale]||
     !Number.isFinite(rate)||rate<8000||rate>192000)
   throw Error("Diagnóstico de notas incompatible");
  const reference=pitch.vocalReference(finalChannels).samples;
  const duration=reference.length/rate;
  if(duration>.001+15||duration<.15)throw Error("Duración de diagnóstico inválida");
  const segments=mode==="sustain"?[{
   startSeconds:0,endSeconds:duration,inputHz:result.analysis?.frequency,
   targetHz:result.targetFrequency,targetNote:result.target?.note,
   correctionCents:result.correctionCents
  }]:(Array.isArray(result.segments)?result.segments:[]);
  if(!segments.length||segments.length>12)throw Error("Cantidad de notas inválida");
  const entries=segments.map((s,index)=>{
   const start=finite(s.startSeconds,0,duration,"inicio"),
    end=finite(s.endSeconds,0,duration+.0001,"fin"),
    inputHz=finite(s.inputHz,70,650,"nota original"),
    plannedHz=finite(s.targetHz,60,800,"frecuencia planificada"),
    plannedCents=finite(s.correctionCents,-250,250,"corrección");
   if(end-start<.15||start>=(end-.0001)||index>0&&start<segments[index-1].endSeconds-.0001)
    throw Error("Segmentos de notas inválidos");
   if(typeof s.targetNote!=="string"||!/^[A-G]#?-?\d$/.test(s.targetNote))
    throw Error("Nombre de nota inválido");
   const note=pitch.nearestNote(inputHz,settings.key,settings.scale);
   if(note.note!==s.targetNote||Math.abs(cents(plannedHz,inputHz)-plannedCents)>2)
    throw Error("Nota y corrección planificadas inconsistentes");
   const begin=Math.max(0,Math.floor(start*rate)),stop=Math.min(reference.length,Math.ceil(end*rate));
   const detected=pitch.detectPitch(reference.subarray(begin,stop),rate,.5);
   const measured=detected?.frequency&&Number.isFinite(detected.frequency)?detected.frequency:null;
   return {
    startSeconds:round(start,3),endSeconds:round(end,3),
    originalNote:pitch.noteName(Math.round(69+12*Math.log2(inputHz/440))),
    originalHz:round(inputHz),
    targetNote:note.note,targetNoteHz:round(note.frequency),
    plannedHz:round(plannedHz),plannedCorrectionCents:round(plannedCents,1),
    measuredOutputHz:round(measured),
    measuredDeviationCents:measured===null?null:round(cents(measured,note.frequency),1),
    detectorConfidence:measured===null?null:round(detected.confidence,3)
   };
  });
  return {method:"autocorrelation-f0",mode,
   caveat:"Cents planificados son órdenes del algoritmo; mediciones del resultado mezclado son estimaciones en ventanas, no garantía de corrección, formantes ni inteligibilidad.",
   segments:entries};
 }
 return {create};
});
