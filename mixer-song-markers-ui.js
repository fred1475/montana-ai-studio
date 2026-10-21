"use strict";
/* User-managed timeline labels; no PCM modification or automatic playback. */
(function(){
 const M=MontanaSongMarkers,$=id=>document.getElementById(id);
 const panel=$("songMarkersPanel");if(!panel)return;
 const heading=document.createElement("h3");heading.textContent="📍 Marcadores de canción";
 const help=document.createElement("p");
 help.textContent="Etiqueta intro, verso o coro. Los marcadores no cambian el audio. Puedes colocar el inicio de una pista en uno pulsando el botón explícitamente.";
 const name=document.createElement("input");name.id="markerName";name.maxLength=35;
 name.placeholder="Ej.: Coro 1";name.setAttribute("aria-label","Nombre del marcador");
 const time=document.createElement("input");time.id="markerSeconds";time.type="number";
 time.min="0";time.max="300";time.step=".001";time.value="0";
 time.setAttribute("aria-label","Segundo del marcador");
 const add=document.createElement("button");add.id="markerAdd";add.type="button";add.textContent="+ Añadir marcador";
 const picked=document.createElement("select");picked.id="markerPicked";
 picked.setAttribute("aria-label","Elegir marcador existente");
 const track=document.createElement("select");track.id="markerTargetTrack";
 track.setAttribute("aria-label","Pista donde situar el inicio");
 for(let i=0;i<8;i++){
  const opt=document.createElement("option");opt.value=String(i);
  opt.textContent=(i+1)+". "+(window.montanaDefaultTrackLabels?.[i]||"Pista");
  track.append(opt);
 }
 const place=document.createElement("button");place.id="markerPlace";place.type="button";
 place.textContent="Situar pista en marcador";
 const remove=document.createElement("button");remove.id="markerRemove";remove.type="button";
 remove.textContent="Eliminar marcador";
 const status=document.createElement("p");status.id="markerStatus";status.setAttribute("role","status");
 status.textContent="Sin marcadores.";
 const listing=document.createElement("ol");listing.id="markerList";
 panel.append(heading,help,name,time,add,picked,track,place,remove,status,listing);
 let markers=[];
 const index=()=>Number(picked.value);
 const draw=()=>{
  const previous=picked.value;
  picked.replaceChildren();listing.replaceChildren();
  for(let i=0;i<markers.length;i++){
   const marker=markers[i];
   const opt=document.createElement("option");opt.value=String(i);
   opt.textContent=M.clock(marker.seconds)+" — "+marker.label;
   picked.append(opt);
   const li=document.createElement("li");
   li.textContent=M.clock(marker.seconds)+" — "+marker.label;
   listing.append(li);
  }
  if(markers.length&&previous!==""&&Number(previous)<markers.length)picked.value=previous;
  remove.disabled=place.disabled=markers.length===0;
  add.disabled=markers.length>=M.MAX;
  status.textContent=markers.length+" marcador(es) guardado(s) en la sesión local (máximo "+M.MAX+").";
  window.montanaTimelineRedraw?.();
  window.refreshSectionPreview?.();
 };
 window.montanaMarkerState=()=>M.validate(markers);
 window.prepareMarkerRestore=raw=>M.validate(raw===undefined?[]:raw);
 window.commitMarkerRestore=prepared=>{
  markers=M.validate(prepared);draw();
 };
 window.renderSongMarkerRuler=end=>{
  if(!markers.length)return null;
  const row=document.createElement("div");
  row.style.cssText="display:grid;grid-template-columns:minmax(90px,120px) minmax(0,1fr);align-items:center;gap:8px;min-height:36px";
  const title=document.createElement("span");title.textContent="Marcadores";title.style.fontSize="12px";
  const background=document.createElement("div");
  background.style.cssText="height:34px;position:relative;border-bottom:1px solid #9b874f";
  for(const marker of markers){
   const position=document.createElement("span");
   position.style.cssText="position:absolute;top:0;bottom:0;border-left:2px solid #efc36e;font-size:10px;white-space:nowrap";
   position.style.left=(100*marker.seconds/end)+"%";
   position.title=marker.label+" — "+M.clock(marker.seconds);
   position.textContent=" "+marker.label;
   position.setAttribute("aria-label",position.title);
   background.append(position);
  }
  row.append(title,background);return row;
 };
 add.addEventListener("click",()=>{
  try{
   const seconds=Number(time.value);
   if(!time.value.trim())throw Error("Introduce segundos válidos");
   const candidate=M.append(markers,name.value,seconds);
   markers=candidate;draw();
   const found=markers.findIndex(m=>m.label===name.value&&m.seconds===seconds);
   picked.value=String(found);
   report("Marcador añadido: "+M.clock(seconds)+" "+name.value);
  }catch(e){report("No se añadió marcador: "+e.message);}
 });
 remove.addEventListener("click",()=>{
  try{
   markers=M.remove(markers,index());draw();
   report("Marcador eliminado sin modificar el audio original.");
  }catch(e){report("No se eliminó marcador: "+e.message);}
 });
 place.addEventListener("click",()=>{
  try{
   const indexTrack=Number(track.value),marker=markers[index()];
   if(!marker||!Number.isInteger(indexTrack)||indexTrack<0||indexTrack>7)
    throw Error("Selecciona un marcador y una pista");
   if(!tracks[indexTrack])throw Error("Carga audio en la pista antes de posicionarla");
   const adjust=indexTrack>0?Number($("alignMs"+indexTrack).value)/1000:0;
   const base=marker.seconds-adjust;
   if(!Number.isFinite(base)||base<0||base>300)
    throw Error("El marcador no admite el desplazamiento de sincronización actual");
   const field=$("offset"+indexTrack);
   // Changes track positioning only on button action and uses the existing
   // change pipeline for non-destructive timeline history and auto recovery.
   field.value=String(Math.round(base*1000)/1000);
   field.dispatchEvent(new Event("change",{bubbles:true}));
   report("Pista "+(indexTrack+1)+" situada en "+M.clock(marker.seconds)+
    ". Inicio actualizado; WAV original intacto.");
  }catch(e){report("No se movió la pista: "+e.message);}
 });
 draw();
})();
