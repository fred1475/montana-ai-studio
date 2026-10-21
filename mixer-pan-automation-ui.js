"use strict";
/* Independent per-lane pan automation editor; validated before committing
 * UI state, feeding Undo/Redo, session export and the same live/offline DSP.
 */
(function(){
 const $=id=>document.getElementById(id),A=MontanaPanAutomation;
 function state(i){
  if(!Number.isInteger(i)||i<0||i>=8)throw Error("Canal de panorama inválido");
  return A.parse($("panAutoPoints"+i).value,$("panAutoEnable"+i).checked);
 }
 function set(i,raw){
  if(!Number.isInteger(i)||i<0||i>=8)throw Error("Canal de panorama inválido");
  const clean=A.validate(raw);
  $("panAutoPoints"+i).value=A.format(clean);
  $("panAutoEnable"+i).checked=clean.enabled;
  $("panAutoStatus"+i).textContent=clean.enabled?
   "Activa · "+clean.points.length+" punto(s) · posición estéreo absoluta":
   "Desactivada · se utiliza el panorama fijo del canal";
  return clean;
 }
 const committed=[];
 for(let i=0;i<8;i++){
  committed[i]=set(i,A.defaults());
  const apply=()=>{
   try{
    const next=state(i);
    committed[i]=set(i,next);
    report("Panorama del canal "+(i+1)+" actualizado. Detén y reproduce para escucharlo.");
   }catch(err){
    set(i,committed[i]);
    report("Curva de panorama no aplicada: "+err.message);
   }
  };
  $("panAutoPoints"+i).addEventListener("change",apply);
  $("panAutoEnable"+i).addEventListener("change",apply);
 }
 window.panAutomationState=state;
 window.validatePanAutomationRestore=(raw,i)=>A.validate(raw===undefined?A.defaults():raw);
 window.commitPanAutomationRestore=states=>{
  if(!Array.isArray(states)||states.length!==8)throw Error("La sesión requiere ocho panoramas");
  const validated=states.map(A.validate);
  validated.forEach((v,i)=>{committed[i]=set(i,v)});
 };
 window.resetPanAutomation=i=>{committed[i]=set(i,A.defaults())};
})();
