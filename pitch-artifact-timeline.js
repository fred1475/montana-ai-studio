/* Montana Music Production LLC — timestamped PCM artifact review hints.
 * Read-only, deterministic 25ms scan of short vocal takes. Flags suspicious
 * local silence, abrupt steps and new near-full-scale peaks relative to dry.
 * Does not identify robotic timbre, formants or perceptual quality.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalArtifactTimeline=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_EVENTS=24;
 function analyze(original,processed,rate){
  if(!Array.isArray(original)||![1,2].includes(original.length)||
     !Array.isArray(processed)||original.length!==processed.length||
     !Number.isInteger(rate)||rate<8000||rate>192000)
   throw Error("Formato de búsqueda de artefactos inválido");
  const n=original[0]?.length;
  if(!Number.isInteger(n)||n<1||n>rate*15)throw Error("Duración vocal inválida");
  const windowSize=Math.max(1,Math.round(rate*.025)),edge=Math.ceil(rate*.075);
  const events=[],counts={dropout:0,step:0,peak:0};
  const push=(code,start,ch)=>{
   counts[code]++;
   if(events.length<MAX_EVENTS)
    events.push({code,timeSeconds:Number((start/rate).toFixed(3)),channel:ch+1});
  };
  for(let ch=0;ch<original.length;ch++){
   const dry=original[ch],wet=processed[ch];
   if(!(dry instanceof Float32Array)||!(wet instanceof Float32Array)||
      dry.length!==n||wet.length!==n)
    throw Error("Canales de artefactos incompatibles");
   let energyDry=0,energyWet=0;
   for(let i=0;i<n;i++){
    if(!Number.isFinite(dry[i])||!Number.isFinite(wet[i]))
     throw Error("Muestra vocal no finita");
    energyDry+=dry[i]*dry[i];energyWet+=wet[i]*wet[i];
   }
   const srcRms=Math.sqrt(energyDry/n),outRms=Math.sqrt(energyWet/n);
   const ratio=srcRms>.01&&outRms>1e-5?outRms/srcRms:null;
   let previousStep=false,previousPeak=false,previousDrop=false;
   for(let start=0;start<n;start+=windowSize){
    const end=Math.min(n,start+windowSize);
    let localDry=0,localWet=0,hasStep=false,hasPeak=false;
    for(let i=start;i<end;i++){
     const x=dry[i],y=wet[i];
     localDry+=x*x;localWet+=y*y;
     if(i>0&&Math.abs(y-wet[i-1])>.25&&
        Math.abs(y-wet[i-1])>4*Math.abs(x-dry[i-1])+.03)
      hasStep=true;
     if(Math.abs(y)>=.98&&Math.abs(x)<.97)hasPeak=true;
    }
    const samples=end-start;
    const dryRms=Math.sqrt(localDry/samples);
    const wetRms=Math.sqrt(localWet/samples);
    const dropout=ratio!==null&&ratio>.05&&start>=edge&&end<=n-edge&&
     dryRms>.015&&wetRms<dryRms*ratio*.12;
    if(dropout&&!previousDrop)push("dropout",start,ch);
    if(hasStep&&!previousStep)push("step",start,ch);
    if(hasPeak&&!previousPeak)push("peak",start,ch);
    previousDrop=dropout;previousStep=hasStep;previousPeak=hasPeak;
   }
  }
  events.sort((a,b)=>a.timeSeconds-b.timeSeconds||a.channel-b.channel||
   a.code.localeCompare(b.code));
  return {version:1,windowMs:25,
   events:events.slice(0,MAX_EVENTS),counts,
   truncated:counts.dropout+counts.step+counts.peak>events.length,
   caveat:"Marcas PCM orientativas, no detección fiable de sonido robótico o naturalidad. Revisar cada segundo con escucha real."};
 }
 return {MAX_EVENTS,analyze};
});
