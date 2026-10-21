"use strict";
/* SVG stereo panorama automation editor (mouse/touch + keyboard); source of truth remains
 * the validated panorama text controls. No third-party libraries, HTML injection or audio mutation.
 */
(function(){
 const G=MontanaPanGraph,M=MontanaPanAutomation;
 const NS="http://www.w3.org/2000/svg",$=id=>document.getElementById(id);
 const node=(tag,attrs={})=>{
  const el=document.createElementNS(NS,tag);
  for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));
  return el;
 };
 const make=(tag,text,parent)=>{
  const el=document.createElement(tag);if(text!==null)el.textContent=text;
  parent.append(el);return el;
 };
 for(let i=0;i<8;i++){
  const host=$("panGraph"+i),select=make("select",null,host);
  select.id="panZoom"+i;select.setAttribute("aria-label","Escala temporal de panorama canal "+(i+1));
  for(const seconds of [2,10,30,60,120,300]){
   const option=make("option",seconds+" segundos",select);option.value=String(seconds);
  }
  select.value="30";
  const svg=node("svg",{
   id:"panSvg"+i,viewBox:"0 0 "+G.WIDTH+" "+G.HEIGHT,
   role:"group","aria-label":"Curva de panorama canal "+(i+1)+
    ". Clic para añadir; arrastra para cambiar tiempo y panorama. Flechas para ajustes finos; Supr para borrar.",
   width:"100%","preserveAspectRatio":"xMidYMid meet"
  });
  svg.style.cssText="display:block;max-width:100%;background:#0b1423;border:1px solid #627386;border-radius:8px;touch-action:none;user-select:none;margin-top:8px";
  svg.style.aspectRatio="440 / 178";
  svg.style.width="100%";
  svg.style.height="auto";
  host.append(svg);
  const del=make("button","Borrar punto seleccionado",host);
  del.id="panDelete"+i;del.type="button";del.disabled=true;
  del.style.cssText="margin-top:6px;font-size:.85rem";
  const status=make("small","Elige un punto de la curva o haz clic para crear uno.",host);
  status.id="panGraphStatus"+i;status.style.display="block";
  let chosen=null,drag=null,draft=null;
  const current=()=>window.panAutomationState(i);
  function reportState(message){status.textContent=message;}
  function pointLabel(p,j){
   return "Punto "+(j+1)+": "+p.time+" s, pan "+p.pan+
    ". Flechas horizontales: tiempo; verticales: panorama. Supr: borrar.";
  }
  function draw(override=null){
   const value=override||current(),seconds=G.horizon(value,Number(select.value));
   svg.replaceChildren();
   const grid=node("g",{"aria-hidden":"true"});
   for(const level of [-100,0,100]){
    const y=G.xy(0,level,seconds).y;
    grid.append(node("line",{x1:G.margin.left,y1:y,x2:G.WIDTH-G.margin.right,y2:y,stroke:"#40526a","stroke-width":1}));
    const label=node("text",{x:2,y:y+4,fill:"#b6c8e0","font-size":10});label.textContent=level===-100?"Izq.":level===0?"Centro":"Der.";grid.append(label);
   }
   for(let n=0;n<=4;n++){
    const t=seconds*n/4,x=G.xy(t,0,seconds).x;
    grid.append(node("line",{x1:x,y1:G.margin.top,x2:x,y2:G.HEIGHT-G.margin.bottom,stroke:"#2a3c54","stroke-width":1}));
    const label=node("text",{x:x,y:G.HEIGHT-7,fill:"#b6c8e0","font-size":10,"text-anchor":"middle"});
    label.textContent=Number(t.toFixed(2))+"s";grid.append(label);
   }
   svg.append(grid);
   const vertices=value.points.map(p=>G.xy(p.time,p.pan,seconds));
   const sequence=vertices.map(p=>p.x+","+p.y).join(" ");
   svg.append(node("polyline",{points:sequence,fill:"none",stroke:value.enabled?"#69c5ed":"#96a8c2","stroke-width":2.8}));
   // Extend final level to the right edge exactly like the audio DSP.
   const last=vertices[vertices.length-1];
   svg.append(node("line",{"data-tail":1,x1:last.x,y1:last.y,x2:G.WIDTH-G.margin.right,y2:last.y,
    stroke:value.enabled?"#69c5ed":"#96a8c2","stroke-width":2,"stroke-dasharray":"4 4"}));
   vertices.forEach((p,j)=>{
    const dot=node("circle",{cx:p.x,cy:p.y,r:j===chosen?8:7,
     fill:j===chosen?"#ffffff":"#69c5ed",stroke:"#141e2c","stroke-width":2,
     tabindex:0,role:"button","data-index":j,"aria-label":pointLabel(value.points[j],j)});
    dot.style.cursor="grab";svg.append(dot);
   });
   del.disabled=chosen===null||chosen===0||chosen>=value.points.length;
  }
  function commit(next,notice){
   const checked=M.validate(next);
   $("panAutoPoints"+i).value=M.format(checked);
   $("panAutoPoints"+i).dispatchEvent(new Event("change",{bubbles:true}));
   draw();reportState(notice||"Panorama actualizado. Guarda la sesión para conservarla.");
  }
  function relative(event){
   const bounds=svg.getBoundingClientRect();
   if(!bounds.width||!bounds.height)return null;
   const seconds=G.horizon(draft||current(),Number(select.value));
   return G.fromXY((event.clientX-bounds.left)*G.WIDTH/bounds.width,
    (event.clientY-bounds.top)*G.HEIGHT/bounds.height,seconds);
  }
  svg.addEventListener("pointerdown",e=>{
   if(e.button!==0)return;
   const target=e.target,idx=target.closest("[data-index]");
   if(idx&&svg.contains(idx)){
    chosen=Number(idx.getAttribute("data-index"));draft=current();
    drag={id:e.pointerId,index:chosen};
    // Keep the pressed SVG circle in the DOM until first movement.
    // Capturing on the SVG while immediately replacing the pointer target can
    // cancel gestures in Chromium and on some touch browsers.
    target.setAttribute("r","8");
    del.disabled=chosen===0;
    reportState(pointLabel(draft.points[chosen],chosen));
   }else{
    const p=relative(e);if(!p)return;
    try{
     const next=G.insert(current(),p.time,p.pan);
     chosen=next.points.findIndex(v=>v.time===p.time);
     commit(next,"Punto añadido. Selecciona para arrastrar o usar las flechas.");
    }catch(err){reportState(err.message);}
   }
  });
  document.addEventListener("pointermove",e=>{
   if(!drag||e.pointerId!==drag.id||!draft)return;
   const p=relative(e);if(!p)return;
   try{
    draft=G.move(draft,drag.index,p.time,p.pan);
    // Update attributes in-place; removing a pressed SVG circle during a
    // gesture can fire pointercancel before pointerup in Chromium.
    const maxTime=G.horizon(draft,Number(select.value));
    const coords=draft.points.map(pt=>G.xy(pt.time,pt.gain,maxTime));
    svg.querySelector("polyline").setAttribute("points",coords.map(pt=>pt.x+","+pt.y).join(" "));
    svg.querySelectorAll("circle[data-index]").forEach((dot,j)=>{
     dot.setAttribute("cx",coords[j].x);dot.setAttribute("cy",coords[j].y);
     dot.setAttribute("aria-label",pointLabel(draft.points[j],j));
    });
    const tail=svg.querySelector('line[data-tail="1"]'),last=coords[coords.length-1];
    if(tail){tail.setAttribute("x1",last.x);tail.setAttribute("y1",last.y);}
    reportState(pointLabel(draft.points[chosen],chosen));
   }catch(err){reportState(err.message);}
  });
  function completeDrag(e,abort){
   if(!drag||e.pointerId!==drag.id)return;
   const next=draft;drag=null;draft=null;
   if(abort){draw();reportState("Movimiento cancelado; el panorama original sigue intacto.");return;}
   commit(next,"Punto desplazado: "+pointLabel(next.points[chosen],chosen));
  }
  document.addEventListener("pointerup",e=>completeDrag(e,false));
  document.addEventListener("pointercancel",e=>completeDrag(e,true));
  svg.addEventListener("keydown",e=>{
   const target=e.target;if(!target.hasAttribute("data-index"))return;
   const index=Number(target.getAttribute("data-index"));
   if(e.key==="Delete"||e.key==="Backspace"){
    e.preventDefault();
    try{const next=G.remove(current(),index);chosen=null;commit(next,"Punto eliminado.");}
    catch(err){reportState(err.message);}return;
   }
   const timeStep=e.shiftKey?1:.1;
   const shifts={ArrowLeft:[-timeStep,0],ArrowRight:[timeStep,0],
    ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(!shifts[e.key])return;
   e.preventDefault();
   const value=current(),p=value.points[index],[dt,dg]=shifts[e.key];
   try{
    const next=G.move(value,index,p.time+dt,p.pan+dg);
    chosen=index;commit(next,pointLabel(next.points[index],index));
    svg.querySelector('[data-index="'+index+'"]')?.focus();
   }catch(err){reportState(err.message);}
  });
  del.addEventListener("click",()=>{
   if(chosen===null)return;
   try{const next=G.remove(current(),chosen);chosen=null;commit(next,"Punto eliminado.");}
   catch(err){reportState(err.message);}
  });
  select.addEventListener("change",()=>{draw();reportState("Escala de "+select.value+" segundos seleccionada.");});
  $("panAutoPoints"+i).addEventListener("change",()=>{
   chosen=null;if(!drag)draw();
  });
  $("panAutoEnable"+i).addEventListener("change",()=>draw());
  draw();
  window.refreshPanAutomationGraph=window.refreshPanAutomationGraph||function(index){
   if(Number.isInteger(index)&&index>=0&&index<8)
    document.getElementById("panAutoPoints"+index)?.dispatchEvent(new Event("pan-auto-redraw"));
  };
  $("panAutoPoints"+i).addEventListener("pan-auto-redraw",()=>{chosen=null;draw();});
 }
})();
