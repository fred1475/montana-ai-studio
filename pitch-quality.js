/* Montana Music Production LLC — advisory before/after pitch-audio QA.
 * Deterministic sample-domain checks only. This cannot certify timbre,
 * formants, perceived quality, true peak, or EBU R128 conformance.
 * Source and corrected Float32 PCM are read only.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPitchQA=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const db=v=>v>1e-12?20*Math.log10(v):null;
 function analyze(original,corrected,rate){
  if(!Array.isArray(original)||!Array.isArray(corrected)||!original.length||
     original.length>2||corrected.length!==original.length||
     !Number.isFinite(rate)||rate<8000||rate>192000)
    throw Error("Canales o frecuencia de QA vocal inválidos");
  const n=original[0]?.length;
  if(!Number.isSafeInteger(n)||n<1||n>rate*15)throw Error("Duración de QA vocal inválida");
  let sourcePeak=0,outputPeak=0,srcEnergy=0,outEnergy=0;
  let maxSourceStep=0,maxOutputStep=0,newLargeSteps=0;
  for(let ch=0;ch<original.length;ch++){
   const before=original[ch],after=corrected[ch];
   if(!(before instanceof Float32Array)||!(after instanceof Float32Array)||
      before.length!==n||after.length!==n)throw Error("Muestras QA vocal incompatibles");
   let previousBefore=0,previousAfter=0;
   for(let i=0;i<n;i++){
    const src=before[i],dst=after[i];
    if(!Number.isFinite(src)||!Number.isFinite(dst))throw Error("Muestra QA vocal no finita");
    sourcePeak=Math.max(sourcePeak,Math.abs(src));
    outputPeak=Math.max(outputPeak,Math.abs(dst));
    srcEnergy+=src*src;outEnergy+=dst*dst;
    if(i>0){
     const a=Math.abs(src-previousBefore),b=Math.abs(dst-previousAfter);
     maxSourceStep=Math.max(maxSourceStep,a);
     maxOutputStep=Math.max(maxOutputStep,b);
     // Heuristic: a new >0.25 full-scale one-sample jump not present
     // in source. Can be legitimate transient; no automatic processing.
     if(b>.25 && b>4*a+.03)newLargeSteps++;
    }
    previousBefore=src;previousAfter=dst;
   }
  }
  const count=n*original.length;
  const sourceRms=Math.sqrt(srcEnergy/count),outputRms=Math.sqrt(outEnergy/count);
  const rmsDeltaDb=sourceRms>1e-9&&outputRms>1e-9?db(outputRms/sourceRms):null;
  const peakIncreaseDb=sourcePeak>1e-9&&outputPeak>1e-9?db(outputPeak/sourcePeak):null;
  const warnings=[];
  if(outputPeak>=1)warnings.push({id:"sample_clip",message:"La voz afinada alcanza o supera 0 dBFS de pico de muestra; revisa ganancia y limitación."});
  else if(outputPeak>=.98 && outputPeak>sourcePeak+.01)warnings.push({id:"low_headroom",message:"La afinación deja muy poco margen de pico; revisa clipping al mezclar."});
  if(rmsDeltaDb!==null&&Math.abs(rmsDeltaDb)>6)
   warnings.push({id:"rms_change",message:"El RMS cambió más de 6 dB respecto al original; compara niveles antes de aprobar."});
  if(newLargeSteps>0)
   warnings.push({id:"new_steps",message:"Aparecieron saltos rápidos de muestra ausentes en la fuente; escucha posibles clics."});
  if(sourceRms>1e-5&&outputRms<sourceRms*.03)
   warnings.push({id:"signal_loss",message:"La salida afinada perdió casi toda la energía del original."});
  return {
   version:1,channels:original.length,frames:n,sampleRate:rate,
   metrics:{sourcePeakDbfs:db(sourcePeak),outputPeakDbfs:db(outputPeak),
    sourceRmsDbfs:db(sourceRms),outputRmsDbfs:db(outputRms),
    rmsDeltaDb,peakIncreaseDb,maxSourceStep,maxOutputStep,newLargeSteps},
   warnings,
   qualification:"Indicadores PCM heurísticos, no certificación de formantes, timbre, percepción, EBU R128 ni ausencia de artefactos."
  };
 }
 return {analyze};
});
