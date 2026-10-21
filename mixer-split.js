"use strict";
/* Montana Music Production LLC — up to four non-destructive regions per track.
 * Original WAV/recording bytes are never cut; each fragment points to the
 * original buffer, with its own source cut point and independent timeline start.
 * Backwards-compatible two-fragment session fields: enabled / at / rightOffset.
 * Additional fragments are encoded as extras: [{at,offset},...].
 */
(function(){
 const round=x=>Math.round(x*100)/100;
 const empty=()=>({enabled:false,at:0,rightOffset:0});
 const cleanExtras=x=>x===undefined?[]:x;
 function ui(i){
  const enabled=$("splitMode"+i).value==="1",count=Number($("splitCount"+i).value);
  if(!enabled)return empty();
  const s={enabled:true,at:Number($("splitAt"+i).value),rightOffset:Number($("splitOffset"+i).value)};
  if(count>2){
   s.extras=[];
   for(let part=3;part<=Math.min(count,4);part++){
    s.extras.push({at:Number($("splitAt"+(part-1)+"_"+i).value),offset:Number($("splitOffset"+(part-1)+"_"+i).value)});
   }
  }
  return s;
 }
 function checked(settings,i,buffer,prospective=null){
  const s=settings;
  if(!s||typeof s!=="object"||Array.isArray(s)||typeof s.enabled!=="boolean"||
     typeof s.at!=="number"||!Number.isFinite(s.at)||
     typeof s.rightOffset!=="number"||!Number.isFinite(s.rightOffset)||
     s.at<0||s.at>300||s.rightOffset<0||s.rightOffset>300)
   throw Error("División de clips inválida en canal "+(i+1));
  const extras=cleanExtras(s.extras);
  if(!Array.isArray(extras)||extras.length>2||extras.some(p=>!p||typeof p!=="object"||Array.isArray(p)||
     typeof p.at!=="number"||!Number.isFinite(p.at)||typeof p.offset!=="number"||!Number.isFinite(p.offset)||
     p.at<0||p.at>300||p.offset<0||p.offset>300))
   throw Error("Fragmentos adicionales inválidos en canal "+(i+1));
  if(!s.enabled){
   if(extras.length)throw Error("Un canal sin división no admite fragmentos adicionales");
   return {enabled:false,at:s.at,rightOffset:s.rightOffset};
  }
  if(!buffer)throw Error("No hay audio para dividir en canal "+(i+1));
  const clip=prospective||region(i,buffer);
  if(clip.repeat!==1)throw Error("Para dividir, cambia Repetir región a 1");
  const cuts=[0,s.at,...extras.map(x=>x.at),clip.singleDuration];
  for(let j=1;j<cuts.length;j++){
   if(!Number.isFinite(cuts[j])||cuts[j]-cuts[j-1]<.04999)
    throw Error("Cada fragmento debe durar al menos 0.05 s y los cortes deben estar ordenados");
  }
  return extras.length?{enabled:true,at:s.at,rightOffset:s.rightOffset,
    extras:extras.map(({at,offset})=>({at,offset}))}:
   {enabled:true,at:s.at,rightOffset:s.rightOffset};
 }
 function splitRegions(i,buffer){
  const clip=region(i,buffer),s=checked(ui(i),i,buffer,clip);
  if(!s.enabled)return [clip];
  const extras=cleanExtras(s.extras),cuts=[0,s.at,...extras.map(x=>x.at),clip.singleDuration],
    offsets=[clip.offset,s.rightOffset,...extras.map(x=>x.offset)];
  return offsets.map((offset,j)=>{
   const start=clip.start+cuts[j],singleDuration=cuts[j+1]-cuts[j];
   return {...clip,start,offset,duration:singleDuration,singleDuration,repeat:1};
  });
 }
 function status(i){
  const enabled=$("splitMode"+i).value==="1",count=Number($("splitCount"+i).value);
  $("splitRemove"+i).disabled=!enabled;
  $("splitAdd"+i).disabled=!enabled||count>=4;
  $("splitLess"+i).disabled=!enabled||count<=2;
  $("splitAt"+i).disabled=!enabled;$("splitOffset"+i).disabled=!enabled;
  for(let part=3;part<=4;part++){
   const show=enabled&&count>=part,prefix=part-1;
   $("splitExtra"+prefix+"_"+i).hidden=!show;
   $("splitAt"+prefix+"_"+i).disabled=!show;
   $("splitOffset"+prefix+"_"+i).disabled=!show;
  }
  $("splitStatus"+i).textContent=enabled?
   count+" fragmentos independientes. Cada corte se mide desde el principio del recorte; cada inicio corresponde a la canción. Fuente original intacta.":
   "Una región completa; sin división.";
 }
 function reset(i){
  $("splitMode"+i).value="0";$("splitCount"+i).value="2";
  $("splitAt"+i).value="0";$("splitOffset"+i).value="0";
  for(let p=2;p<=3;p++){$("splitAt"+p+"_"+i).value="0";$("splitOffset"+p+"_"+i).value="0";}
  status(i);
 }
 window.getTrackSegments=splitRegions;
 window.trackSplitEnabled=i=>$("splitMode"+i).value==="1";
 window.splitSessionState=i=>checked(ui(i),i,tracks[i]);
 window.prepareSplitRestore=(loaded,records)=>records.map((record,i)=>{
  const s=record.split===undefined?empty():record.split;
  if(!s||typeof s!=="object")throw Error("Configuración de división inválida");
  const data=loaded[i],b=data.decoded;
  if(!s.enabled)return checked(s,i,b);
  if(!b)throw Error("No se puede dividir un canal vacío");
  const desired=data.offset+(i>0?data.alignMs/1000:0);
  const start=data.trimStart+Math.max(0,-desired);
  const end=data.trimEnd===0?b.duration:data.trimEnd;
  return checked(s,i,b,{repeat:data.repeat,singleDuration:end-start});
 });
 window.commitSplitRestore=prepared=>prepared.forEach((s,i)=>{
  reset(i);
  $("splitMode"+i).value=s.enabled?"1":"0";
  $("splitAt"+i).value=s.at;$("splitOffset"+i).value=s.rightOffset;
  const extras=cleanExtras(s.extras);
  $("splitCount"+i).value=String(s.enabled?2+extras.length:2);
  extras.forEach((e,j)=>{
   $("splitAt"+(j+2)+"_"+i).value=e.at;
   $("splitOffset"+(j+2)+"_"+i).value=e.offset;
  });
  status(i);
 });
 window.resetSplit=reset;
 for(let i=0;i<8;i++){
  const details=document.createElement("details");details.id="splitDetails"+i;
  details.innerHTML='<summary>✂️ Editor multiclip (máximo 4 por pista)</summary>'+
   '<label>Estado <select id="splitMode'+i+'"><option value="0">Sin dividir</option><option value="1">División activa</option></select></label>'+
   '<input type="hidden" id="splitCount'+i+'" value="2">'+
   '<button type="button" id="splitHalf'+i+'">✂️ Dividir por mitad</button> '+
   '<button type="button" id="splitAdd'+i+'">+ Añadir fragmento</button> '+
   '<button type="button" id="splitLess'+i+'">− Quitar último</button> '+
   '<button type="button" id="splitRemove'+i+'">Quitar división</button>'+
   '<label for="splitAt'+i+'">Primer corte desde el recorte inicial (segundos)</label>'+
   '<input id="splitAt'+i+'" type="number" min="0.05" max="300" step="0.01" value="0" style="width:100%">'+
   '<label for="splitOffset'+i+'">Inicio del fragmento 2 en la canción (segundos)</label>'+
   '<input id="splitOffset'+i+'" type="number" min="0" max="300" step="0.01" value="0" style="width:100%">'+
   [2,3].map(p=>'<div id="splitExtra'+p+'_'+i+'" hidden>'+
    '<label for="splitAt'+p+'_'+i+'">Corte para fragmento '+(p+1)+' (segundos desde recorte inicial)</label>'+
    '<input id="splitAt'+p+'_'+i+'" type="number" min="0.05" max="300" step="0.01" value="0" style="width:100%">'+
    '<label for="splitOffset'+p+'_'+i+'">Inicio del fragmento '+(p+1)+' en la canción (segundos)</label>'+
    '<input id="splitOffset'+p+'_'+i+'" type="number" min="0" max="300" step="0.01" value="0" style="width:100%"></div>').join("")+
   '<p id="splitStatus'+i+'">Una región completa; sin división.</p>'+
   '<small>Hasta 4 fragmentos no destructivos por pista, 1 repetición, cortes ordenados, duración mínima 0.05 s. Se aplican los efectos y fundidos de canal. Sin crossfade automático ni time-stretch.</small>';
  document.querySelectorAll("article.track")[i].append(details);
  for(const name of ["splitMode","splitCount","splitAt","splitOffset","splitAt2_","splitOffset2_","splitAt3_","splitOffset3_"]){
   const field=name.endsWith("_")?name+i:name+i;
   $(field).addEventListener("change",()=>{
    if(name==="splitMode"&&$("splitMode"+i).value==="1"&&tracks[i]&&Number($("splitAt"+i).value)===0){
     try{
      const clip=region(i,tracks[i]),half=round(clip.singleDuration/2);
      if(half>=.05&&half<=clip.singleDuration-.05&&clip.repeat===1){
       $("splitAt"+i).value=half;$("splitOffset"+i).value=round(clip.offset+half);
      }
     }catch(e){}
    }
    status(i);
   });
   if(name!=="splitMode")$(field).addEventListener("input",()=>status(i));
  }
  $("splitHalf"+i).addEventListener("click",()=>{
   try{
    if(!tracks[i])throw Error("Importa audio antes de dividirlo");
    const clip=region(i,tracks[i]),half=round(clip.singleDuration/2);
    if(clip.repeat!==1||half<.05||half>clip.singleDuration-.05)throw Error("La región debe durar al menos 0.1 s y tener una repetición");
    $("splitAt"+i).value=half;
    $("splitOffset"+i).value=round(clip.offset+half);
    $("splitCount"+i).value="2";
    $("splitMode"+i).value="1";
    $("splitMode"+i).dispatchEvent(new Event("change",{bubbles:true}));
    report("Canal "+(i+1)+": dos fragmentos. Ajusta posición y añade más fragmentos.");
   }catch(e){report("No se pudo dividir: "+e.message)}
  });
  $("splitAdd"+i).addEventListener("click",()=>{
   try{
    if(!tracks[i])throw Error("Importa audio primero");
    const clip=region(i,tracks[i]),s=checked(ui(i),i,tracks[i],clip);
    if(!s.enabled)throw Error("Primero divide la región");
    const existing=[s.at,...cleanExtras(s.extras).map(x=>x.at)];
    if(existing.length>=3)throw Error("Máximo cuatro fragmentos por pista");
    const lastCut=existing[existing.length-1],half=round((lastCut+clip.singleDuration)/2);
    if(half-lastCut<.04999||clip.singleDuration-half<.04999)throw Error("No queda duración suficiente para cortar");
    const currentOffset=existing.length===1?s.rightOffset:s.extras[s.extras.length-1].offset;
    const count=existing.length+2,field=count-1;
    $("splitAt"+field+"_"+i).value=half;
    $("splitOffset"+field+"_"+i).value=round(currentOffset+half-lastCut);
    $("splitCount"+i).value=String(count);
    $("splitCount"+i).dispatchEvent(new Event("change",{bubbles:true}));
    report("Canal "+(i+1)+" ahora tiene "+count+" fragmentos. Puedes mover cada fragmento desde el editor.");
   }catch(e){report("No se añadió el fragmento: "+e.message)}
  });
  $("splitLess"+i).addEventListener("click",()=>{
   const n=Number($("splitCount"+i).value);
   if(n>2){$("splitCount"+i).value=String(n-1);$("splitCount"+i).dispatchEvent(new Event("change",{bubbles:true}));}
  });
  $("splitRemove"+i).addEventListener("click",()=>{
   reset(i);$("splitMode"+i).dispatchEvent(new Event("change",{bubbles:true}));
   report("Se quitaron los cortes del canal "+(i+1)+" sin modificar el original.");
  });
  status(i);
 }
})();
