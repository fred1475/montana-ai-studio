"use strict";
/* Explicit local download, no upload and no original vocal samples in JSON. */
(function(){
 for(let i=1;i<8;i++){
  const button=document.getElementById("pitchAudit"+i);
  button.addEventListener("click",()=>{
   if(!pitchReports[i]||!originalFiles[i]){
    report("Procesa una toma vocal para crear el informe QA.");
    return;
   }
   try{
    const audit=MontanaVocalAudit.create({
     track:i+1,sourceName:originalFiles[i].name,
     pitch:window.pitchSessionState(i),qa:pitchReports[i],
     level:pitchLevelReports[i],timbre:pitchTimbreReports[i],
     createdAt:new Date().toISOString()
    });
    const blob=new Blob([JSON.stringify(audit,null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.download="montana-qa-vocal-canal-"+(i+1)+".json";
    link.href=url;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    report("Informe QA vocal del canal "+(i+1)+" descargado localmente. No contiene audio ni certifica formantes.");
   }catch(e){report("No se pudo exportar QA vocal: "+e.message);}
  });
 }
})();
