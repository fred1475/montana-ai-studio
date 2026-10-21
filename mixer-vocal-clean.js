"use strict";
// Optional offline preprocessing before playback/export: original audio is never touched.
(function(){
 const cache=Array(8).fill(null);
 const keys=["gateOn","gateThreshold","gateReduction","deessOn","deessThreshold","deessStrength"];
 const defaults=MontanaVocalClean.defaults;
 function state(i){
  if(i===0)return defaults();
  const result={
   gateOn:$("gateOn"+i).checked,gateThreshold:Number($("gateThreshold"+i).value),
   gateReduction:Number($("gateReduction"+i).value),deessOn:$("deessOn"+i).checked,
   deessThreshold:Number($("deessThreshold"+i).value),deessStrength:Number($("deessStrength"+i).value)
  };
  return MontanaVocalClean.check(result);
 }
 function clear(i){cache[i]=null;if(i>0)$("cleanResult"+i).textContent="Se aplica al reproducir o exportar (sin cambiar el original)."}
 window.resetClean=clear;
 window.cleanSessionState=state;
 window.prepareCleanRestore=records=>records.map((record,i)=>{
  const v=record.clean===undefined?defaults():record.clean;
  MontanaVocalClean.check(v);
  if(i===0&&(v.gateOn||v.deessOn))throw Error("Limpieza vocal inválida en instrumental");
  return {...v};
 });
 window.commitCleanRestore=records=>{
  records.forEach((v,i)=>{
   cache[i]=null;
   if(i===0)return;
   for(const k of keys){
    const input=$(k+i);
    if(typeof v[k]==="boolean")input.checked=v[k];else input.value=v[k];
   }
   for(const k of ["gateThreshold","gateReduction","deessThreshold","deessStrength"]){
    $("cleanVal"+k+i).textContent=Number(v[k])+(k==="deessStrength"?"%":" dB");
   }
   $("cleanResult"+i).textContent="Limpieza cargada; lista para reproducir.";
  });
 };
 window.getMixBuffer=i=>{
  const source=window.getPitchBuffer(i);
  if(!source||i===0)return source;
  const settings=state(i);
  if(!settings.gateOn&&!settings.deessOn)return source;
  const signature=JSON.stringify(settings),cached=cache[i];
  if(cached&&cached.source===source&&cached.signature===signature)return cached.buffer;
  if(source.numberOfChannels<1||source.numberOfChannels>2)throw Error("Limpieza solo disponible para pistas mono/estéreo");
  const data=Array.from({length:source.numberOfChannels},(_,ch)=>source.getChannelData(ch));
  const corrected=MontanaVocalClean.process(data,source.sampleRate,settings);
  const result=audio().createBuffer(source.numberOfChannels,source.length,source.sampleRate);
  corrected.forEach((samples,ch)=>result.copyToChannel(samples,ch));
  cache[i]={source,signature,buffer:result};
  $("cleanResult"+i).textContent="Limpieza aplicada al audio de esta pista.";
  return result;
 };
 for(let i=1;i<8;i++){
  const section=document.createElement("details");section.id="cleanDetails"+i;
  section.innerHTML='<summary>🧹 Limpieza vocal: gate y de-esser</summary>'+
   '<label><input type="checkbox" id="gateOn'+i+'"> Activar puerta de ruido</label>'+
   '<label for="gateThreshold'+i+'">Umbral puerta <output id="cleanValgateThreshold'+i+'">-35 dB</output></label><input id="gateThreshold'+i+'" type="range" min="-60" max="-15" step="1" value="-35">'+
   '<label for="gateReduction'+i+'">Reducción en silencio <output id="cleanValgateReduction'+i+'">-45 dB</output></label><input id="gateReduction'+i+'" type="range" min="-60" max="-12" step="1" value="-45">'+
   '<label><input type="checkbox" id="deessOn'+i+'"> Activar de-esser (sibilancias)</label>'+
   '<label for="deessThreshold'+i+'">Umbral de-esser <output id="cleanValdeessThreshold'+i+'">-32 dB</output></label><input id="deessThreshold'+i+'" type="range" min="-50" max="-15" step="1" value="-32">'+
   '<label for="deessStrength'+i+'">Intensidad de-esser <output id="cleanValdeessStrength'+i+'">75%</output></label><input id="deessStrength'+i+'" type="range" min="0" max="100" step="5" value="75">'+
   '<p id="cleanResult'+i+'">Se aplica al reproducir o exportar (sin cambiar el original).</p>'+
   '<small>Procesamiento local básico: el de-esser comparte un detector y la misma reducción entre canales estéreo para minimizar alteraciones de imagen; el ataque se adapta a la frecuencia de muestreo. No sustituye reducción espectral ni limpieza profesional. Escucha el resultado para detectar artefactos.</small>';
  document.querySelectorAll("article.track")[i].append(section);
  for(const k of keys){
   const input=$(k+i);
   input.addEventListener("input",()=>{
    if(k!=="gateOn"&&k!=="deessOn")$("cleanVal"+k+i).textContent=input.value+(k==="deessStrength"?"%":" dB");
    clear(i);
   });
   if(k==="gateOn"||k==="deessOn")input.addEventListener("change",()=>clear(i));
  }
 }
})();
