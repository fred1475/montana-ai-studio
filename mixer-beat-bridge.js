"use strict";
/* Confirmed Beat Lab inbox import. No automatic changes to music/session. */
(function(){
 const button=document.getElementById("beatTransferImport"),
  discard=document.getElementById("beatTransferDiscard"),
  status=document.getElementById("beatTransferStatus"),
  replace=document.getElementById("beatTransferReplace");
 let pending=null,busy=false;
 const show=s=>{status.textContent=s;};
 const refresh=async()=>{
  button.disabled=true;pending=null;
  try{
   const item=await MontanaBeatBridge.read();
   if(!item){show("No hay ningún ritmo pendiente. Puedes crearlo en Beat Lab.");return;}
   pending=item;button.disabled=false;
   show("Beat pendiente: "+item.filename+" · "+item.bpm+" BPM · "+
    (item.frames/item.rate).toFixed(2)+" s. Confirma para colocarlo en el canal 1.");
  }catch(e){show("No se pudo recuperar el beat: "+e.message+
   ". Descarte el envío y genere uno nuevo desde Beat Lab si es necesario.");}
 };
 button.addEventListener("click",async()=>{
  if(busy)return;busy=true;button.disabled=true;
  try{
   // Re-read at click time: storage can change in a different browser tab.
   const item=await MontanaBeatBridge.read();
   if(!item)throw Error("El beat pendiente ya no existe");
   if(tracks[0]&&!replace.checked)
    throw Error("El canal 1 ya tiene audio. Guarda la sesión y marca la autorización de reemplazo si deseas sustituirlo.");
   const file=new File([item.bytes],item.filename,{type:"audio/wav"});
   show("Verificando audio del Beat Lab antes de importarlo...");
   await window.montanaLoadTrackFile(0,file);
   document.getElementById("bpm").value=String(item.bpm);
   document.getElementById("file0").value="";
   replace.checked=false;
   pending=null;
   // Audio is committed first; a storage deletion error must not invalidate it.
   try{await MontanaBeatBridge.discard();}
   catch(e){show("Beat importado, pero no se pudo borrar el envío pendiente: "+e.message+
      ". Puedes descartarlo manualmente.");return;}
   show("Beat importado en canal 1 · "+item.bpm+
     " BPM. No se alteró la grabación fuente en Beat Lab. Guarda tu sesión para conservarlo.");
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
