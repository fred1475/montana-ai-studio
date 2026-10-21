/* Montana Music Production LLC — BS.1770-5 / EBU R128-derived offline loudness diagnostics.
 * K weighting; 400ms blocks with 75% overlap and absolute/relative gates.
 * Includes ungated momentary (400ms), short-term (3s), gated integrated\n * and EBU Tech 3342 LRA (10th to 95th percentiles, -20 LU relative gate).\n * Stereo 1+1 channels (each weight 1). Intersample peak estimated using
 * polyphase windowed-sinc 4x; not independently certified to EBU R128.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaLoudness=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const db=x=>x>1e-16?20*Math.log10(x):-Infinity;
 const loud=x=>x>1e-16?-0.691+10*Math.log10(x):-Infinity;
 function coeff(rate){
  function section(freq,q,shelf=false){
   const k=Math.tan(Math.PI*freq/rate),k2=k*k,den=1+k/q+k2;
   const a1=2*(k2-1)/den,a2=(1-k/q+k2)/den;
   if(!shelf)return [1,-2,1,a1,a2]; // BS.1770 stage-2 numerator is [1,-2,1]
   const vH=Math.pow(10,3.999843853973347/20),vB=Math.pow(vH,0.4996667741545416);
   return [(vH+vB*k/q+k2)/den,2*(k2-vH)/den,(vH-vB*k/q+k2)/den,a1,a2];
  }
  return [section(1681.974450955533,0.7071752369554196,true),section(38.13547087602444,0.5003270373238773)];
 }
 function biquad(c){
  let x1=0,x2=0,y1=0,y2=0;
  return sample=>{
   const y=c[0]*sample+c[1]*x1+c[2]*x2-c[3]*y1-c[4]*y2;
   x2=x1;x1=sample;y2=y1;y1=y;return y;
  };
 }
 const kernel=(()=>{
  const out=[];const radius=6;
  for(const f of [.25,.5,.75]){
   const weights=[];
   for(let k=-5;k<=6;k++){
    const x=k-f,z=Math.PI*x;
    const sinc=Math.abs(x)<1e-12?1:Math.sin(z)/z;
    const window=Math.abs(x)<radius?(0.42+0.5*Math.cos(Math.PI*x/radius)+0.08*Math.cos(2*Math.PI*x/radius)):0;
    weights.push(sinc*window);
   }
   const sum=weights.reduce((s,w)=>s+w,0);
   out.push(weights.map(w=>w/sum));
  }
  return out;
 })();
 function intersamplePeak(left,right,start,end,basePeak=0){
  let peak=basePeak;
  const buffers=[left,right],n=left.length;
  for(let i=start;i<end;i++){
   for(const channel of buffers){
    peak=Math.max(peak,Math.abs(channel[i]));
    for(let phase=0;phase<3;phase++){
     const h=kernel[phase];let y=0;
     for(let k=0;k<12;k++){
      const idx=i+k-5;
      if(idx>=0&&idx<n)y+=channel[idx]*h[k];
     }
     peak=Math.max(peak,Math.abs(y));
    }
   }
  }
  return peak;
 }
 async function measure(left,right,rate,opts={}){
  if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||left.length!==right.length||left.length===0)throw Error("PCM estéreo inválido");
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error("Frecuencia de muestreo inválida");
  const n=left.length,win=Math.round(rate*.4),hop=Math.round(rate*.1);
  if(n<win)throw Error("Se requieren por lo menos 400 ms para medir LUFS integrado");
  if(n>rate*300)throw Error("El análisis está limitado a cinco minutos");
  const [shelf,hp]=coeff(rate);
  const leftShelf=biquad(shelf),rightShelf=biquad(shelf),leftHP=biquad(hp),rightHP=biquad(hp);
  const shortWin=Math.round(rate*3),shortRing=new Float64Array(shortWin),shortBlocks=[];
  const ring=new Float64Array(win),blocks=[];
  let shortSum=0,momentaryLufs=-Infinity,shortTermLufs=-Infinity,maxMomentaryLufs=-Infinity,maxShortTermLufs=-Infinity;
  let sum=0,peak=0,oversampled=0;
  const chunk=Math.max(hop,Math.min(n,Math.floor(rate*2)));
  for(let i=0;i<n;i++){
   const l=left[i],r=right[i];
   if(!Number.isFinite(l)||!Number.isFinite(r))throw Error("El audio contiene valores inválidos");
   peak=Math.max(peak,Math.abs(l),Math.abs(r));
   const xl=leftHP(leftShelf(l)),xr=rightHP(rightShelf(r));
   const energy=xl*xl+xr*xr;
   const old=ring[i%win];ring[i%win]=energy;sum+=energy-old;
   const prior=shortRing[i%shortWin];shortRing[i%shortWin]=energy;shortSum+=energy-prior;
   if(i+1>=win&&(i+1-win)%hop===0){
    const power=Math.max(0,sum/win);
    blocks.push(power);momentaryLufs=loud(power);maxMomentaryLufs=Math.max(maxMomentaryLufs,momentaryLufs);
   }
   if(i+1>=shortWin&&(i+1-shortWin)%hop===0){
    const power=Math.max(0,shortSum/shortWin);
    shortBlocks.push(power);shortTermLufs=loud(power);maxShortTermLufs=Math.max(maxShortTermLufs,shortTermLufs);
   }
   if((i+1)%chunk===0){
    oversampled=intersamplePeak(left,right,i+1-chunk,i+1,oversampled);
    if(opts.yieldToBrowser)await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  const remainder=n%chunk;
  if(remainder)oversampled=intersamplePeak(left,right,n-remainder,n,oversampled);
  const abs=blocks.filter(e=>loud(e)>=-70);
  const shortAbs=shortBlocks.filter(e=>loud(e)>=-70);
  let loudnessRangeLu=null;
  if(shortAbs.length>=2){
   const avg=shortAbs.reduce((s,x)=>s+x,0)/shortAbs.length;
   const gate=loud(avg)-20; // EBU Tech 3342 relative gate for LRA
   const valid=shortAbs.filter(e=>loud(e)>=gate).map(loud).sort((a,b)=>a-b);
   if(valid.length>=2){
    const percentile=p=>{
     const pos=(valid.length-1)*p,low=Math.floor(pos),high=Math.ceil(pos);
     return valid[low]+(valid[high]-valid[low])*(pos-low);
    };
    loudnessRangeLu=Math.max(0,percentile(.95)-percentile(.10));
   }
  }
  const extra={momentaryLufs,shortTermLufs,maxMomentaryLufs,maxShortTermLufs,
   loudnessRangeLu,lraStable:n>=rate*60};
  if(!abs.length)return {integratedLufs:-Infinity,truePeakDbtp:db(oversampled),truePeak:oversampled,samplePeakDbfs:db(peak),gatedBlocks:0,totalBlocks:blocks.length,...extra};
  const mean=abs.reduce((s,x)=>s+x,0)/abs.length;
  const relative=loud(mean)-10;
  const gated=abs.filter(e=>loud(e)>=relative);
  const gatedPower=gated.reduce((s,x)=>s+x,0)/gated.length;
  return {integratedLufs:loud(gatedPower),truePeakDbtp:db(oversampled),truePeak:oversampled,samplePeakDbfs:db(peak),gatedBlocks:gated.length,totalBlocks:blocks.length,...extra};
 }
 return {measure};
});
