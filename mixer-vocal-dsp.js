/* Montana Music Production LLC — vocal noise gate and de-esser beta.
 * Offline, non-destructive, browser-local DSP; no third-party dependencies.
 * Gate: linked-channel RMS envelope and smooth gain. De-esser: dynamically
 * attenuate only high-frequency sibilance band using a simple 1-pole split.
 * This is NOT spectral restoration or a mastering-grade de-esser.
 */
(function(root,factory){
 const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaVocalClean=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const defaults=()=>({gateOn:false,gateThreshold:-35,gateReduction:-45,deessOn:false,deessThreshold:-32,deessStrength:75});
 function check(s){
  if(!s||typeof s!=="object"||typeof s.gateOn!=="boolean"||typeof s.deessOn!=="boolean")throw Error("Estado de limpieza inválido");
  for(const [k,lo,hi] of [["gateThreshold",-60,-15],["gateReduction",-60,-12],["deessThreshold",-50,-15],["deessStrength",0,100]]){
   if(typeof s[k]!=="number"||!Number.isFinite(s[k])||s[k]<lo||s[k]>hi)throw Error("Parámetro de limpieza inválido: "+k);
  }
  return s;
 }
 function process(channels,rate,options){
  const s=check(options);
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||channels.some(c=>!(c instanceof Float32Array)))throw Error("Audio vocal mono/estéreo inválido");
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error("Frecuencia de muestreo inválida");
  const n=channels[0].length;
  if(n<1||channels.some(c=>c.length!==n)||n>rate*300)throw Error("Canales incompatibles o duración excesiva");
  const out=channels.map(c=>Float32Array.from(c));
  if(s.gateOn){
   const threshold=Math.pow(10,s.gateThreshold/20),floor=Math.pow(10,s.gateReduction/20);
   const powerA=Math.exp(-1/(rate*.010));
   const attackA=Math.exp(-1/(rate*.003)),releaseA=Math.exp(-1/(rate*.080));
   let power=0,gain=floor,hold=0;
   const holdLength=Math.round(rate*.025);
   for(let i=0;i<n;i++){
    let sampleMax=0;
    for(const c of out){const v=c[i];if(!Number.isFinite(v))throw Error("Muestra vocal inválida");sampleMax=Math.max(sampleMax,Math.abs(v))}
    power=power*powerA+(1-powerA)*sampleMax*sampleMax;
    if(Math.sqrt(power)>=threshold)hold=holdLength;
    else if(hold>0)hold--;
    const target=hold>0?1:floor;
    gain=target+(gain-target)*(target>gain?attackA:releaseA);
    for(const c of out)c[i]*=gain;
   }
  }
  if(s.deessOn&&s.deessStrength>0){
   const threshold=Math.pow(10,s.deessThreshold/20),strength=s.deessStrength/100;
   const lowK=1-Math.exp(-2*Math.PI*4000/rate);
   const envA=Math.exp(-1/(rate*.008));
   for(const samples of out){
    let low=0,power=0,atten=1;
    for(let i=0;i<n;i++){
     const v=samples[i];if(!Number.isFinite(v))throw Error("Muestra vocal inválida");
     low+=lowK*(v-low);
     const high=v-low;
     power=envA*power+(1-envA)*high*high;
     const rms=Math.sqrt(power);
     const target=rms>threshold?1-strength*(1-threshold/rms):1;
     // Smooth the attenuation; avoid zipper noise during fast syllables.
     atten+=(target-atten)*.055;
     samples[i]=low+atten*high;
    }
   }
  }
  return out;
 }
 return {defaults,check,process};
});
