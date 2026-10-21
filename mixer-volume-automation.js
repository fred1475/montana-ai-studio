/* Montana Music Production LLC — non-destructive linear volume automation.
 * Time is global song timeline seconds; gain percentages are post-fader,
 * pre-EQ/compressor, sampled continuously via Web Audio AudioParam ramps.
 * This is fixed, linear amplitude automation; not a volume-rider AI.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVolumeAutomation=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_POINTS=8,MAX_SECONDS=300,MAX_GAIN=150;
 const defaults=()=>({enabled:false,points:[{time:0,gain:100}]});
 function validate(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     typeof value.enabled!=="boolean"||!Array.isArray(value.points)||
     value.points.length<1||value.points.length>MAX_POINTS)
    throw Error("Automatización inválida: hasta ocho puntos");
  let previous=-1;
  const points=value.points.map((p,i)=>{
   if(!p||typeof p!=="object"||Array.isArray(p)||
      typeof p.time!=="number"||!Number.isFinite(p.time)||p.time<0||p.time>MAX_SECONDS||
      Math.abs(p.time*100-Math.round(p.time*100))>1e-7||
      typeof p.gain!=="number"||!Number.isFinite(p.gain)||p.gain<0||p.gain>MAX_GAIN||
      Math.round(p.gain)!==p.gain||p.time<=previous||(i===0&&p.time!==0))
    throw Error("Puntos inválidos: empezar en 0 s, tiempos crecientes (0–300) y nivel entero (0–150)");
   previous=p.time;return {time:p.time,gain:p.gain};
  });
  return {enabled:value.enabled,points};
 }
 function parse(text,enabled=false){
  if(typeof text!=="string"||text.length>180||!text.trim())
   throw Error("Escribe los puntos de automatización");
  const tokens=text.split(",");
  if(tokens.length<1||tokens.length>MAX_POINTS)throw Error("Usa de 1 a 8 puntos");
  const points=tokens.map(token=>{
   const cleaned=token.trim();
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?:(?:0|[1-9]\d*)$/.test(cleaned))
    throw Error("Formato inválido: 0:100, 10:60, 20:100");
   const [time,gain]=cleaned.split(":").map(Number);
   return {time,gain};
  });
  return validate({enabled,points});
 }
 function format(raw){
  return validate(raw).points.map(p=>p.time+":"+p.gain).join(", ");
 }
 function at(raw,time){
  const state=validate(raw);
  if(!Number.isFinite(time)||time<0)throw Error("Tiempo de automatización inválido");
  if(!state.enabled)return 1;
  const p=state.points;
  if(time<=p[0].time)return p[0].gain/100;
  for(let i=1;i<p.length;i++){
   if(time<=p[i].time){
    const factor=(time-p[i-1].time)/(p[i].time-p[i-1].time);
    return (p[i-1].gain+(p[i].gain-p[i-1].gain)*factor)/100;
   }
  }
  return p[p.length-1].gain/100;
 }
 function attach(ctx,output,raw,origin=0){
  const state=validate(raw);
  if(!ctx||typeof ctx.createGain!=="function"||!output||typeof output.connect!=="function"||
     !Number.isFinite(origin)||origin<0)
   throw Error("Cadena de automatización inválida");
  const node=ctx.createGain(),parameter=node.gain;
  if(!parameter||typeof parameter.setValueAtTime!=="function"||
     typeof parameter.linearRampToValueAtTime!=="function")
   throw Error("El navegador no admite automatización de volumen");
  parameter.setValueAtTime(state.enabled?state.points[0].gain/100:1,origin);
  if(state.enabled)for(let i=1;i<state.points.length;i++){
   const p=state.points[i];
   parameter.linearRampToValueAtTime(p.gain/100,origin+p.time);
  }
  node.connect(output);
  return node;
 }
 return {MAX_POINTS,MAX_SECONDS,MAX_GAIN,defaults,validate,parse,format,at,attach};
});
