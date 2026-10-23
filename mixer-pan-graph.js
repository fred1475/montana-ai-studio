/* Montana Music Production LLC — pure pan automation graph geometry.
 * Panorama -100 = left at top, 0 = center, +100 = right at bottom.
 * Edits retain strict 8-point, 0–300 s and 0.01 s separation invariants.
 */
(function(root,factory){
 const api=factory(root.MontanaPanAutomation||
  (typeof require==="function"?require("./mixer-pan-automation.js"):null));
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPanGraph=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(P){
 "use strict";
 if(!P)throw Error("Motor de panorama no disponible");
 const WIDTH=440,HEIGHT=178;
 const margin={left:44,right:16,top:15,bottom:26};
 const plotWidth=WIDTH-margin.left-margin.right;
 const plotHeight=HEIGHT-margin.top-margin.bottom;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),hundredth=x=>Math.round(x*100)/100;
 function horizon(raw,requested){
  const value=P.validate(raw);
  if(![2,10,30,60,120,300].includes(requested))
   throw Error("Zoom de panorama inválido");
  return Math.max(requested,value.points[value.points.length-1].time);
 }
 function xy(time,pan,seconds){
  if(!Number.isFinite(time)||!Number.isFinite(pan)||!Number.isFinite(seconds)||seconds<=0)
   throw Error("Coordenadas de panorama inválidas");
  return {x:margin.left+plotWidth*clamp(time/seconds,0,1),
   y:margin.top+plotHeight*clamp((pan+100)/200,0,1)};
 }
 function fromXY(x,y,seconds){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(seconds)||seconds<=0)
   throw Error("Coordenadas de panorama inválidas");
  return {time:hundredth(clamp((x-margin.left)/plotWidth,0,1)*seconds),
   pan:Math.round(clamp((y-margin.top)/plotHeight,0,1)*200)-100};
 }
 function move(raw,index,time,pan){
  const v=P.validate(raw);
  if(!Number.isInteger(index)||index<0||index>=v.points.length||
     !Number.isFinite(time)||!Number.isFinite(pan))
   throw Error("Punto de panorama inválido");
  const prev=index===0?0:v.points[index-1].time+.01;
  const next=index===v.points.length-1?300:v.points[index+1].time-.01;
  const t=index===0?0:hundredth(clamp(time,prev,next));
  const p=Math.round(clamp(pan,-100,100));
  return P.validate({...v,points:v.points.map((item,j)=>j===index?{time:t,pan:p}:item)});
 }
 function insert(raw,time,pan){
  const v=P.validate(raw);
  if(v.points.length===P.MAX_POINTS)throw Error("Máximo ocho puntos");
  if(!Number.isFinite(time)||!Number.isFinite(pan))throw Error("Punto inválido");
  const t=hundredth(time),p=Math.round(pan);
  if(t<=0||t>300||p< -100||p>100||v.points.some(x=>Math.abs(x.time-t)<.009))
   throw Error("Punto de panorama muy cercano, fuera de rango o repetido");
  return P.validate({...v,points:[...v.points,{time:t,pan:p}].sort((a,b)=>a.time-b.time)});
 }
 function remove(raw,index){
  const v=P.validate(raw);
  if(!Number.isInteger(index)||index<=0||index>=v.points.length)
   throw Error("No se puede borrar el punto inicial de 0 segundos");
  return P.validate({...v,points:v.points.filter((_,i)=>i!==index)});
 }
 return {WIDTH,HEIGHT,margin,xy,fromXY,move,insert,remove,horizon};
});
