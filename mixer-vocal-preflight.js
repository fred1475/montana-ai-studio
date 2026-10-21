/* Montana Music Production LLC — source-only vocal preflight.
 * Offline, read-only statistics: no audio mutation, processing, uploads or
 * EBU/ITU certification. Full-scale samples only indicate clipping risk.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalPreflight=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const db=x=>x>0?20*Math.log10(x):null;
 function analyze(channels,sampleRate){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
     channels.some(ch=>!(ch instanceof Float32Array)))throw Error("Solo voz mono o estéreo válida");
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error("Frecuencia de muestreo inválida");
  const frames=channels[0].length;
  if(frames<1||frames>sampleRate*300||channels.some(ch=>ch.length!==frames))
   throw Error("Canales incompatibles o duración excesiva");
  let peak=0,energy=0,nearFullScaleSamples=0;
  const sums=channels.map(()=>0),power=channels.map(()=>0);
  let cross=0;
  for(let i=0;i<frames;i++){
   const values=[];
   for(let c=0;c<channels.length;c++){
    const v=channels[c][i];
    if(!Number.isFinite(v))throw Error("Muestra vocal no finita");
    if(Math.abs(v)>1.000001)throw Error("Muestra vocal fuera de escala PCM");
    values[c]=v;
    sums[c]+=v;power[c]+=v*v;energy+=v*v;
    peak=Math.max(peak,Math.abs(v));
    if(Math.abs(v)>=.9999)nearFullScaleSamples++;
   }
   if(channels.length===2)cross+=values[0]*values[1];
  }
  const means=sums.map(v=>v/frames);
  const variances=power.map((p,i)=>Math.max(0,p/frames-means[i]*means[i]));
  const covariance=channels.length===2?cross/frames-means[0]*means[1]:null;
  const corr=channels.length===2&&variances[0]>1e-12&&variances[1]>1e-12?
   Math.max(-1,Math.min(1,covariance/Math.sqrt(variances[0]*variances[1]))):null;
  const rms=Math.sqrt(energy/(channels.length*frames));
  const highest=Math.max(...variances),lowest=Math.min(...variances);
  const warnings=[];
  const warn=(id,label)=>warnings.push({id,label});
  if(rms<.00177828)warn("very_low_level","Nivel RMS inferior a −55 dBFS: señal muy tenue o silencio");
  if(nearFullScaleSamples)warn("possible_digital_clipping","Hay muestras cercanas al máximo digital: inspecciona posible saturación");
  else if(peak>=.94406)warn("little_peak_headroom","Pico superior a −0.5 dBFS: margen de nivel reducido");
  if(means.some(v=>Math.abs(v)>=.01))warn("dc_offset","Componente continua alta: revisa el offset DC de la grabación");
  if(corr!==null&&corr<=-.8)warn("stereo_antiphase","Canales en fuerte contrafase: riesgo de cancelación al sumar a mono");
  if(channels.length===2&&highest>1e-9&&lowest/highest<.01)
   warn("stereo_imbalance","Uno de los canales casi no tiene señal; comprueba el enrutamiento");
  return {
   schema:"montana-vocal-preflight",version:1,
   frames,sampleRate,channels:channels.length,durationSeconds:frames/sampleRate,
   metrics:{peakDbfs:db(peak),rmsDbfs:db(rms),dcOffset:means,
    stereoCorrelation:corr,nearFullScaleSamples},
   warnings,qualification:"Diagnóstico digital orientativo de la fuente original, no prueba de calidad perceptual, hardware, ruido de fondo ni saturación analógica."
  };
 }
 return {analyze};
});
