"use strict";
/* Montana Music Production LLC — laboratory vocal correction within the mixer.
 * Experimental offline sustained or segmented monophonic pitch correction only.
 * The immutable original tracks[] and originalFiles[] remain authoritative.
 * Pitch buffers are separate; session restore re-renders from original audio.
 */
const pitchBuffers=Array(8).fill(null),pitchActive=Array(8).fill(false);
const pitchReports=Array(8).fill(null);
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
const pitchDefault=()=>({mode:"sustain",key:"C",scale:"chromatic",strength:100,enabled:false});
function readPitch(i){
 if(i===0)return pitchDefault();
 return {mode:$("pitchMode"+i).value,key:$("pitchKey"+i).value,
  scale:$("pitchScale"+i).value,strength:Number($("pitchStrength"+i).value),
  enabled:pitchActive[i]};
}
function checkPitch(p,i){
 if(!p||typeof p!=="object"||!["sustain","melody"].includes(p.mode)||
  !MontanaPitch.notes.includes(p.key)||!MontanaPitch.scales[p.scale]||
  typeof p.strength!=="number"||!Number.isFinite(p.strength)||
  p.strength<0||p.strength>100||typeof p.enabled!=="boolean"||
  (i===0&&p.enabled))throw Error("Ajustes de afinación inválidos en canal "+(i+1));
 return p;
}
function pitchInvalidate(i){
 pitchBuffers[i]=null;pitchActive[i]=false;updatePitchQa(i,null);
 if(i>0){
  $("pitchState"+i).textContent="Original — sin corrección aplicada";
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
 const corrected=audio().createBuffer(channels.length,buffer.length,buffer.sampleRate);
 result.channels.forEach((channel,ch)=>{
  if(channel.length!==buffer.length)throw Error("La afinación cambió la duración del audio");
  for(let j=0;j<channel.length;j++)if(!Number.isFinite(channel[j]))throw Error("Se encontró una muestra de audio inválida");
  corrected.copyToChannel(channel,ch);
 });
 const notes=settings.mode==="melody"?result.segments.map(s=>s.targetNote).join(" → "):result.target.note;
 const qa=MontanaPitchQA.analyze(channels,result.channels,buffer.sampleRate);
 return {buffer:corrected,notes,qa,referenceMode:result.analysis?.referenceMode||result.referenceMode||"mono"};
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
  restored.push({settings:{...p},buffer:processed?.buffer||null,qa:processed?.qa||null});
 }
 return restored;
};
window.commitPitchRestore=restored=>{
 restored.forEach(({settings,buffer,qa},i)=>{
  pitchBuffers[i]=buffer;pitchActive[i]=settings.enabled;
  if(i>0)updatePitchQa(i,qa);
  if(i===0)return;
  $("pitchMode"+i).value=settings.mode;$("pitchKey"+i).value=settings.key;
  $("pitchScale"+i).value=settings.scale;$("pitchStrength"+i).value=settings.strength;
  $("pitchStrengthValue"+i).textContent=settings.strength+"%";
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
  '<button id="pitchApply'+i+'" type="button">🎼 Procesar voz</button> <button id="pitchToggle'+i+'" type="button" disabled>Oír corregido</button>'+
  '<p id="pitchState'+i+'">Original — sin corrección aplicada</p>'+
  '<p id="pitchQa'+i+'" role="status">Sin diagnóstico: procesa una toma vocal para comparar original y afinado.</p>'+
  '<small>Las métricas QA son heurísticas PCM, no garantizan timbre, formantes ni calidad perceptual. La afinación sigue siendo offline, limitada a fragmentos breves; fuente sin alterar.</small>';
 document.querySelectorAll("article.track")[i].append(el);
 for(const key of ["pitchMode","pitchKey","pitchScale","pitchStrength"]){
  $(key+i).addEventListener("change",()=>pitchInvalidate(i));
 }
 $("pitchStrength"+i).addEventListener("input",()=>{
  $("pitchStrengthValue"+i).textContent=$("pitchStrength"+i).value+"%";
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
   $("pitchToggle"+i).disabled=false;$("pitchToggle"+i).textContent="Oír original";
   $("pitchState"+i).textContent="Afinación activa: "+result.notes+(result.referenceMode==="phase-safe-channel"?" · Detector protegido contra cancelación de fase":result.referenceMode==="stronger-channel"?" · Detector usando canal más fuerte":"");
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
