/* Montana Music Production LLC — offline, provenance-linked WAV export preflight.
 * Measures exact PCM16 bytes of exported stereo WAV, not pre-quantized floats.
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
  const buffer=await blob.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(buffer.byteLength<44||buffer.byteLength>56*1024*1024)throw Error("La auditoría admite WAV de hasta 56 MiB; el archivo original aún puede descargarse");
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
  for(let i=0;i<frames;i++){
   const v0=readSample(44+i*stride),v1=readSample(44+i*stride+bytesPerSample);
   left[i]=v0/divisor;right[i]=v1/divisor;
   peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
   clippedSamples+=(v0===maxPositive||v0===minNegative?1:0)+(v1===maxPositive||v1===minNegative?1:0);
   energy+=left[i]*left[i]+right[i]*right[i];
  }
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
   {id:"pcm_clipping",label:"Muestras PCM16 a escala completa",
    status:clippedSamples?"warning":"clear",count:clippedSamples},
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
    rmsDbfs:db(Math.sqrt(energy/(frames*2))),pcmClippedSamples:clippedSamples},
   checks,processing:{
    normalizationApplied:settings.normalizationApplied===true,
    limiterApplied:settings.limiterApplied===true,
    originalSourcesPreserved:true
   },
   qualification:"ESTIMACIONES PARA REVISIÓN DE AUDIO. No implica certificación EBU R128/ITU, conformidad true-peak, ausencia de distorsión ni garantía de calidad.",
   reproducibility:"El CRC32 permite comprobar que este informe corresponde exactamente a los bytes del WAV descargado. No es una firma criptográfica.",
   reference:"EBU R128 / ITU BS.1770; tolerancias internas de verificación, no homologación."
  };
 }
 return {crc32,analyzeWav};
});
