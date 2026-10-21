"use strict";
/* Blind local listening: generated after pitch controls, no network, no
 * persisted audio or subjective judgments without explicit export.
 */
(function(){
 const $=id=>document.getElementById(id);
 for(let i=1;i<8;i++){
  const host=document.createElement("section");host.id="blindPanel"+i;
  host.innerHTML='<hr><h3>🎧 Escucha vocal A/B a ciegas</h3>'+
   '<small>Orden sorteado localmente. No mires otras opciones del canal durante la prueba. Comparación RMS aproximada; ±6 dB y picos pueden limitar la igualdad. No es doble ciego.</small>'+
   '<p><button type="button" id="blindStart'+i+'" disabled>Preparar escucha ciega</button></p>'+
   '<p><button type="button" id="blindPlayA'+i+'" disabled>▶ Escuchar A</button> '+
   '<button type="button" id="blindPlayB'+i+'" disabled>▶ Escuchar B</button> '+
   '<button type="button" id="blindStop'+i+'" disabled>■ Detener escucha</button></p>'+
   '<label for="blindNatural'+i+'">Naturalidad percibida de la opción que prefieras (1–5)</label>'+
   '<select id="blindNatural'+i+'"><option value="">Sin valorar</option>'+
   [1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select>'+
   '<label for="blindClear'+i+'">Inteligibilidad percibida (1–5)</label>'+
   '<select id="blindClear'+i+'"><option value="">Sin valorar</option>'+
   [1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select>'+
   '<label for="blindColor'+i+'">Conservación percibida del timbre (1–5)</label>'+
   '<select id="blindColor'+i+'"><option value="">Sin valorar</option>'+
   [1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select>'+
   '<label for="blindNotes'+i+'">Observaciones personales (opcional)</label>'+
   '<textarea id="blindNotes'+i+'" rows="2" maxlength="500" style="width:100%"></textarea>'+
   '<p><button type="button" id="blindChooseA'+i+'" disabled>Prefiero A y revelar</button> '+
   '<button type="button" id="blindChooseB'+i+'" disabled>Prefiero B y revelar</button></p>'+
   '<p id="blindStatus'+i+'" role="status">Procesa primero la voz para probar A/B.</p>'+
   '<button type="button" id="blindReport'+i+'" disabled>📋 Descargar evaluación subjetiva JSON</button>';
  $("pitchDetails"+i).append(host);
  let trial=null,refs=null,answer=null,playing=null;
  const status=text=>$("blindStatus"+i).textContent=text;
  const stop=()=>{
   if(playing){try{playing.stop();}catch(_){}try{playing.disconnect();}catch(_){}playing=null;}
  };
  const toggle=(active,started=false)=>{
   $("blindStart"+i).disabled=!active;
   for(const k of ["blindPlayA","blindPlayB","blindStop","blindChooseA","blindChooseB"])
    $(k+i).disabled=!started;
   $("blindReport"+i).disabled=true;
  };
  const reset=()=>{
   stop();trial=null;refs=null;answer=null;
   toggle(false);
   for(const k of ["blindNatural","blindClear","blindColor"])$(k+i).value="";
   $("blindNotes"+i).value="";
   status("Procesa primero la voz para probar A/B.");
  };
  const enable=()=>{
   reset();toggle(!!(tracks[i]&&pitchBuffers[i]&&pitchReports[i]));
   if(!$("blindStart"+i).disabled)status("Voz procesada lista. Prepara un nuevo sorteo A/B cuando quieras.");
  };
  $("blindStart"+i).addEventListener("click",()=>{
   stop();answer=null;trial=null;refs=null;
   if(!tracks[i]||!pitchBuffers[i]||!pitchReports[i]){
    enable();return;
   }
   try{
    const raw=tracks[i],wet=pitchBuffers[i];
    const dryChannels=Array.from({length:raw.numberOfChannels},(_,ch)=>raw.getChannelData(ch));
    const wetChannels=Array.from({length:wet.numberOfChannels},(_,ch)=>wet.getChannelData(ch));
    const draw=()=>{const x=new Uint32Array(1);crypto.getRandomValues(x);return x[0];};
    const prepared=MontanaVocalBlind.prepare(dryChannels,wetChannels,raw.sampleRate,draw);
    if(raw!==tracks[i]||wet!==pitchBuffers[i])throw Error("La toma cambió durante el sorteo");
    trial=prepared;refs={raw,wet};
    for(const k of ["blindNatural","blindClear","blindColor"])$(k+i).value="";
    $("blindNotes"+i).value="";
    toggle(true,true);
    status("Orden sorteado. Escucha A y B; luego puntúa y escoge tu favorita. La identidad no se muestra antes de elegir.");
   }catch(e){enable();status("No se inició la escucha ciega: "+e.message);}
  });
  const stillValid=()=>trial&&refs&&refs.raw===tracks[i]&&refs.wet===pitchBuffers[i]&&
   !!pitchReports[i];
  const play=choice=>{
   if(!stillValid()){enable();return;}
   stop();
   try{
    const context=audio();
    if(context.state==="suspended")context.resume().catch(()=>{});
    const c=trial.choices[choice],buffer=context.createBuffer(c.length,trial.frames,trial.rate);
    c.forEach((samples,index)=>buffer.copyToChannel(samples,index));
    const node=context.createBufferSource();node.buffer=buffer;
    node.connect(context.destination);
    node.onended=()=>{if(playing===node)playing=null;};
    playing=node;node.start();
    status("Escuchando "+(choice===0?"A":"B")+". La identidad permanece oculta hasta elegir.");
   }catch(e){stop();status("No se pudo reproducir: "+e.message);}
  };
  $("blindPlayA"+i).addEventListener("click",()=>play(0));
  $("blindPlayB"+i).addEventListener("click",()=>play(1));
  $("blindStop"+i).addEventListener("click",()=>{stop();status("Escucha detenida; puedes continuar la prueba.");});
  const choose=key=>{
   if(!stillValid()){enable();return;}
   if(answer){status("Para otro intento, prepara un nuevo sorteo.");return;}
   try{
    const grades={
     naturalidad:Number($("blindNatural"+i).value),
     inteligibilidad:Number($("blindClear"+i).value),
     timbre:Number($("blindColor"+i).value),
     notes:$("blindNotes"+i).value
    };
    // Empty selects are 0, rejected before any reveal.
    const result=MontanaVocalBlind.result(trial,key,grades,new Date().toISOString());
    stop();answer=result;
    for(const k of ["blindChooseA","blindChooseB","blindPlayA","blindPlayB","blindStop"])
     $(k+i).disabled=true;
    $("blindReport"+i).disabled=false;
    status("Resultado revelado: A = "+(result.reveal.A==="original"?"original":"afinada")+
     ", B = "+(result.reveal.B==="original"?"original":"afinada")+
     ". Preferiste "+key+" ("+(result.chosenType==="original"?"original":"afinada")+
     "). Opinión subjetiva; no acredita naturalidad o formantes.");
   }catch(e){status("Antes de revelar, completa las tres valoraciones: "+e.message);}
  };
  $("blindChooseA"+i).addEventListener("click",()=>choose("A"));
  $("blindChooseB"+i).addEventListener("click",()=>choose("B"));
  $("blindReport"+i).addEventListener("click",()=>{
   if(!answer||!stillValid()){enable();return;}
   const data=JSON.stringify(answer,null,2)+"\n";
   const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));
   const a=document.createElement("a");a.href=url;
   a.download="montana-evaluacion-ciega-canal-"+(i+1)+".json";
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   status("Evaluación subjetiva descargada localmente. No contiene audio ni afirma certificación profesional.");
  });
  window.montanaBlindReset=window.montanaBlindReset||function(index){
   document.dispatchEvent(new CustomEvent("montana-blind-reset",{detail:index}));
  };
  window.montanaBlindReady=window.montanaBlindReady||function(index){
   document.dispatchEvent(new CustomEvent("montana-blind-ready",{detail:index}));
  };
  document.addEventListener("montana-blind-reset",event=>{if(event.detail===i)reset();});
  document.addEventListener("montana-blind-ready",event=>{if(event.detail===i)enable();});
 }
})();
