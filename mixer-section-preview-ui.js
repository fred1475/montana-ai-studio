"use strict";
/* Explicit local preview of an arrangement section. Uses the standard
 * fader/input trim/EQ/compression/space pipeline but approximate boundary
 * ramps, no exact clip crossfades or effect preroll. Full render unchanged.
 */
(function(){
 const $=id=>document.getElementById(id),M=MontanaSongMarkers,S=MontanaSectionPlan;
 const host=$("songMarkersPanel");if(!host)return;
 const title=document.createElement("h4");title.textContent="🎧 Escuchar sección entre marcadores";
 const help=document.createElement("p");
 help.textContent="Preescucha rápida de hasta 30 s: incluye pistas, fader, EQ, compresión y efectos, pero no reproduce exactamente crossfades, fundidos de clip ni colas de efectos anteriores. No exporta ni modifica el WAV.";
 const from=document.createElement("select");from.id="sectionFrom";from.setAttribute("aria-label","Marcador inicial");
 const to=document.createElement("select");to.id="sectionTo";to.setAttribute("aria-label","Marcador final");
 const listen=document.createElement("button");listen.id="sectionListen";listen.type="button";listen.textContent="▶ Escuchar sección";
 const halt=document.createElement("button");halt.id="sectionHalt";halt.type="button";halt.textContent="■ Detener sección";
 const status=document.createElement("p");status.id="sectionStatus";status.setAttribute("role","status");
 halt.disabled=true;listen.disabled=true;
 host.append(title,help,from,to,listen,halt,status);
 let playing=null,nonce=0;
 function haltPreview(){
  nonce++;
  if(playing){
   for(const src of playing.sources){try{src.stop()}catch(_){}try{src.disconnect()}catch(_){}}
   if(playing.master){try{playing.master.disconnect()}catch(_){}}
   playing=null;
  }
  halt.disabled=true;
 }
 function refresh(){
  const list=window.montanaMarkerState();
  const wasFrom=from.value,wasTo=to.value;
  from.replaceChildren();to.replaceChildren();
  list.forEach((m,i)=>{
   for(const sel of [from,to]){
    const option=document.createElement("option");
    option.value=String(i);option.textContent=M.clock(m.seconds)+" — "+m.label;
    sel.append(option);
   }
  });
  if(list.length>=2){
   from.value=wasFrom!==""&&+wasFrom<list.length?wasFrom:"0";
   to.value=wasTo!==""&&+wasTo<list.length?wasTo:String(list.length-1);
  }
  listen.disabled=list.length<2;
  if(!playing)halt.disabled=true;
  status.textContent=list.length<2?"Crea dos marcadores para escuchar una sección.":
   "Elige inicio y fin ascendentes (máximo 30 s). No modifica archivos.";
 }
 window.refreshSectionPreview=refresh;
 function scheduleAutomation(param,model,base,start,end,at,kind){
  const active=model.enabled;
  let initial=base;
  if(active)initial=kind==="pan"?MontanaPanAutomation.at(model,start,base):
   MontanaVolumeAutomation.at(model,start);
  param.setValueAtTime(initial,at);
  if(active)for(const point of model.points){
   if(point.time<=start||point.time>end)continue;
   const value=kind==="pan"?point.pan/100:point.gain/100;
   param.linearRampToValueAtTime(value,at+point.time-start);
  }
 }
 listen.addEventListener("click",async()=>{
  const id=++nonce;
  try{
   const markers=window.montanaMarkerState(),a=markers[Number(from.value)],b=markers[Number(to.value)];
   if(!a||!b)throw Error("Elige inicio y fin válidos");
   const selected=S.range(a.seconds,b.seconds);
   if(!tracks.some(Boolean))throw Error("Importa una pista antes de escuchar");
   const regions=tracks.map((buffer,i)=>buffer?window.getTrackSegments(i,buffer):[]);
   // Validate every source before touching the playback already running.
   const plan=S.plan(selected.start,selected.end,regions);
   const buffers=tracks.map((buffer,i)=>buffer?window.getMixBuffer(i):null);
   if(!plan.regions)throw Error("No hay fragmentos audibles en esta sección");
   stop();haltPreview();
   const token=nonce;
   const ac=audio();await ac.resume();
   if(token!==nonce)return;
   const at=ac.currentTime+.06,master=ac.createGain(),sources=[];
   const built={master,sources};
   playing=built;halt.disabled=false;
   master.gain.setValueAtTime(0,at);
   master.gain.linearRampToValueAtTime(Number($("masterGain").value)/100,at+.008);
   master.gain.setValueAtTime(Number($("masterGain").value)/100,at+selected.duration-.008);
   master.gain.linearRampToValueAtTime(0,at+selected.duration);
   master.connect(ac.destination);
   try{
    for(let i=0;i<8;i++){
     if(!plan.tracks[i].length)continue;
     const vol=ac.createGain(),automation=ac.createGain(),eqIn=ac.createGain(),stereo=ac.createStereoPanner();
     vol.gain.value=gain(i);
     vol.connect(automation).connect(eqIn);
     const vm=window.volumeAutomationState(i),pm=window.panAutomationState(i);
     scheduleAutomation(automation.gain,vm,1,selected.start,selected.end,at,"volume");
     scheduleAutomation(stereo.pan,pm,pan(i),selected.start,selected.end,at,"pan");
     addSpace(ac,addCompressor(ac,addEq(ac,eqIn,i),i),i).connect(stereo).connect(master);
     const pre=MontanaInputTrim.attach(ac,vol,Number($("inputTrim"+i).value));
     for(const clip of plan.tracks[i]){
      const src=ac.createBufferSource(),gate=ac.createGain();
      src.buffer=buffers[i];src.loop=clip.loop;
      if(src.loop){src.loopStart=clip.loopStart;src.loopEnd=clip.loopEnd;}
      const when=at+clip.when,fade=Math.min(.005,clip.duration/4);
      gate.gain.setValueAtTime(0,when);
      gate.gain.linearRampToValueAtTime(1,when+fade);
      gate.gain.setValueAtTime(1,when+clip.duration-fade);
      gate.gain.linearRampToValueAtTime(0,when+clip.duration);
      src.connect(gate).connect(pre);
      sources.push(src);
      src.onended=()=>{try{src.disconnect();gate.disconnect()}catch(_){ }};
      src.start(when,clip.sourceOffset,clip.duration);
     }
    }
   }catch(e){haltPreview();throw e;}
   status.textContent="Reproduciendo "+M.clock(selected.start)+" a "+M.clock(selected.end)+
    " — "+plan.regions+" fragmento(s). Escucha de referencia, no mezcla master.";
   // A UI timeout stops residual effect tails and avoids leaving an output
   // connected after this exact bounded preview.
   setTimeout(()=>{
    if(nonce!==token||playing!==built)return;
    haltPreview();
    status.textContent="Preescucha terminada. Los WAV originales siguen intactos.";
   },Math.ceil((selected.duration+.13)*1000));
  }catch(e){
   if(id===nonce||!playing)status.textContent="No se inició la sección: "+e.message;
   halt.disabled=false;
   if(!playing)halt.disabled=true;
  }
 });
 halt.addEventListener("click",()=>{
  haltPreview();status.textContent="Sección detenida; ninguna grabación modificada.";
 });
 refresh();
})();
