"use strict";
/* Volume-automation controls, separate from DSP for safe session loading. */
(function(){
 const $=id=>document.getElementById(id);
 const M=MontanaVolumeAutomation;
 function state(i){
  if(!Number.isInteger(i)||i<0||i>=8)throw Error("Canal de automatización inválido");
  return M.parse($("autoPoints"+i).value,$("autoEnable"+i).checked);
 }
 function set(i,value){
  if(!Number.isInteger(i)||i<0||i>=8)throw Error("Canal inválido");
  const v=M.validate(value);
  $("autoEnable"+i).checked=v.enabled;
  $("autoPoints"+i).value=M.format(v);
  $("autoPreview"+i).textContent=v.enabled?
    "Activa · "+v.points.length+" punto(s) · valores interpolados en la línea de tiempo":
    "Desactivada: ganancia uniforme 100 % durante toda la canción";
  window.refreshVolumeAutomationGraph?.(i);
  return v;
 }
 for(let i=0;i<8;i++){
  const checkbox=$("autoEnable"+i),points=$("autoPoints"+i);
  // Failed edits are rolled back before history listeners capture an edit.
  let committed=set(i,M.defaults());
  const apply=()=>{
   try{
    const next=state(i);
    committed=set(i,next);
    report("Automatización del canal "+(i+1)+(next.enabled?" activada":" desactivada")+
     ". Reinicia la reproducción para escuchar cambios.");
   }catch(e){set(i,committed);report("Automatización no aplicada: "+e.message);}
  };
  checkbox.addEventListener("change",apply);
  points.addEventListener("change",apply);
 }
 window.volumeAutomationState=state;
 window.validateVolumeAutomationRestore=(raw,i)=>
  M.validate(raw===undefined?M.defaults():raw);
 window.commitVolumeAutomationRestore=(states)=>{
  if(!Array.isArray(states)||states.length!==8)throw Error("Sesión sin ocho automatizaciones");
  const clean=states.map(M.validate);
  clean.forEach((v,i)=>set(i,v));
 };
 window.resetVolumeAutomation=i=>{
  const value=set(i,M.defaults());
  return value;
 };
})();
