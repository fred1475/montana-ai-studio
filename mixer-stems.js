"use strict";
/* Montana Music Production — isolated stems and dependency-free ZIP archive.
 * Every file includes timeline leading silence, trim, input gain, track gain, timeline automation, pan, EQ,
 * compressor, reverb, delay, automated stereo panorama and experimental selected vocal DSP.
 * Mute/solo, master gain, and master limiter deliberately do NOT print into
 * stems; they are isolated sources for later mixing.
 * Local ZIP uses STORE (no compression) and CRC32, portable to any OS.
 * Streaming CRC32 avoids full-size typed-array copies of each WAV stem.
 */
(function(){
 const maxArchive=145*1024*1024; // avoid exceeding browser RAM/file limits
 function sampleRate(){const rate=Number($("stemSampleRate").value);if(rate!==44100&&rate!==48000)throw Error("Frecuencia de stems inválida");return rate}
 function formatBits(){const bits=Number($("stemBits").value);if(bits!==16&&bits!==24)throw Error("Profundidad de stems inválida");return bits}
 function regionPlan(rate){
  if(!tracks.some(Boolean))throw Error("Primero importa audio");
  const segments=tracks.map((b,i)=>b?window.getTrackSegments(i,b):[]);
  const end=Math.max(0,...segments.flatMap((items,i)=>items.map(clip=>clip.offset+clip.duration+effectTail(i))));
  const frames=Math.ceil(end*rate);
  if(!frames||!Number.isSafeInteger(frames))throw Error("Duración de audio inválida");
  return {segments,frames,rate};
 }
 function fileName(i){return String(i+1).padStart(2,"0")+"-"+labels[i].normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-")+".wav"}
 async function renderStem(i,plan,bits){
  const buffer=tracks[i];
  if(!buffer)throw Error("El canal no tiene audio");
  const srcBuffer=window.getMixBuffer(i);
  const ctx=new OfflineAudioContext(2,plan.frames,plan.rate);
  const vol=ctx.createGain(),panNode=ctx.createStereoPanner(),eqIn=ctx.createGain();
  const automated=MontanaVolumeAutomation.attach(ctx,eqIn,window.volumeAutomationState(i),0);
  vol.connect(automated);
  const pre=MontanaInputTrim.attach(ctx,vol,Number($("inputTrim"+i).value));
  vol.gain.value=Number($("vol"+i).value)/100;
  MontanaPanAutomation.schedule(panNode,window.panAutomationState(i),pan(i),0);
  addSpace(ctx,addCompressor(ctx,addEq(ctx,eqIn,i),i),i).connect(panNode).connect(ctx.destination);
  const crossfadePlan=window.prepareCrossfadePlan(i,plan.segments[i]);
  for(const [clipIndex,clip] of plan.segments[i].entries()){
   const src=ctx.createBufferSource();src.buffer=srcBuffer;
   if(clip.repeat>1){src.loop=true;src.loopStart=clip.start;src.loopEnd=clip.start+clip.singleDuration}
   window.connectClipCrossfade(ctx,src,pre,i,clip,clip.offset,clipIndex,crossfadePlan);
   src.start(clip.offset,clip.start,clip.duration);
  }
  const rendered=await ctx.startRendering();
  return MontanaWavExport.encode(rendered.getChannelData(0),rendered.getChannelData(1),plan.rate,{bits,dither:false});
 }
 // Process WAV Blob chunks without copying a complete WAV into JS memory.
 async function crc32Data(source){
  let crc=0xffffffff;
  const step=bytes=>{
   for(let i=0;i<bytes.length;i++){
    crc^=bytes[i];
    for(let k=0;k<8;k++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;
   }
  };
  if(source instanceof Blob){
   const reader=source.stream().getReader();
   try{
    while(true){
     const {done,value}=await reader.read();
     if(done)break;
     step(value);
    }
   }finally{reader.releaseLock()}
  }else if(source instanceof Uint8Array)step(source);
  else throw Error("Datos ZIP inválidos");
  return (crc^0xffffffff)>>>0;
 }
 const enc=new TextEncoder();
 async function makeZip(files){
  const parts=[],central=[];let offset=0;
  const write=(view,pos,val)=>view.setUint32(pos,val>>>0,true);
  const write16=(view,pos,val)=>view.setUint16(pos,val,true);
  for(const file of files){
   const filename=enc.encode(file.name),bytes=file.bytes;
   const byteLength=bytes instanceof Blob?bytes.size:bytes?.length;
   if(filename.length>255||!Number.isSafeInteger(byteLength)||byteLength>0xffffffff)throw Error("Nombre o archivo inválido");
   const crc=await crc32Data(bytes);
   const local=new Uint8Array(30+filename.length),l=new DataView(local.buffer);
   write(l,0,0x04034b50);write16(l,4,20);write16(l,6,0x0800);
   write16(l,8,0);write16(l,10,0);write16(l,12,0);
   write(l,14,crc);write(l,18,byteLength);write(l,22,byteLength);
   write16(l,26,filename.length);write16(l,28,0);local.set(filename,30);
   parts.push(local,bytes);
   const dir=new Uint8Array(46+filename.length),d=new DataView(dir.buffer);
   write(d,0,0x02014b50);write16(d,4,20);write16(d,6,20);
   write16(d,8,0x0800);write16(d,10,0);write16(d,12,0);
   write16(d,14,0);write(d,16,crc);write(d,20,byteLength);
   write(d,24,byteLength);write16(d,28,filename.length);
   write16(d,30,0);write16(d,32,0);write16(d,34,0);
   write16(d,36,0);write(d,38,0);write(d,42,offset);
   dir.set(filename,46);central.push(dir);
   offset+=local.length+byteLength;
  }
  const centralLength=central.reduce((v,a)=>v+a.length,0);
  const end=new Uint8Array(22),e=new DataView(end.buffer);
  write(e,0,0x06054b50);write16(e,4,0);write16(e,6,0);
  write16(e,8,files.length);write16(e,10,files.length);
  write(e,12,centralLength);write(e,16,offset);write16(e,20,0);
  return new Blob([...parts,...central,end],{type:"application/zip"});
 }
 function download(blob,name){
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;document.body.append(anchor);
  anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 $("stemTrack").addEventListener("change",()=>{});
 $("exportStem").addEventListener("click",async()=>{
  const button=$("exportStem");button.disabled=true;
  try{
   const i=Number($("stemTrack").value),bits=formatBits(),plan=regionPlan(sampleRate());
   if(!tracks[i])throw Error("Selecciona un canal con audio");
   // Reject unsafe sizes before processed vocal buffers and Web Audio allocation.
   MontanaExportPreflight.estimate({frames:plan.frames,rate:plan.rate,bits,kind:"stem"});
   report("Renderizando "+labels[i]+" como WAV independiente...");
   const blob=await renderStem(i,plan,bits);download(blob,fileName(i));
   report("Stem WAV PCM"+bits+" a "+(plan.rate/1000).toFixed(1)+" kHz descargado: "+labels[i]+". Conserva la posición y efectos del canal. No aplica el volumen/limitador maestro ni el mute/solo.");
  }catch(e){report("No se pudo exportar stem: "+e.message)}
  finally{button.disabled=false}
 });
 $("exportStems").addEventListener("click",async()=>{
  const button=$("exportStems");button.disabled=true;
  try{
   const bits=formatBits(),plan=regionPlan(sampleRate()),indices=tracks.map((b,i)=>b?i:-1).filter(i=>i>=0);
   // Budget check happens before the first costly offline render.
   MontanaExportPreflight.estimate({frames:plan.frames,rate:plan.rate,bits,kind:"stems",stemCount:indices.length});
   const files=[];
   for(const i of indices){
    report("Exportando stem "+files.length+"/"+indices.length+": "+labels[i]+"...");
    const blob=await renderStem(i,plan,bits);
    files.push({name:fileName(i),bytes:blob});
   }
   const note=[
    "Montana Music Production — stems individuales, WAV PCM"+bits+", "+(plan.rate/1000).toFixed(1)+" kHz, estéreo.",
    "Todos los archivos están alineados desde 0:00 y tienen idéntica duración.",
    "Incluyen: ganancia de entrada, volumen del canal y automatización de canción, panorama, ecualización, compresor, reverb, delay y corrección/limpieza vocal activadas.",
    "No incluyen mute/solo, volumen maestro, limitador maestro ni metrónomo.",
    "Los archivos originales siguen intactos; las colas de efectos conservan su duración.",
    "No son masters terminados. Revise clipping y realice mezcla/masterización de forma independiente."
   ].join("\n")+"\n";
   files.push({name:"LEEME-STEMS.txt",bytes:enc.encode(note)});
   const zip=await makeZip(files);
   if(zip.size>maxArchive)throw Error("El ZIP excede el límite de seguridad");
   download(zip,"montana-ai-studio-stems.zip");
   report("ZIP de "+indices.length+" stems PCM"+bits+" a "+(plan.rate/1000).toFixed(1)+" kHz creado. Archivos alineados desde 0:00, sin master ni mute/solo.");
  }catch(e){report("No se pudieron exportar los stems: "+e.message)}
  finally{button.disabled=false}
 });
})();
