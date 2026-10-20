"use strict";
/* Montana Music Production — non-destructive per-clip fade in/out.
 * One automated AudioParam envelope shared by listening, rendering stems,
 * overdub guide and complete WAV export.
 */
(function(){
 function values(i){
  const fadeIn=Number($("fadeIn"+i).value),fadeOut=Number($("fadeOut"+i).value);
  if(!Number.isFinite(fadeIn)||!Number.isFinite(fadeOut)||fadeIn<0||fadeIn>5||fadeOut<0||fadeOut>5)
   throw Error("Fundido inválido en canal "+(i+1)+": use entre 0 y 5 segundos");
  return {fadeIn,fadeOut};
 }
 window.validateFades=values;
 window.connectFades=(ctx,source,destination,i,clip,when)=>{
  const {fadeIn,fadeOut}=values(i);
  if(!clip||!Number.isFinite(clip.duration)||clip.duration<=0||!Number.isFinite(when)||when<0)
   throw Error("Región o inicio inválido para fundido en canal "+(i+1));
  if(!fadeIn&&!fadeOut){source.connect(destination);return destination}
  const envelope=ctx.createGain(),param=envelope.gain;
  const factor=Math.min(1,clip.duration/(fadeIn+fadeOut));
  const fi=fadeIn*factor,fo=fadeOut*factor,end=when+clip.duration;
  source.connect(envelope);envelope.connect(destination);
  param.setValueAtTime(fi?0:1,when);
  if(fi)param.linearRampToValueAtTime(1,when+fi);
  if(fo){
   param.setValueAtTime(1,end-fo);
   param.linearRampToValueAtTime(0,end);
  }
  return envelope;
 };
})();
