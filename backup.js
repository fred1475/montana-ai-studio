"use strict";
// Runs after studio.js. Entirely local; no network or server storage.
(() => {
const $el=id=>document.getElementById(id);
const LIMIT=110*1024*1024;
const MAX_COUNT=500;
const report=msg=>{$el("backupStatus").textContent=msg};
function b64(bytes){
  let parts=[];
  for(let n=0;n<bytes.length;n+=8192)parts.push(String.fromCharCode(...bytes.subarray(n,n+8192)));
  return btoa(parts.join(""));
}
function fromB64(s){
  if(typeof s!=="string"||s.length>LIMIT*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4!==0)throw Error("Datos de audio inválidos.");
  const raw=atob(s),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}
$el("backupAll").addEventListener("click",async()=>{
  const btn=$el("backupAll");btn.disabled=true;report("Preparando respaldo...");
  try{
    const projects=await allProjects();
    if(projects.length>MAX_COUNT)throw Error("Demasiados proyectos para un solo archivo.");
    const packed=[];
    for(const p of projects){
      const {blob,...meta}=p;
      if(blob){
        if(blob.size>80*1024*1024)throw Error("Una grabación excede 80 MB; descárgala individualmente.");
        packed.push({...meta,audio:{mime:blob.type||"audio/wav",base64:b64(new Uint8Array(await blob.arrayBuffer()))}});
      }else packed.push(meta);
    }
    const json=JSON.stringify({format:"montana-studio-backup",version:1,created:new Date().toISOString(),projects:packed});
    if(json.length>LIMIT)throw Error("Respaldo demasiado grande.");
    download(new Blob([json],{type:"application/json"}),"montana-studio-respaldo-"+new Date().toISOString().slice(0,10)+".json");
    report("Respaldo creado con "+projects.length+" proyecto(s). Comprueba la descarga.");
  }catch(err){report("Error: "+err.message)}
  finally{btn.disabled=false}
});
$el("restoreBackup").addEventListener("change",async()=>{
  const input=$el("restoreBackup"),file=input.files?.[0];if(!file)return;
  report("Validando respaldo...");
  try{
    if(file.size>LIMIT)throw Error("Archivo demasiado grande.");
    const pkg=JSON.parse(await file.text());
    if(pkg?.format!=="montana-studio-backup"||pkg.version!==1||!Array.isArray(pkg.projects))
      throw Error("Archivo no es un respaldo completo compatible.");
    if(pkg.projects.length>MAX_COUNT)throw Error("Demasiados proyectos.");
    // Validate entire payload before changing local storage.
    const restored=[];
    for(const item of pkg.projects){
      if(!item||typeof item!=="object"||!["song","audio"].includes(item.kind)||typeof item.title!=="string"||item.title.length>300)
        throw Error("Un proyecto no tiene datos válidos.");
      const p={kind:item.kind,title:item.title};
      if(item.kind==="song"){
        for(const key of ["genre","theme","lyrics","bpm","mood"]){
          if(item[key]!=null&&typeof item[key]!=="string")throw Error("Campo inválido: "+key);
          p[key]=item[key]||"";
        }
        if(p.lyrics.length>1000000)throw Error("Letra demasiado grande.");
      }else{
        if(!item.audio||typeof item.audio.mime!=="string"||!item.audio.mime.startsWith("audio/"))throw Error("Audio incompatible.");
        const bytes=fromB64(item.audio.base64);
        if(bytes.length>80*1024*1024)throw Error("Audio demasiado grande.");
        p.blob=new Blob([bytes],{type:item.audio.mime});
      }
      restored.push(p);
    }
    if(!confirm("¿Agregar "+restored.length+" proyecto(s) al almacenamiento local? Los existentes se conservan.")){report("Restauración cancelada.");return;}
    let saved=0;
    for(const p of restored){await saveProject(p);saved++}
    await listProjects();
    report("Restaurados "+saved+" proyecto(s). Los anteriores siguen guardados.");
  }catch(err){report("No se pudo restaurar: "+err.message)}
  finally{input.value=""}
});
})();
