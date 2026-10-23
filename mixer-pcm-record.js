/* Montana Music Production LLC — browser-local uncompressed mono PCM24 capture.
 * Captures the first microphone channel using AudioWorklet (silent output).
 * WAV avoids an additional lossy MediaRecorder codec, but browser capture can
 * resample or process hardware input: NOT bit-perfect/latency calibrated.
 * No audio is uploaded. MediaRecorder remains an explicit compatibility mode.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPcmRecord=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_BYTES=50e6,MAX_SECONDS=300;
 function supported(){
  return typeof AudioContext!=="undefined"&&typeof AudioWorkletNode!=="undefined"&&
   typeof isSecureContext!=="undefined"&&isSecureContext;
 }
 function encodeMono(chunks,rate){
  if(!Array.isArray(chunks)||!Number.isInteger(rate)||rate<8000||rate>192000)
   throw Error("Grabación PCM inválida");
  let frames=0;
  for(const chunk of chunks){
   if(!(chunk instanceof Float32Array))throw Error("Fragmento PCM inválido");
   frames+=chunk.length;
   if(frames>rate*MAX_SECONDS||44+frames*3>MAX_BYTES)
    throw Error("La toma PCM supera cinco minutos o 50 MB");
  }
  if(frames<rate*.08)throw Error("La toma PCM es demasiado corta");
  const bytes=new ArrayBuffer(44+frames*3),data=new DataView(bytes);
  const fourcc=(at,s)=>{for(let i=0;i<s.length;i++)data.setUint8(at+i,s.charCodeAt(i));};
  fourcc(0,"RIFF");data.setUint32(4,bytes.byteLength-8,true);
  fourcc(8,"WAVE");fourcc(12,"fmt ");data.setUint32(16,16,true);
  data.setUint16(20,1,true);data.setUint16(22,1,true);
  data.setUint32(24,rate,true);data.setUint32(28,rate*3,true);
  data.setUint16(32,3,true);data.setUint16(34,24,true);
  fourcc(36,"data");data.setUint32(40,frames*3,true);
  let offset=44;
  for(const chunk of chunks)for(const sample of chunk){
   if(!Number.isFinite(sample))throw Error("Muestra PCM no finita");
   const v=Math.max(-1,Math.min(1,sample));
   const q=Math.round(v*(v<0?8388608:8388607));
   data.setUint8(offset,q&255);data.setUint8(offset+1,(q>>8)&255);
   data.setUint8(offset+2,(q>>16)&255);offset+=3;
  }
  return new Blob([bytes],{type:"audio/wav"});
 }
 async function create(stream){
  if(!supported()||!stream||typeof stream.getAudioTracks!=="function"||
     !stream.getAudioTracks().length)
   throw Error("La grabación WAV requiere Chrome/Edge, AudioWorklet y HTTPS/localhost");
  let context=null,url=null,source=null,node=null;
  try{
   context=new AudioContext({latencyHint:"interactive"});
   await context.resume();
   const code=[
    "class MontanaPcmCapture extends AudioWorkletProcessor {",
    " constructor(){super();this.buf=new Float32Array(2048);this.used=0;this.finished=false;",
    "  this.port.onmessage=e=>{if(e.data==='stop'&&!this.finished){",
    "    this.flush();this.finished=true;this.port.postMessage({type:'done'});",
    "  }};",
    " }",
    " flush(){if(this.used){const block=this.buf.slice(0,this.used);",
    "  this.port.postMessage({type:'pcm',data:block},[block.buffer]);this.used=0;}}",
    " process(inputs,outputs){",
    "  if(!this.finished){const s=inputs[0]&&inputs[0][0];",
    "   if(s){let pos=0;while(pos<s.length){",
    "    const count=Math.min(this.buf.length-this.used,s.length-pos);",
    "    this.buf.set(s.subarray(pos,pos+count),this.used);",
    "    this.used+=count;pos+=count;if(this.used===this.buf.length)this.flush();",
    "   }}",
    "  }",
    "  for(const o of outputs)for(const c of o)c.fill(0);",
    "  return !this.finished;",
    " }",
    "}",
    "registerProcessor('montana-pcm-capture',MontanaPcmCapture);"
   ].join("\n");
   url=URL.createObjectURL(new Blob([code],{type:"text/javascript"}));
   await context.audioWorklet.addModule(url);
   source=context.createMediaStreamSource(stream);
   node=new AudioWorkletNode(context,"montana-pcm-capture",{
    numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]
   });
  }catch(e){
   try{source?.disconnect();node?.disconnect();}catch(_){}
   if(context&&context.state!=="closed")await context.close().catch(()=>{});
   if(url)URL.revokeObjectURL(url);
   throw e;
  }
  const rate=context.sampleRate,framesLimit=Math.min(
   Math.floor(rate*MAX_SECONDS),Math.floor((MAX_BYTES-44)/3));
  const chunks=[];let frames=0,failure=null,doneResolve=null;
  const done=new Promise(resolve=>{doneResolve=resolve;});
  let closed=false;
  const recorder={state:"inactive",mimeType:"audio/wav",
   ondataavailable:null,onerror:null,onstop:null,
   start(){
    if(this.state!=="inactive"||closed)throw Error("Captura PCM ya iniciada");
    this.state="recording";
    source.connect(node);node.connect(context.destination); // silent worklet
   },
   stop(){
    if(this.state!=="recording")return;
    this.state="inactive";
    node.port.postMessage("stop");
    (async()=>{
     try{
      await Promise.race([
       done,new Promise((_,reject)=>setTimeout(()=>reject(Error("El capturador PCM no respondió")),3000))
      ]);
      if(failure)throw failure;
      const blob=encodeMono(chunks,rate);
      this.ondataavailable?.({data:blob});
     }catch(e){this.onerror?.({error:e});}
     finally{
      try{source.disconnect();node.disconnect();node.port.close()}catch(_){}
      if(context.state!=="closed")await context.close().catch(()=>{});
      if(url)URL.revokeObjectURL(url);
      closed=true;
      this.onstop?.();
     }
    })();
   }
  };
  node.port.onmessage=e=>{
   const m=e.data;
   if(m?.type==="pcm"&&m.data instanceof Float32Array){
    frames+=m.data.length;
    if(frames>framesLimit){
     failure=Error("La toma PCM supera cinco minutos o 50 MB");
     if(recorder.state==="recording")recorder.stop();
    }else chunks.push(m.data);
   }else if(m?.type==="done")doneResolve();
  };
  return recorder;
 }
 return {supported,create,encodeMono};
});
