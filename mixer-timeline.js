"use strict";
(function(){
 const root=document.getElementById("timeline");if(!root)return;
 const colors=["#dfb85e","#64b5e8","#7ed1c0","#c3a0f4","#f2a2ae","#88c46a","#e0a66c","#9ea8ed"];
 function redraw(){
  const end=Math.max(10,...tracks.map((b,i)=>{if(!b)return 0;try{const r=region(i,b);return r.offset+r.duration}catch(e){return 0}}));
  root.replaceChildren();
  tracks.forEach((b,i)=>{
   const lane=document.createElement("div");lane.style.cssText="display:grid;grid-template-columns:100px 1fr;align-items:center;gap:8px;min-height:32px";
   const title=document.createElement("span");title.textContent=(i+1)+". "+labels[i];title.style.fontSize="12px";
   const bg=document.createElement("div");bg.style.cssText="height:28px;position:relative;border:1px solid #46516a;border-radius:5px;background:repeating-linear-gradient(90deg,#202c40 0px,#202c40 1px,#172132 1px,#172132 10%)";
   if(b){try{const t=region(i,b),clip=document.createElement("div");clip.style.position="absolute";clip.style.left=(100*t.offset/end)+"%";clip.style.width=(100*t.duration/end)+"%";clip.style.top="3px";clip.style.bottom="3px";clip.style.borderRadius="4px";clip.style.background=colors[i];clip.title="Inicio: "+t.offset.toFixed(2)+"s; duración: "+t.duration.toFixed(2)+"s";clip.setAttribute("aria-label",clip.title);bg.append(clip)}catch(e){bg.title=e.message}}
   lane.append(title,bg);root.append(lane);
  });
  const footer=document.createElement("small");footer.textContent="0 s — "+end.toFixed(1)+" s · Vista de referencia, no se puede arrastrar todavía.";root.append(footer);
 }
 const observer=new MutationObserver(()=>redraw());
 observer.observe(document.getElementById("tracks"),{childList:true,subtree:false});
 for(let i=0;i<8;i++){["offset","trimStart","trimEnd","file"].forEach(k=>$(k+i).addEventListener("change",()=>setTimeout(redraw,100)))}
 document.getElementById("sessionFile").addEventListener("change",()=>setTimeout(redraw,750));
 redraw();
})();
