"use strict";
/* Montana Music Production LLC — experimental offline WSOLA time stretching.
 * Changes duration while preserving sample rate and approximate fundamental
 * frequency. Transients and complex polyphony may still smear: NOT production
 * quality certification. Uses one shared alignment plan for stereo channels.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaTimeStretch=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 function validate(channels,rate,ratio){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
     channels.some(c=>!(c instanceof Float32Array))||
     !Number.isInteger(rate)||rate<8000||rate>96000||
     !Number.isFinite(ratio)||ratio<.8||ratio>1.25)
   throw Error("Formato o relación de estiramiento inválido");
  const n=channels[0].length;
  if(n<rate*.3||n>rate*12||channels.some(c=>c.length!==n))
   throw Error("Usa audio de 0.3 a 12 segundos con canales de igual longitud");
  for(const channel of channels)for(let i=0;i<n;i++){
   if(!Number.isFinite(channel[i]))throw Error("Audio con muestras inválidas");
  }
  return n;
 }
 function reference(channels){
  if(channels.length===1)return channels[0];
  const [left,right]=channels;
  let l=0,r=0,cross=0;
  for(let i=0;i<left.length;i++){l+=left[i]*left[i];r+=right[i]*right[i];cross+=left[i]*right[i]}
  const correlation=l>1e-12&&r>1e-12?cross/Math.sqrt(l*r):0;
  if(correlation<-.5||Math.min(l,r)<.04*Math.max(l,r))return l>=r?left:right;
  const mono=new Float32Array(left.length);
  for(let i=0;i<mono.length;i++)mono[i]=.5*(left[i]+right[i]);
  return mono;
 }
 function stretch(channels,rate,ratio){
  const n=validate(channels,rate,ratio);
  const outFrames=Math.round(n*ratio);
  if(ratio===1)return {channels:channels.map(c=>c.slice()),rate,ratio,sourceFrames:n,outputFrames:n};
  const frame=Math.max(256,2*Math.round(rate*.04/2)),hop=frame/2,search=Math.max(8,Math.round(rate*.005));
  if(n<frame*3)throw Error("Audio demasiado corto para la ventana temporal");
  const ref=reference(channels),positions=[0],sources=[0];
  let previous=0;
  for(let position=hop;position<outFrames;position+=hop){
   const ideal=Math.round(position/ratio);
   const lo=Math.max(0,previous+Math.floor(hop*.45),ideal-search);
   const hi=Math.min(n-frame,ideal+search);
   let best=Math.max(0,Math.min(n-frame,ideal));
   if(lo<=hi){
    let high=-Infinity;
    // Compare the previous input frame's second half with candidates'
    // first half, keeping the waveform's phase continuous across the join.
    for(let candidate=lo;candidate<=hi;candidate+=4){
     let xy=0,x2=0,y2=0;
     for(let k=0;k<hop;k+=8){
      const x=ref[previous+hop+k],y=ref[candidate+k];
      xy+=x*y;x2+=x*x;y2+=y*y;
     }
     const score=x2>1e-11&&y2>1e-11?
      xy/Math.sqrt(x2*y2)-.008*Math.abs(candidate-ideal)/search:
      -.008*Math.abs(candidate-ideal)/search;
     if(score>high){high=score;best=candidate}
    }
   }
   positions.push(position);sources.push(best);previous=best;
  }
  const w=new Float32Array(frame);
  for(let k=0;k<frame;k++)w[k]=.5-.5*Math.cos(2*Math.PI*(k+.5)/frame);
  const weights=new Float32Array(outFrames);
  const output=channels.map(()=>new Float32Array(outFrames));
  for(let segment=0;segment<positions.length;segment++){
   const at=positions[segment],src=sources[segment],size=Math.min(frame,outFrames-at);
   for(let k=0;k<size;k++){
    const weight=w[k],dst=at+k;
    weights[dst]+=weight;
    for(let ch=0;ch<channels.length;ch++)output[ch][dst]+=channels[ch][src+k]*weight;
   }
  }
  for(let i=0;i<outFrames;i++){
   for(let ch=0;ch<channels.length;ch++)output[ch][i]=weights[i]>.000001?
    output[ch][i]/weights[i]:channels[ch][Math.min(n-1,Math.round(i/ratio))];
  }
  return {channels:output,rate,ratio,sourceFrames:n,outputFrames:outFrames};
 }
 return Object.freeze({stretch});
});
