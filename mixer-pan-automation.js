/* Montana Music Production LLC — bounded time-domain panorama automation.
 * Absolute stereo pan position in percent: -100 left, 0 center, +100 right.
 * Operates at the StereoPannerNode AudioParam; no source WAV is modified.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPanAutomation=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_POINTS=8,MAX_SECONDS=300,MIN_PAN=-100,MAX_PAN=100;
 const defaults=()=>({enabled:false,points:[{time:0,pan:0}]});
 function validate(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     typeof raw.enabled!=="boolean"||!Array.isArray(raw.points)||
     raw.points.length<1||raw.points.length>MAX_POINTS)
   throw Error("Automatización de panorama inválida");
  let previous=-1;
  const points=raw.points.map((p,i)=>{
   if(!p||typeof p!=="object"||Array.isArray(p)||
      typeof p.time!=="number"||!Number.isFinite(p.time)||p.time<0||
      p.time>MAX_SECONDS||Math.abs(p.time*100-Math.round(p.time*100))>1e-7||
      typeof p.pan!=="number"||!Number.isFinite(p.pan)||p.pan<MIN_PAN||
      p.pan>MAX_PAN||Math.round(p.pan)!==p.pan||
      p.time<=previous||(i===0&&p.time!==0))
    throw Error("Puntos de panorama inválidos: comenzar en 0, tiempos crecientes, -100 a +100");
   previous=p.time;
   return {time:p.time,pan:p.pan};
  });
  return {enabled:raw.enabled,points};
 }
 function parse(source,enabled=false){
  if(typeof source!=="string"||!source.trim()||source.length>200)
   throw Error("Automatización de panorama inválida");
  const chunks=source.split(",");
  if(chunks.length<1||chunks.length>MAX_POINTS)throw Error("Hasta ocho puntos de panorama");
  const points=chunks.map(chunk=>{
   const token=chunk.trim();
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?:-?(?:0|[1-9]\d*)$/.test(token))
    throw Error("Formato de panorama inválido: 0:-100, 1:100, 2:0");
   const [time,pan]=token.split(":").map(Number);
   return {time,pan};
  });
  return validate({enabled,points});
 }
 function format(raw){return validate(raw).points.map(p=>p.time+":"+p.pan).join(", ")}
 function at(raw,time,basePan=0){
  const state=validate(raw);
  if(!Number.isFinite(time)||time<0||!Number.isFinite(basePan)||basePan< -1||basePan>1)
   throw Error("Tiempo o panorama base inválido");
  if(!state.enabled)return basePan;
  const pts=state.points;
  if(time<=0)return pts[0].pan/100;
  for(let i=1;i<pts.length;i++)if(time<=pts[i].time){
   const a=pts[i-1],b=pts[i],fraction=(time-a.time)/(b.time-a.time);
   return (a.pan+(b.pan-a.pan)*fraction)/100;
  }
  return pts[pts.length-1].pan/100;
 }
 function schedule(node,raw,basePan,origin=0){
  const state=validate(raw);
  if(!node||!node.pan||typeof node.pan.setValueAtTime!=="function"||
     typeof node.pan.linearRampToValueAtTime!=="function"||
     typeof basePan!=="number"||!Number.isFinite(basePan)||
     basePan< -1||basePan>1||!Number.isFinite(origin)||origin<0)
   throw Error("Nodo de panorama incompatible");
  node.pan.setValueAtTime(state.enabled?state.points[0].pan/100:basePan,origin);
  if(state.enabled)for(const p of state.points.slice(1))
   node.pan.linearRampToValueAtTime(p.pan/100,origin+p.time);
  return node;
 }
 return {MAX_POINTS,MAX_SECONDS,MIN_PAN,MAX_PAN,defaults,validate,parse,format,at,schedule};
});
