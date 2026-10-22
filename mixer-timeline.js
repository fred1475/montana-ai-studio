"use strict";
(function(){
 const root=document.getElementById("timeline");if(!root)return;
 const colors=["#dfb85e","#64b5e8","#7ed1c0","#c3a0f4","#f2a2ae","#88c46a","#e0a66c","#9ea8ed"];
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const round=v=>window.gridSettings?.().on?Math.round(v*10000)/10000:Math.round(v*100)/100;
 // Visual-only zoom. The source offsets, BPM grid, render/export clocks and
 // signed session schema never depend on this viewport setting.
 const zoomLevels=[1,2,4,8];let zoomIndex=0;
 root.setAttribute("role","region");root.style.overflowX="auto";
 root.style.maxWidth="100%";root.setAttribute("aria-label","Editor temporal de ocho pistas con desplazamiento horizontal");
 const controls=document.createElement("div");
 controls.style.cssText="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0";
 const minus=document.createElement("button"),plus=document.createElement("button"),reset=document.createElement("button"),status=document.createElement("output");
 minus.type=plus.type=reset.type="button";
 minus.id="timelineZoomOut";plus.id="timelineZoomIn";reset.id="timelineZoomFit";status.id="timelineZoomStatus";
 minus.textContent="− Alejar";plus.textContent="+ Acercar";reset.textContent="Ajustar vista";
 status.setAttribute("aria-live","polite");
 controls.append(minus,plus,reset,status);root.before(controls);
 // Clip-level controls operate on an explicit source ID, not on the sorted
 // visual position. Keeping edits in the existing fields preserves backups,
 // undo/redo, preview, WAV export and stems without changing the schema.
 const clipControls=document.createElement("div");
 clipControls.style.cssText="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0";
 const selectedStatus=document.createElement("output");selectedStatus.id="timelineSelectedStatus";
 selectedStatus.setAttribute("aria-live","polite");
 const selectedLabel=document.createElement("label");selectedLabel.textContent="Inicio exacto (s) ";
 const selectedStart=document.createElement("input");selectedStart.id="timelineSelectedStart";
 selectedStart.type="number";selectedStart.min="0";selectedStart.max="300";selectedStart.step="0.0001";
 selectedStart.style.width="95px";selectedLabel.append(selectedStart);
 const applyStart=document.createElement("button");applyStart.type="button";applyStart.id="timelineApplyStart";applyStart.textContent="Aplicar inicio";
 const duplicate=document.createElement("button");duplicate.type="button";duplicate.id="timelineDuplicate";duplicate.textContent="Duplicar clip";
 const remove=document.createElement("button");remove.type="button";remove.id="timelineRemoveCopy";remove.textContent="Quitar copia";
 const rippleLabel=document.createElement("label");rippleLabel.textContent="Mover desde clip (s) ";
 const rippleAmount=document.createElement("input");rippleAmount.id="timelineRippleAmount";
 rippleAmount.type="number";rippleAmount.step="0.0001";rippleAmount.min="-300";rippleAmount.max="300";
 rippleAmount.value="1";rippleAmount.style.width="95px";rippleLabel.append(rippleAmount);
 const ripple=document.createElement("button");ripple.type="button";ripple.id="timelineRippleMove";ripple.textContent="Mover grupo";
 clipControls.append(selectedStatus,selectedLabel,applyStart,duplicate,remove,rippleLabel,ripple);root.before(clipControls);
 let selected=null;
 function selectedClip(){
  if(!selected||!tracks[selected.track])return null;
  try{return window.getTrackSegments(selected.track,tracks[selected.track]).find(p=>p.editField===selected.field)||null}
  catch(e){return null}
 }
 function highlight(){
  root.querySelectorAll("[data-edit-field]").forEach(node=>{
   node.style.outline=selected&&node.dataset.track===String(selected.track)&&node.dataset.editField===selected.field?
    "3px solid #fff":"1px solid #141c2b";
  });
 }
 function refreshSelection(){
  const clip=selectedClip();
  if(!clip)selected=null;
  selectedStatus.textContent=clip?"Pista "+(selected.track+1)+" · "+(clip.copied?"copia":"original")+
   " · "+clip.duration.toFixed(2)+" s":"Selecciona un fragmento en la línea de tiempo";
  if(clip&&document.activeElement!==selectedStart)selectedStart.value=String(round(clip.offset));
  if(!clip)selectedStart.value="";
  selectedStart.disabled=applyStart.disabled=!clip;
  duplicate.disabled=!clip||Number($("copyCount"+selected.track).value)>=4;
  remove.disabled=!clip||!clip.copied;
  rippleAmount.disabled=ripple.disabled=!clip;
  highlight();
 }
 function selectClip(i,field){selected={track:i,field};refreshSelection()}
 function registerClip(node,i,field){
  node.dataset.editField=field;
  node.addEventListener("pointerdown",()=>selectClip(i,field));
  node.addEventListener("focus",()=>selectClip(i,field));
  node.addEventListener("keydown",event=>{
   selectClip(i,field);
   if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==="d"){
    event.preventDefault();event.stopPropagation();duplicateCurrent();
   }else if(event.key==="Delete"&&selectedClip()?.copied){
    event.preventDefault();event.stopPropagation();removeCurrent();
   }
  });
  node.addEventListener("click",()=>selectClip(i,field));
  node.setAttribute("aria-keyshortcuts","Control+D Meta+D Delete");
 }
 applyStart.addEventListener("click",()=>{
  if(!selectedClip())return;
  const desired=Number(selectedStart.value);
  if(!selectedStart.value.trim()||!Number.isFinite(desired)||desired<0||desired>300){
   report("Inicio inválido: usa entre 0 y 300 segundos");return;
  }
  const {track,field}=selected;
  const shift=field==="offset"+track&&track>0?Number($("alignMs"+track).value)/1000:0;
  const base=round(desired-shift);
  if(base<0||base>300){report("La alineación del canal impide ese inicio exacto");return}
  const el=$(field),before=el.value;
  el.value=String(base);
  try{window.getTrackSegments(track,tracks[track]);}
  catch(e){el.value=before;report("No se pudo mover el clip: "+e.message);return}
  if(before!==el.value)el.dispatchEvent(new Event("change",{bubbles:true}));
  refreshSelection();
 });
 selectedStart.addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();applyStart.click()}
 });
 function duplicateCurrent(){
  if(!selectedClip())return;
  try{
   const {track,field}=selected,next=window.montanaTimelineClipActions.duplicate(track,field);
   selected={track,field:next};refreshSelection();
   report("Pista "+(track+1)+": clip duplicado sin alterar la fuente original.");
  }catch(e){report("No se pudo duplicar: "+e.message)}
 }
 function removeCurrent(){
  if(!selectedClip()||!selectedClip().copied)return;
  try{
   const {track,field}=selected;selected=null;
   window.montanaTimelineClipActions.removeCopy(track,field);
   refreshSelection();report("Copia de pista "+(track+1)+" retirada; el original permanece.");
  }catch(e){report("No se pudo quitar la copia: "+e.message);refreshSelection()}
 }
 duplicate.addEventListener("click",duplicateCurrent);
 remove.addEventListener("click",removeCurrent);
 // Ripple changes existing non-destructive offsets only. Validate the whole
 // prospective arrangement before any history capture or UI event: either all
 // selected-and-later clips move together, or none of them move.
 ripple.addEventListener("click",()=>{
  if(!selectedClip())return;
  const delta=Number(rippleAmount.value);
  if(!rippleAmount.value.trim()||!Number.isFinite(delta)||delta<-300||delta>300){
   report("Desplazamiento inválido: usa entre −300 y 300 segundos");return;
  }
  if(delta===0)return;
  const {track,field}=selected,segments=window.getTrackSegments(track,tracks[track]);
  const selectedIndex=segments.findIndex(s=>s.editField===field);
  if(selectedIndex<0)return;
  const affected=segments.slice(selectedIndex),previous=[];
  try{
   for(const clip of affected){
    const id=clip.editField,input=$(id);
    const shift=id==="offset"+track&&track>0?Number($("alignMs"+track).value)/1000:0;
    const next=round(clip.offset+delta-shift);
    if(!Number.isFinite(next)||next<0||next>300)throw Error("Un clip saldría del límite de 0–300 s");
    previous.push({input,value:input.value,next});
   }
   previous.forEach(item=>{item.input.value=String(item.next)});
   const nextSegments=window.getTrackSegments(track,tracks[track]);
   window.prepareCrossfadePlan(track,nextSegments);
  }catch(e){
   previous.forEach(item=>{item.input.value=item.value});
   report("No se movió ningún clip: "+e.message);
   return;
  }
  window.captureTimelineHistory?.();
  redraw();report("Pista "+(track+1)+": "+affected.length+" fragmentos movidos "+delta+" s. Deshacer revierte el grupo.");
 });
 function setZoom(index){
  zoomIndex=clamp(index,0,zoomLevels.length-1);
  minus.disabled=zoomIndex===0;plus.disabled=zoomIndex===zoomLevels.length-1;
  status.textContent="Zoom ×"+zoomLevels[zoomIndex]+" · desplázate horizontalmente para ver más";
  redraw();
 }
 minus.addEventListener("click",()=>setZoom(zoomIndex-1));
 plus.addEventListener("click",()=>setZoom(zoomIndex+1));
 reset.addEventListener("click",()=>setZoom(0));
 window.montanaTimelineZoomState=()=>({factor:zoomLevels[zoomIndex],index:zoomIndex});
 function redraw(){
  const end=Math.max(10,...(window.montanaMarkerState?.()||[]).map(m=>m.seconds),...tracks.map((b,i)=>{
   if(!b)return 0;try{return Math.max(0,...window.getTrackSegments(i,b).map(t=>t.offset+t.duration+Math.max(2,t.duration*.1)))}catch(e){return 0}
  }));
  root.replaceChildren();
  const minWidth=Math.max(500,root.clientWidth||800)*zoomLevels[zoomIndex];
  tracks.forEach((b,i)=>{
   const lane=document.createElement("div");
   lane.style.cssText="display:grid;grid-template-columns:minmax(90px,120px) minmax(0,1fr);align-items:center;gap:8px;min-height:36px";
   lane.style.minWidth=minWidth+"px";
   const title=document.createElement("span");title.textContent=(i+1)+". "+labels[i];title.style.fontSize="12px";
   const bg=document.createElement("div");bg.style.cssText="height:32px;position:relative;border:1px solid #46516a;border-radius:5px;background:repeating-linear-gradient(90deg,#202c40 0px,#202c40 1px,#172132 1px,#172132 10%)";
   if(b){try{
     if(window.trackHasMultipleClips?.(i)){
      const segments=window.getTrackSegments(i,b);
      segments.forEach((part,j)=>{
       const block=document.createElement("div");
       block.dataset.track=String(i);block.dataset.part=String(j+1);
       block.style.cssText="position:absolute;top:4px;bottom:4px;border-radius:4px;min-width:8px;outline:1px solid #141c2b;cursor:grab;touch-action:none";
       block.style.background=colors[i];block.style.opacity=j===0?"0.9":"0.7";
       block.style.width=(100*part.duration/end)+"%";
       let current=round(part.offset),drag=null,keysMoved=false;
       const fieldId=part.editField||(j===0?"offset"+i:j===1?"splitOffset"+i:"splitOffset"+j+"_"+i);
       registerClip(block,i,fieldId);
       const description=()=>{
        const s="Pista "+(i+1)+", fragmento "+(j+1)+", inicio "+current.toFixed(2)+" s, duración "+part.duration.toFixed(2)+" s";
        block.title=s;block.setAttribute("aria-label",s);
        block.setAttribute("aria-valuenow",String(current));block.setAttribute("aria-valuetext",s);
       };
       const position=(value,edit=false)=>{
        current=round(clamp(edit?window.gridSnapTime(value):value,0,300));
        block.style.left=(100*current/end)+"%";description();
       };
       const commit=()=>{
        const field=$(fieldId),shift=fieldId==="offset"+i&&i>0?Number($("alignMs"+i).value)/1000:0;
        const next=round(Math.max(0,current-shift));
        if(Number(field.value)===next)return;
        field.value=next;field.dispatchEvent(new Event("change",{bubbles:true}));
       };
       block.tabIndex=0;block.setAttribute("role","slider");
       block.setAttribute("aria-valuemin","0");block.setAttribute("aria-valuemax","300");
       position(part.offset);
       block.addEventListener("pointerdown",event=>{
        if(event.button!==0||drag)return;
        event.preventDefault();block.focus();
        drag={id:event.pointerId,x:event.clientX,start:current};
        block.style.cursor="grabbing";
        const onMove=e=>{
         if(!drag||e.pointerId!==drag.id)return;
         const width=bg.getBoundingClientRect().width;
         if(width>0)position(drag.start+(e.clientX-drag.x)*end/width,true);
        };
        const cleanup=()=>{
         window.removeEventListener("pointermove",onMove);
         window.removeEventListener("pointerup",onUp);
         window.removeEventListener("pointercancel",onCancel);
         drag=null;block.style.cursor="grab";
        };
        const onUp=e=>{if(drag&&e.pointerId===drag.id){cleanup();commit()}};
        const onCancel=e=>{if(drag&&e.pointerId===drag.id){cleanup();position(part.offset)}};
        window.addEventListener("pointermove",onMove);
        window.addEventListener("pointerup",onUp);
        window.addEventListener("pointercancel",onCancel);
       });
       block.addEventListener("keydown",event=>{
        if(!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;
        event.preventDefault();
        const step=event.shiftKey?1:0.1;
        position(event.key==="Home"?0:(window.gridSettings().on?window.gridNudge(current,event.key==="ArrowRight"?1:-1,event.shiftKey):current+(event.key==="ArrowRight"?step:-step)));
        const shift=fieldId==="offset"+i&&i>0?Number($("alignMs"+i).value)/1000:0;
        $(fieldId).value=round(Math.max(0,current-shift));keysMoved=true;
       });
       block.addEventListener("keyup",event=>{
        if(keysMoved&&["ArrowLeft","ArrowRight","Home"].includes(event.key)){
         keysMoved=false;window.captureTimelineHistory?.();
        }
       });
       bg.append(block);
      });
     }else{
     const t=region(i,b),clip=document.createElement("div"),limit=Math.min(300,Math.max(0,end-t.duration));
     let current=t.offset,drag=null,keysMoved=false;
     const label=()=>{const s="Pista "+(i+1)+", inicio "+current.toFixed(2)+" segundos, duración "+t.duration.toFixed(2)+" segundos";clip.title=s;clip.setAttribute("aria-label",s);clip.setAttribute("aria-valuenow",current.toFixed(2));clip.setAttribute("aria-valuetext",s)};
     const setPosition=(value,edit=false)=>{
       current=round(clamp(edit?window.gridSnapTime(value):value,0,limit));
       clip.style.left=(100*current/end)+"%";
       label();
     };
     const commit=()=>{
       const field=$("offset"+i);
       const shift=i===0?0:Number($("alignMs"+i).value)/1000;
       const base=round(Math.max(0,current-shift));
       if(Number(field.value)===base)return;
       field.value=base;
       field.dispatchEvent(new Event("change",{bubbles:true}));
     };
     clip.dataset.track=String(i);
     registerClip(clip,i,"offset"+i);
     clip.style.cssText="position:absolute;top:4px;bottom:4px;border-radius:4px;cursor:grab;touch-action:none;min-width:8px;outline-offset:2px";
     clip.style.background=colors[i];
     clip.style.width=(100*t.duration/end)+"%";
     clip.tabIndex=0;clip.setAttribute("role","slider");
     clip.setAttribute("aria-valuemin","0");clip.setAttribute("aria-valuemax",limit.toFixed(2));
     setPosition(t.offset);
     // Listen on window so dragging remains reliable when the clip moves
     // away from the pointer or the browser retargets pointer events.
     clip.addEventListener("pointerdown",e=>{
       if(e.button!==0||drag)return;
       e.preventDefault();
       clip.focus();
       drag={pointerId:e.pointerId,x:e.clientX,offset:current};
       clip.style.cursor="grabbing";
       const onMove=event=>{
         if(!drag||event.pointerId!==drag.pointerId)return;
         const width=bg.getBoundingClientRect().width;
         if(width>0)setPosition(drag.offset+(event.clientX-drag.x)*end/width,true);
       };
       const cleanup=()=>{
         window.removeEventListener("pointermove",onMove);
         window.removeEventListener("pointerup",onUp);
         window.removeEventListener("pointercancel",onCancel);
         drag=null;clip.style.cursor="grab";
       };
       const onUp=event=>{
         if(!drag||event.pointerId!==drag.pointerId)return;
         cleanup();commit();
       };
       const onCancel=event=>{
         if(!drag||event.pointerId!==drag.pointerId)return;
         cleanup();setPosition(Number($("offset"+i).value));
       };
       window.addEventListener("pointermove",onMove);
       window.addEventListener("pointerup",onUp);
       window.addEventListener("pointercancel",onCancel);
     });
     clip.addEventListener("keydown",e=>{
       if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;
       e.preventDefault();
       const step=e.shiftKey?1:0.1;
       setPosition(e.key==="Home"?0:(window.gridSettings().on?window.gridNudge(current,e.key==="ArrowRight"?1:-1,e.shiftKey):current+(e.key==="ArrowRight"?step:-step)));
       $("offset"+i).value=round(Math.max(0,current-(i===0?0:Number($("alignMs"+i).value)/1000)));keysMoved=true;
     });
     clip.addEventListener("keyup",e=>{
       if(keysMoved&&["ArrowLeft","ArrowRight","Home"].includes(e.key)){
         keysMoved=false; window.captureTimelineHistory?.(); // Capture one keyboard edit without losing clip focus.
       }
     });
     bg.append(clip);
     }
   }catch(e){bg.title=e.message}}
   lane.append(title,bg);root.append(lane);
  });
  const markerRuler=window.renderSongMarkerRuler?.(end);
  if(markerRuler){markerRuler.style.minWidth=minWidth+"px";root.prepend(markerRuler)}
  const footer=document.createElement("small");
  footer.textContent="0 s — "+end.toFixed(1)+" s · Zoom visual ×"+zoomLevels[zoomIndex]+". Arrastra o usa flechas para mover; Ctrl/Cmd + D duplica; Supr quita una copia; Deshacer recupera. Los originales no cambian.";
  root.append(footer);
  refreshSelection();
 }
 const observer=new MutationObserver(redraw);
 observer.observe(document.getElementById("tracks"),{childList:true,subtree:true,characterData:true});
 for(let i=0;i<8;i++)["offset","trimStart","trimEnd","repeat","fadeIn","fadeOut","file","splitMode","splitCount","splitAt","splitOffset","splitAt2_","splitOffset2_","splitAt3_","splitOffset3_","copyCount","copySource0_","copyOffset0_","copySource1_","copyOffset1_","copySource2_","copyOffset2_","copySource3_","copyOffset3_",...(i>0?["alignMs"]:[])].forEach(k=>$(k+i).addEventListener("change",redraw));
 // Imported session labels are updated only after decoding; observed DOM changes redraw on completion.
 window.montanaTimelineRedraw=redraw;
 window.addEventListener("resize",redraw);
 setZoom(0);
})();
