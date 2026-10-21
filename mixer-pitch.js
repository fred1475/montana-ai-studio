"use strict";
/* Montana Music Production LLC — laboratory vocal correction within the mixer.
 * Experimental offline sustained or segmented monophonic pitch correction only.
 * The immutable original tracks[] and originalFiles[] remain authoritative.
 * Pitch buffers are separate; session restore re-renders from original audio.
 */
const pitchBuffers=Array(8).fill(null),pitchActive=Array(8).fill(false);
const pitchReports=Array(8).fill(null),pitchLevelReports=Array(8).fill(null);
const pitchTimbreReports=Array(8).fill(null),pitchNoteReports=Array(8).fill(null);
function updatePitchNotes(i,diagnosis){
 pitchNoteReports[i]=diagnosis;
 if(i===0)return;
 const container=$("pitchNoteAudit"+i);
 container.replaceChildren();
 if(!diagnosis){
  container.textContent="Sin notas medidas; procesa una toma vocal.";
  return;
 }
 const title=document.createElement("p");
 title.textContent="Notas detectadas: "+diagnosis.segments.length+
  ". Cents planificados ≠ desviación medida después del procesamiento.";
 container.append(title);
 const table=document.createElement("table");
 table.style.cssText="width:100%;font-size:.8rem;border-collapse:collapse";
 const head=document.createElement("tr");
 for(const label of ["Tiempo","Detectada","Objetivo","Corrección planeada","Resultado medido"]){
  const cell=document.createElement("th");cell.textContent=label;
  cell.style.cssText="padding:3px;text-align:left;border-bottom:1px solid #74829a";
  head.append(cell);
 }
 table.append(head);
 for(const entry of diagnosis.segments){
  const row=document.createElement("tr");
  const values=[
   entry.startSeconds+"–"+entry.endSeconds+" s",
   entry.originalNote+" ("+entry.originalHz+" Hz)",
   entry.targetNote+" ("+entry.targetNoteHz+" Hz)",
   (entry.plannedCorrectionCents>=0?"+":"")+entry.plannedCorrectionCents+" cents",
   entry.measuredOutputHz===null?"No medible":
    entry.measuredOutputHz+" Hz / "+
    (entry.measuredDeviationCents>=0?"+":"")+entry.measuredDeviationCents+" cents vs. objetivo"
  ];
  for(const val of values){
   const cell=document.createElement("td");cell.textContent=val;
   cell.style.cssText="padding:3px;border-bottom:1px solid #35445b";row.append(cell);
  }
  table.append(row);
 }
 container.append(table);
 const caution=document.createElement("small");
 caution.textContent="Estimación F0 de una ventana por nota; vibrato, ruido, consonantes y mezclas pueden impedir medir el tono. No certifica artefactos, formantes ni calidad perceptual.";
 container.append(caution);
}
function pitchTimbreText(info,enabled){
 if(!enabled)return "Protección de carácter espectral desactivada.";
 if(!info)return "Protección espectral sin análisis disponible.";
 if(info.status==="insufficient_signal")return "Protección espectral: señal insuficiente para estimar cambios de balance.";
 const before=info.originalMaxBandShiftDb===null?"N/D":info.originalMaxBandShiftDb.toFixed(1);
 const after=info.outputMaxBandShiftDb===null?"N/D":info.outputMaxBandShiftDb.toFixed(1);
 return "Protección espectral orientativa: diferencia máxima en bandas "+before+" → "+after+
  " dB; corrección aplicada "+info.wetPercent+" %. "+
  (info.status==="reduced_correction"?"Se redujo la intensidad de corrección para proteger el balance tonal. ":
   "No se redujo la corrección. ")+
  "No equivale a protección de formantes ni garantiza naturalidad.";
}
function updatePitchTimbre(i,info,enabled){
 pitchTimbreReports[i]=info;
 if(i>0)document.getElementById("pitchTimbreStatus"+i).textContent=pitchTimbreText(info,enabled);
}
function pitchMatchLabel(info,enabled){
 if(!enabled)return "Igualación de nivel desactivada (comparación sin ajustar RMS).";
 if(!info||info.status==="omitted_silent_signal")return "Igualación omitida: falta señal suficiente en alguna toma.";
 const gain=info.appliedGainDb.toFixed(2);
 return "Igualación RMS orientativa: "+(gain.startsWith("-")?"":"+")+gain+" dB aplicado a la voz afinada. "+
  (info.limited?"Límite de ganancia o margen de pico alcanzado; niveles podrían diferir.":
   "Niveles RMS aproximados sin alteración del original.")+
  " No verifica formantes ni timbre.";
}
function updatePitchMatch(i,info,enabled){
 pitchLevelReports[i]=info;
 if(i>0)document.getElementById("pitchMatchStatus"+i).textContent=pitchMatchLabel(info,enabled);
}
function pitchQaText(report){
 if(!report)return "Sin diagnóstico: procesa una toma vocal para comparar original y afinado.";
 const m=report.metrics,fmt=v=>v===null?"N/D":v.toFixed(1);
 return "QA vocal orientativo (no certificación): RMS original "+fmt(m.sourceRmsDbfs)+
  " dBFS → corregido "+fmt(m.outputRmsDbfs)+" dBFS; variación "+
  fmt(m.rmsDeltaDb)+" dB. Pico corregido "+fmt(m.outputPeakDbfs)+
  " dBFS. Saltos nuevos: "+m.newLargeSteps+". "+
  "Ventanas de posible microcorte: "+m.dropoutWindowCount+
   (m.firstDropoutSeconds===null?".":", primera en "+m.firstDropoutSeconds.toFixed(2)+
    " s (canal "+m.firstDropoutChannel+").")+" "+
  "Cambio relativo de altas (aprox. 2.5 kHz): "+fmt(m.highBandDeltaDb)+" dB. "+
  (report.stereo?"Estéreo: correlación "+fmt(report.stereo.source.correlation)+
   " → "+fmt(report.stereo.output.correlation)+"; balance L/R "+
   fmt(report.stereo.source.balanceDb)+" → "+fmt(report.stereo.output.balanceDb)+" dB. ":"")+
  (report.warnings.length?"AVISOS: "+report.warnings.map(w=>w.message).join(" "):
   "Sin alertas en estos criterios PCM; todavía requiere escucha de artefactos y formantes.");
}
function updatePitchQa(i,report){
 pitchReports[i]=report;
 if(i>0)$("pitchQa"+i).textContent=pitchQaText(report);
}
const pitchDefault=()=>({mode:"sustain",key:"C",scale:"chromatic",strength:100,wet:100,matchLevel:false,protectTimbre:false,enabled:false});
function readPitch(i){
 if(i===0)return pitchDefault();
 return {mode:$("pitchMode"+i).value,key:$("pitchKey"+i).value,
  scale:$("pitchScale"+i).value,strength:Number($("pitchStrength"+i).value),
  wet:Number($("pitchWet"+i).value),matchLevel:$("pitchMatch"+i).checked,protectTimbre:$("pitchTimbre"+i).checked,enabled:pitchActive[i]};
}
function checkPitch(p,i){
 if(!p||typeof p!=="object"||!["sustain","melody"].includes(p.mode)||
  !MontanaPitch.notes.includes(p.key)||!MontanaPitch.scales[p.scale]||
  typeof p.strength!=="number"||!Number.isFinite(p.strength)||
  p.strength<0||p.strength>100||typeof p.enabled!=="boolean"||
  (i===0&&p.enabled))throw Error("Ajustes de afinación inválidos en canal "+(i+1));
 const wet=p.wet===undefined?100:p.wet;
 if(typeof wet!=="number"||!Number.isFinite(wet)||wet<0||wet>100)throw Error("Mezcla seca/procesada inválida en canal "+(i+1));
 const matchLevel=p.matchLevel===undefined?false:p.matchLevel;
 if(typeof matchLevel!=="boolean")throw Error("Igualación de nivel inválida en canal "+(i+1));
 const protectTimbre=p.protectTimbre===undefined?false:p.protectTimbre;
 if(typeof protectTimbre!=="boolean")throw Error("Protección de carácter inválida en canal "+(i+1));
 return {...p,wet,matchLevel,protectTimbre};
}
function pitchInvalidate(i){
 window.montanaBlindReset?.(i);
 pitchBuffers[i]=null;pitchActive[i]=false;updatePitchQa(i,null);updatePitchNotes(i,null);
 updatePitchMatch(i,null,i>0&&$("pitchMatch"+i).checked);
 updatePitchTimbre(i,null,i>0&&$("pitchTimbre"+i).checked);
 if(i>0){
  $("pitchState"+i).textContent="Original — sin corrección aplicada";
  $("pitchAudit"+i).disabled=true;
  $("pitchAB"+i).disabled=true;
  $("pitchToggle"+i).disabled=true;
  $("pitchToggle"+i).textContent="Oír corregido";
 }
}
function processVocal(buffer,settings){
 if(!buffer)throw Error("Importa voz antes de afinar");
 if(buffer.numberOfChannels<1||buffer.numberOfChannels>2)throw Error("Solo voz mono/estéreo");
 const limit=settings.mode==="melody"?10:15;
 const min=settings.mode==="melody"?.65:.2;
 if(buffer.duration>limit||buffer.duration<min)throw Error("Para este modo usa una toma vocal de "+min+" a "+limit+" segundos");
 const channels=Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch).slice());
 const options={key:settings.key,scale:settings.scale,strength:settings.strength};
 const result=settings.mode==="melody"?
  MontanaMelody.processMelody(channels,buffer.sampleRate,options):
  MontanaPitch.process(channels,buffer.sampleRate,options);
 const guarded=settings.protectTimbre?
  MontanaPitchTimbreGuard.apply(channels,result.channels,buffer.sampleRate):null;
 const tonalChannels=guarded?guarded.channels:result.channels;
 const matched=settings.matchLevel?MontanaPitchLevelMatch.match(channels,tonalChannels):null;
 const processedChannels=matched?matched.channels:tonalChannels;
 const mixedChannels=MontanaPitchBlend.blend(channels,processedChannels,settings.wet);
 const corrected=audio().createBuffer(channels.length,buffer.length,buffer.sampleRate);
 mixedChannels.forEach((channel,ch)=>{
  if(channel.length!==buffer.length)throw Error("La afinación cambió la duración del audio");
  for(let j=0;j<channel.length;j++)if(!Number.isFinite(channel[j]))throw Error("Se encontró una muestra de audio inválida");
  corrected.copyToChannel(channel,ch);
 });
 const notes=settings.mode==="melody"?result.segments.map(s=>s.targetNote).join(" → "):result.target.note;
 const qa=MontanaPitchQA.analyze(channels,mixedChannels,buffer.sampleRate);
 const noteAudit=MontanaPitchNoteAudit.create(result,settings.mode,mixedChannels,buffer.sampleRate,settings);
 return {buffer:corrected,notes,qa,noteAudit,match:matched?.report||null,timbre:guarded?.report||null,referenceMode:result.analysis?.referenceMode||result.referenceMode||"mono"};
}
window.resetPitch=pitchInvalidate;
window.pitchSessionState=i=>{
 const p=checkPitch(readPitch(i),i);
 if(p.enabled&&!pitchBuffers[i])throw Error("Afinación faltante en canal "+(i+1));
 return p;
};
window.getPitchBuffer=i=>pitchActive[i]&&pitchBuffers[i]?pitchBuffers[i]:tracks[i];
window.preparePitchRestore=(loaded,records)=>{
 const restored=[];
 for(let i=0;i<8;i++){
  const p=checkPitch(records[i].pitch===undefined?pitchDefault():records[i].pitch,i);
  if(p.enabled&&!loaded[i].decoded)throw Error("Afinación sin voz en canal "+(i+1));
  // Build all corrected buffers before changing the open session (atomic restore).
  const processed=p.enabled?processVocal(loaded[i].decoded,p):null;
  restored.push({settings:{...p},buffer:processed?.buffer||null,qa:processed?.qa||null,noteAudit:processed?.noteAudit||null,match:processed?.match||null,timbre:processed?.timbre||null});
 }
 return restored;
};
window.commitPitchRestore=restored=>{
 restored.forEach(({settings,buffer,qa,noteAudit,match,timbre},i)=>{
  pitchBuffers[i]=buffer;pitchActive[i]=settings.enabled;
  if(i>0){updatePitchQa(i,qa);updatePitchNotes(i,noteAudit);updatePitchMatch(i,match,settings.matchLevel);
   updatePitchTimbre(i,timbre,settings.protectTimbre);}
  if(i===0)return;
  $("pitchMode"+i).value=settings.mode;$("pitchKey"+i).value=settings.key;
  $("pitchScale"+i).value=settings.scale;$("pitchStrength"+i).value=settings.strength;
  $("pitchStrengthValue"+i).textContent=settings.strength+"%";
  $("pitchWet"+i).value=settings.wet;$("pitchWetValue"+i).textContent=settings.wet+"%";
  $("pitchMatch"+i).checked=settings.matchLevel;
  $("pitchTimbre"+i).checked=settings.protectTimbre;
  $("pitchAudit"+i).disabled=!buffer;
  $("pitchAB"+i).disabled=!buffer;
  window.montanaBlindReady?.(i);
  $("pitchToggle"+i).disabled=!buffer;
  $("pitchToggle"+i).textContent=settings.enabled?"Oír original":"Oír corregido";
  $("pitchState"+i).textContent=buffer?"Afinación restaurada y activa":"Original — sin corrección aplicada";
 });
};
for(let i=1;i<8;i++){
 const el=document.createElement("details");el.id="pitchDetails"+i;
 el.innerHTML='<summary>🎤 Afinación vocal experimental</summary>'+
  '<label for="pitchMode'+i+'">Tipo de fragmento</label><select id="pitchMode'+i+'"><option value="sustain">Nota sostenida</option><option value="melody">Frase de varias notas (beta)</option></select>'+
  '<label for="pitchKey'+i+'">Tonalidad</label><select id="pitchKey'+i+'">'+MontanaPitch.notes.map(n=>'<option value="'+n+'">'+n+'</option>').join("")+'</select>'+
  '<label for="pitchScale'+i+'">Escala</label><select id="pitchScale'+i+'"><option value="chromatic">Cromática</option><option value="major">Mayor</option><option value="minor">Menor</option></select>'+
  '<label for="pitchStrength'+i+'">Intensidad <output id="pitchStrengthValue'+i+'">100%</output></label><input id="pitchStrength'+i+'" type="range" min="0" max="100" step="10" value="100">'+
  '<label for="pitchWet'+i+'">Mezcla de voz procesada: <output id="pitchWetValue'+i+'">100%</output></label><input id="pitchWet'+i+'" type="range" min="0" max="100" step="10" value="100">'+
  '<label><input id="pitchMatch'+i+'" type="checkbox"> Igualar nivel RMS de la voz afinada al original (opcional)</label>'+ 
  '<small>Ganancia común estéreo; límite habitual ±6 dB y margen de pico. Comparar a nivel parecido NO garantiza preservar formantes, naturalidad ni fase. La fuente sigue intacta.</small>'+ 
  '<p id="pitchMatchStatus'+i+'" role="status">Igualación de nivel desactivada (comparación sin ajustar RMS).</p>'+
  '<label><input id="pitchTimbre'+i+'" type="checkbox"> Protección experimental del carácter espectral</label>'+
  '<small>Si la afinación cambia mucho el balance entre bandas graves/medias/agudas, se reduce parte de la corrección. Puede dejar notas parcialmente desafinadas. NO identifica ni garantiza conservar formantes.</small>'+
  '<p id="pitchTimbreStatus'+i+'" role="status">Protección de carácter espectral desactivada.</p>'+ 
  '<button id="pitchApply'+i+'" type="button">🎼 Procesar voz</button> <button id="pitchToggle'+i+'" type="button" disabled>Oír corregido</button> <button id="pitchAudit'+i+'" type="button" disabled>📋 Guardar informe QA</button> <button id="pitchAB'+i+'" type="button" disabled>🎧 Descargar comparativa A/B</button>'+
  '<p id="pitchState'+i+'">Original — sin corrección aplicada</p>'+
  '<p id="pitchQa'+i+'" role="status">Sin diagnóstico: procesa una toma vocal para comparar original y afinado.</p>'+
  '<section aria-label="Diagnóstico de notas y cents"><h4>🎼 Diagnóstico de notas y cents</h4><div id="pitchNoteAudit'+i+'">Sin notas medidas; procesa una toma vocal.</div></section>'+
  '<small>Las métricas QA son heurísticas PCM, no garantizan timbre, formantes ni calidad perceptual. La afinación sigue siendo offline, limitada a fragmentos breves; fuente sin alterar.</small>';
 document.querySelectorAll("article.track")[i].append(el);
 for(const key of ["pitchMode","pitchKey","pitchScale","pitchStrength","pitchWet","pitchMatch","pitchTimbre"]){
  $(key+i).addEventListener("change",()=>pitchInvalidate(i));
 }
 $("pitchStrength"+i).addEventListener("input",()=>{
  $("pitchStrengthValue"+i).textContent=$("pitchStrength"+i).value+"%";
  pitchInvalidate(i);
 });
 $("pitchWet"+i).addEventListener("input",()=>{
  $("pitchWetValue"+i).textContent=$("pitchWet"+i).value+"%";
  pitchInvalidate(i);
 });
 $("pitchApply"+i).addEventListener("click",async()=>{
  const btn=$("pitchApply"+i);btn.disabled=true;
  try{
   const state=checkPitch(readPitch(i),i);
   if(!tracks[i])throw Error("Importa una voz en el canal");
   report("Procesando afinación en canal "+(i+1)+"...");
   stop();
   // Yield a frame for the feedback to become visible before synchronous DSP.
   await new Promise(resolve=>setTimeout(resolve,0));
   const result=processVocal(tracks[i],state);
   pitchBuffers[i]=result.buffer;pitchActive[i]=true;updatePitchQa(i,result.qa);
   updatePitchNotes(i,result.noteAudit);
   updatePitchMatch(i,result.match,state.matchLevel);
   updatePitchTimbre(i,result.timbre,state.protectTimbre);
   $("pitchAudit"+i).disabled=false;
   $("pitchAB"+i).disabled=false;
   window.montanaBlindReady?.(i);
   $("pitchToggle"+i).disabled=false;$("pitchToggle"+i).textContent="Oír original";
   $("pitchState"+i).textContent="Afinación activa: "+result.notes+" · Mezcla procesada "+state.wet+"%"+(result.referenceMode==="phase-safe-channel"?" · Detector protegido contra cancelación de fase":result.referenceMode==="stronger-channel"?" · Detector usando canal más fuerte":"");
   report("Canal "+(i+1)+" afinado (beta). Alterna original/corregido y escucha antes de exportar.");
  }catch(err){report("No se aplicó afinación: "+err.message)}finally{btn.disabled=false}
 });
 $("pitchToggle"+i).addEventListener("click",()=>{
  if(!pitchBuffers[i])return;
  stop();pitchActive[i]=!pitchActive[i];
  $("pitchToggle"+i).textContent=pitchActive[i]?"Oír original":"Oír corregido";
  $("pitchState"+i).textContent=pitchActive[i]?"Afinación activa":"Original activo; corrección disponible";
  report("Canal "+(i+1)+": "+(pitchActive[i]?"afinado":"original")+". Reproduce para comparar.");
 });
}
