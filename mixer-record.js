"use strict";
// Local microphone overdubs: no automatic latency compensation or professional
// synchronization claim. Each completed recording remains downloadable raw.
// Unexpected capture errors leave an existing channel's original intact.
let recording=null;
function recordingSupported(){return !!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)}
function updateSourceDownload(){
 const i=Number($("recordTrack").value);
 $("downloadSource").disabled=!originalFiles[i]||!!recording;
}
window.updateSourceDownload=updateSourceDownload;
$("recordTrack").addEventListener("change",updateSourceDownload);
$("downloadSource").addEventListener("click",()=>{
 const i=Number($("recordTrack").value),file=originalFiles[i];
 if(!file){report("No hay audio original en este canal.");return}
 const url=URL.createObjectURL(file),a=document.createElement("a");
 a.href=url;a.download=file.name||"montana-fuente-canal-"+(i+1);
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 report("Descarga solicitada del audio original del canal "+(i+1)+". Guarda también la sesión completa.");
});
$("recordStart").addEventListener("click",async()=>{
 if(recording)return;
 if(!recordingSupported()){report("Grabación no disponible: requiere HTTPS o localhost y un navegador compatible.");return}
 const i=Number($("recordTrack").value);
 try{window.validateMetronome()}catch(err){report(err.message);return}
 if(tracks[i]&&!confirm("El canal seleccionado ya tiene audio. ¿Reemplazarlo cuando termine la nueva toma?"))return;
 let guides;
 try{
  guides=tracks.map((buffer,index)=>buffer&&index!==i?
   {index,buffer:window.getMixBuffer(index),clip:(window.validateFades(index),region(index,buffer))}:null).filter(Boolean);
 }catch(err){report("Corrige las pistas de acompañamiento antes de grabar: "+err.message);return}
 let stream=null,recorder=null,started=false;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(x=>MediaRecorder.isTypeSupported(x));
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  const chunks=[],state={recorder,stream,index:i,failed:false};
  recording=state;updateSourceDownload();
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onerror=()=>{
   state.failed=true;
   report("Error en la grabación. Se conservará la pista anterior.");
   try{if(recorder.state==="recording")recorder.stop()}catch(e){}
  };
  recorder.onstop=async()=>{
   // Keep the start button disabled until saving/decoding is done.
   stop();
   stream.getTracks().forEach(t=>t.stop());
   $("recordStop").disabled=true;
   try{
    if(state.failed)throw Error("Captura fallida; toma descartada y pista anterior intacta");
    const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
    if(!blob.size)throw Error("No se capturó audio");
    if(blob.size>50e6)throw Error("La toma supera 50 MB");
    const bytes=await blob.arrayBuffer(),decoded=await audio().decodeAudioData(bytes.slice(0));
    if(decoded.duration>300)throw Error("La toma supera cinco minutos");
    const ext=blob.type.includes("mp4")?"m4a":"webm";
    const file=new File([blob],"toma-canal-"+(i+1)+"."+ext,{type:blob.type});
    // Atomic replacement happens only after a full successful decode.
    tracks[i]=decoded;originalFiles[i]=file;
    window.resetPitch?.(i);window.resetClean?.(i);
    $("file"+i).value="";$("trimStart"+i).value=0;$("trimEnd"+i).value=0;$("fadeIn"+i).value=0;$("fadeOut"+i).value=0;
    $("offset"+i).value=0;
    if(i>0){$("alignMs"+i).value=0;$("alignVal"+i).textContent="0 ms"}
    $("label"+i).textContent=file.name+" — "+decoded.duration.toFixed(1)+" s";
    window.resetEditHistory?.();
    report("Toma guardada en canal "+(i+1)+". Usa «Rescatar fuente del canal» para descargar el audio original; guarda también tu sesión.");
   }catch(err){report("No se reemplazó la pista: "+err.message+". Tu audio anterior sigue intacto.");}
   finally{
    recording=null;$("recordStart").disabled=false;updateSourceDownload();
   }
  };
  // Begin recording just before starting the guide. Offset isn't calibrated.
  recorder.start(1000);started=true;
  $("recordStart").disabled=true;$("recordStop").disabled=false;
  if(guides.length){
   await audio().resume();stop();
   const at=audio().currentTime+.08,m=audio().createGain();
   m.gain.value=Number($("masterGain").value)/100;
   window.attachMasterMeter(audio(),m).connect(audio().destination);activeOutputs.push(m);
   for(const guide of guides){
    const index=guide.index,src=audio().createBufferSource(),g=audio().createGain(),p=audio().createStereoPanner();
    src.buffer=guide.buffer;g.gain.value=gain(index);p.pan.value=pan(index);
    window.connectFades(audio(),src,g,index,guide.clip,at+guide.clip.offset);const eq=addEq(audio(),g,index),comp=addCompressor(audio(),eq,index),fx=addSpace(audio(),comp,index);
    window.attachTrackMeter(audio(),fx,index).connect(p).connect(m);
    src.start(at+guide.clip.offset,guide.clip.start,guide.clip.duration);players.push(src);
   }
   if($("metronomeOn").checked)window.startMetronome(audio(),at);
  }else if($("metronomeOn").checked){
   await audio().resume();window.startMetronome(audio(),audio().currentTime+.08);
  }
  report("Grabando canal "+(i+1)+". Usa audífonos. Si hay retraso, alinea manualmente la voz en ms al terminar.");
 }catch(err){
  if(recording&&recorder===recording.recorder){
   recording.failed=true;
   try{if(recorder.state!=="inactive")recorder.stop()}catch(e){}
  }else{
   stream?.getTracks().forEach(t=>t.stop());
   $("recordStart").disabled=false;recording=null;updateSourceDownload();
  }
  if(!started)stream?.getTracks().forEach(t=>t.stop());
  report("Error al iniciar la grabación: "+err.message+". La pista anterior se conserva.");
 }
});
$("recordStop").addEventListener("click",()=>{
 if(recording?.recorder?.state==="recording"){
  $("recordStop").disabled=true;
  recording.recorder.stop();
 }
});
window.addEventListener("beforeunload",e=>{
 if(recording){e.preventDefault();e.returnValue="";}
});
window.addEventListener("pagehide",()=>{
 if(recording){
  recording.failed=true;
  recording.stream.getTracks().forEach(t=>t.stop());
  try{if(recording.recorder.state!=="inactive")recording.recorder.stop()}catch(e){}
 }
});
updateSourceDownload();
