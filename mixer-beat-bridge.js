"use strict";
/* Beat Lab -> mixer: explicit local handoff, one beat or five stems.
 * Validate and decode every stem before modifying any channel. No cloud.
 */
(function(){
 const button=document.getElementById("beatTransferImport"),
  discard=document.getElementById("beatTransferDiscard"),
  status=document.getElementById("beatTransferStatus"),
  replace=document.getElementById("beatTransferReplace"),
  startControl=document.getElementById("beatStemStart");
 let pending=null,busy=false;
 const show=s=>{status.textContent=s;};
 const refresh=async()=>{
  button.disabled=true;pending=null;
  try{
   const item=await MontanaBeatBridge.read();
   if(!item){show("No hay ningún ritmo pendiente. Puedes crearlo en Beat Lab.");return;}
   pending=item;button.disabled=false;
   if(item.version===2)show("Beat pendiente: cinco instrumentos alineados, "+item.bpm+
    " BPM · "+(item.frames/item.rate).toFixed(2)+
    " s. Selecciona los cinco canales y confirma; no se modifica nada todavía.");
   else show("Beat pendiente: "+item.filename+" · "+item.bpm+" BPM · "+
    (item.frames/item.rate).toFixed(2)+" s. Confirma para colocarlo en el canal 1.");
  }catch(e){show("No se pudo recuperar el beat: "+e.message+
   ". Descarte el envío y genere uno nuevo desde Beat Lab si es necesario.");}
 };
 button.addEventListener("click",async()=>{
  if(busy)return;busy=true;button.disabled=true;
  try{
   // Re-read immediately: another tab might have replaced the pending inbox.
   const item=await MontanaBeatBridge.read();
   if(!item)throw Error("El beat pendiente ya no existe");
   if(item.version===2){
    const begin=Number(startControl.value);
    if(!Number.isInteger(begin)||begin<0||begin>3)
     throw Error("Selecciona cinco canales consecutivos válidos");
    const targets=item.stems.map((stem,i)=>begin+i);
    const snapshots=targets.map(i=>tracks[i]);
    const occupied=targets.filter(i=>!!tracks[i]);
    if(occupied.length&&!replace.checked)
     throw Error("Los canales "+occupied.map(i=>i+1).join(", ")+
      " contienen audio. Guarda primero tu sesión y autoriza el reemplazo o cambia la ubicación.");
    const assignments=item.stems.map((stem,i)=>({
     channel:targets[i],file:new File([stem.bytes],stem.filename,{type:"audio/wav"})
    }));
    show("Decodificando cinco stems antes de cambiar ninguna pista...");
    const prepared=await window.montanaPrepareTrackBatch(assignments);
    if(snapshots.some((old,i)=>tracks[targets[i]]!==old))
     throw Error("Los canales cambiaron durante la decodificación. Revisa antes de importar.");
    if(occupied.length&&!replace.checked)
     throw Error("La autorización de reemplazo fue retirada.");
    // The same-origin inbox is validated twice, but also defend against
    // a changed payload while audio decoding is in progress.
    const after=await MontanaBeatBridge.read();
    if(!after||after.version!==2||after.created!==item.created||
       after.stems.some((stem,i)=>stem.crc32!==item.stems[i].crc32))
     throw Error("El envío cambió durante la preparación. Repítelo.");
    window.montanaCommitTrackBatch(prepared);
    // Labels describe their new musical contents. Original WAV filenames
    // remain untouched and will still be available in the session backup.
    const musicalNames=["Bombo","Caja","Palmas","Hi-hat","Bajo"];
    targets.forEach((track,i)=>window.setMixerTrackLabel(track,musicalNames[i]));
    document.getElementById("bpm").value=String(item.bpm);
    replace.checked=false;pending=null;
    try{await MontanaBeatBridge.discard();}
    catch(e){show("Stems importados pero no se borró el envío pendiente: "+e.message);return;}
    show("Cinco instrumentos importados en canales "+(begin+1)+"–"+(begin+5)+
     " · "+item.bpm+" BPM. Guarda la sesión; no se cambió el audio fuente en Beat Lab.");
   }else{
    if(tracks[0]&&!replace.checked)
     throw Error("El canal 1 ya tiene audio. Guarda la sesión y marca la autorización de reemplazo si deseas sustituirlo.");
    const file=new File([item.bytes],item.filename,{type:"audio/wav"});
    show("Verificando audio del Beat Lab antes de importarlo...");
    await window.montanaLoadTrackFile(0,file);
    window.setMixerTrackLabel(0,"Ritmo Beat Lab");
    document.getElementById("bpm").value=String(item.bpm);
    document.getElementById("file0").value="";
    replace.checked=false;pending=null;
    try{await MontanaBeatBridge.discard();}
    catch(e){show("Beat importado, pero no se pudo borrar el envío pendiente: "+e.message+
       ". Puedes descartarlo manualmente.");return;}
    show("Beat importado en canal 1 · "+item.bpm+
     " BPM. No se alteró la grabación fuente en Beat Lab. Guarda tu sesión para conservarlo.");
   }
  }catch(e){show("Importación cancelada: "+e.message+". El audio anterior se conserva.");
  }finally{busy=false;button.disabled=!pending;}
 });
 discard.addEventListener("click",async()=>{
  if(busy)return;busy=true;discard.disabled=true;button.disabled=true;
  try{await MontanaBeatBridge.discard();pending=null;replace.checked=false;
   show("Envío pendiente descartado. El audio del mezclador no cambió.");
  }catch(e){show("No se pudo descartar el beat: "+e.message);}
  finally{busy=false;discard.disabled=false;button.disabled=!pending;}
 });
 window.refreshBeatTransfer=refresh;
 refresh();
})();
