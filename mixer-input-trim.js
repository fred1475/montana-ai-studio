/* Montana Music Production LLC — safe input trim before channel fader,
 * EQ, compressor, reverb, delay and metering. No original WAV mutation.
 * Track trim does NOT replace clip envelopes/automation.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaInputTrim=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MIN_DB=-24,MAX_DB=12;
 function validate(db){
  if(typeof db!=="number"||!Number.isFinite(db)||db<MIN_DB||db>MAX_DB||
     Math.round(db*2)!==db*2)throw Error("Entrada de pista fuera del rango -24 a +12 dB (pasos de 0.5)");
  return db;
 }
 function amplitude(db){return Math.pow(10,validate(db)/20);}
 function attach(ctx,output,db){
  if(!ctx||typeof ctx.createGain!=="function"||
     !output||typeof output.connect!=="function")
    throw Error("Cadena de audio para entrada inválida");
  const input=ctx.createGain();
  input.gain.value=amplitude(db);
  input.connect(output);
  return input;
 }
 return {MIN_DB,MAX_DB,validate,amplitude,attach};
});
