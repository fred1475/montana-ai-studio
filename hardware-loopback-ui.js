"use strict";
/* Browser-audio loopback harness. User confirmation REQUIRED.
 * The same AudioContext timeline schedules the output probe and timestamps
 * recorded PCM in AudioWorklet currentFrame. No automatic latency correction.
 */
(function(){
 const $=id=>document.getElementById(id),engine=window.MontanaLoopback;
 const status=$("loopStatus"),button=$("measureLoop");
 let busy=false,lastReport=null;
 const reportButton=$("downloadLoopReport");
 const say=s=>{status.textContent=s};
 const ready=()=>button.disabled=busy||!$("confirmSafe").checked;
 $("confirmSafe").addEventListener("change",ready);
 async function scan(){
  const audio=await navigator.mediaDevices?.enumerateDevices?.();
  if(!audio)throw Error("El navegador requiere HTTPS/localhost para listar entradas");
  const inputs=audio.filter(x=>x.kind==="audioinput"),menu=$("loopInput"),previous=menu.value;
  menu.replaceChildren(new Option("Entrada predeterminada",""));
  inputs.forEach((x,i)=>menu.add(new Option(x.label||"Entrada "+(i+1),x.deviceId)));
  if([...menu.options].some(x=>x.value===previous))menu.value=previous;
  say(inputs.length+" entrada(s) detectadas. La salida usada será la predeterminada del sistema.");
 }
 $("scanLoop").addEventListener("click",()=>scan().catch(e=>say("No se pueden listar entradas: "+e.message)));
 button.addEventListener("click",async()=>{
  if(busy||!$("confirmSafe").checked)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode){
   say("Necesitas Chrome/Edge compatible, localhost o HTTPS y permiso del micrófono.");return;
  }
  busy=true;ready();lastReport=null;reportButton.disabled=true;let stream=null,ctx=null,node=null,src=null,output=null,url=null;
  const chunks=[];
  try{
   const selected=$("loopInput").value;
   say("Solicitando entrada y preparando prueba de loopback segura...");
   stream=await navigator.mediaDevices.getUserMedia({audio:{
    ...(selected?{deviceId:{exact:selected}}:{}),channelCount:{ideal:1},
    echoCancellation:false,noiseSuppression:false,autoGainControl:false
   },video:false});
   ctx=new AudioContext({latencyHint:"interactive"});
   await ctx.resume();
   const processor=[
    "class MontanaLoopCapture extends AudioWorkletProcessor {",
    " process(inputs,outputs){",
    "  const source=inputs[0]&&inputs[0][0];",
    "  if(source){const samples=new Float32Array(source);",
    "   this.port.postMessage({frame:currentFrame,data:samples},[samples.buffer]);}",
    "  for(const o of outputs)for(const ch of o)ch.fill(0);",
    "  return true;",
    " }",
    "}",
    "registerProcessor('montana-loop-capture',MontanaLoopCapture);"
   ].join("\n");
   url=URL.createObjectURL(new Blob([processor],{type:"text/javascript"}));
   await ctx.audioWorklet.addModule(url);
   src=ctx.createMediaStreamSource(stream);
   node=new AudioWorkletNode(ctx,"montana-loop-capture",{
    numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]
   });
   node.port.onmessage=e=>{
    if(e.data?.data instanceof Float32Array&&Number.isInteger(e.data.frame))
     chunks.push(e.data);
   };
   src.connect(node);node.connect(ctx.destination); // AudioWorklet produces silence
   const probe=engine.createProbe(ctx.sampleRate),
    buffer=ctx.createBuffer(1,probe.length,ctx.sampleRate);
   buffer.copyToChannel(probe,0);
   output=ctx.createBufferSource();output.buffer=buffer;
   output.connect(ctx.destination);
   const startAt=ctx.currentTime+.35,startFrame=Math.round(startAt*ctx.sampleRate);
   say("Reproduciendo pulso breve por la salida del sistema y capturando retorno...");
   output.start(startAt);
   await new Promise(resolve=>setTimeout(resolve,2850));
   if(!chunks.length)throw Error("No llegó ningún bloque PCM desde la entrada");
   const firstFrame=chunks[0].frame;
   const finalFrame=Math.max(...chunks.map(c=>c.frame+c.data.length));
   if(finalFrame-firstFrame>ctx.sampleRate*4)throw Error("Captura excesiva");
   const captured=new Float32Array(finalFrame-firstFrame);
   for(const c of chunks)captured.set(c.data,c.frame-firstFrame);
   const estimated=engine.estimate(captured,probe,ctx.sampleRate,startFrame,firstFrame,750);
   lastReport={format:"montana-loopback-estimate",version:1,createdAt:new Date().toISOString(),
    measurement:estimated,inputName:stream.getAudioTracks()[0]?.label||"entrada desconocida",
    output:"salida predeterminada del sistema",note:"Solo estimación en bucle físico; sin compensación automática ni validación certificada."};
   reportButton.disabled=false;
   $("loopResults").textContent="Latencia de ida y vuelta estimada: "+estimated.estimatedRoundTripMs.toFixed(2)+" ms"+
    "\nCoincidencia con señal: "+estimated.matchScore.toFixed(3)+
    "\nFrecuencia: "+estimated.sourceRate+" Hz"+
    "\nPico de retorno: "+estimated.inputPeakDbfs.toFixed(1)+" dBFS"+
    "\n\n"+estimated.caveat+
    "\n\nEsta prueba no modifica la alineación del mezclador. Repite la medición y escucha una toma con el equipo real antes de ajustar tiempos.";
   say("Medición de loopback completada; recuerda que es una estimación sin certificación.");
  }catch(err){
   $("loopResults").textContent="No se obtuvo una latencia fiable. No se aplicó ninguna compensación.";
   say("Prueba no concluyente: "+(err?.message||String(err)));
  }finally{
   try{output?.stop()}catch(e){}
   try{output?.disconnect();src?.disconnect();node?.disconnect()}catch(e){}
   stream?.getTracks().forEach(t=>t.stop());
   if(ctx&&ctx.state!=="closed")await ctx.close().catch(()=>{});
   if(url)URL.revokeObjectURL(url);
   busy=false;ready();
  }
 });
 reportButton.addEventListener("click",()=>{
  if(!lastReport)return;
  const bytes=JSON.stringify(lastReport,null,2)+"\n",blob=new Blob([bytes],{type:"application/json"}),
   url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="montana-latencia-loopback-estimada.json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 });
 scan().catch(()=>{});
 ready();
})();