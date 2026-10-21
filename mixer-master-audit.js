/* Montana Music Production LLC — offline, provenance-linked WAV export preflight.
 * Measures exact PCM16/24 bytes of exported stereo WAV, not pre-quantized floats.
 * EBU R128 references are internal engineering checks, NOT a certification.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaMasterAudit=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const crcTable=new Uint32Array(256);
 for(let i=0;i<256;i++){
  let c=i;
  for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;
  crcTable[i]=c>>>0;
 }
 const db=v=>v>0?20*Math.log10(v):null;
 function crc32(bytes){
  let state=0xffffffff;
  for(let i=0;i<bytes.length;i++)state=crcTable[(state^bytes[i])&255]^(state>>>8);
  return (state^0xffffffff)>>>0;
 }
 async function analyzeWav(blob,measure,settings={}){
  if(!blob||typeof blob.arrayBuffer!=="function")throw Error("Se requiere un WAV exportado");
  if(typeof measure!=="function")throw Error("No hay motor de análisis");
  const maxAuditBytes=56*1024*1024;
  // Refuse oversized exports BEFORE reading the Blob into a contiguous buffer.
  // An oversized WAV may still be downloaded: only the optional audit is skipped.
  if(typeof blob.size==="number"&&(!Number.isSafeInteger(blob.size)||blob.size>maxAuditBytes))
   throw Error("La auditoría admite WAV de hasta 56 MiB; el archivo original aún puede descargarse");
  const buffer=await blob.arrayBuffer();
  if(buffer.byteLength<44||buffer.byteLength>maxAuditBytes)
   throw Error("La auditoría admite WAV de hasta 56 MiB; el archivo original aún puede descargarse");
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  function fourcc(pos){return String.fromCharCode(...bytes.subarray(pos,pos+4))}
  const bits=view.getUint16(34,true),bytesPerSample=bits/8,stride=bytesPerSample*2;
  if(fourcc(0)!=="RIFF"||fourcc(8)!=="WAVE"||fourcc(12)!=="fmt "||fourcc(36)!=="data"||
     view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||
     view.getUint16(22,true)!==2||(bits!==16&&bits!==24)||
     view.getUint16(32,true)!==stride)
   throw Error("La auditoría exige WAV PCM16/24 estéreo sin metadatos adicionales");
  const sampleRate=view.getUint32(24,true),length=view.getUint32(40,true);
  if(sampleRate<8000||sampleRate>192000||view.getUint32(28,true)!==sampleRate*stride||
     view.getUint32(4,true)!==bytes.length-8||length+44!==bytes.length||length%stride!==0)
   throw Error("Estructura o duración del WAV inválida");
  const frames=length/stride,left=new Float32Array(frames),right=new Float32Array(frames);
  const readSample=(offset)=>{
   if(bits===16)return view.getInt16(offset,true);
   const value=bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16);
   return value&0x800000?value-0x1000000:value;
  };
  const divisor=bits===16?32768:8388608;
  const maxPositive=bits===16?32767:8388607,minNegative=-divisor;
  let peak=0,clippedSamples=0,energy=0;
  let sumLeft=0,sumRight=0,powerLeft=0,powerRight=0,cross=0,monoEnergy=0;
  for(let i=0;i<frames;i++){
   const v0=readSample(44+i*stride),v1=readSample(44+i*stride+bytesPerSample);
   left[i]=v0/divisor;right[i]=v1/divisor;
   peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
   clippedSamples+=(v0===maxPositive||v0===minNegative?1:0)+(v1===maxPositive||v1===minNegative?1:0);
   energy+=left[i]*left[i]+right[i]*right[i];
   sumLeft+=left[i];sumRight+=right[i];
   powerLeft+=left[i]*left[i];powerRight+=right[i]*right[i];
   cross+=left[i]*right[i];
   const mono=(left[i]+right[i])*.5;
   monoEnergy+=mono*mono;
  }
  const meanLeft=frames?sumLeft/frames:0,meanRight=frames?sumRight/frames:0;
  const leftVariance=frames?Math.max(0,powerLeft/frames-meanLeft*meanLeft):0;
  const rightVariance=frames?Math.max(0,powerRight/frames-meanRight*meanRight):0;
  // Pearson correlation excludes DC. Very quiet channels are undefined.
  const stereoCorrelation=leftVariance>1e-12&&rightVariance>1e-12?
    Math.max(-1,Math.min(1,(cross/frames-meanLeft*meanRight)/Math.sqrt(leftVariance*rightVariance))):null;
  const leftRms=frames?Math.sqrt(powerLeft/frames):0;
  const rightRms=frames?Math.sqrt(powerRight/frames):0;
  const stronger=Math.max(leftRms,rightRms),weaker=Math.min(leftRms,rightRms);
  const channelLevelDifferenceDb=weaker>1e-10?20*Math.log10(stronger/weaker):null;
  const rms=frames?Math.sqrt(energy/(2*frames)):0;
  const monoRms=frames?Math.sqrt(monoEnergy/frames):0;
  // Standard mono fold-down = (L+R)/2. Delta is relative to stereo channel
  // RMS, not an absolute perceived-loudness prediction. Null for silence.
  const monoFoldDownDeltaDb=rms>1e-10&&monoRms>1e-10?20*Math.log10(monoRms/rms):null;
  // PCM16/24 quantization can leave a tiny residue for inverse polarity.
  // Treat < -76.5 dB relative fold-down as *practically* silent, not
  // mathematically exact cancellation.
  const monoFoldDownSilent=rms>1e-8&&monoRms/rms<.00015;
  const sideImbalance=stronger>1e-5&&(weaker/stronger)<.1;
  const monoCancellation=rms>1e-8&&monoRms/rms<.5;
  const highDc=Math.max(Math.abs(meanLeft),Math.abs(meanRight))>=.01;
  const loud=await measure(left,right,sampleRate,settings.yieldToBrowser?{yieldToBrowser:true}:{});
  const i=Number.isFinite(loud.integratedLufs)?loud.integratedLufs:null;
  const tp=Number.isFinite(loud.truePeakDbtp)?loud.truePeakDbtp:null;
  const delta=i===null?null:i+23;
  const checks=[
   {id:"ebu_loudness",label:"Referencia EBU −23 LUFS ±0.5 LU (criterio interno)",
    status:delta===null?"unknown":Math.abs(delta)<=.5?"within-internal-range":"outside-internal-range",
    deviationLU:delta},
   {id:"ebu_true_peak",label:"Referencia máxima de emisión −1 dBTP (estimación, no certificación)",
    status:tp===null?"unknown":tp<=-1?"within-internal-range":"outside-internal-range",
    deviationDb:tp===null?null:tp+1},
   {id:"pcm_clipping",label:"Muestras PCM16/24 a escala completa",
    status:clippedSamples?"warning":"clear",count:clippedSamples},
   {id:"stereo_phase",label:"Correlación L/R inferior a −0.8 (criterio interno)",
    status:stereoCorrelation!==null&&stereoCorrelation<=-.8?"warning":"clear",correlation:stereoCorrelation},
   {id:"mono_compatibility",label:"Posible pérdida al sumar a mono mayor de 6 dB (criterio interno)",
    status:monoCancellation?"warning":"clear",deltaDb:monoFoldDownDeltaDb,completeCancellation:monoFoldDownSilent},
   {id:"stereo_channel_balance",label:"Desbalance L/R superior a 20 dB (criterio interno)",
    status:sideImbalance?"warning":"clear",differenceDb:channelLevelDifferenceDb},
   {id:"dc_offset",label:"Offset DC medio ≥ 0.01 de escala completa (criterio interno)",
    status:highDc?"warning":"clear",meanLeft,meanRight},
   {id:"lra_duration",label:"Estabilidad estadística de LRA",
    status:frames/sampleRate>=60?"sufficient-duration":"provisional"}
  ];
  return {
   schema:"montana-r128-preflight",version:1,generatedAt:new Date().toISOString(),
   file:{name:"montana-ai-studio-mezcla.wav",sizeBytes:bytes.length,crc32:crc32(bytes).toString(16).padStart(8,"0"),
    crcAlgorithm:"CRC-32/ISO-HDLC",encoding:"PCM signed "+bits+"-bit little-endian",bitsPerSample:bits,channels:2,sampleRate,frames,durationSeconds:frames/sampleRate},
   metrics:{integratedLufs:i,momentaryLufs:Number.isFinite(loud.momentaryLufs)?loud.momentaryLufs:null,
    shortTermLufs:Number.isFinite(loud.shortTermLufs)?loud.shortTermLufs:null,
    maximumMomentaryLufs:Number.isFinite(loud.maxMomentaryLufs)?loud.maxMomentaryLufs:null,
    maximumShortTermLufs:Number.isFinite(loud.maxShortTermLufs)?loud.maxShortTermLufs:null,
    loudnessRangeLu:Number.isFinite(loud.loudnessRangeLu)?loud.loudnessRangeLu:null,
    lraProvisional:!loud.lraStable,
    truePeakDbtpEstimated:tp,samplePeakDbfs:db(peak),
    rmsDbfs:db(rms),pcmClippedSamples:clippedSamples,
    stereoCorrelation,monoFoldDownDeltaDb,monoFoldDownSilent,
    leftChannelRmsDbfs:db(leftRms),rightChannelRmsDbfs:db(rightRms),
    channelLevelDifferenceDb,dcOffsetLeft:meanLeft,dcOffsetRight:meanRight},
   checks,processing:{
    normalizationApplied:settings.normalizationApplied===true,
    limiterApplied:settings.limiterApplied===true,
    ditherApplied:settings.ditherApplied===true,
    originalSourcesPreserved:true
   },
   qualification:"ESTIMACIONES PARA REVISIÓN DE AUDIO. Correlación y caída mono son indicadores matemáticos, no evaluación perceptual. No implica certificación EBU R128/ITU, conformidad true-peak, ausencia de distorsión ni garantía de calidad.",
   reproducibility:"El CRC32 permite comprobar que este informe corresponde exactamente a los bytes del WAV descargado. No es una firma criptográfica.",
   reference:"EBU R128 / ITU BS.1770; tolerancias internas de verificación, no homologación."
  };
 }
 return {crc32,analyzeWav};
});
