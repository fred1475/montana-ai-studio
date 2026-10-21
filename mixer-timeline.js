"use strict";
(function(){
 const root=document.getElementById("timeline");if(!root)return;
 const colors=["#dfb85e","#64b5e8","#7ed1c0","#c3a0f4","#f2a2ae","#88c46a","#e0a66c","#9ea8ed"];
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const round=v=>Math.round(v*100)/100;
 function redraw(){
  const end=Math.max(10,...tracks.map((b,i)=>{
   if(!b)return 0;try{return Math.max(0,...window.getTrackSegments(i,b).map(t=>t.offset+t.duration+Math.max(2,t.duration*.1)))}catch(e){return 0}
  }));
  root.replaceChildren();
  tracks.forEach((b,i)=>{
   const lane=document.createElement("div");
   lane.style.cssText="display:grid;grid-template-columns:minmax(90px,120px) minmax(0,1fr);align-items:center;gap:8px;min-height:36px";
   const title=document.createElement("span");title.textContent=(i+1)+". "+labels[i];title.style.fontSize="12px";
   const bg=document.createElement("div");bg.style.cssText="height:32px;position:relative;border:1px solid #46516a;border-radius:5px;background:repeating-linear-gradient(90deg,#202c40 0px,#202c40 1px,#172132 1px,#172132 10%)";
   if(b){try{
     if(window.trackSplitEnabled?.(i)){
      const segments=window.getTrackSegments(i,b);
      segments.forEach((part,j)=>{
       const block=document.createElement("div");
       block.dataset.track=String(i);block.dataset.part=String(j+1);
       block.style.cssText="position:absolute;top:4px;bottom:4px;border-radius:4px;min-width:8px;outline:1px solid #141c2b;cursor:grab;touch-action:none";
       block.style.background=colors[i];block.style.opacity=j===0?"0.9":"0.7";
       block.style.width=(100*part.duration/end)+"%";
       let current=round(part.offset),drag=null,keysMoved=false;
       const fieldId=j===0?"offset"+i:j===1?"splitOffset"+i:"splitOffset"+j+"_"+i;
       const description=()=>{
        const s="Pista "+(i+1)+", fragmento "+(j+1)+", inicio "+current.toFixed(2)+" s, duración "+part.duration.toFixed(2)+" s";
        block.title=s;block.setAttribute("aria-label",s);
        block.setAttribute("aria-valuenow",String(current));block.setAttribute("aria-valuetext",s);
       };
       const position=value=>{
        current=round(clamp(value,0,300));
        block.style.left=(100*current/end)+"%";description();
       };
       const commit=()=>{
        const field=$(fieldId),shift=j===0&&i>0?Number($("alignMs"+i).value)/1000:0;
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
         if(width>0)position(drag.start+(e.clientX-drag.x)*end/width);
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
        position(event.key==="Home"?0:current+(event.key==="ArrowRight"?step:-step));
        const shift=j===0&&i>0?Number($("alignMs"+i).value)/1000:0;
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
     const setPosition=value=>{
       current=round(clamp(value,0,limit));
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
         if(width>0)setPosition(drag.offset+(event.clientX-drag.x)*end/width);
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
       setPosition(e.key==="Home"?0:current+(e.key==="ArrowRight"?step:-step));
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
  const footer=document.createElement("small");
  footer.textContent="0 s — "+end.toFixed(1)+" s · Arrastra cualquier fragmento para moverlo. Flechas: 0.1 s; Shift + flecha: 1 s. Los archivos originales no cambian.";
  root.append(footer);
 }
 const observer=new MutationObserver(redraw);
 observer.observe(document.getElementById("tracks"),{childList:true,subtree:true,characterData:true});
 for(let i=0;i<8;i++)["offset","trimStart","trimEnd","repeat","fadeIn","fadeOut","file","splitMode","splitCount","splitAt","splitOffset","splitAt2_","splitOffset2_","splitAt3_","splitOffset3_",...(i>0?["alignMs"]:[])].forEach(k=>$(k+i).addEventListener("change",redraw));
 // Imported session labels are updated only after decoding; observed DOM changes redraw on completion.
 redraw();
})();
