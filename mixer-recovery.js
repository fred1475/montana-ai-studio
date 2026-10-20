"use strict";
/* Montana Music Production — opt-in local recovery.
 * Stores a single fully validated session containing original audio bytes
 * in IndexedDB. A failed transaction does not replace the prior snapshot.
 * Does not sync with any server and does not auto-restore over active work.
 */
(function(){
 const key="montana-studio-recovery-optin-v1";
 const dbName="montana-studio-local-recovery-v1",store="snapshots",recordId="latest";
 const btn=$("autosaveNow"),restore=$("restoreRecovery"),remove=$("clearRecovery");
 const enabled=$("autosaveEnabled"),info=$("recoveryStatus");
 let dirty=false,revision=0,busy=false,dbPromise=null;
 function note(msg){info.textContent=msg}
 function openDB(){
  if(!window.indexedDB)return Promise.reject(Error("Este navegador no admite IndexedDB"));
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(dbName,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store,{keyPath:"id"});
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error("No se pudo abrir el almacenamiento"));
  }).catch(err=>{dbPromise=null;throw err});
  return dbPromise;
 }
 async function transact(mode,work){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(store,mode),table=tx.objectStore(store);
   let value;
   const request=work(table);
   if(request){
    request.onsuccess=()=>{value=request.result};
   }
   tx.oncomplete=()=>resolve(value);
   tx.onabort=()=>reject(tx.error||Error("No se pudo escribir recuperación"));
   tx.onerror=()=>{}; // Transaction abort reports the precise error.
  });
 }
 function markDirty(){
  if(!enabled.checked)return;
  revision++;dirty=true;
 }
 const skip=el=>el&&(["autosaveEnabled","autosaveNow","restoreRecovery","clearRecovery"].includes(el.id));
 document.addEventListener("change",e=>{if(!skip(e.target))markDirty()});
 document.addEventListener("input",e=>{if(!skip(e.target))markDirty()});
 new MutationObserver(changes=>{
  if(changes.some(x=>x.target?.id?.startsWith("label")))markDirty();
 }).observe($("tracks"),{subtree:true,childList:true,characterData:true});
 async function status(){
  try{
   const result=await transact("readonly",table=>table.get(recordId));
   if(result){
    restore.disabled=false;remove.disabled=false;
    note("Recuperación local encontrada: "+new Date(result.savedAt).toLocaleString()+". Solo se restaurará si lo solicitas.");
   }else{
    restore.disabled=true;remove.disabled=true;
    note("Todavía no existe respaldo de recuperación en este navegador.");
   }
  }catch(err){restore.disabled=true;remove.disabled=true;note("Recuperación no disponible: "+err.message)}
 }
 async function save(force=false){
  if(busy||!enabled.checked||(!dirty&&!force)||!tracks.some(Boolean)||recording)return false;
  busy=true;btn.disabled=true;
  const before=revision;
  try{
   const session=await window.createMixerSnapshot();
   const result={id:recordId,savedAt:Date.now(),session};
   // IndexedDB commits atomically: quota errors leave the old record intact.
   await transact("readwrite",table=>table.put(result));
   if(revision===before)dirty=false;
   restore.disabled=false;remove.disabled=false;
   note("Recuperación local guardada: "+new Date(result.savedAt).toLocaleString()+". Descarga también un JSON de respaldo.");
   return true;
  }catch(err){
   note("No se pudo autoguardar: "+err.message+". Descarga el respaldo JSON para no perder trabajo.");
   return false;
  }finally{busy=false;btn.disabled=false}
 }
 enabled.addEventListener("change",()=>{
  try{localStorage.setItem(key,enabled.checked?"1":"0")}
  catch(e){note("No se pudo recordar la preferencia. Esta sesión puede seguir funcionando.")}
  if(enabled.checked){markDirty();save(true)}
  else{dirty=false;note("Autoguardado desactivado. No se borró ninguna recuperación existente.")}
 });
 btn.addEventListener("click",()=>save(true));
 restore.addEventListener("click",async()=>{
  if(busy)return;
  if(tracks.some(Boolean)&&!confirm("Hay pistas abiertas. ¿Restaurar la recuperación local y reemplazar la sesión actual?"))return;
  busy=true;restore.disabled=true;
  try{
   const entry=await transact("readonly",table=>table.get(recordId));
   if(!entry?.session)throw Error("No se encontró recuperación guardada");
   await window.restoreMixerSnapshot(entry.session);
   // Do not immediately overwrite the valid backup with a half-restored one.
   dirty=false;
   note("Sesión recuperada del almacenamiento local. Descarga ahora el JSON de respaldo.");
  }catch(err){note("No se restauró la recuperación: "+err.message+". El proyecto abierto sigue disponible.")}
  finally{busy=false;restore.disabled=false}
 });
 remove.addEventListener("click",async()=>{
  if(!confirm("¿Eliminar la única recuperación local? Esta acción no borra tus pistas abiertas ni los JSON descargados."))return;
  if(busy)return;
  busy=true;remove.disabled=true;
  try{await transact("readwrite",table=>table.delete(recordId));dirty=false;await status()}
  catch(err){note("No se pudo eliminar la recuperación: "+err.message)}
  finally{busy=false}
 });
 try{enabled.checked=localStorage.getItem(key)==="1"}
 catch(e){enabled.checked=false}
 setInterval(()=>{if(enabled.checked&&dirty)save(false)},45000);
 status();
})();
