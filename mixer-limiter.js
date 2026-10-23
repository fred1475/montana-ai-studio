/* Montana Music Production LLC — stereo-linked offline sample-peak limiter.
 * Not a true-peak, LUFS, or mastering-certified brickwall limiter.
 * Applies predictive attenuation before PCM16 WAV encoding; it never
 * changes the imported/recorded originals, and it preserves stereo balance.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaLimiter=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function limitStereo(left,right,rate,ceilingDb=-1){
  if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||left.length!==right.length||!left.length)
   throw Error("Canales estéreo inválidos");
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error("Frecuencia de muestreo inválida");
  if(!Number.isFinite(ceilingDb)||ceilingDb< -6||ceilingDb>-.5)throw Error("Techo del limitador inválido");
  const ceiling=Math.pow(10,ceilingDb/20),n=left.length;
  const required=new Float32Array(n);
  let peakIn=0,peakOut=0,minGain=1;
  for(let i=0;i<n;i++){
   const p=Math.max(Math.abs(left[i]),Math.abs(right[i]));
   if(!Number.isFinite(p))throw Error("Señal de audio inválida");
   if(p>peakIn)peakIn=p;
   required[i]=p>ceiling?ceiling/p:1;
  }
  const attack=Math.max(1,Math.floor(rate*.004)),release=Math.max(1,Math.floor(rate*.09));
  // Propagate attenuation backwards: approximately 4ms pre-attack, to
  // smooth transient approach while guaranteeing sample peak ceiling.
  for(let i=n-2;i>=0;i--){
   const future=required[i+1];
   const maxCurrent=future+(1-future)/attack;
   if(required[i]>maxCurrent)required[i]=maxCurrent;
  }
  let gain=1;
  for(let i=0;i<n;i++){
   gain=Math.min(required[i],gain+(1-gain)/release);
   if(gain<minGain)minGain=gain;
   left[i]*=gain;right[i]*=gain;
   const p=Math.max(Math.abs(left[i]),Math.abs(right[i]));
   if(p>peakOut)peakOut=p;
  }
  return {peakIn,peakOut,ceilingDb,minimumGain:minGain,
   maximumReductionDb:minGain<1?-20*Math.log10(minGain):0};
 }
 return {limitStereo};
});
