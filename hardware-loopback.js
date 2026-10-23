/* Montana Music Production LLC — physical loopback LATENCY ESTIMATE (not certified).
 * The browser schedules an original generated signal and timestamps a parallel
 * AudioWorklet capture in one AudioContext timebase. Estimate returned delay
 * by normalized correlation; never claim driver-level or universal latency.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaLoopback=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const frequencies=[907,1163,1523,1931,2477,1367,2081,1613,1031],
  moments=[.045,.116,.209,.302,.416,.533,.687,.836,.997];
 function createProbe(rate){
  if(!Number.isInteger(rate)||rate<16000||rate>192000)throw Error("Frecuencia de audio inválida");
  const output=new Float32Array(Math.round(rate*1.13)),width=Math.round(rate*.009);
  for(let j=0;j<moments.length;j++){
   const first=Math.round(rate*moments[j]),phase=j*.47;
   for(let k=0;k<width&&first+k<output.length;k++){
    const w=Math.sin(Math.PI*k/Math.max(1,width-1))**2;
    output[first+k]+=(j%2?-1:1)*.10*w*Math.sin(2*Math.PI*frequencies[j]*k/rate+phase);
   }
  }
  return output;
 }
 function estimate(captured,reference,rate,outputStartFrame,firstCapturedFrame,limitMs=750){
  if(!(captured instanceof Float32Array)||!(reference instanceof Float32Array)||
     !Number.isInteger(rate)||rate<16000||rate>192000||
     !Number.isInteger(outputStartFrame)||outputStartFrame<0||!Number.isInteger(firstCapturedFrame)||firstCapturedFrame<0||
     !Number.isFinite(limitMs)||limitMs<10||limitMs>2000)
   throw Error("Parámetros de calibración inválidos");
  const nominal=outputStartFrame-firstCapturedFrame,maxLag=Math.round(rate*limitMs/1000);
  if(nominal<0||nominal+reference.length+maxLag>captured.length)
   throw Error("Grabación incompleta: falta audio antes o después del pulso");
  let capPeak=0;
  for(let i=0;i<captured.length;i++){
   if(!Number.isFinite(captured[i]))throw Error("Captura corrupta");
   capPeak=Math.max(capPeak,Math.abs(captured[i]));
  }
  if(capPeak<.0005)throw Error("No se detectó señal de retorno por la interfaz");
  const positions=[],referenceValues=[];
  for(let i=0;i<reference.length;i+=6){
   if(Math.abs(reference[i])>.003){positions.push(i);referenceValues.push(reference[i]);}
  }
  if(positions.length<50)throw Error("Pulso de referencia insuficiente");
  let refPower=0;for(const v of referenceValues)refPower+=v*v;
  function match(offset){
   let dot=0,power=0;
   for(let j=0;j<positions.length;j++){
    const v=captured[nominal+offset+positions[j]],source=referenceValues[j];
    dot+=v*source;power+=v*v;
   }
   return power>1e-9?dot/Math.sqrt(refPower*power):0;
  }
  let bestScore=-Infinity,bestLag=0;
  for(let lag=0;lag<=maxLag;lag+=4){
   const s=match(lag);
   if(s>bestScore){bestScore=s;bestLag=lag}
  }
  for(let lag=Math.max(0,bestLag-5);lag<=Math.min(maxLag,bestLag+5);lag++){
   const s=match(lag);
   if(s>bestScore){bestScore=s;bestLag=lag}
  }
  if(bestScore<.42)throw Error("Señal de loopback ambigua o demasiado débil. No se informa latencia");
  return {estimatedRoundTripMs:Math.round(bestLag/rate*100000)/100,
   lagSamples:bestLag,matchScore:Math.round(bestScore*10000)/10000,
   sourceRate:rate,inputPeakDbfs:20*Math.log10(capPeak),
   caveat:"ESTIMACIÓN de ida y vuelta del trayecto físico con un mismo AudioContext. No es calibración certificada, compensación automática ni garantía de sincronía de grabación."};
 }
 return {createProbe,estimate};
});