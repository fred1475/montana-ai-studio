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

 // Stereo monitoring is diagnostic only: remove DC before correlation and
 // suppress ratios if either channel is effectively silent.
 function stereoSnapshot(channels){
  const [left,right]=channels,n=left.length;
  let sumL=0,sumR=0,sumLL=0,sumRR=0,sumLR=0;
  for(let i=0;i<n;i++){
   const l=left[i],r=right[i];
   sumL+=l;sumR+=r;sumLL+=l*l;sumRR+=r*r;sumLR+=l*r;
  }
  const varL=Math.max(0,sumLL-sumL*sumL/n),varR=Math.max(0,sumRR-sumR*sumR/n);
  const correlation=varL>1e-10&&varR>1e-10?
   Math.max(-1,Math.min(1,(sumLR-sumL*sumR/n)/Math.sqrt(varL*varR))):null;
  const balanceDb=sumLL>1e-9&&sumRR>1e-9?10*Math.log10(sumLL/sumRR):null;
  return {correlation,balanceDb};
 }
 function analyze(original,corrected,rate){
  if(!Array.isArray(original)||!Array.isArray(corrected)||!original.length||
     original.length>2||corrected.length!==original.length||
     !Number.isFinite(rate)||rate<8000||rate>192000)
    throw Error("Canales o frecuencia de QA vocal inválidos");
  const n=original[0]?.length;
  if(!Number.isSafeInteger(n)||n<1||n>rate*15)throw Error("Duración de QA vocal inválida");
  let sourcePeak=0,outputPeak=0,srcEnergy=0,outEnergy=0;
  // Gain-independent upper-frequency energy comparison, not a formant measure.
  const highPassAlpha=Math.exp(-2*Math.PI*2500/rate);
  const lowPassGain=1-highPassAlpha;
  let sourceHighEnergy=0,outputHighEnergy=0;
  let maxSourceStep=0,maxOutputStep=0,newLargeSteps=0;
  // Short fixed windows give an advisory about a local missing syllable,
  // compared against the overall gain to ignore uniform gain changes.
  const windowFrames=Math.max(1,Math.round(rate*.025));
  const energyWindows=[];
  for(let ch=0;ch<original.length;ch++){
   const before=original[ch],after=corrected[ch];
   if(!(before instanceof Float32Array)||!(after instanceof Float32Array)||
      before.length!==n||after.length!==n)throw Error("Muestras QA vocal incompatibles");
   let previousBefore=0,previousAfter=0;
   let sourceLow=0,outputLow=0;
   let windowSource=0,windowOutput=0;
   for(let i=0;i<n;i++){
    const src=before[i],dst=after[i];
    if(!Number.isFinite(src)||!Number.isFinite(dst))throw Error("Muestra QA vocal no finita");
    sourcePeak=Math.max(sourcePeak,Math.abs(src));
    outputPeak=Math.max(outputPeak,Math.abs(dst));
    srcEnergy+=src*src;outEnergy+=dst*dst;
    windowSource+=src*src;windowOutput+=dst*dst;
    if((i+1)%windowFrames===0){
     energyWindows.push({start:i+1-windowFrames,frames:windowFrames,
      sourceEnergy:windowSource,outputEnergy:windowOutput});
     windowSource=0;windowOutput=0;
    }
    sourceLow+=lowPassGain*(src-sourceLow);
    outputLow+=lowPassGain*(dst-outputLow);
    sourceHighEnergy+=(src-sourceLow)**2;
    outputHighEnergy+=(dst-outputLow)**2;
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
   // Ignore partial trailing windows to avoid edge artifacts.
  }
  const count=n*original.length;
  const sourceRms=Math.sqrt(srcEnergy/count),outputRms=Math.sqrt(outEnergy/count);
  const rmsDeltaDb=sourceRms>1e-9&&outputRms>1e-9?db(outputRms/sourceRms):null;
  const peakIncreaseDb=sourcePeak>1e-9&&outputPeak>1e-9?db(outputPeak/sourcePeak):null;
  const overallGain=sourceRms>.01&&outputRms>1e-5?outputRms/sourceRms:null;
  let dropoutWindowCount=0,firstDropoutSeconds=null;
  if(overallGain!==null&&overallGain>.05){
   const edgeGuard=Math.ceil(rate*.075);
   for(const w of energyWindows){
    if(w.start<edgeGuard||w.start+w.frames>n-edgeGuard)continue;
    const beforeRms=Math.sqrt(w.sourceEnergy/w.frames);
    const afterRms=Math.sqrt(w.outputEnergy/w.frames);
    if(beforeRms>.015&&afterRms<beforeRms*overallGain*.12){
     dropoutWindowCount++;
     if(firstDropoutSeconds===null||w.start/rate<firstDropoutSeconds)
      firstDropoutSeconds=w.start/rate;
    }
   }
  }
  // Use mean-square gating rather than duration-dependent integrated
  // energy: near-silence should remain "not measurable" at any clip length.
  const highBandShareDb=(band,total)=>
   total/count>1e-10&&band/count>1e-16?10*Math.log10(band/total):null;
  const sourceHighBandDb=highBandShareDb(sourceHighEnergy,srcEnergy);
  const outputHighBandDb=highBandShareDb(outputHighEnergy,outEnergy);
  const highBandDeltaDb=sourceHighBandDb!==null&&outputHighBandDb!==null?
   outputHighBandDb-sourceHighBandDb:null;
  const stereo=original.length===2?{
   source:stereoSnapshot(original),output:stereoSnapshot(corrected)
  }:null;
  const warnings=[];
  if(stereo){
   const before=stereo.source,after=stereo.output;
   if(before.correlation!==null&&after.correlation!==null&&
      Math.abs(before.correlation)>=.70&&Math.abs(after.correlation-before.correlation)>.45)
    warnings.push({id:"stereo_coherence_change",
     message:"La afinación cambió de forma importante la correlación estéreo; revisa fase y compatibilidad mono."});
   if(before.balanceDb!==null&&after.balanceDb!==null&&
      Math.abs(after.balanceDb-before.balanceDb)>3)
    warnings.push({id:"stereo_balance_change",
     message:"El balance de nivel entre izquierdo y derecho cambió más de 3 dB; compara con la fuente."});
  }
  if(highBandDeltaDb!==null&&Math.abs(highBandDeltaDb)>6)
   warnings.push({id:"spectral_balance_shift",
    message:"El balance relativo de frecuencias altas cambió más de 6 dB; escucha posibles cambios de brillo o aspereza en la voz."});
  if(outputPeak>=1)warnings.push({id:"sample_clip",message:"La voz afinada alcanza o supera 0 dBFS de pico de muestra; revisa ganancia y limitación."});
  else if(outputPeak>=.98 && outputPeak>sourcePeak+.01)warnings.push({id:"low_headroom",message:"La afinación deja muy poco margen de pico; revisa clipping al mezclar."});
  if(rmsDeltaDb!==null&&Math.abs(rmsDeltaDb)>6)
   warnings.push({id:"rms_change",message:"El RMS cambió más de 6 dB respecto al original; compara niveles antes de aprobar."});
  if(dropoutWindowCount>0)
   warnings.push({id:"local_dropouts",
    message:"Posibles microcortes en la voz procesada: comprueba fragmentos que hayan perdido señal frente a la toma original."});
  if(newLargeSteps>0)
   warnings.push({id:"new_steps",message:"Aparecieron saltos rápidos de muestra ausentes en la fuente; escucha posibles clics."});
  if(sourceRms>1e-5&&outputRms<sourceRms*.03)
   warnings.push({id:"signal_loss",message:"La salida afinada perdió casi toda la energía del original."});
  return {
   version:1,channels:original.length,frames:n,sampleRate:rate,
   metrics:{sourcePeakDbfs:db(sourcePeak),outputPeakDbfs:db(outputPeak),
    sourceRmsDbfs:db(sourceRms),outputRmsDbfs:db(outputRms),
    rmsDeltaDb,peakIncreaseDb,maxSourceStep,maxOutputStep,newLargeSteps,
    sourceHighBandDb,outputHighBandDb,highBandDeltaDb,
    dropoutWindowCount,firstDropoutSeconds},
   stereo,warnings,
   qualification:"Indicadores PCM heurísticos (banda alta aproximada con filtro de un polo a 2.5 kHz; ventanas de 25 ms para pérdida local); no certificación de formantes, timbre, percepción, EBU R128 ni ausencia de artefactos."
  };
 }
 return {analyze};
});
