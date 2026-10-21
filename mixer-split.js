"use strict";
/* Montana Music Production LLC — first two-segment arranger beta.
 * One optional split per track; both fragments reference the SAME immutable
 * imported audio buffer. Only the second timeline start becomes independent.
 * Not a multi-clip workstation or crossfade engine.
 */
(function(){
 const empty=()=>({enabled:false,at:0,rightOffset:0});
 function ui(i){
  return {enabled:$("splitMode"+i).value==="1",
   at:Number($("splitAt"+i).value),rightOffset:Number($("splitOffset"+i).value)};
 }
 function checked(settings,i,buffer,prospective=null){
  if(!settings||typeof settings!=="object"||typeof settings.enabled!=="boolean"||
     typeof settings.at!=="number"||!Number.isFinite(settings.at)||
     typeof settings.rightOffset!=="number"||!Number.isFinite(settings.rightOffset)||
     settings.at<0||settings.at>300||settings.rightOffset<0||settings.rightOffset>300)
   throw Error("División de clips inválida en canal "+(i+1));
  if(!settings.enabled)return settings;
  if(!buffer)throw Error("No hay audio para dividir en canal "+(i+1));
  const clip=prospective||region(i,buffer);
  if(clip.repeat!==1)throw Error("Para dividir, primero cambia Repetir región a 1");
  if(settings.at<.05||settings.at>clip.singleDuration-.05)
   throw Error("Divide a 0.05 s como mínimo del principio y final del fragmento");
  return settings;
 }
 function splitRegions(i,buffer){
  const clip=region(i,buffer),settings=checked(ui(i),i,buffer,clip);
  if(!settings.enabled)return [clip];
  const left={...clip,duration:settings.at,singleDuration:settings.at,repeat:1};
  const rightDur=clip.singleDuration-settings.at;
  const right={...clip,start:clip.start+settings.at,offset:settings.rightOffset,
   duration:rightDur,singleDuration:rightDur,repeat:1};
  return [left,right];
 }
 function status(i){
  const s=ui(i),button=$("splitMode"+i);
  $("splitRemove"+i).disabled=!s.enabled;
  $("splitAt"+i).disabled=!s.enabled;
  $("splitOffset"+i).disabled=!s.enabled;
  $("splitStatus"+i).textContent=s.enabled?
   "Dos fragmentos independientes; el segundo empieza en "+s.rightOffset.toFixed(2)+" s. El original permanece intacto.":
   "Una región completa; sin división.";
  button.textContent=s.enabled?"División activa":"Sin dividir";
 }
 window.getTrackSegments=splitRegions;
 window.trackSplitEnabled=i=>ui(i).enabled;
 window.splitSessionState=i=>checked(ui(i),i,tracks[i]);
 window.prepareSplitRestore=(loaded,records)=>records.map((record,i)=>{
  const s=record.split===undefined?empty():record.split;
  const data=loaded[i],b=data.decoded;
  if(!s||typeof s!=="object")throw Error("Configuración de división inválida");
  if(!s.enabled)return {...checked(s,i,b)};
  if(!b)throw Error("No se puede dividir un canal vacío");
  const desired=data.offset+(i>0?data.alignMs/1000:0);
  const start=data.trimStart+Math.max(0,-desired);
  const end=data.trimEnd===0?b.duration:data.trimEnd;
  const clip={repeat:data.repeat,singleDuration:end-start};
  return {...checked(s,i,b,clip)};
 });
 window.commitSplitRestore=prepared=>prepared.forEach((s,i)=>{
  $("splitAt"+i).value=s.at;
  $("splitOffset"+i).value=s.rightOffset;
  $("splitMode"+i).value=s.enabled?"1":"0";
  status(i);
 });
 window.resetSplit=i=>{
  $("splitMode"+i).value="0";$("splitAt"+i).value="0";
  $("splitOffset"+i).value="0";status(i);
 };
 for(let i=0;i<8;i++){
  const details=document.createElement("details");
  details.id="splitDetails"+i;
  details.innerHTML='<summary>✂️ Dividir y mover clip (beta)</summary>'+
   '<label>Estado <select id="splitMode'+i+'"><option value="0">Sin dividir</option><option value="1">Dos fragmentos</option></select></label>'+
   '<button type="button" id="splitHalf'+i+'">✂️ Dividir región por mitad</button>'+
   ' <button type="button" id="splitRemove'+i+'" disabled>Quitar división</button>'+
   '<label for="splitAt'+i+'">Punto de corte (segundos desde el recorte inicial)</label>'+
   '<input id="splitAt'+i+'" type="number" min="0.05" max="300" step="0.01" value="0" disabled style="width:100%">'+
   '<label for="splitOffset'+i+'">Inicio del segundo fragmento en la canción (segundos)</label>'+
   '<input id="splitOffset'+i+'" type="number" min="0" max="300" step="0.01" value="0" disabled style="width:100%">'+
   '<p id="splitStatus'+i+'">Una región completa; sin división.</p>'+
   '<small>Un solo corte y dos fragmentos como máximo por pista; repeticiones deben estar en 1. Sin crossfade automático. Los fundidos de pista se aplican a ambos fragmentos. No corta el archivo fuente.</small>';
  document.querySelectorAll("article.track")[i].append(details);
  function update(e){
   if(e.target.id==="splitMode"+i&&e.target.value==="1"&&tracks[i]){
    try{const b=region(i,tracks[i]);const at=Math.round(b.singleDuration*50)/100;
     if(at>=.05&&at<=b.singleDuration-.05&&b.repeat===1){
      $("splitAt"+i).value=at;
      $("splitOffset"+i).value=Math.round((b.offset+at)*100)/100;
     }
    }catch(err){}
   }
   status(i);
  }
  for(const field of ["splitMode","splitAt","splitOffset"]){
   $(field+i).addEventListener("change",update);
   $(field+i).addEventListener("input",()=>{if(field!=="splitMode")status(i)});
  }
  $("splitHalf"+i).addEventListener("click",()=>{
   try{
    if(!tracks[i])throw Error("Importa un audio antes de dividirlo");
    const b=region(i,tracks[i]);
    if(b.repeat!==1||b.singleDuration<.12)throw Error("La región debe durar al menos 0.12 s y tener una repetición");
    const half=Math.round(b.singleDuration*50)/100;
    $("splitAt"+i).value=half;
    $("splitOffset"+i).value=Math.round((b.offset+half)*100)/100;
    $("splitMode"+i).value="1";
    $("splitMode"+i).dispatchEvent(new Event("change",{bubbles:true}));
    report("Canal "+(i+1)+" dividido. Mueve el segundo fragmento con Inicio del segundo fragmento.");
   }catch(e){report("No se dividió el canal: "+e.message)}
  });
  $("splitRemove"+i).addEventListener("click",()=>{
   $("splitMode"+i).value="0";
   $("splitMode"+i).dispatchEvent(new Event("change",{bubbles:true}));
   report("Se quitó la división en canal "+(i+1)+" sin modificar el original.");
  });
  status(i);
 }
})();
