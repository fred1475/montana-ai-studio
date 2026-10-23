/* Montana Music Production LLC — local microphone input engineering diagnostics.
 * Input and noise samples are measured from actual PCM float data.
 * Does NOT measure end-to-end recording latency or hardware calibration.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaHardwareDSP=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function db(value){return value>1e-12?20*Math.log10(value):null}
 function inspect(pcm,rate,quietSeconds=1.5){
  if(!(pcm instanceof Float32Array)||!pcm.length||!Number.isFinite(rate)||rate<8000||rate>192000)
   throw Error("Audio PCM o frecuencia de muestreo inválidos");
  const quietEnd=Math.min(pcm.length,Math.floor(rate*quietSeconds));
  let sum=0,peak=0,fullScale=0,quietEnergy=0,speechEnergy=0,clipRun=0,longestClipRun=0;
  for(let i=0;i<pcm.length;i++){
   const x=pcm[i],abs=Math.abs(x);
   if(!Number.isFinite(x))throw Error("Audio PCM contiene muestras inválidas");
   peak=Math.max(peak,abs);
   sum+=x*x;
   if(abs>=.98){
    fullScale++;clipRun++;longestClipRun=Math.max(longestClipRun,clipRun);
   }else clipRun=0;
   if(i<quietEnd)quietEnergy+=x*x;
   else speechEnergy+=x*x;
  }
  const quietRms=Math.sqrt(quietEnergy/Math.max(1,quietEnd));
  const speechRms=Math.sqrt(speechEnergy/Math.max(1,pcm.length-quietEnd));
  const rms=Math.sqrt(sum/pcm.length);
  const duration=pcm.length/rate,peakDbfs=db(peak),quietRmsDbfs=db(quietRms);
  const speechRmsDbfs=db(speechRms),fullScaleFraction=fullScale/pcm.length;
  const result={
   durationSeconds:Math.round(duration*1000)/1000,sampleRate:rate,channelsAnalyzed:1,
   measuredPeakDbfs:peakDbfs,measuredRmsDbfs:db(rms),
   firstSecondsNoiseRmsDbfs:quietRmsDbfs,laterSpeechRmsDbfs:speechRmsDbfs,
   nearFullScaleSamples:fullScale,nearFullScaleFraction:fullScaleFraction,
   longestNearFullScaleRun:longestClipRun,validSpeechWindow:pcm.length>quietEnd,
   observations:[],method:"Niveles digitales PCM: muestra pico y RMS; primer segmento usado como referencia de ruido, no como noise-floor calibrado"
  };
  if(duration<3)result.observations.push("Grabación corta: usa la prueba completa de 8 segundos para comparar ruido y voz.");
  if(fullScale>0||peak>=.98)
   result.observations.push("RIESGO DE SATURACIÓN: hay muestras cerca de 0 dBFS. Reduce la ganancia de entrada de la interfaz.");
  else if(peakDbfs!==null&&peakDbfs> -3)
   result.observations.push("Picos altos: deja algo más de margen bajando la ganancia de entrada.");
  else if(peakDbfs===null||peakDbfs< -30)
   result.observations.push("Señal muy baja: comprueba entrada, cable, alimentación y ganancia sin subir el volumen de salida.");
  else result.observations.push("Picos digitales dentro de un margen orientativo; escucha también la toma para revisar distorsión.");
  if(quietEnd>=rate){
   if(quietRmsDbfs!==null&&quietRmsDbfs> -40)
    result.observations.push("El tramo inicial tuvo nivel alto: revisa ruido ambiente, ventiladores y que estuvieras en silencio.");
   else result.observations.push("Tramo inicial medido. El nivel solo representa los primeros segundos de esta toma.");
  }
  if(result.validSpeechWindow&&speechRmsDbfs!==null&&quietRmsDbfs!==null&&speechRmsDbfs-quietRmsDbfs<6)
   result.observations.push("La diferencia entre voz y fondo fue pequeña; repite guardando silencio al principio.");
  return result;
 }
 function wavMono(pcm,rate){
  if(!(pcm instanceof Float32Array)||pcm.length===0||pcm.length>rate*30||!Number.isInteger(rate)||rate<8000||rate>192000)
   throw Error("Fuente WAV inválida");
  const bytes=new ArrayBuffer(44+pcm.length*2),dv=new DataView(bytes);
  const ascii=(p,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(p+i,s.charCodeAt(i))};
  ascii(0,"RIFF");dv.setUint32(4,bytes.byteLength-8,true);ascii(8,"WAVE");
  ascii(12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);
  dv.setUint16(22,1,true);dv.setUint32(24,rate,true);
  dv.setUint32(28,rate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
  ascii(36,"data");dv.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++){
   const x=pcm[i];if(!Number.isFinite(x))throw Error("Audio PCM inválido");
   dv.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))* (x<0?32768:32767)),true);
  }
  return bytes;
 }
 return {inspect,wavMono};
});