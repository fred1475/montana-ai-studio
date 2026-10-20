"use strict";
(function(){
 const root=document.getElementById("timeline");if(!root)return;
 const colors=["#dfb85e","#64b5e8","#7ed1c0","#c3a0f4","#f2a2ae","#88c46a","#e0a66c","#9ea8ed"];
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const round=v=>Math.round(v*100)/100;
 function redraw(){
  const end=Math.max(10,...tracks.map((b,i)=>{
   if(!b)return 0;try{const t=region(i,b);return t.offset+t.duration+Math.max(2,t.duration*.1)}catch(e){return 0}
  }));
  root.replaceChildren();
  tracks.forEach((b,i)=>{
   const lane=document.createElement("div");
   lane.style.cssText="display:grid;grid-template-columns:minmax(90px,120px) minmax(0,1fr);align-items:center;gap:8px;min-height:36px";
   const title=document.createElement("span");title.textContent=(i+1)+". "+labels[i];title.style.fontSize="12px";
   const bg=document.createElement("div");bg.style.cssText="height:32px;position:relative;border:1px solid #46516a;border-radius:5px;background:repeating-linear-gradient(90deg,#202c40 0px,#202c40 1px,#172132 1px,#172132 10%)";
   if(b){try{
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
       if(Number(field.value)===current)return;
       field.value=current;
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
       $("offset"+i).value=current;keysMoved=true;
     });
     clip.addEventListener("keyup",e=>{
       if(keysMoved&&["ArrowLeft","ArrowRight","Home"].includes(e.key)){
         keysMoved=false; window.captureTimelineHistory?.(); // Capture one keyboard edit without losing clip focus.
       }
     });
     bg.append(clip);
   }catch(e){bg.title=e.message}}
   lane.append(title,bg);root.append(lane);
  });
  const footer=document.createElement("small");
  footer.textContent="0 s — "+end.toFixed(1)+" s · Arrastra un bloque para mover su inicio. Flechas: 0.1 s; Shift + flecha: 1 s. Los archivos originales no cambian.";
  root.append(footer);
 }
 const observer=new MutationObserver(redraw);
 observer.observe(document.getElementById("tracks"),{childList:true,subtree:true,characterData:true});
 for(let i=0;i<8;i++)["offset","trimStart","trimEnd","file",...(i>0?["alignMs"]:[])].forEach(k=>$(k+i).addEventListener("change",redraw));
 // Imported session labels are updated only after decoding; observed DOM changes redraw on completion.
 redraw();
})();
