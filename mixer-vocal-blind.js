/* Montana Music Production LLC — source-safe randomized listening exercise.
 * Not double-blind or a certification of vocal quality. Random order is
 * concealed in UI until the listener commits a subjective preference.
 */
(function(root,factory){
 const api=factory(root.MontanaPitchLevelMatch||
  (typeof require==="function"?require("./pitch-level-match.js"):null));
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalBlind=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(level){
 "use strict";
 if(!level)throw Error("Normalizador vocal no disponible");
 const MAX_SECONDS=15;
 function prepare(dry,wet,rate,draw){
  if(!Number.isInteger(rate)||rate<8000||rate>192000||
     !Array.isArray(dry)||!Array.isArray(wet)||
     ![1,2].includes(dry.length)||dry.length!==wet.length)
   throw Error("Comparación ciega: formato vocal incompatible");
  const a=level.inspect(dry),b=level.inspect(wet);
  if(a.frames!==b.frames||a.frames>rate*MAX_SECONDS)
   throw Error("Comparación ciega: duración incompatible");
  if(typeof draw!=="function")throw Error("Falta aleatoriedad para el ensayo");
  const n=draw();
  if(!Number.isInteger(n)||n<0||n>0xffffffff)
   throw Error("Sorteo A/B inválido");
  const match=level.match(dry,wet);
  // A shared attenuation guards any existing >0.98 PCM peak on both takes.
  // It does not overwrite either underlying original or pitch buffer.
  const peak=Math.max(a.peak,level.inspect(match.channels).peak);
  const common=peak>.98?.98/peak:1;
  const copy=samples=>samples.map(ch=>Float32Array.from(ch,x=>x*common));
  const aligned=[copy(dry),copy(match.channels)];
  const firstIsWet=!!(n&1);
  return {
   choices:firstIsWet?[aligned[1],aligned[0]]:aligned,
   order:firstIsWet?["processed","original"]:["original","processed"],
   rate,frames:a.frames,channels:dry.length,
   match:{gainDb:match.report.appliedGainDb,
    limited:match.report.limited,reason:match.report.status,
    residualDb:a.rms>1e-5&&b.rms>1e-5?
     20*Math.log10(level.inspect(aligned[1]).rms/level.inspect(aligned[0]).rms):null,
    commonAttenuationDb:20*Math.log10(common)}
  };
 }
 function result(trial,selection,grades,createdAt){
  if(!trial||!Array.isArray(trial.order)||trial.order.length!==2||
     !new Set(trial.order).has("original")||!new Set(trial.order).has("processed")||
     !["A","B"].includes(selection)||
     !grades||typeof grades!=="object"||Array.isArray(grades)||
     typeof createdAt!=="string"||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(createdAt))
   throw Error("Resultado de escucha ciega inválido");
  const axes=["naturalidad","inteligibilidad","timbre"];
  const ratings={};
  for(const axis of axes){
   const x=grades[axis];
   if(!Number.isInteger(x)||x<1||x>5)
    throw Error("Valora las tres dimensiones de 1 a 5");
   ratings[axis]=x;
  }
  const notes=grades.notes===undefined?"":grades.notes;
  if(typeof notes!=="string"||notes.length>500||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(notes))
   throw Error("Notas de escucha inválidas");
  if(!trial.match||typeof trial.match.gainDb!=="number")
   throw Error("Nivel de comparación inválido");
  return {
   schema:"montana-vocal-blind",version:1,createdAt,
   choice:selection,chosenType:trial.order[selection==="A"?0:1],
   reveal:{A:trial.order[0],B:trial.order[1]},
   subjectiveRatings:ratings,notes,
   loudness:{gainDb:trial.match.gainDb,residualDb:trial.match.residualDb,
    gainLimited:trial.match.limited,
    commonAttenuationDb:trial.match.commonAttenuationDb},
   comparison:{sampleRate:trial.rate,frames:trial.frames,channels:trial.channels},
   limitations:"Escucha local de una persona; A/B aleatorio no doble ciego. Los niveles pueden diferir por límites de pico. Las calificaciones subjetivas no certifican formantes, naturalidad ni inteligibilidad."
  };
 }
 return {MAX_SECONDS,prepare,result};
});
