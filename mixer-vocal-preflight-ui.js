"use strict";
// Read-only diagnostics of the source audio; never call getMixBuffer() here
// because it can apply pitch, cleanup or other non-original transformations.
(function(){
 const empty="Diagnóstico no ejecutado. Importa una voz y pulsa Analizar fuente.";
 function reset(i){
  if(i>0&&i<8){
   const out=document.getElementById("vocalPreflightResult"+i);
   if(out)out.textContent=empty;
  }
 }
 window.resetVocalPreflight=reset;
 for(let i=1;i<8;i++){
  const details=document.createElement("details");
  details.id="vocalPreflightDetails"+i;
  details.innerHTML='<summary>🔎 Diagnóstico de toma vocal (fuente original)</summary>'+
   '<button type="button" id="analyzeVocalSource'+i+'">Analizar fuente sin modificarla</button>'+
   '<p id="vocalPreflightResult'+i+'" role="status"></p>'+
   '<small>Solo mide PCM decodificado original. Señala nivel, muestras cerca de escala completa, DC y posible cancelación al sumar estéreo a mono. No prueba saturación analógica ni calidad profesional.</small>';
  document.querySelectorAll("article.track")[i].append(details);
  const button=document.getElementById("analyzeVocalSource"+i);
  const out=document.getElementById("vocalPreflightResult"+i);
  out.textContent=empty;
  button.addEventListener("click",async()=>{
   button.disabled=true;
   out.textContent="Analizando únicamente la fuente original...";
   try{
    if(!tracks[i])throw Error("Primero importa o graba voz en este canal");
    const source=tracks[i];
    // Yield one UI frame on the main thread; no permission, network, or upload.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const channels=Array.from({length:source.numberOfChannels},(_,ch)=>source.getChannelData(ch));
    const reportData=MontanaVocalPreflight.analyze(channels,source.sampleRate);
    // Discard stale findings if the original audio changed during evaluation.
    if(tracks[i]!==source){out.textContent="La toma cambió. Analiza la nueva fuente.";return}
    const m=reportData.metrics;
    const fmt=v=>v===null?"N/D":v.toFixed(1);
    out.textContent="Fuente: "+fmt(reportData.durationSeconds)+" s · Pico: "+fmt(m.peakDbfs)+
     " dBFS · RMS: "+fmt(m.rmsDbfs)+" dBFS · DC máx.: "+
     Math.max(...m.dcOffset.map(Math.abs)).toFixed(4)+
     " · Correlación L/R: "+(m.stereoCorrelation===null?"N/D":m.stereoCorrelation.toFixed(3))+
     " · Muestras cercanas a escala completa: "+m.nearFullScaleSamples+
     ". "+(reportData.warnings.length?
        "Avisos: "+reportData.warnings.map(w=>w.label).join("; ")+".":"Sin avisos en los criterios internos.")+
     " Lectura orientativa, no es una certificación.";
   }catch(err){out.textContent="No se pudo analizar: "+err.message}
   finally{button.disabled=false}
  });
 }
})();
