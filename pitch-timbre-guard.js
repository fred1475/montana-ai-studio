/* Montana Music Production LLC — optional spectral-character guard for pitch.
 * Four coarse low/mid/high bands detect gross changes in relative spectral
 * energy after pitch DSP. If coloration is excessive, fade some corrected
 * signal toward immutable dry audio. This is NOT formant estimation,
 * a formant-preserving pitch shifter or a perceptual quality certificate.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPitchTimbreGuard=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const BAND_EDGES=[350,1200,3200],LIMIT_DB=6;
 const candidates=[1,.75,.5,.25,0];
 function inspect(channels,rate){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
    !Number.isFinite(rate)||rate<8000||rate>192000||
    !(channels[0] instanceof Float32Array)||!channels[0].length||
    channels[0].length>rate*15||channels.some(ch=>!(ch instanceof Float32Array)||
      ch.length!==channels[0].length))
   throw Error("Señal vocal o frecuencia inválida");
  const n=channels[0].length,bands=new Float64Array(4);
  let total=0;
  const alpha=BAND_EDGES.map(f=>1-Math.exp(-2*Math.PI*f/rate));
  for(const samples of channels){
   const lo=[0,0,0];
   for(let i=0;i<n;i++){
    const x=samples[i];
    if(!Number.isFinite(x))throw Error("Muestra vocal no finita");
    for(let j=0;j<3;j++)lo[j]+=alpha[j]*(x-lo[j]);
    const b0=lo[0],b1=lo[1]-lo[0],b2=lo[2]-lo[1],b3=x-lo[2];
    bands[0]+=b0*b0;bands[1]+=b1*b1;bands[2]+=b2*b2;bands[3]+=b3*b3;
    total+=x*x;
   }
  }
  const count=n*channels.length;
  return {rms:Math.sqrt(total/count),
    bands:Array.from(bands,x=>Math.sqrt(x/count))};
 }
 function compare(reference,output){
  if(!reference||!output)throw Error("Espectros vocales inválidos");
  // Skip near-silent reference or output; not a reliable timbre assessment.
  if(reference.rms<.002||output.rms<.002)
   return {measurable:false,maxBandShiftDb:null,shiftsDb:[null,null,null,null]};
  const values=[];
  for(let i=0;i<4;i++){
   const a=reference.bands[i]/reference.rms;
   const b=output.bands[i]/output.rms;
   // Suppress vanishing bands: ratios otherwise diverge from noise floor.
   values.push(a<.005||b<.005?null:20*Math.log10(b/a));
  }
  const finite=values.filter(v=>v!==null);
  return {measurable:finite.length>=2,
   maxBandShiftDb:finite.length>=2?Math.max(...finite.map(Math.abs)):null,
   shiftsDb:values};
 }
 function validate(source,processed,rate){
  if(!Array.isArray(source)||!Array.isArray(processed)||
     source.length!==processed.length||
     source.some((ch,i)=>!processed[i]||ch.length!==processed[i].length))
   throw Error("Tomas originales/procesadas incompatibles");
  const before=inspect(source,rate),after=inspect(processed,rate);
  return {before,after};
 }
 function blend(dry,wet,amount){
  const out=[];
  for(let ch=0;ch<dry.length;ch++){
   const c=new Float32Array(dry[ch].length);
   for(let i=0;i<c.length;i++)c[i]=dry[ch][i]*(1-amount)+wet[ch][i]*amount;
   out.push(c);
  }
  return out;
 }
 function apply(source,processed,rate,limitDb=LIMIT_DB){
  if(typeof limitDb!=="number"||!Number.isFinite(limitDb)||
     limitDb<3||limitDb>12)
   throw Error("Umbral de protección espectral inválido");
  const {before,after}=validate(source,processed,rate);
  const initial=compare(before,after);
  let best=processed,wet=1,assessment=initial;
  if(initial.measurable&&initial.maxBandShiftDb>limitDb){
   for(const amount of candidates.slice(1)){
    const candidate=blend(source,processed,amount),spectrum=inspect(candidate,rate),
      evaluation=compare(before,spectrum);
    if(!evaluation.measurable||evaluation.maxBandShiftDb<=limitDb){
     best=candidate;wet=amount;assessment=evaluation;break;
    }
   }
  }
  return {channels:best.map(c=>c.slice()),report:{
   enabled:true,bandEdgesHz:BAND_EDGES.slice(),limitDb,
   originalMaxBandShiftDb:initial.maxBandShiftDb,
   outputMaxBandShiftDb:assessment.maxBandShiftDb,
   wetPercent:Math.round(wet*100),
   status:!initial.measurable?"insufficient_signal":wet<1?"reduced_correction":"unchanged",
   qualification:"Protección heurística de balance espectral en cuatro bandas. No mide formantes ni garantiza timbre/naturalidad."
  }};
 }
 return {BAND_EDGES,LIMIT_DB,inspect,compare,apply};
});
