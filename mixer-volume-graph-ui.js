"use strict";
/* SVG volume envelope editor (mouse/touch + keyboard); source of truth remains
 * the validated text controls. No third-party libraries, HTML injection or audio mutation.
 */
(function(){
 const G=MontanaVolumeGraph,M=MontanaVolumeAutomation;
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
  const host=$("autoGraph"+i),select=make("select",null,host);
  select.id="autoZoom"+i;select.setAttribute("aria-label","Escala temporal gráfica canal "+(i+1));
  for(const seconds of [2,10,30,60,120,300]){
   const option=make("option",seconds+" segundos",select);option.value=String(seconds);
  }
  select.value="30";
  const svg=node("svg",{
   id:"autoSvg"+i,viewBox:"0 0 "+G.WIDTH+" "+G.HEIGHT,
   role:"group","aria-label":"Curva de volumen canal "+(i+1)+
    ". Clic en fondo para crear un punto. Arrastrar para mover. Flechas para ajustar; Supr para borrar.",
   width:"100%","preserveAspectRatio":"xMidYMid meet"
  });
  svg.style.cssText="display:block;max-width:100%;background:#0b1423;border:1px solid #627386;border-radius:8px;touch-action:none;user-select:none;margin-top:8px";
  svg.style.aspectRatio="440 / 178";
  svg.style.width="100%";
  svg.style.height="auto";
  host.append(svg);
  const del=make("button","Borrar punto seleccionado",host);
  del.id="autoDelete"+i;del.type="button";del.disabled=true;
  del.style.cssText="margin-top:6px;font-size:.85rem";
  const status=make("small","Elige un punto de la curva o haz clic para crear uno.",host);
  status.id="autoGraphStatus"+i;status.style.display="block";
  let chosen=null,drag=null,draft=null;
  const current=()=>window.volumeAutomationState(i);
  function reportState(message){status.textContent=message;}
  function pointLabel(p,j){
   return "Punto "+(j+1)+": "+p.time+" s, "+p.gain+
    " %. Flechas horizontales: tiempo; verticales: nivel. Supr: borrar.";
  }
  function draw(override=null){
   const value=override||current(),seconds=G.horizon(value,Number(select.value));
   svg.replaceChildren();
   const grid=node("g",{"aria-hidden":"true"});
   for(const level of [0,50,100,150]){
    const y=G.xy(0,level,seconds).y;
    grid.append(node("line",{x1:G.margin.left,y1:y,x2:G.WIDTH-G.margin.right,y2:y,stroke:"#40526a","stroke-width":1}));
    const label=node("text",{x:2,y:y+4,fill:"#b6c8e0","font-size":10});label.textContent=level+"%";grid.append(label);
   }
   for(let n=0;n<=4;n++){
    const t=seconds*n/4,x=G.xy(t,0,seconds).x;
    grid.append(node("line",{x1:x,y1:G.margin.top,x2:x,y2:G.HEIGHT-G.margin.bottom,stroke:"#2a3c54","stroke-width":1}));
    const label=node("text",{x:x,y:G.HEIGHT-7,fill:"#b6c8e0","font-size":10,"text-anchor":"middle"});
    label.textContent=Number(t.toFixed(2))+"s";grid.append(label);
   }
   svg.append(grid);
   const vertices=value.points.map(p=>G.xy(p.time,p.gain,seconds));
   const sequence=vertices.map(p=>p.x+","+p.y).join(" ");
   svg.append(node("polyline",{points:sequence,fill:"none",stroke:value.enabled?"#efc36e":"#96a8c2","stroke-width":2.8}));
   // Extend final level to the right edge exactly like the audio DSP.
   const last=vertices[vertices.length-1];
   svg.append(node("line",{x1:last.x,y1:last.y,x2:G.WIDTH-G.margin.right,y2:last.y,
    stroke:value.enabled?"#efc36e":"#96a8c2","stroke-width":2,"stroke-dasharray":"4 4"}));
   vertices.forEach((p,j)=>{
    const dot=node("circle",{cx:p.x,cy:p.y,r:j===chosen?8:7,
     fill:j===chosen?"#ffffff":"#efc36e",stroke:"#141e2c","stroke-width":2,
     tabindex:0,role:"button","data-index":j,"aria-label":pointLabel(value.points[j],j)});
    dot.style.cursor="grab";svg.append(dot);
   });
   del.disabled=chosen===null||chosen===0||chosen>=value.points.length;
  }
  function commit(next,notice){
   const checked=M.validate(next);
   $("autoPoints"+i).value=M.format(checked);
   $("autoPoints"+i).dispatchEvent(new Event("change",{bubbles:true}));
   draw();reportState(notice||"Curva actualizada. Guarda la sesión para conservarla.");
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
     const next=G.insert(current(),p.time,p.gain);
     chosen=next.points.findIndex(v=>v.time===p.time);
     commit(next,"Punto añadido. Selecciona para arrastrar o usar las flechas.");
    }catch(err){reportState(err.message);}
   }
  });
  document.addEventListener("pointermove",e=>{
   if(!drag||e.pointerId!==drag.id||!draft)return;
   const p=relative(e);if(!p)return;
   try{
    draft=G.move(draft,drag.index,p.time,p.gain);
    draw(draft);reportState(pointLabel(draft.points[chosen],chosen));
   }catch(err){reportState(err.message);}
  });
  function completeDrag(e,abort){
   if(!drag||e.pointerId!==drag.id)return;
   const next=draft;drag=null;draft=null;
   if(abort){draw();reportState("Movimiento cancelado; el patrón original sigue intacto.");return;}
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
    ArrowUp:[0,1],ArrowDown:[0,-1]};
   if(!shifts[e.key])return;
   e.preventDefault();
   const value=current(),p=value.points[index],[dt,dg]=shifts[e.key];
   try{
    const next=G.move(value,index,p.time+dt,p.gain+dg);
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
  $("autoPoints"+i).addEventListener("change",()=>{
   chosen=null;if(!drag)draw();
  });
  $("autoEnable"+i).addEventListener("change",()=>draw());
  draw();
  window.refreshVolumeAutomationGraph=window.refreshVolumeAutomationGraph||function(index){
   if(Number.isInteger(index)&&index>=0&&index<8)
    document.getElementById("autoPoints"+index)?.dispatchEvent(new Event("auto-redraw"));
  };
  $("autoPoints"+i).addEventListener("auto-redraw",()=>{chosen=null;draw();});
 }
})();
