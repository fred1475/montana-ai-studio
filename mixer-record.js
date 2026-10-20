"use strict";
// Microphone take recording with local MediaRecorder. This is an overdub guide,
// not a latency-compensated or sample-accurate multitrack recorder.
let recording=null;
function recordingSupported(){return !!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)}
$("recordStart").addEventListener("click",async()=>{
 if(recording)return;
 if(!recordingSupported()){report("Grabación no disponible: requiere HTTPS o localhost y un navegador compatible.");return}
 const i=Number($("recordTrack").value);
 if(tracks[i]&&!confirm("El canal seleccionado ya tiene audio. ¿Reemplazarlo cuando termine la nueva toma?"))return;
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(x=>MediaRecorder.isTypeSupported(x));
  const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  const chunks=[];recording={recorder,stream,index:i};
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>report("Error en la grabación del micrófono.");
  recorder.onstop=async()=>{
   stop(); // Also stop reference playback.
   const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
   stream.getTracks().forEach(t=>t.stop());
   $("recordStart").disabled=false;$("recordStop").disabled=true;
   recording=null;
   if(!blob.size){report("No se capturó audio.");return}
   try{
    if(blob.size>50e6)throw Error("Toma mayor de 50 MB");
    const raw=await blob.arrayBuffer(),decoded=await audio().decodeAudioData(raw.slice(0));
    if(decoded.duration>300)throw Error("La toma supera cinco minutos.");
    const ext=blob.type.includes("mp4")?"m4a":"webm";
    const f=new File([blob],"toma-canal-"+(i+1)+"."+ext,{type:blob.type});
    tracks[i]=decoded;originalFiles[i]=f;$("file"+i).value="";
    $("label"+i).textContent=f.name+" — "+decoded.duration.toFixed(1)+" s";
    report("Toma guardada en canal "+(i+1)+". Descarga el respaldo de sesión para conservarla.");
   }catch(err){report("No se pudo decodificar la grabación: "+err.message+". Intenta importar audio WAV.");}
  };
  recorder.start(1000);
  $("recordStart").disabled=true;$("recordStop").disabled=false;
  // Guide/reference is played but recording is not latency compensated.
  if(tracks.some((buf,index)=>index!==i&&buf)){await audio().resume();stop();const at=audio().currentTime+.08;tracks.forEach((buf,index)=>{if(!buf||index===i)return;const src=audio().createBufferSource(),g=audio().createGain(),p=audio().createStereoPanner();src.buffer=buf;g.gain.value=gain(index);p.pan.value=pan(index);src.connect(g).connect(p).connect(audio().destination);src.start(at);players.push(src)});}
  report("Grabando canal "+(i+1)+". Usa audífonos para evitar filtración del instrumental. Esta versión NO corrige la latencia automáticamente.");
 }catch(err){
  stream?.getTracks().forEach(t=>t.stop());recording=null;$("recordStart").disabled=false;$("recordStop").disabled=true;report("No se inició la grabación: "+err.message)
 }
});
$("recordStop").addEventListener("click",()=>{if(recording?.recorder?.state==="recording")recording.recorder.stop()});
window.addEventListener("pagehide",()=>{if(recording){recording.stream.getTracks().forEach(t=>t.stop());try{recording.recorder.stop()}catch(e){}}});
