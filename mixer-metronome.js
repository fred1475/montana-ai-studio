"use strict";
// Browser-native four-beat metronome. Monitoring only, NEVER part of exported WAV.
(function(){
 let timer=null,active=null;
 const notes=[];
 function stop(token){
  if(token&&token!==active)return;
  if(timer!==null){clearInterval(timer);timer=null}
  active=null;
  for(const osc of notes.splice(0)){try{osc.stop()}catch(e){}try{osc.disconnect()}catch(e){}}
 }
 function start(ctx,startTime){
  stop();
  if(!$("metronomeOn").checked)return null;
  const bpm=Number($("bpm").value);
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error("BPM inválido (40–240)");
  const token={beat:0,next:Math.max(ctx.currentTime+.04,startTime||ctx.currentTime+.04)};
  active=token;
  function tick(){
   if(active!==token)return;
   const until=ctx.currentTime+.15;
   while(token.next<until&&token.beat<10000){
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type="sine";
    osc.frequency.value=token.beat%4===0?1320:880;
    gain.gain.setValueAtTime(.0001,token.next);
    gain.gain.exponentialRampToValueAtTime(.12,token.next+.002);
    gain.gain.exponentialRampToValueAtTime(.0001,token.next+.043);
    osc.connect(gain).connect(ctx.destination);
    osc.start(token.next);osc.stop(token.next+.05);
    osc.onended=()=>{const index=notes.indexOf(osc);if(index>=0)notes.splice(index,1);osc.disconnect();gain.disconnect()};
    notes.push(osc);
    token.beat++;
    token.next+=60/bpm;
   }
  }
  tick();timer=setInterval(tick,35);
  return token;
 }
 window.startMetronome=start;
 window.stopMetronome=stop;
 window.metronomeIsRunning=()=>!!active;
 window.metronomeScheduledBeats=()=>active?.beat||0;
 window.validateMetronome=()=>{
  const bpm=Number($("bpm").value);
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error("BPM inválido (40–240)");
  return bpm;
 };
})();
