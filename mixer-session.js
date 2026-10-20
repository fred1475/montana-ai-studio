"use strict";
// Portable, local-only JSON session with embedded audio and mixer settings.
const originalFiles=Array(8).fill(null);
function to64(bytes){let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
function from64(s){if(typeof s!=="string"||s.length>100000000)throw Error("Contenido inválido");const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
$("saveSession").addEventListener("click",async()=>{
 const btn=$("saveSession");btn.disabled=true;
 try{
  const items=[];let total=0;
  for(let i=0;i<8;i++){
   const f=$("file"+i).files?.[0]||originalFiles[i],state={volume:+$("vol"+i).value,pan:+$("pan"+i).value,lowEQ:Number($("lowEQ"+i).value),highEQ:Number($("highEQ"+i).value),mute:$("mute"+i).checked,solo:$("solo"+i).checked,offset:Number($("offset"+i).value),trimStart:Number($("trimStart"+i).value),trimEnd:Number($("trimEnd"+i).value)};
   if(tracks[i]&&f){
    if(f.size>50e6||(total+=f.size)>80e6)throw Error("Máximo 80 MB por sesión.");
    items.push({...state,name:f.name,type:f.type,data:to64(new Uint8Array(await f.arrayBuffer()))});
   }else items.push({...state,name:null,type:null,data:null});
  }
  if(!items.some(x=>x.data))throw Error("Carga una pista antes de guardar.");
  const blob=new Blob([JSON.stringify({format:"montana-mixer-session",version:1,masterGain:Number($("masterGain").value),tracks:items})],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="montana-sesion-8-pistas.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  report("Sesión guardada en archivo JSON. Consérvalo en privado.");
 }catch(e){report("No se guardó: "+e.message)}finally{btn.disabled=false}
});
$("loadSession").addEventListener("click",()=>$("sessionFile").click());
$("sessionFile").addEventListener("change",async(e)=>{
 const btn=$("loadSession");btn.disabled=true;
 try{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>112e6)throw Error("Archivo demasiado grande.");
  const s=JSON.parse(await file.text());
  if(s.format!=="montana-mixer-session"||s.version!==1||!Array.isArray(s.tracks)||s.tracks.length!==8)throw Error("Formato de sesión incompatible.");
  const masterGain=s.masterGain===undefined?80:Number(s.masterGain);
  if(!Number.isFinite(masterGain)||masterGain<0||masterGain>100)throw Error("Volumen maestro inválido.");
  const loaded=[];let bytes=0;
  for(let i=0;i<8;i++){
   const t=s.tracks[i];if(!t||typeof t!=="object")throw Error("Canal corrupto.");
   const v=Number(t.volume),p=Number(t.pan);
   if(!Number.isFinite(v)||v<0||v>150||!Number.isFinite(p)||p< -100||p>100||typeof t.mute!=="boolean"||typeof t.solo!=="boolean")throw Error("Ajustes inválidos.");
   const lowEQ=t.lowEQ===undefined?0:Number(t.lowEQ),highEQ=t.highEQ===undefined?0:Number(t.highEQ);
   if(![lowEQ,highEQ].every(Number.isFinite)||[lowEQ,highEQ].some(x=>x< -12||x>12))throw Error("Ajustes de ecualización inválidos.");
   const offset=t.offset===undefined?0:Number(t.offset),trimStart=t.trimStart===undefined?0:Number(t.trimStart),trimEnd=t.trimEnd===undefined?0:Number(t.trimEnd);
   if(![offset,trimStart,trimEnd].every(Number.isFinite)||[offset,trimStart,trimEnd].some(x=>x<0||x>300))throw Error("Posición de pista inválida.");
   let decoded=null,source=null;
   if(t.data!==null){
    const raw=from64(t.data);bytes+=raw.byteLength;
    if(raw.byteLength>50e6||bytes>80e6)throw Error("Audio demasiado grande.");
    source=new File([raw],String(t.name||"pista-"+(i+1)+".wav").slice(0,200),{type:String(t.type||"audio/wav").slice(0,100)});
    decoded=await audio().decodeAudioData(raw.buffer.slice(0));
    if(decoded.duration>300)throw Error("Pista demasiado larga.");
   }
   if(decoded&&(trimStart>=decoded.duration||trimEnd>decoded.duration+.001||(trimEnd!==0&&trimEnd<=trimStart)))throw Error("Recorte de pista inválido.");
   loaded.push({decoded,source,volume:v,pan:p,mute:t.mute,solo:t.solo,offset,trimStart,trimEnd,lowEQ,highEQ});
  }
  stop();
  $("masterGain").value=masterGain;$("masterValue").textContent=masterGain+"%";
  loaded.forEach((t,i)=>{
   tracks[i]=t.decoded;originalFiles[i]=t.source;
   // Reset file inputs so the restored bytes are authoritative on next save.
   $("file"+i).value="";
   $("vol"+i).value=t.volume;$("val"+i).textContent=t.volume+"%";
   $("pan"+i).value=t.pan;$("panval"+i).textContent=t.pan===0?"Centro":(t.pan<0?"Izq ":"Der ")+Math.abs(t.pan);
   $("lowEQ"+i).value=t.lowEQ;$("lowVal"+i).textContent=t.lowEQ+" dB";
   $("highEQ"+i).value=t.highEQ;$("highVal"+i).textContent=t.highEQ+" dB";
   $("offset"+i).value=t.offset;$("trimStart"+i).value=t.trimStart;$("trimEnd"+i).value=t.trimEnd;
   $("mute"+i).checked=t.mute;$("solo"+i).checked=t.solo;
   $("label"+i).textContent=t.source?t.source.name+" — "+t.decoded.duration.toFixed(1)+" s":"Sin audio";
  });
  report("Sesión restaurada con "+loaded.filter(t=>t.decoded).length+" pista(s) de audio.");
 }catch(err){report("No se restauró la sesión: "+err.message)}finally{btn.disabled=false;e.target.value=""}
});
