/* Montana Music Production LLC — offline A/B voice package, PCM16 and QA.
 * Exports only when explicitly requested, without network or mutating source.
 * Original-in-package is a decoded, re-encoded PCM16 listening reference;
 * the uploaded original file remains unchanged (may be another bit depth).
 */
(function(root,factory){
 const wav=typeof module!=="undefined"&&module.exports?require("./mixer-wav-export.js"):root.MontanaWavExport;
 const zip=typeof module!=="undefined"&&module.exports?require("./beat-archive.js"):root.MontanaBeatArchive;
 const api=factory(wav,zip);
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalAB=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(wav,archive){
 "use strict";
 if(!wav||!archive)throw Error("Exportadores del estudio no disponibles");
 const MAX_RATE=192000,MAX_SECONDS=15;
 function inspect(buffer,name){
  if(!buffer||![1,2].includes(buffer.numberOfChannels)||
     !Number.isInteger(buffer.length)||buffer.length<1||
     !Number.isInteger(buffer.sampleRate)||buffer.sampleRate<8000||
     buffer.sampleRate>MAX_RATE||buffer.length>buffer.sampleRate*MAX_SECONDS||
     typeof buffer.getChannelData!=="function")
   throw Error("Toma "+name+" no compatible con comparación A/B");
  const channels=[];
  for(let ch=0;ch<buffer.numberOfChannels;ch++){
   const data=buffer.getChannelData(ch);
   if(!(data instanceof Float32Array)||data.length!==buffer.length)
    throw Error("Canales A/B incompatibles");
   // Reject NaN/Infinity early before allocating any WAV output.
   for(let i=0;i<data.length;i++)if(!Number.isFinite(data[i]))
    throw Error("Muestra A/B inválida");
   channels.push(data);
  }
  return {rate:buffer.sampleRate,frames:buffer.length,channels};
 }
 async function makePackage(original,corrected,audit){
  const dry=inspect(original,"original"),wet=inspect(corrected,"afinada");
  if(dry.rate!==wet.rate||dry.frames!==wet.frames||
     dry.channels.length!==wet.channels.length)
   throw Error("La toma original y afinada tienen formato distinto");
  if(!audit||audit.schema!=="montana-vocal-audit"||audit.version!==1||
     audit.qa?.frames!==dry.frames||audit.qa?.sampleRate!==dry.rate||
     audit.qa?.channels!==dry.channels.length||audit.pitch?.enabled!==true)
   throw Error("El diagnóstico vocal no corresponde a las dos tomas");
  const metadata=JSON.stringify(audit,null,2)+"\n";
  if(metadata.length>12000)throw Error("Informe A/B demasiado grande");
  const encoder=new TextEncoder();
  const encodeChannels=data=>wav.encode(data.channels[0],data.channels[1]||data.channels[0],data.rate,{bits:16,dither:false});
  const a=encodeChannels(dry),b=encodeChannels(wet);
  const [dryBytes,wetBytes]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);
  const notes=[
   "MONTANA MUSIC PRODUCTION LLC - COMPARACION VOCAL A/B",
   "01-VOZ-ORIGINAL.wav: señal decodificada de origen, reexportada PCM16 estereo.",
   "02-VOZ-AFINADA.wav: resultado del procesador vocal antes de faders, efectos y master.",
   "03-DIAGNOSTICO.json: métricas PCM, ajustes y advertencias, SIN muestras de audio.",
   "Ambas versiones comparten tasa de muestreo, duración y referencias temporales.",
   "La grabación original subida nunca se reemplaza ni modifica.",
   "Estos WAV A/B NO representan por defecto la mezcla master ni garantizan formantes.",
   "La igualdad de volumen depende de que la opción de comparación RMS esté activada.",
   "Requiere evaluación auditiva humana; sin certificación perceptual ni EBU R128.",
   ""
  ].join("\n");
  const bytes=archive.makeZip([
   {name:"01-VOZ-ORIGINAL.wav",bytes:new Uint8Array(dryBytes)},
   {name:"02-VOZ-AFINADA.wav",bytes:new Uint8Array(wetBytes)},
   {name:"03-DIAGNOSTICO.json",bytes:encoder.encode(metadata)},
   {name:"LEEME.txt",bytes:encoder.encode(notes)}
  ]);
  return {bytes,rate:dry.rate,frames:dry.frames,
   sourceChannels:dry.channels.length,
   originalWavBytes:dryBytes.byteLength,processedWavBytes:wetBytes.byteLength};
 }
 return {MAX_SECONDS,inspect,makePackage};
});
