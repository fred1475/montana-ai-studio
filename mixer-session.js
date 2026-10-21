"use strict";
// Portable, local-only JSON session with embedded audio and mixer settings.
const originalFiles=Array(8).fill(null);
function to64(bytes){let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
function from64(s){if(typeof s!=="string"||s.length>110000000)throw Error("Contenido inválido");const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
async function createMixerSnapshot(){
  const items=[];let total=0;
  for(let i=0;i<8;i++){
   const f=originalFiles[i],state={volume:+$("vol"+i).value,pan:+$("pan"+i).value,lowEQ:Number($("lowEQ"+i).value),highEQ:Number($("highEQ"+i).value),compEnabled:$("compEnable"+i).checked,compThreshold:Number($("compThreshold"+i).value),compRatio:Number($("compRatio"+i).value),reverb:Number($("reverb"+i).value),delayWet:Number($("delayWet"+i).value),delayMs:Number($("delayMs"+i).value),mute:$("mute"+i).checked,solo:$("solo"+i).checked,offset:Number($("offset"+i).value),trimStart:Number($("trimStart"+i).value),trimEnd:Number($("trimEnd"+i).value),repeat:Number($("repeat"+i).value),fadeIn:Number($("fadeIn"+i).value),fadeOut:Number($("fadeOut"+i).value),alignMs:i===0?0:Number($("alignMs"+i).value),pitch:window.pitchSessionState(i),clean:window.cleanSessionState(i),split:window.splitSessionState(i),crossfade:window.crossfadeSessionState(i),clipCopies:window.copySessionState(i)};
   if(![state.volume,state.pan,state.lowEQ,state.highEQ,state.compThreshold,state.compRatio,state.reverb,state.delayWet,state.delayMs,state.offset,state.trimStart,state.trimEnd,state.repeat,state.fadeIn,state.fadeOut,state.alignMs].every(Number.isFinite)||state.volume<0||state.volume>150||Math.abs(state.pan)>100||Math.abs(state.lowEQ)>12||Math.abs(state.highEQ)>12||state.compThreshold< -36||state.compThreshold> -6||state.compRatio<2||state.compRatio>12||state.reverb<0||state.reverb>50||state.delayWet<0||state.delayWet>50||state.delayMs<100||state.delayMs>750||[state.offset,state.trimStart,state.trimEnd].some(v=>v<0||v>300)||Math.abs(state.alignMs)>250||state.fadeIn<0||state.fadeIn>5||state.fadeOut<0||state.fadeOut>5||!Number.isInteger(state.repeat)||state.repeat<1||state.repeat>8)throw Error("Ajustes inválidos en canal "+(i+1));
   if(tracks[i]){region(i,tracks[i]);window.prepareCrossfadePlan(i,window.getTrackSegments(i,tracks[i]))} // Never create a backup that the loader cannot restore.
   if(tracks[i]&&f){
    if(f.size>50e6||(total+=f.size)>80e6)throw Error("Máximo 80 MB por sesión.");
    const raw=new Uint8Array(await f.arrayBuffer());
    // CRC32 detects accidental damage in portable and IndexedDB backups.
    // It is an integrity checksum, not authentication or encryption.
    const sourceCrc32=window.MontanaMasterAudit.crc32(raw).toString(16).padStart(8,"0");
    items.push({...state,name:f.name,type:f.type,data:to64(raw),sourceCrc32});
   }else items.push({...state,name:null,type:null,data:null});
  }
  if(!items.some(x=>x.data))throw Error("Carga una pista antes de guardar.");
  return {format:"montana-mixer-session",version:1,masterGain:Number($("masterGain").value),recordTrack:Number($("recordTrack").value),recordFormat:$("recordFormat").value,bpm:window.validateMetronome(),metronomeOn:$("metronomeOn").checked,gridSnapOn:$("gridSnapOn").checked,gridDivision:Number($("gridDivision").value),limiterOn:$("limiterOn").checked,limiterCeiling:Number($("limiterCeiling").value),normalizeOn:$("normalizeOn").checked,normalizeTarget:Number($("normalizeTarget").value),loudnessOn:$("loudnessOn").checked,auditOn:$("auditOn").checked,wavSampleRate:Number($("wavSampleRate").value),wavBits:Number($("wavBits").value),stemBits:Number($("stemBits").value),stemSampleRate:Number($("stemSampleRate").value),ditherOn:$("ditherOn").checked,tracks:items};
}
window.createMixerSnapshot=createMixerSnapshot;
$("saveSession").addEventListener("click",async()=>{
 const btn=$("saveSession");btn.disabled=true;
 try{
  const blob=new Blob([JSON.stringify(await createMixerSnapshot())],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="montana-sesion-8-pistas.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  report("Sesión guardada en archivo JSON. Consérvalo en privado.");
 }catch(e){report("No se guardó: "+e.message)}finally{btn.disabled=false}
});
$("loadSession").addEventListener("click",()=>$("sessionFile").click());
async function restoreMixerSnapshot(s){
  if(s.format!=="montana-mixer-session"||s.version!==1||!Array.isArray(s.tracks)||s.tracks.length!==8)throw Error("Formato de sesión incompatible.");
  const masterGain=s.masterGain===undefined?80:Number(s.masterGain);
  if(!Number.isFinite(masterGain)||masterGain<0||masterGain>100)throw Error("Volumen maestro inválido.");
  const recordTrack=s.recordTrack===undefined?1:s.recordTrack;
  if(!Number.isInteger(recordTrack)||recordTrack<1||recordTrack>7)throw Error("Canal de grabación inválido.");
  const recordFormat=s.recordFormat===undefined?"wav":s.recordFormat;
  if(recordFormat!=="wav"&&recordFormat!=="compressed")throw Error("Formato de grabación inválido.");
  const bpm=s.bpm===undefined?100:s.bpm,metronomeOn=s.metronomeOn===undefined?false:s.metronomeOn;
  if(typeof bpm!=="number"||!Number.isFinite(bpm)||bpm<40||bpm>240||typeof metronomeOn!=="boolean")throw Error("Metrónomo o BPM inválido.");
  const limiterOn=s.limiterOn===undefined?false:s.limiterOn,limiterCeiling=s.limiterCeiling===undefined?-1:s.limiterCeiling;
  if(typeof limiterOn!=="boolean"||typeof limiterCeiling!=="number"||!Number.isFinite(limiterCeiling)||limiterCeiling< -6||limiterCeiling>-.5)throw Error("Limitador maestro inválido.");
  const normalizeOn=s.normalizeOn===undefined?false:s.normalizeOn,normalizeTarget=s.normalizeTarget===undefined?-1:s.normalizeTarget;
  if(typeof normalizeOn!=="boolean"||typeof normalizeTarget!=="number"||!Number.isFinite(normalizeTarget)||normalizeTarget< -6||normalizeTarget>-.5)throw Error("Normalización inválida.");
  const loudnessOn=s.loudnessOn===undefined?false:s.loudnessOn;
  if(typeof loudnessOn!=="boolean")throw Error("Preferencia de análisis LUFS inválida.");
  const auditOn=s.auditOn===undefined?false:s.auditOn;
  if(typeof auditOn!=="boolean")throw Error("Preferencia de auditoría WAV inválida.");
  const wavSampleRate=s.wavSampleRate===undefined?44100:s.wavSampleRate;
  if(wavSampleRate!==44100&&wavSampleRate!==48000)throw Error("Frecuencia de WAV inválida.");
  const stemSampleRate=s.stemSampleRate===undefined?44100:s.stemSampleRate;
  if(stemSampleRate!==44100&&stemSampleRate!==48000)throw Error("Frecuencia de stems inválida.");
  const stemBits=s.stemBits===undefined?16:s.stemBits;
  if(stemBits!==16&&stemBits!==24)throw Error("Profundidad de stems inválida.");
  const wavBits=s.wavBits===undefined?16:s.wavBits,ditherOn=s.ditherOn===undefined?false:s.ditherOn;
  if((wavBits!==16&&wavBits!==24)||typeof ditherOn!=="boolean")throw Error("Ajustes de WAV o dither inválidos.");
  const loaded=[];let bytes=0;
  for(let i=0;i<8;i++){
   const t=s.tracks[i];if(!t||typeof t!=="object")throw Error("Canal corrupto.");
   const v=Number(t.volume),p=Number(t.pan);
   if(!Number.isFinite(v)||v<0||v>150||!Number.isFinite(p)||p< -100||p>100||typeof t.mute!=="boolean"||typeof t.solo!=="boolean")throw Error("Ajustes inválidos.");
   const lowEQ=t.lowEQ===undefined?0:Number(t.lowEQ),highEQ=t.highEQ===undefined?0:Number(t.highEQ);
   if(![lowEQ,highEQ].every(Number.isFinite)||[lowEQ,highEQ].some(x=>x< -12||x>12))throw Error("Ajustes de ecualización inválidos.");
   const compEnabled=t.compEnabled===undefined?false:t.compEnabled,compThreshold=t.compThreshold===undefined?-18:Number(t.compThreshold),compRatio=t.compRatio===undefined?4:Number(t.compRatio);
   if(typeof compEnabled!=="boolean"||![compThreshold,compRatio].every(Number.isFinite)||compThreshold< -36||compThreshold> -6||compRatio<2||compRatio>12)throw Error("Ajustes del compresor inválidos.");
   const reverb=t.reverb===undefined?0:Number(t.reverb),delayWet=t.delayWet===undefined?0:Number(t.delayWet),delayMs=t.delayMs===undefined?300:Number(t.delayMs);
   if(![reverb,delayWet,delayMs].every(Number.isFinite)||reverb<0||reverb>50||delayWet<0||delayWet>50||delayMs<100||delayMs>750)throw Error("Efectos de espacio inválidos.");
   const offset=t.offset===undefined?0:Number(t.offset),trimStart=t.trimStart===undefined?0:Number(t.trimStart),trimEnd=t.trimEnd===undefined?0:Number(t.trimEnd);
   const repeat=t.repeat===undefined?1:t.repeat;
   if(!Number.isInteger(repeat)||repeat<1||repeat>8)throw Error("Repeticiones de canal inválidas.");
   const fadeIn=t.fadeIn===undefined?0:t.fadeIn,fadeOut=t.fadeOut===undefined?0:t.fadeOut;
   if(typeof fadeIn!=="number"||typeof fadeOut!=="number"||!Number.isFinite(fadeIn)||!Number.isFinite(fadeOut)||fadeIn<0||fadeIn>5||fadeOut<0||fadeOut>5)throw Error("Fundidos de canal inválidos.");
   const alignMs=t.alignMs===undefined?0:t.alignMs;
   if(typeof alignMs!=="number"||!Number.isFinite(alignMs)||Math.abs(alignMs)>250||(i===0&&alignMs!==0))throw Error("Sincronización manual inválida.");
   if(![offset,trimStart,trimEnd].every(Number.isFinite)||[offset,trimStart,trimEnd].some(x=>x<0||x>300))throw Error("Posición de pista inválida.");
   let decoded=null,source=null;
   if(t.data!==null){
    const raw=from64(t.data);bytes+=raw.byteLength;
    if(raw.byteLength>50e6||bytes>80e6)throw Error("Audio demasiado grande.");
    // Backward compatibility: older sessions have no sourceCrc32.
    if(t.sourceCrc32!==undefined){
     if(typeof t.sourceCrc32!=="string"||!/^[0-9a-f]{8}$/.test(t.sourceCrc32)||
        window.MontanaMasterAudit.crc32(raw).toString(16).padStart(8,"0")!==t.sourceCrc32)
      throw Error("Integridad del audio fallida en canal "+(i+1)+": el respaldo puede estar dañado.");
    }
    source=new File([raw],String(t.name||"pista-"+(i+1)+".wav").slice(0,200),{type:String(t.type||"audio/wav").slice(0,100)});
    decoded=await audio().decodeAudioData(raw.buffer.slice(0));
    if(decoded.duration>300)throw Error("Pista demasiado larga.");
   }
   if(t.data===null&&t.sourceCrc32!==undefined)throw Error("Integridad del respaldo inválida: huella sin audio.");
   if(decoded&&(trimStart>=decoded.duration||trimEnd>decoded.duration+.001||(trimEnd!==0&&trimEnd<=trimStart)))throw Error("Recorte de pista inválido.");
   loaded.push({decoded,source,volume:v,pan:p,mute:t.mute,solo:t.solo,offset,trimStart,trimEnd,repeat,fadeIn,fadeOut,alignMs,lowEQ,highEQ,compEnabled,compThreshold,compRatio,reverb,delayWet,delayMs});
  }
  const preparedPitch=window.preparePitchRestore(loaded,s.tracks);
  const preparedClean=window.prepareCleanRestore(s.tracks);
  const preparedSplit=window.prepareSplitRestore(loaded,s.tracks);
  const preparedCrossfade=window.prepareCrossfadeRestore(s.tracks);
  const preparedCopies=window.prepareCopyRestore(loaded,s.tracks,preparedSplit);
  const preparedGrid=window.validateGridRestore(s);
  window.validateRestoredCrossfades(loaded,preparedSplit,preparedCrossfade);
  window.validateCopyCrossfadeRestore(loaded,preparedSplit,preparedCopies,preparedCrossfade);
  stop();
  $("masterGain").value=masterGain;$("masterValue").textContent=masterGain+"%";
  $("recordTrack").value=String(recordTrack);$("recordFormat").value=recordFormat;
  $("bpm").value=bpm;$("metronomeOn").checked=metronomeOn;
  window.restoreGrid(preparedGrid);
  $("limiterOn").checked=limiterOn;$("limiterCeiling").value=limiterCeiling;$("limiterCeilingVal").textContent=limiterCeiling+" dBFS";
  $("normalizeOn").checked=normalizeOn;$("normalizeTarget").value=normalizeTarget;$("normalizeVal").textContent=normalizeTarget+" dBFS";
  $("loudnessOn").checked=loudnessOn;$("loudnessResults").textContent="Análisis listo para ejecutar en la próxima exportación; no modifica el audio.";
  $("wavSampleRate").value=String(wavSampleRate);
  $("wavBits").value=String(wavBits);$("stemBits").value=String(stemBits);$("stemSampleRate").value=String(stemSampleRate);$("ditherOn").checked=ditherOn;
  $("ditherOn").disabled=wavBits!==16;
  $("auditOn").checked=auditOn;window.montanaLastAudit=null;$("downloadAudit").disabled=true;
  $("auditStatus").textContent="La auditoría requiere exportar de nuevo el WAV; ninguna cifra anterior se reutiliza.";
  loaded.forEach((t,i)=>{
   tracks[i]=t.decoded;originalFiles[i]=t.source;
   window.resetVocalPreflight?.(i);
   // Reset file inputs so the restored bytes are authoritative on next save.
   $("file"+i).value="";
   $("vol"+i).value=t.volume;$("val"+i).textContent=t.volume+"%";
   $("pan"+i).value=t.pan;$("panval"+i).textContent=t.pan===0?"Centro":(t.pan<0?"Izq ":"Der ")+Math.abs(t.pan);
   $("lowEQ"+i).value=t.lowEQ;$("lowVal"+i).textContent=t.lowEQ+" dB";
   $("highEQ"+i).value=t.highEQ;$("highVal"+i).textContent=t.highEQ+" dB";
   $("compEnable"+i).checked=t.compEnabled;
   $("compThreshold"+i).value=t.compThreshold;$("compThresholdVal"+i).textContent=t.compThreshold+" dB";
   $("compRatio"+i).value=t.compRatio;$("compRatioVal"+i).textContent=t.compRatio+":1";
   for(const k of ["reverb","delayWet","delayMs"]){$(k+i).value=t[k];$(k+"Val"+i).textContent=t[k]+(k==="delayMs"?" ms":"%");}
   $("offset"+i).value=t.offset;$("trimStart"+i).value=t.trimStart;$("trimEnd"+i).value=t.trimEnd;$("repeat"+i).value=t.repeat;$("fadeIn"+i).value=t.fadeIn;$("fadeOut"+i).value=t.fadeOut;
   if(i>0){$("alignMs"+i).value=t.alignMs;$("alignVal"+i).textContent=t.alignMs+" ms"}
   $("mute"+i).checked=t.mute;$("solo"+i).checked=t.solo;
   $("label"+i).textContent=t.source?t.source.name+" — "+t.decoded.duration.toFixed(1)+" s":"Sin audio";
  });
  window.commitPitchRestore(preparedPitch);
  window.commitCleanRestore(preparedClean);
  window.commitSplitRestore(preparedSplit);
  window.commitCrossfadeRestore(preparedCrossfade);
  window.commitCopyRestore(preparedCopies);
  window.resetEditHistory?.();
  window.updateSourceDownload?.();
  report("Sesión restaurada con "+loaded.filter(t=>t.decoded).length+" pista(s) de audio.");

}
window.restoreMixerSnapshot=restoreMixerSnapshot;
$("sessionFile").addEventListener("change",async(e)=>{
 const btn=$("loadSession");btn.disabled=true;
 try{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>112e6)throw Error("Archivo demasiado grande.");
  const s=JSON.parse(await file.text());
  await restoreMixerSnapshot(s); }catch(err){report("No se restauró la sesión: "+err.message)}finally{btn.disabled=false;e.target.value=""}
});
