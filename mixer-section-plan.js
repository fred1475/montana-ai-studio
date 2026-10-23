/* Montana Music Production LLC — bounded timeline section planning.
 * Plans decoded source offsets without changing tracks, source WAV,
 * region/loop settings or the full-song export pipeline.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaSectionPlan=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_SECONDS=30,MIN_SECONDS=.05,END=300;
 const finite=x=>typeof x==="number"&&Number.isFinite(x);
 function range(start,end){
  if(!finite(start)||!finite(end)||start<0||end>END||
     end-start<MIN_SECONDS-1e-7||end-start>MAX_SECONDS+1e-7)
   throw Error("Preescucha: elige marcadores ascendentes separados entre 0.05 y 30 segundos");
  return {start,end,duration:end-start};
 }
 function plan(start,end,clipSets){
  const window=range(start,end);
  if(!Array.isArray(clipSets)||clipSets.length!==8||clipSets.some(x=>!Array.isArray(x)||x.length>24))
   throw Error("Canales de sección incompatibles");
  const plans=[];
  for(let i=0;i<8;i++){
   const entries=[];
   for(const [clipIndex,clip] of clipSets[i].entries()){
    if(!clip||![clip.offset,clip.start,clip.duration,clip.singleDuration].every(finite)||
       clip.offset<0||clip.offset>300.25||clip.start<0||
       clip.duration<=0||clip.singleDuration<=0||
       !Number.isInteger(clip.repeat)||clip.repeat<1||clip.repeat>8||
       Math.abs(clip.duration-clip.singleDuration*clip.repeat)>1e-4)
     throw Error("Fragmento inválido para preescucha");
    const left=Math.max(start,clip.offset),right=Math.min(end,clip.offset+clip.duration);
    if(right-left<1e-6)continue;
    const advanced=left-clip.offset;
    // AudioBufferSourceNode with native loop offsets handles crossing a
    // repetition boundary; no buffer copying, stretching or re-encoding.
    const position=advanced%clip.singleDuration;
    const offset=Math.abs(position-clip.singleDuration)<1e-7?0:position;
    const sourceOffset=clip.start+offset;
    entries.push({
     track:i,when:left-start,sourceOffset,duration:right-left,
     loop:clip.repeat>1,loopStart:clip.start,
     loopEnd:clip.start+clip.singleDuration,
     // Keep the full arrangement coordinates so partial auditions can
     // follow fades/crossfades already in progress at the marker boundary.
     clipIndex,regionStart:clip.offset,regionDuration:clip.duration,
     elapsed:advanced
    });
   }
   plans.push(entries);
  }
  return {window,tracks:plans,regions:plans.reduce((a,b)=>a+b.length,0)};
 }
 return {MAX_SECONDS,MIN_SECONDS,range,plan};
});
