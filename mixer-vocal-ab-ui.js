"use strict";
/* Download paired vocal WAV + QA locally only by explicit user action. */
(function(){
 for(let i=1;i<8;i++){
  const button=document.getElementById("pitchAB"+i);
  button.addEventListener("click",async()=>{
   if(!tracks[i]||!pitchBuffers[i]||!pitchReports[i]||!originalFiles[i]){
    report("Procesa primero una toma vocal para crear el paquete A/B.");
    return;
   }
   button.disabled=true;
   const raw=tracks[i],wet=pitchBuffers[i],file=originalFiles[i];
   try{
    const settings=window.pitchSessionState(i);
    // Toggling A/B playback switches the active source but does not discard
    // the corrected buffer. The package always compares both full buffers.
    const audit=MontanaVocalAudit.create({
     track:i+1,sourceName:file.name,pitch:{...settings,enabled:true},
     qa:pitchReports[i],level:pitchLevelReports[i],timbre:pitchTimbreReports[i],
     noteAnalysis:pitchNoteReports[i],
     artifactTimeline:pitchArtifactReports[i],
     createdAt:new Date().toISOString()
    });
    report("Preparando comparativa A/B del canal "+(i+1)+" sin alterar la fuente...");
    const packageData=await MontanaVocalAB.makePackage(raw,wet,audit);
    // Never download a package misattributed to a newer take/project after
    // an asynchronous encode.
    if(tracks[i]!==raw||pitchBuffers[i]!==wet||originalFiles[i]!==file)
     throw Error("La toma cambió durante la exportación; vuelve a intentarlo");
    const url=URL.createObjectURL(new Blob([packageData.bytes],{type:"application/zip"}));
    const a=document.createElement("a");a.href=url;
    a.download="montana-voz-AB-canal-"+(i+1)+".zip";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    report("Comparativa A/B del canal "+(i+1)+" descargada: voz original decodificada y afinada como WAV PCM16, QA y guía. Escucha ambas para evaluar naturalidad.");
   }catch(e){report("No se exportó comparativa A/B: "+e.message)}
   finally{button.disabled=!(tracks[i]&&pitchBuffers[i]&&pitchReports[i]);}
  });
 }
})();
