"use strict";
/* Local-only input capture. Uses modern AudioWorklet; audible monitoring disabled.
 * Nothing is uploaded. These readings do NOT establish physical loopback latency.
 */
(function(){
 const $=id=>document.getElementById(id),engine=window.MontanaHardwareDSP;
 const status=$("testStatus"),outputs=$("testResults"),start=$("startTest"),stop=$("stopTest");
 const maxSeconds=30;
 let active=null,last=null,busy=false;
 const say=s=>{status.textContent=s};
 const reportError=e=>{say("Error en diagnóstico: "+(e?.message||String(e))+". Comprueba HTTPS/localhost, permisos y entrada de la interfaz.")};
 const save=(name,blob)=>{
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 function info(){
  const x=last?.analysis;if(!x)return;
  const fmt=v=>v===null?"silencio / no medible":v.toFixed(2)+" dBFS";
  const label=last.deviceLabel||"Dispositivo sin etiqueta";
  outputs.textContent="Entrada: "+label+
   "\nTasa real del contexto: "+last.rate+" Hz; duración: "+x.durationSeconds+" s"+
   "\nPico digital: "+fmt(x.measuredPeakDbfs)+
   "\nNivel promedio RMS: "+fmt(x.measuredRmsDbfs)+
   "\nPrimeros 2 s (fondo, RMS): "+fmt(x.firstSecondsNoiseRmsDbfs)+
   "\nResto (voz esperada, RMS): "+fmt(x.laterSpeechRmsDbfs)+
   "\nMuestras próximas a saturación (>=98% escala): "+x.nearFullScaleSamples+
   "\nDetalles técnicos: "+JSON.stringify(last.trackSettings,null,2)+
   "\n\n"+x.observations.join("\n")+
   "\n\nNota: esta medición digital NO calibra latencia de interfaz ni nivel acústico real.";
 }
 async function scan(){
  if(!navigator.mediaDevices?.enumerateDevices)throw Error("Este navegador no permite enumerar entradas");
  const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==="audioinput");
  const menu=$("inputDevice"),existing=menu.value;
  menu.replaceChildren(new Option("Entrada predeterminada del sistema",""));
  inputs.forEach((x,i)=>menu.add(new Option(x.label||"Entrada de audio "+(i+1),x.deviceId)));
  if([...menu.options].some(x=>x.value===existing))menu.value=existing;
  return inputs.length;
 }
 async function finish(){
  if(!active||active.finishing)return;
  const run=active;run.finishing=true;active=null;
  if(run.timer!==null)clearTimeout(run.timer);
  try{
   run.source.disconnect();run.node.disconnect();
   run.stream.getTracks().forEach(x=>x.stop());
   await run.context.close();
   run.workletURL&&URL.revokeObjectURL(run.workletURL);
   let total=0;for(const arr of run.chunks)total+=arr.length;
   if(total<Math.floor(run.rate*.5))throw Error("La entrada no produjo suficiente audio PCM");
   if(total>run.rate*maxSeconds)throw Error("El audio excedió los límites del diagnóstico");
   const pcm=new Float32Array(total);let p=0;
   for(const a of run.chunks){pcm.set(a,p);p+=a.length}
   const analysis=engine.inspect(pcm,run.rate,2);
   last={pcm,rate:run.rate,analysis,deviceLabel:run.deviceLabel,trackSettings:run.trackSettings};
   info();$("captureLevel").value=analysis.measuredPeakDbfs===null?0:Math.min(1,Math.pow(10,analysis.measuredPeakDbfs/20));
   $("downloadTestWav").disabled=false;$("downloadTestJson").disabled=false;
   say("Diagnóstico local terminado. Revisa los resultados y descarga los archivos si quieres conservarlos.");
  }catch(e){reportError(e)}
  finally{busy=false;start.disabled=false;stop.disabled=true;$("scanDevices").disabled=false}
 }
 async function record(){
  if(busy)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode){
   reportError(Error("Usa Chrome o Edge en HTTPS/localhost con compatibilidad AudioWorklet"));
   return;
  }
  busy=true;start.disabled=true;$("scanDevices").disabled=true;
  last=null;$("downloadTestWav").disabled=true;$("downloadTestJson").disabled=true;
  outputs.textContent="Preparando entrada...";say("Solicitando permiso de micrófono...");
  let stream=null,context=null,workletURL=null;
  try{
   const selected=$("inputDevice").value;
   stream=await navigator.mediaDevices.getUserMedia({audio:{
    ...(selected?{deviceId:{exact:selected}}:{}),channelCount:{ideal:1},
    echoCancellation:false,noiseSuppression:false,autoGainControl:false
   },video:false});
   const track=stream.getAudioTracks()[0];
   if(!track)throw Error("No se recibió una pista de audio");
   context=new AudioContext({latencyHint:"interactive"});
   await context.resume();
   // Generate an audio worklet locally; its output remains SILENT.
   const sourceCode=[
    "class MontanaMicCapture extends AudioWorkletProcessor {",
    " process(inputs,outputs) {",
    "  const input=inputs[0]&&inputs[0][0];",
    "  if(input){const a=new Float32Array(input);this.port.postMessage(a,[a.buffer]);}",
    "  for(const output of outputs)for(const channel of output)channel.fill(0);",
    "  return true;",
    " }",
    "}",
    "registerProcessor('montana-mic-capture',MontanaMicCapture);"
   ].join("\n");
   workletURL=URL.createObjectURL(new Blob([sourceCode],{type:"text/javascript"}));
   await context.audioWorklet.addModule(workletURL);
   const src=context.createMediaStreamSource(stream);
   const node=new AudioWorkletNode(context,"montana-mic-capture",{
    numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]
   });
   const run={stream,context,source:src,node,rate:context.sampleRate,
    deviceLabel:track.label,trackSettings:track.getSettings?track.getSettings():{},
    chunks:[],timer:null,finishing:false,workletURL};
   node.port.onmessage=e=>{if(active===run&&e.data instanceof Float32Array)run.chunks.push(e.data)};
   src.connect(node);node.connect(context.destination); // muted output from processor
   active=run;stop.disabled=false;
   // Test harness may shorten the capture; normal end-user duration is eight seconds.
   const override=window.__MONTANA_HW_TEST_DURATION__;
   const seconds=Number.isFinite(override)&&override>=1&&override<=maxSeconds?override:8;
   run.timer=setTimeout(()=>finish(),seconds*1000);
   say("Grabando muestra local ("+seconds+" s). Primeros 2 s en silencio; luego voz normal. Sin monitoreo del micrófono.");
   outputs.textContent="PCM en captura; el análisis se ejecutará al terminar.";
  }catch(e){
   if(active){await finish();return}
   stream?.getTracks().forEach(x=>x.stop());
   if(context&&context.state!=="closed")await context.close();
   if(workletURL)URL.revokeObjectURL(workletURL);
   busy=false;start.disabled=false;stop.disabled=true;$("scanDevices").disabled=false;
   reportError(e);
  }
 }
 $("scanDevices").addEventListener("click",async()=>{
  try{const n=await scan();say("Entradas de audio detectadas: "+n+". Si ves nombres genéricos, concede el permiso de micrófono al iniciar la prueba.")}
  catch(e){reportError(e)}
 });
 start.addEventListener("click",record);
 stop.addEventListener("click",finish);
 $("downloadTestWav").addEventListener("click",()=>{
  if(last)save("montana-interfaz-diagnostico-raw.wav",new Blob([engine.wavMono(last.pcm,last.rate)],{type:"audio/wav"}));
 });
 $("downloadTestJson").addEventListener("click",()=>{
  if(!last)return;
  const payload={
   format:"montana-hardware-diagnostic",version:1,generatedAt:new Date().toISOString(),
   deviceLabel:last.deviceLabel,reportedDeviceSettings:last.trackSettings,
   analysis:last.analysis,localOnly:true,
   limitation:"Prueba orientativa de amplitud digital; NO mide ni compensa latencia física."
  };
  save("montana-interfaz-diagnostico.json",new Blob([JSON.stringify(payload,null,2)+"\n"],{type:"application/json"}));
 });
 window.addEventListener("pagehide",()=>{
  if(active){
   if(active.timer!==null)clearTimeout(active.timer);
   active.stream.getTracks().forEach(t=>t.stop());
   active.context.close().catch(()=>{});
   active=null;
  }
 });
 scan().catch(()=>{});
})();