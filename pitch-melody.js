/* Montana Music Production LLC — laboratory melody segment corrector.
 * EXPERIMENT ONLY: isolated, steady monophonic notes, not real-time Auto-Tune.
 * Detects pitch separately by short autocorrelation windows and invokes
 * the tested sustained-note PSOLA routine for each stable detected region.
 * Unvoiced sections, glides and vibrato may be rejected or sound unnatural.
 */
(function(root,factory){
 const pitch=typeof module!=="undefined"&&module.exports?require("./pitch-engine.js"):root.MontanaPitch;
 const api=factory(pitch);
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaMelody=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(pitch){
 "use strict";
 if(!pitch||typeof pitch.correctChannel!=="function")throw Error("Requiere pitch-engine.js");
 const freqToMidi=f=>Math.round(69+12*Math.log2(f/440));
 const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
 function processMelody(channels,rate,opts={}){
  if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(c=>!(c instanceof Float32Array)))throw Error("Solo audio mono o estéreo");
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error("Frecuencia de muestreo inválida");
  const n=channels[0].length;
  if(channels.some(c=>c.length!==n)||n<rate*.65||n>rate*10)throw Error("La frase debe durar entre 0.65 y 10 segundos");
  const strength=opts.strength===undefined?100:Number(opts.strength);
  if(!Number.isFinite(strength)||strength<0||strength>100)throw Error("Intensidad inválida");
  const reference=pitch.vocalReference(channels);
  const mono=reference.samples;
  const hop=Math.max(1,Math.round(rate*.075)),half=2048,frames=[];
  for(let center=half;center+half<n;center+=hop){
   const result=pitch.detectPitch(mono,rate,center/n);
   frames.push({center,frequency:result?.frequency||null,midi:result?freqToMidi(result.frequency):null});
  }
  if(frames.length<7)throw Error("Frase demasiado corta para detectar cambios");
  const valid=frames.filter(f=>f.midi!==null);
  if(valid.length<frames.length*.75)throw Error("Demasiados silencios o sonidos sin tono reconocible; usa notas claras");
  // Three-window median smooths isolated octave errors but does not quantize
  // the correction itself; medians of original detected frequencies are retained.
  const stable=frames.map((f,i)=>{
   const around=frames.slice(Math.max(0,i-1),Math.min(frames.length,i+2)).filter(x=>x.midi!==null).map(x=>x.midi);
   return around.length>=2?median(around):f.midi;
  });
  if(stable.some(v=>v===null))throw Error("Notas poco estables");
  // Repair one-frame glitches without inventing notes at long pitch transitions.
  for(let i=1;i<stable.length-1;i++)if(stable[i-1]===stable[i+1])stable[i]=stable[i-1];
  const groups=[];
  for(let i=0;i<frames.length;i++){
   const last=groups[groups.length-1];
   if(!last||last.midi!==stable[i])groups.push({midi:stable[i],begin:i,end:i+1});
   else last.end=i+1;
  }
  if(groups.length<2)throw Error("No se detectaron cambios entre notas. Prueba el modo nota sostenida");
  if(groups.length>12||groups.some(g=>g.end-g.begin<2))throw Error("Cambios demasiado rápidos o inestables para esta beta");
  const boundaries=[0];
  for(let k=1;k<groups.length;k++){
   const last=frames[groups[k].begin-1].center,first=frames[groups[k].begin].center;
   boundaries.push(Math.round((last+first)/2));
  }
  boundaries.push(n);
  if(boundaries.some((b,i)=>i>0&&b-boundaries[i-1]<Math.floor(rate*.20)))throw Error("Una nota dura menos de 0.2 s; esta versión no puede procesarla");
  const segments=[],out=channels.map(()=>new Float32Array(n));
  for(let index=0;index<groups.length;index++){
   const g=groups[index],start=boundaries[index],end=boundaries[index+1];
   const pitches=frames.slice(g.begin,g.end).filter(f=>f.frequency&&freqToMidi(f.frequency)===g.midi).map(f=>f.frequency);
   if(pitches.length<2)throw Error("No se pudo estimar una nota estable");
   const inputHz=median(pitches),target=pitch.nearestNote(inputHz,opts.key||"C",opts.scale||"chromatic");
   const adjusted=inputHz*Math.pow(target.frequency/inputHz,strength/100);
   const cents=1200*Math.log2(adjusted/inputHz);
   if(Math.abs(cents)>250)throw Error("Corrección fuera de rango seguro");
   // Use one pitch-mark timeline per note for both stereo channels. The
   // correction stays sample-coherent even with inverted or unequal L/R.
   const sharedPlan=channels.length===2&&Math.abs(cents)>=.3?
     pitch.pitchMarkPlan(mono.subarray(start,end),rate,inputHz):null;
   const originals=channels.map(ch=>ch.subarray(start,end));
   const shifted=originals.map(source=>Math.abs(cents)<.3?Float32Array.from(source):
      pitch.correctChannel(source,rate,inputHz,adjusted,sharedPlan));
   // Retain unvoiced consonants inside each note, with a single gain envelope
   // for related stereo channels. Existing transition guards still bridge notes.
   const corrected=Math.abs(cents)<.3?shifted:
      pitch.preserveUnvoiced(originals,shifted,mono.subarray(start,end),rate,inputHz);
   for(let ch=0;ch<channels.length;ch++)out[ch].set(corrected[ch],start);
   segments.push({startSeconds:start/rate,endSeconds:end/rate,inputHz,targetHz:adjusted,targetNote:target.note,correctionCents:cents});
  }
  // Prevent the splice between separately PSOLA-corrected notes from making
  // discontinuous waveform jumps. The original voice is the continuous bridge
  // centered on each detected transition; equal-power-like raised sine edges
  // reintroduce correction 12 ms away. Source PCM remains unchanged.
  const guardMs=12,guardSamples=Math.max(1,Math.round(rate*guardMs/1000));
  for(let index=1;index<boundaries.length-1;index++){
   const boundary=boundaries[index],left=boundary-boundaries[index-1],right=boundaries[index+1]-boundary;
   const radius=Math.min(guardSamples,Math.floor(Math.min(left,right)*.12));
   if(radius<2)continue;
   for(let j=Math.max(0,boundary-radius);j<Math.min(n,boundary+radius);j++){
    const t=Math.min(1,Math.abs(j-boundary)/radius);
    const correctedWeight=Math.sin(t*Math.PI/2)**2;
    for(let ch=0;ch<channels.length;ch++){
     const original=channels[ch][j];
     out[ch][j]=original*(1-correctedWeight)+out[ch][j]*correctedWeight;
    }
   }
  }
  return {channels:out,segments,duration:n/rate,mode:"melody-experimental",referenceMode:reference.mode,transitionGuardMs:guardMs};
 }
 return {processMelody};
});
