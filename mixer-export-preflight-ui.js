"use strict";
/* Non-rendering, on-demand estimate for the currently loaded project.
 * This is a capacity advisory, not a prediction of process memory usage.
 */
(function(){
 const button=document.getElementById("estimateExport");
 const out=document.getElementById("exportEstimateStatus");
 if(!button||!out)throw Error("Panel de estimación no disponible");
 button.addEventListener("click",()=>{
  try{
   if(!tracks.some(Boolean))throw Error("Primero importa una pista");
   const endpoints=tracks.map((buffer,i)=>buffer?
    window.getTrackSegments(i,buffer).map(c=>c.offset+c.duration+effectTail(i)):[]
   ).flat();
   const end=Math.max(0,...endpoints);
   if(!Number.isFinite(end)||end<=0)throw Error("Duración de proyecto inválida");
   const active=tracks.filter(Boolean).length;
   const masterRate=Number(document.getElementById("wavSampleRate").value);
   const stemRate=Number(document.getElementById("stemSampleRate").value);
   const master=MontanaExportPreflight.estimate({
    frames:Math.ceil(end*masterRate),rate:masterRate,
    bits:Number(document.getElementById("wavBits").value),kind:"master",
    audit:document.getElementById("auditOn").checked
   });
   const stems=MontanaExportPreflight.estimate({
    frames:Math.ceil(end*stemRate),rate:stemRate,
    bits:Number(document.getElementById("stemBits").value),kind:"stems",stemCount:active
   });
   const totalSeconds=end.toFixed(2);
   const lowerBound=(Math.max(master.minimumWorkingBytes,stems.minimumWorkingBytes)/MontanaExportPreflight.MiB).toFixed(1);
   const warnings=[...new Set([...master.warnings,...stems.warnings])];
   out.textContent="Duración prevista: "+totalSeconds+" s. "+master.summary+". "+
    stems.summary+". Buffer temporal mínimo orientativo: "+lowerBound+
    " MiB (no incluye las pistas originales, efectos, navegador ni el sistema). "+
    (warnings.length?"Avisos: "+warnings.join("; ")+".":"El tamaño calculado está dentro de los límites internos. ")+
    "Este cálculo no exporta, no modifica audio y no garantiza que haya RAM disponible.";
  }catch(error){
   out.textContent="No se puede planificar esta exportación: "+error.message+
    ". El proyecto y sus archivos originales no cambiaron.";
  }
 });
})();
