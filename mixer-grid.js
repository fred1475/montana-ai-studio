"use strict";
/* Montana Music Production LLC — musical time quantization in seconds.
 * Opt-in snap for drag/keyboard edits and clip paste; never time-stretches
 * audio or silently quantizes an existing arrangement on project load.
 */
(function(){
 const divisions=[4,8,16],round=x=>Math.round(x*10000)/10000;
 function validate(on,division,bpm){
  if(typeof on!=="boolean"||!Number.isInteger(division)||!divisions.includes(division)||
     !Number.isFinite(bpm)||bpm<40||bpm>240)
   throw Error("Configuración de cuadrícula inválida");
  return {on,division,bpm,stepSeconds:240/(bpm*division)};
 }
 const options=()=>validate($("gridSnapOn").checked,Number($("gridDivision").value),Number($("bpm").value));
 function snap(v,mode="nearest"){
  if(!Number.isFinite(v)||v<0)throw Error("Posición de clip inválida");
  const data=options();
  if(!data.on)return round(v);
  const count=v/data.stepSeconds;
  const units=mode==="next"?Math.floor(count+1e-8)+1:
   mode==="previous"?Math.ceil(count-1e-8)-1:Math.round(count);
  return round(Math.max(0,Math.min(300,units*data.stepSeconds)));
 }
 window.gridSnapTime=snap;
 window.gridNudge=(v,dir,shift=false)=>{
  if(dir===0)return 0;
  if(!options().on)return round(Math.max(0,v+(dir>0?1:-1)*(shift?1:.1)));
  if(shift){
   const bars=240/options().bpm;
   return round(Math.max(0,Math.min(300,Math.round((v+dir*bars)/options().stepSeconds)*options().stepSeconds)));
  }
  return snap(v,dir>0?"next":"previous");
 };
 window.gridSettings=()=>{const x=options();return {on:x.on,division:x.division}};
 window.validateGridRestore=s=>{
  const on=s.gridSnapOn===undefined?false:s.gridSnapOn,division=s.gridDivision===undefined?16:s.gridDivision;
  return validate(on,division,100);
 };
 window.restoreGrid=s=>{
  $("gridSnapOn").checked=s.on;$("gridDivision").value=String(s.division);
  $("gridDivision").disabled=!s.on;update();
 };
 function update(){
  try{
   const x=options();
   $("gridDivision").disabled=!x.on;
   $("gridStatus").textContent=(x.on?"Snap activado":"Movimiento libre")+
    " · "+x.division+" subdivisiones por compás · "+x.stepSeconds.toFixed(4)+" s por cuadrícula a "+x.bpm+" BPM.";
  }catch(err){$("gridStatus").textContent="Cuadrícula inválida: "+err.message}
 }
 ["gridSnapOn","gridDivision","bpm"].forEach(k=>{
  $(k).addEventListener("input",update);$(k).addEventListener("change",update);
 });
 update();
})();