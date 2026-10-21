/* Montana Music Production LLC — geometry and safe edits for graphic volume automation.
 * Pure source functions: graph editing cannot modify source audio or mutate a
 * caller's automation object. All edits use the same validation as text input.
 */
(function(root,factory){
 const api=factory(root.MontanaVolumeAutomation||
   (typeof require==="function"?require("./mixer-volume-automation.js"):null));
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVolumeGraph=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(M){
 "use strict";
 if(!M)throw Error("Motor de automatización no disponible");
 const WIDTH=440,HEIGHT=178;
 const margin={left:36,right:16,top:15,bottom:26};
 const plotWidth=WIDTH-margin.left-margin.right;
 const plotHeight=HEIGHT-margin.top-margin.bottom;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const hundredth=n=>Math.round(n*100)/100;
 function horizon(raw,requested){
  const state=M.validate(raw);
  if(![2,10,30,60,120,300].includes(requested))throw Error("Zoom de tiempo inválido");
  return Math.max(requested,state.points[state.points.length-1].time);
 }
 function xy(time,gain,maxTime){
  if(!Number.isFinite(time)||!Number.isFinite(gain)||
     !Number.isFinite(maxTime)||maxTime<=0)throw Error("Coordenadas inválidas");
  return {x:margin.left+plotWidth*clamp(time/maxTime,0,1),
   y:margin.top+plotHeight*(1-clamp(gain/150,0,1))};
 }
 function fromXY(x,y,maxTime){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(maxTime)||maxTime<=0)
   throw Error("Coordenadas inválidas");
  return {time:hundredth(clamp((x-margin.left)/plotWidth,0,1)*maxTime),
   gain:Math.round(clamp(1-(y-margin.top)/plotHeight,0,1)*150)};
 }
 function move(raw,index,time,gain){
  const state=M.validate(raw);
  if(!Number.isInteger(index)||index<0||index>=state.points.length)
   throw Error("Punto inválido");
  if(!Number.isFinite(time)||!Number.isFinite(gain))throw Error("Valores inválidos");
  const prev=index===0?0:state.points[index-1].time+.01;
  const next=index===state.points.length-1?300:state.points[index+1].time-.01;
  const newTime=index===0?0:hundredth(clamp(time,prev,next));
  const newGain=Math.round(clamp(gain,0,150));
  return M.validate({...state,points:state.points.map((p,i)=>
   i===index?{time:newTime,gain:newGain}:p)});
 }
 function insert(raw,time,gain){
  const state=M.validate(raw);
  if(state.points.length>=M.MAX_POINTS)throw Error("Máximo ocho puntos");
  if(!Number.isFinite(time)||!Number.isFinite(gain))throw Error("Punto inválido");
  const t=hundredth(time),g=Math.round(gain);
  if(t<=0||t>300||g<0||g>150||state.points.some(p=>Math.abs(p.time-t)<.009))
   throw Error("Punto demasiado cercano, fuera de rango o repetido");
  const points=[...state.points,{time:t,gain:g}].sort((a,b)=>a.time-b.time);
  return M.validate({...state,points});
 }
 function remove(raw,index){
  const state=M.validate(raw);
  if(!Number.isInteger(index)||index<=0||index>=state.points.length)
   throw Error("No se puede borrar el primer punto de 0 segundos");
  return M.validate({...state,points:state.points.filter((_,i)=>i!==index)});
 }
 return {WIDTH,HEIGHT,margin,xy,fromXY,move,insert,remove,horizon};
});
