/* Montana Music Production LLC — experimental vocal dry/wet mixer.
 * Local offline Float32 arrays only. Equal-gain blend; not phase aligned,
 * not a formant correction, and never overwrites source channels.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaPitchBlend=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function blend(dry,wet,amount=100){
  if(!Array.isArray(dry)||!Array.isArray(wet)||dry.length<1||
     dry.length>2||wet.length!==dry.length||
     !Number.isFinite(amount)||amount<0||amount>100)
   throw Error("Mezcla vocal inválida");
  const n=dry[0]?.length;
  if(!Number.isSafeInteger(n)||n<1)throw Error("Duración vocal inválida");
  const ratio=amount/100;
  const out=[];
  for(let ch=0;ch<dry.length;ch++){
   const a=dry[ch],b=wet[ch];
   if(!(a instanceof Float32Array)||!(b instanceof Float32Array)||
      a.length!==n||b.length!==n)
    throw Error("Canales de mezcla incompatibles");
   const c=new Float32Array(n);
   for(let i=0;i<n;i++){
    const x=a[i],y=b[i];
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error("PCM vocal no finito");
    c[i]=ratio===0?x:ratio===1?y:x*(1-ratio)+y*ratio;
    if(!Number.isFinite(c[i]))throw Error("Mezcla vocal fuera de rango");
   }
   out.push(c);
  }
  return out;
 }
 return {blend};
});
