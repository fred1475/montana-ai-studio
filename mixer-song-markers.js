/* Montana Music Production LLC — non-destructive arrangement markers.
 * Marker positions live in the project timeline, not the source WAV.
 * Save/restore is strict; earlier project files default to no markers.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaSongMarkers=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX=24,END=300;
 function validate(value){
  if(!Array.isArray(value)||value.length>MAX)
   throw Error("Lista de marcadores inválida (máximo 24)");
  const positions=new Set();
  return value.map((m,index)=>{
   if(!m||typeof m!=="object"||Array.isArray(m)||
      typeof m.label!=="string"||m.label.trim()!==m.label||
      m.label.length<1||m.label.length>35||
      /[\u0000-\u001f\u007f<>]/.test(m.label)||
      typeof m.seconds!=="number"||!Number.isFinite(m.seconds)||
      m.seconds<0||m.seconds>END||
      Math.abs(Math.round(m.seconds*1000)-m.seconds*1000)>1e-7)
    throw Error("Marcador inválido número "+(index+1));
   const key=Math.round(m.seconds*1000);
   if(positions.has(key))throw Error("Dos marcadores no pueden compartir el mismo segundo");
   positions.add(key);
   return {label:m.label,seconds:m.seconds};
  }).sort((a,b)=>a.seconds-b.seconds);
 }
 function append(markers,label,seconds){
  return validate([...validate(markers),{label,seconds}]);
 }
 function remove(markers,at){
  const list=validate(markers);
  if(!Number.isInteger(at)||at<0||at>=list.length)
   throw Error("Marcador para borrar inválido");
  return validate(list.filter((_,i)=>i!==at));
 }
 function move(markers,at,newSeconds){
  const list=validate(markers);
  if(!Number.isInteger(at)||at<0||at>=list.length)
   throw Error("Marcador para mover inválido");
  return validate(list.map((m,i)=>i===at?{...m,seconds:newSeconds}:m));
 }
 function clock(seconds){
  if(typeof seconds!=="number"||!Number.isFinite(seconds)||seconds<0||seconds>END)
   throw Error("Tiempo de marcador inválido");
  const minutes=Math.floor(seconds/60),remainder=(seconds%60).toFixed(3).padStart(6,"0");
  return String(minutes).padStart(2,"0")+":"+remainder;
 }
 return {MAX,END,validate,append,remove,move,clock};
});
