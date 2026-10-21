"use strict";
/* Montana Music Production LLC — nondestructive per-track clip copy/paste.
 * Four editable paste instances reference the existing decoded source audio.
 * Never duplicates/recompresses media; crossfades see chronological regions.
 */
(function(){
 const maxCopies=4,empty=()=>({copies:[]});
 const round=x=>Math.round(x*100)/100;
 const baseSegments=window.getTrackSegments;
 function ui(i){
  const count=Number($("copyCount"+i).value);
  if(!Number.isInteger(count)||count<0||count>maxCopies)throw Error("Número de copias inválido en canal "+(i+1));
  return {copies:Array.from({length:count},(_,j)=>({
   sourceIndex:Number($("copySource"+j+"_"+i).value),
   offset:Number($("copyOffset"+j+"_"+i).value)
  }))};
 }
 function validate(setting,i,base,hasSource){
  if(!setting||typeof setting!=="object"||Array.isArray(setting)||!Array.isArray(setting.copies)||
     setting.copies.length>maxCopies)throw Error("Portapapeles de clips inválido en canal "+(i+1));
  if(setting.copies.length&&!hasSource)throw Error("No hay audio para pegar en canal "+(i+1));
  return {copies:setting.copies.map(copy=>{
   if(!copy||typeof copy!=="object"||Array.isArray(copy)||
     !Number.isInteger(copy.sourceIndex)||copy.sourceIndex<0||copy.sourceIndex>=base.length||
     typeof copy.offset!=="number"||!Number.isFinite(copy.offset)||copy.offset<0||copy.offset>300)
    throw Error("Origen o posición de copia inválido en canal "+(i+1));
   return {sourceIndex:copy.sourceIndex,offset:copy.offset};
  })};
 }
 function get(i,buffer){
  const originals=baseSegments(i,buffer),s=validate(ui(i),i,originals,!!buffer);
  const all=originals.map((clip,j)=>({
   ...clip,editField:j===0?"offset"+i:j===1?"splitOffset"+i:"splitOffset"+j+"_"+i,
   copied:false
  }));
  for(let j=0;j<s.copies.length;j++){
   const copy=s.copies[j],src=originals[copy.sourceIndex];
   all.push({...src,offset:copy.offset,editField:"copyOffset"+j+"_"+i,copied:true});
  }
  return all.map((clip,index)=>({...clip,order:index})).sort((a,b)=>a.offset-b.offset||a.order-b.order);
 }
 function update(i){
  const count=Number($("copyCount"+i).value);
  for(let j=0;j<maxCopies;j++)$("copySlot"+j+"_"+i).hidden=j>=count;
  $("copyClear"+i).disabled=count===0;
  $("copyPaste"+i).disabled=count>=maxCopies;
  $("copyStatus"+i).textContent=count?
   count+" clip(s) pegado(s), independientes en tiempo y enlazados al audio original.":
   "Sin copias. Puedes copiar cualquier fragmento existente del archivo fuente.";
 }
 function sourceSegmentsForRestore(item,split,i){
  if(!item.decoded)return [];
  const b=item.decoded,desired=item.offset+(i?item.alignMs/1000:0);
  const start=item.trimStart+Math.max(0,-desired);
  const end=item.trimEnd===0?b.duration:item.trimEnd;
  const total=end-start,offset=Math.max(0,desired);
  if(!split.enabled)return [{start,offset,duration:total*item.repeat}];
  const cuts=[0,split.at,...(split.extras||[]).map(e=>e.at),total],
   positions=[offset,split.rightOffset,...(split.extras||[]).map(e=>e.offset)];
  return positions.map((off,j)=>({start:start+cuts[j],offset:off,duration:cuts[j+1]-cuts[j]}));
 }
 window.getOriginalTrackSegments=baseSegments;
 window.getTrackSegments=get;
 window.trackHasMultipleClips=i=>window.trackSplitEnabled(i)||Number($("copyCount"+i).value)>0;
 window.copySessionState=i=>validate(ui(i),i,tracks[i]?baseSegments(i,tracks[i]):[],!!tracks[i]);
 window.prepareCopyRestore=(loaded,records,splits)=>records.map((record,i)=>{
  const base=sourceSegmentsForRestore(loaded[i],splits[i],i);
  return validate(record.clipCopies===undefined?empty():record.clipCopies,i,base,!!loaded[i].decoded);
 });
 window.validateCopyCrossfadeRestore=(loaded,splits,copies,crossfades)=>{
  const check=window.prepareCrossfadePlan;
  // Validate projected ordering without mutating the currently open project.
  loaded.forEach((item,i)=>{
   if(!item.decoded||!crossfades[i].enabled)return;
   const base=sourceSegmentsForRestore(item,splits[i],i);
   const all=[...base,...copies[i].copies.map(c=>({...base[c.sourceIndex],offset:c.offset}))];
   all.sort((a,b)=>a.offset-b.offset);
   window.validateCrossfadeSegments(crossfades[i],i,all);
  });
 };
 window.commitCopyRestore=prepared=>prepared.forEach((s,i)=>{
  $("copyCount"+i).value=String(s.copies.length);
  for(let j=0;j<maxCopies;j++){
   const clip=s.copies[j]||{sourceIndex:0,offset:0};
   $("copySource"+j+"_"+i).value=String(clip.sourceIndex);
   $("copyOffset"+j+"_"+i).value=String(clip.offset);
  }
  update(i);
 });
 window.resetCopies=i=>{
  $("copyCount"+i).value="0";
  for(let j=0;j<maxCopies;j++){
   $("copySource"+j+"_"+i).value="0";$("copyOffset"+j+"_"+i).value="0";
  }
  update(i);
 };
 for(let i=0;i<8;i++){
  const details=document.createElement("details");
  details.id="copyDetails"+i;
  details.innerHTML='<summary>📋 Copiar y pegar clips (beta)</summary>'+
   '<label for="copySelect'+i+'">Fragmento original que copiar</label>'+
   '<select id="copySelect'+i+'">'+[0,1,2,3].map(j=>'<option value="'+j+'">Fragmento '+(j+1)+'</option>').join("")+'</select>'+
   '<label for="copyAt'+i+'">Inicio del nuevo clip en la canción (segundos)</label>'+
   '<input id="copyAt'+i+'" type="number" min="0" max="300" step="0.01" value="0">'+
   '<button id="copyPaste'+i+'" type="button">📋 Pegar copia</button> '+
   '<button id="copyRemove'+i+'" type="button">Quitar última copia</button> '+
   '<button id="copyClear'+i+'" type="button">Quitar todas las copias</button>'+
   '<input id="copyCount'+i+'" type="hidden" value="0">'+
   Array.from({length:maxCopies},(_,j)=>'<div id="copySlot'+j+'_'+i+'" hidden>'+
    '<label>Copia '+(j+1)+' — segmento original <select id="copySource'+j+'_'+i+'">'+
    [0,1,2,3].map(k=>'<option value="'+k+'">'+(k+1)+'</option>').join("")+'</select></label>'+
    '<label for="copyOffset'+j+'_'+i+'">Inicio de copia '+(j+1)+' (segundos)</label>'+
    '<input type="number" id="copyOffset'+j+'_'+i+'" min="0" max="300" step="0.01" value="0"></div>').join("")+
   '<p id="copyStatus'+i+'">Sin copias.</p>'+
   '<small>Hasta 4 copias extra por pista; cada una reutiliza la fuente y sus efectos. Arrastra o usa flechas para moverlas en la línea de tiempo. Deshacer/Rehacer y sesiones guardan las posiciones. No se copian clips entre canales.</small>';
  document.querySelectorAll("article.track")[i].append(details);
  for(const id of ["copyCount"+i,...Array.from({length:maxCopies},(_,j)=>"copySource"+j+"_"+i),
   ...Array.from({length:maxCopies},(_,j)=>"copyOffset"+j+"_"+i)]){
   $(id).addEventListener("change",()=>update(i));
  }
  $("copyPaste"+i).addEventListener("click",()=>{
   try{
    if(!tracks[i])throw Error("Importa audio primero");
    const base=baseSegments(i,tracks[i]),index=Number($("copySelect"+i).value),
     offset=window.gridSnapTime(Number($("copyAt"+i).value)),count=Number($("copyCount"+i).value);
    if(count>=maxCopies)throw Error("Máximo de 4 copias por pista");
    validate({copies:[{sourceIndex:index,offset}]},i,base,true);
    $("copySource"+count+"_"+i).value=String(index);
    $("copyOffset"+count+"_"+i).value=String(offset);
    $("copyCount"+i).value=String(count+1);
    $("copyCount"+i).dispatchEvent(new Event("change",{bubbles:true}));
    report("Canal "+(i+1)+": copia "+(count+1)+" creada a "+offset+" s sin modificar el original.");
   }catch(e){report("No se pegó el clip: "+e.message)}
  });
  $("copyRemove"+i).addEventListener("click",()=>{
   const count=Number($("copyCount"+i).value);
   if(count>0){
    $("copyCount"+i).value=String(count-1);
    $("copyCount"+i).dispatchEvent(new Event("change",{bubbles:true}));
   }
  });
  $("copyClear"+i).addEventListener("click",()=>{
   if(Number($("copyCount"+i).value)){
    $("copyCount"+i).value="0";
    $("copyCount"+i).dispatchEvent(new Event("change",{bubbles:true}));
   }
  });
  update(i);
 }
})();