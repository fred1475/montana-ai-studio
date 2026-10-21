/* Montana Music Production LLC — WAV PCM stereo export, 16/24 bit.
 * Offline export only. Optional TPDF dither at 16-bit quantization, no proprietary DSP.
 * Default PCM16 preserves old sessions; PCM24 is available for master and stems.
 * Chunked PCM encoding avoids a 150 MiB temporary contiguous output ArrayBuffer.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaWavExport=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_BYTES=150*1024*1024;
 function encode(left,right,rate,options={}){
  if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||
    !left.length||left.length!==right.length)throw Error("Canales PCM estéreo inválidos");
  if(!Number.isInteger(rate)||rate<8000||rate>192000)throw Error("Frecuencia de muestreo inválida");
  const bits=options.bits===undefined?16:options.bits;
  if(bits!==16&&bits!==24)throw Error("Profundidad WAV inválida: solo PCM16 o PCM24");
  const dither=options.dither===undefined?false:options.dither;
  if(typeof dither!=="boolean")throw Error("Ajuste de dither inválido");
  if(dither&&bits!==16)throw Error("El dither TPDF solo se ofrece al exportar 16 bits");
  const bytesPerSample=bits/8,stride=bytesPerSample*2;
  const length=44+left.length*stride;
  if(!Number.isSafeInteger(length)||length>MAX_BYTES)throw Error("Resultado WAV demasiado grande");
  // Blob copies each completed PCM block. Keep temporary contiguous PCM
  // allocations bounded independently of WAV length (up to 150 MiB).
  // Keep the same sample/channel traversal, quantization and dither stream:
  // the resulting WAV bytes must remain identical to the legacy encoder.
  const CHUNK_FRAMES=32768;
  const header=new Uint8Array(44),head=new DataView(header.buffer);
  const fourcc=(at,text)=>{for(let j=0;j<4;j++)header[at+j]=text.charCodeAt(j)};
  fourcc(0,"RIFF");head.setUint32(4,length-8,true);fourcc(8,"WAVE");
  fourcc(12,"fmt ");head.setUint32(16,16,true);head.setUint16(20,1,true);
  head.setUint16(22,2,true);head.setUint32(24,rate,true);
  head.setUint32(28,rate*stride,true);head.setUint16(32,stride,true);
  head.setUint16(34,bits,true);fourcc(36,"data");
  head.setUint32(40,length-44,true);
  // Reproducible xorshift uniforms; TPDF variance 1/6 LSB² from U1-U2.
  // Dither is NOT a cryptographic random number generator.
  let state=0x49ae1985;
  const uniform=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const parts=[header];
  for(let start=0;start<left.length;start+=CHUNK_FRAMES){
   const blockFrames=Math.min(CHUNK_FRAMES,left.length-start);
   const bytes=new Uint8Array(blockFrames*stride),dv=new DataView(bytes.buffer);
   for(let j=0;j<blockFrames;j++)for(let ch=0;ch<2;ch++){
    const i=start+j;
    let value=ch===0?left[i]:right[i];
    if(!Number.isFinite(value))throw Error("Audio PCM contiene valores inválidos");
    if(dither)value+=(uniform()-uniform())/32768;
    value=Math.max(-1,Math.min(1,value));
    const quantized=Math.round(value*(value<0?(bits===16?32768:8388608):(bits===16?32767:8388607)));
    const p=j*stride+ch*bytesPerSample;
    if(bits===16)dv.setInt16(p,quantized,true);
    else{bytes[p]=quantized&255;bytes[p+1]=(quantized>>8)&255;bytes[p+2]=(quantized>>16)&255}
   }
   parts.push(bytes);
  }
  return new Blob(parts,{type:"audio/wav"});
 }
 return {encode};
});
