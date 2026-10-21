/* Montana Music Production LLC — non-destructive arrangement envelopes for
 * marker-to-marker auditions. Evaluate fades against the ORIGINAL clip clock,
 * not against the clipped preview's start/end. Crossfades use the same linear
 * or equal-power shape as full-song playback, with bounded curve sampling.
 * Effect pre-roll and the short anti-click preview gate remain approximate.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaSectionEnvelope=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const finite=x=>typeof x==="number"&&Number.isFinite(x);
 const MAX_POINTS=4097;
 function validate(clip,fades,ramp,curve){
  if(!clip||![clip.regionStart,clip.regionDuration,clip.elapsed,clip.duration].every(finite)||
     clip.regionStart<0||clip.regionDuration<=0||clip.elapsed<0||clip.duration<=0||
     clip.elapsed+clip.duration>clip.regionDuration+1e-5||
     !fades||![fades.fadeIn,fades.fadeOut].every(finite)||
     fades.fadeIn<0||fades.fadeIn>5||fades.fadeOut<0||fades.fadeOut>5||
     !["equal-power","linear"].includes(curve))
   throw Error("Envolvente de sección inválida");
  if(ramp!==null&&ramp!==undefined){
   if(typeof ramp!=="object"||Array.isArray(ramp))throw Error("Crossfade de sección inválido");
   for(const transition of [ramp.fadeIn,ramp.fadeOut]){
    if(transition===null||transition===undefined)continue;
    if(!finite(transition.start)||!finite(transition.duration)||
       transition.duration<=0||transition.duration>3.001||
       transition.start<clip.regionStart-1e-5||
       transition.start+transition.duration>clip.regionStart+clip.regionDuration+1e-5)
     throw Error("Transición fuera del fragmento");
   }
  }
 }
 function transitionGain(absolute,transition,incoming,curve){
  if(!transition)return 1;
  const x=Math.max(0,Math.min(1,(absolute-transition.start)/transition.duration));
  return curve==="linear"?(incoming?x:1-x):
   (incoming?Math.sin(x*Math.PI/2):Math.cos(x*Math.PI/2));
 }
 function gainAt(clip,elapsed,fades,ramp,curve="equal-power"){
  validate(clip,fades,ramp,curve);
  if(!finite(elapsed)||elapsed<0||elapsed>clip.regionDuration+1e-5)
   throw Error("Posición de sección inválida");
  return gainAtUnchecked(clip,elapsed,fades,ramp,curve);
 }
 function build(clip,fades,ramp=null,curve="equal-power"){
  validate(clip,fades,ramp,curve);
  // Fast path for unchanged level; avoids scheduling large flat curves.
  if(!fades.fadeIn&&!fades.fadeOut&&!ramp?.fadeIn&&!ramp?.fadeOut)
   return null;
  const count=Math.min(MAX_POINTS,Math.max(65,Math.ceil(clip.duration*400)+1));
  const values=new Float32Array(count);
  for(let i=0;i<count;i++){
   const elapsed=clip.elapsed+clip.duration*i/(count-1);
   values[i]=gainAtUnchecked(clip,elapsed,fades,ramp,curve);
  }
  return values;
 }
 function gainAtUnchecked(clip,elapsed,fades,ramp,curve){
  const factor=fades.fadeIn+fades.fadeOut?
   Math.min(1,clip.regionDuration/(fades.fadeIn+fades.fadeOut)):1;
  const fi=fades.fadeIn*factor,fo=fades.fadeOut*factor;
  let gain=1;
  if(fi&&elapsed<fi)gain=Math.min(gain,elapsed/fi);
  if(fo&&elapsed>clip.regionDuration-fo)
   gain=Math.min(gain,(clip.regionDuration-elapsed)/fo);
  const absolute=clip.regionStart+elapsed;
  return Math.max(0,Math.min(1,gain*
   transitionGain(absolute,ramp?.fadeIn,true,curve)*
   transitionGain(absolute,ramp?.fadeOut,false,curve)));
 }
 function schedule(param,when,clip,fades,ramp=null,curve="equal-power"){
  if(!param||typeof param.setValueCurveAtTime!=="function"||
     typeof param.setValueAtTime!=="function"||!finite(when)||when<0)
   throw Error("Parámetro de preescucha inválido");
  const values=build(clip,fades,ramp,curve);
  if(values)param.setValueCurveAtTime(values,when,clip.duration);
  else param.setValueAtTime(1,when);
  return values;
 }
 return {MAX_POINTS,gainAt,build,schedule};
});
