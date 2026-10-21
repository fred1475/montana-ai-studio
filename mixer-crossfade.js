"use strict";
/* Montana Music Production LLC — optional equal-power or linear clip crossfades.
 * Adjacent source-order clips must advance along the timeline and overlap.
 * No destructive processing; live playback, overdub guide, WAV and stems use
 * exactly the same time-domain gain envelopes.
 */
(function(){
 const empty=()=>({enabled:false,curve:"equal-power"});
 function validateState(s,i){
  if(!s||typeof s!=="object"||Array.isArray(s)||
     typeof s.enabled!=="boolean"||!["equal-power","linear"].includes(s.curve))
   throw Error("Crossfade inválido en pista "+(i+1));
  return {enabled:s.enabled,curve:s.curve};
 }
 function state(i){return validateState({enabled:$("crossfadeOn"+i).checked,curve:$("crossfadeCurve"+i).value},i)}
 function prepare(settings,i,segments){
  const s=validateState(settings,i),ramps=segments.map(()=>({fadeIn:null,fadeOut:null}));
  if(!s.enabled||segments.length<2)return {...s,ramps};
  for(let j=0;j<segments.length-1;j++){
   const a=segments[j],b=segments[j+1],aEnd=a.offset+a.duration,bEnd=b.offset+b.duration;
   if(b.offset+1e-6<a.offset||bEnd+1e-6<aEnd)
    throw Error("Para crossfade ordena los fragmentos en el tiempo (sin fragmentos anidados) en pista "+(i+1));
   const length=aEnd-b.offset;
   if(length<=.001)continue;
   if(length>3.001)
    throw Error("La superposición para crossfade no puede superar 3 segundos en pista "+(i+1));
   if(j+2<segments.length&&segments[j+2].offset<aEnd-.001)
    throw Error("El crossfade no admite tres fragmentos simultáneos en pista "+(i+1));
   const ramp={start:b.offset,duration:length};
   ramps[j].fadeOut=ramp;
   ramps[j+1].fadeIn=ramp;
  }
  return {...s,ramps};
 }
 window.prepareCrossfadePlan=(i,segments)=>prepare(state(i),i,segments);
 window.crossfadeSessionState=state;
 window.connectClipCrossfade=(ctx,source,dest,i,clip,when,index,plan)=>{
  if(!plan?.enabled){window.connectFades(ctx,source,dest,i,clip,when);return}
  const ramp=plan.ramps[index];
  if(!ramp)throw Error("Plan de crossfade incorrecto");
  const gain=ctx.createGain();
  gain.gain.setValueAtTime(ramp.fadeIn?0:1,when);
  const apply=(transition,incoming)=>{
   if(!transition)return;
   const localStart=when+transition.start-clip.offset,duration=transition.duration;
   if(localStart<when-1e-5||localStart+duration>when+clip.duration+1e-5)
    throw Error("Crossfade fuera del fragmento");
   const curve=new Float32Array(65);
   for(let k=0;k<curve.length;k++){
    const x=k/(curve.length-1);
    curve[k]=plan.curve==="equal-power"?
     (incoming?Math.sin(x*Math.PI/2):Math.cos(x*Math.PI/2)):(incoming?x:1-x);
   }
   gain.gain.setValueCurveAtTime(curve,Math.max(when,localStart),duration);
  };
  apply(ramp.fadeIn,true);apply(ramp.fadeOut,false);
  window.connectFades(ctx,source,gain,i,clip,when);
  gain.connect(dest);
 };
 window.prepareCrossfadeRestore=records=>records.map((r,i)=>validateState(r.crossfade===undefined?empty():r.crossfade,i));
 window.validateRestoredCrossfades=(loaded,splits,crossfades)=>{
  loaded.forEach((entry,i)=>{
   if(!entry.decoded||!crossfades[i].enabled)return;
   const src=entry.decoded,raw=entry.offset+(i>0?entry.alignMs/1000:0);
   const start=entry.trimStart+Math.max(0,-raw),end=entry.trimEnd===0?src.duration:entry.trimEnd;
   const offset=Math.max(0,raw);
   const seg= {offset,duration:(end-start)*entry.repeat};
   let pieces=[seg];
   if(splits[i].enabled){
    const extra=splits[i].extras||[],cuts=[0,splits[i].at,...extra.map(x=>x.at),end-start],
      offsets=[offset,splits[i].rightOffset,...extra.map(x=>x.offset)];
    pieces=offsets.map((off,j)=>({offset:off,duration:cuts[j+1]-cuts[j]}));
   }
   prepare(crossfades[i],i,pieces);
  });
 };
 window.commitCrossfadeRestore=prepared=>prepared.forEach((s,i)=>{
  $("crossfadeOn"+i).checked=s.enabled;$("crossfadeCurve"+i).value=s.curve;
  $("crossfadeCurve"+i).disabled=!s.enabled;
 });
 window.resetCrossfade=i=>{
  $("crossfadeOn"+i).checked=false;$("crossfadeCurve"+i).value="equal-power";
  $("crossfadeCurve"+i).disabled=true;
 };
 for(let i=0;i<8;i++){
  const details=document.createElement("details");details.id="crossfadeDetails"+i;
  details.innerHTML='<summary>🎚️ Crossfade entre fragmentos (beta)</summary>'+
   '<label><input type="checkbox" id="crossfadeOn'+i+'"> Activar transición automática en cada superposición</label>'+
   '<label for="crossfadeCurve'+i+'">Curva</label><select id="crossfadeCurve'+i+'" disabled>'+
   '<option value="equal-power">Potencia igual (musical)</option><option value="linear">Lineal</option></select>'+
   '<small>Se aplica al solapamiento completo (máximo 3 segundos) entre fragmentos consecutivos. Orden temporal creciente, sin fragmentos anidados ni tres simultáneos. El modo sin activar conserva el sonido actual. No altera el audio original.</small>';
  document.querySelectorAll("article.track")[i].append(details);
  $("crossfadeOn"+i).addEventListener("change",()=>{
   $("crossfadeCurve"+i).disabled=!$("crossfadeOn"+i).checked;
  });
 }
})();
