/* Montana Music Production LLC — local original beat sequencer, no AI, no licensed samples. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaBeat=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const STEPS=16,PPQ=480,STEP_TICKS=120;
 const drums=Object.freeze({kick:36,snare:38,clap:39,hat:42});
 const keys=Object.keys(drums);
 const allowedBars=[1,2,4,8];
 function preset(name="trap"){
  const pattern={version:1,bpm:100,bars:4,swing:0,drums:{},bass:Array(STEPS).fill(null)};
  for(const k of keys)pattern.drums[k]=Array(STEPS).fill(0);
  const fill=(k,positions)=>positions.forEach(i=>pattern.drums[k][i]=1);
  if(name==="trap"){
   pattern.bpm=140;fill("kick",[0,7,10]);fill("snare",[4,12]);fill("hat",[0,2,4,6,8,10,12,14]);
   pattern.bass[0]=36;pattern.bass[7]=36;pattern.bass[10]=39;
  }else if(name==="reggaeton"){
   pattern.bpm=94;fill("kick",[0,6,8,14]);fill("snare",[4,12]);fill("clap",[4,12]);fill("hat",[2,6,10,14]);
   pattern.bass[0]=36;pattern.bass[8]=39;
  }else if(name==="dembow"){
   pattern.bpm=112;fill("kick",[0,3,8,11]);fill("snare",[4,12]);fill("clap",[7,15]);fill("hat",[0,2,4,6,8,10,12,14]);
   pattern.bass[0]=36;pattern.bass[8]=41;
  }else if(name==="hiphop"){
   pattern.bpm=88;fill("kick",[0,6,10]);fill("snare",[4,12]);fill("hat",[0,2,4,6,8,10,12,14]);
   pattern.bass[0]=36;pattern.bass[10]=43;
  }else if(name!=="empty")throw Error("Preset desconocido");
  return pattern;
 }
 function validate(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||value.version!==1||
     !Number.isInteger(value.bpm)||value.bpm<60||value.bpm>200||
     !allowedBars.includes(value.bars)||!Number.isInteger(value.swing)||value.swing<0||value.swing>40||
     !value.drums||typeof value.drums!=="object"||!Array.isArray(value.bass)||value.bass.length!==STEPS)
   throw Error("Patrón inválido: BPM 60–200, compases 1/2/4/8, swing 0–40");
  const out={version:1,bpm:value.bpm,bars:value.bars,swing:value.swing,drums:{},bass:[]};
  for(const k of keys){
   const row=value.drums[k];
   if(!Array.isArray(row)||row.length!==STEPS||row.some(v=>v!==0&&v!==1))
    throw Error("Pista de batería inválida: "+k);
   out.drums[k]=row.slice();
  }
  for(const note of value.bass){
   if(note!==null&&(!Number.isInteger(note)||note<36||note>60))
    throw Error("Nota de bajo inválida");
   out.bass.push(note);
  }
  return out;
 }
 function events(raw){
  const p=validate(raw),out=[];
  for(let b=0;b<p.bars;b++)for(let i=0;i<STEPS;i++){
   const tick=(b*STEPS+i)*STEP_TICKS+(i%2?Math.round(p.swing*STEP_TICKS/100):0);
   for(const k of keys)if(p.drums[k][i])out.push({tick,midi:drums[k],channel:9,velocity:k==="hat"?68:104,length:45,kind:k});
   if(p.bass[i]!==null)out.push({tick,midi:p.bass[i],channel:0,velocity:95,length:100,kind:"bass"});
  }
  return out;
 }
 function isolate(raw,instrument){
  const p=validate(raw);
  if(instrument!=="bass"&&!keys.includes(instrument))throw Error("Stem desconocido");
  for(const k of keys)if(k!==instrument)p.drums[k]=Array(STEPS).fill(0);
  if(instrument!=="bass")p.bass=Array(STEPS).fill(null);
  return p;
 }
 function vlq(n){
  if(!Number.isInteger(n)||n<0||n>0x0fffffff)throw Error("Tick MIDI inválido");
  let x=n&127;const bytes=[x];
  while((n>>>=7)>0){x=(n&127)|128;bytes.unshift(x);}
  return bytes;
 }
 function midi(raw){
  const p=validate(raw),mspq=Math.round(60000000/p.bpm),data=[];
  const music=events(p),all=[{tick:0,rank:0,bytes:[0xff,0x51,3,(mspq>>16)&255,(mspq>>8)&255,mspq&255]}];
  for(const e of music){
   all.push({tick:e.tick,rank:2,bytes:[0x90|e.channel,e.midi,e.velocity]});
   all.push({tick:e.tick+e.length,rank:1,bytes:[0x80|e.channel,e.midi,0]});
  }
  all.push({tick:p.bars*STEPS*STEP_TICKS,rank:3,bytes:[0xff,0x2f,0]});
  all.sort((a,b)=>a.tick-b.tick||a.rank-b.rank||a.bytes[0]-b.bytes[0]||a.bytes[1]-b.bytes[1]);
  let last=0;
  for(const e of all){data.push(...vlq(e.tick-last),...e.bytes);last=e.tick;}
  const out=new Uint8Array(14+8+data.length),v=new DataView(out.buffer);
  function word(i,s){for(let k=0;k<s.length;k++)out[i+k]=s.charCodeAt(k);}
  word(0,"MThd");v.setUint32(4,6);v.setUint16(8,0);v.setUint16(10,1);v.setUint16(12,PPQ);
  word(14,"MTrk");v.setUint32(18,data.length);out.set(data,22);
  return out;
 }
 function wav(channels,rate){
  if(!Array.isArray(channels)||channels.length!==2||!Number.isInteger(rate)||
     rate<8000||rate>96000||channels.some(c=>!(c instanceof Float32Array))||
     channels[0].length!==channels[1].length||channels[0].length<1)
   throw Error("PCM para WAV inválido");
  const n=channels[0].length,size=44+n*4;
  if(!Number.isSafeInteger(size)||size>100*1024*1024)throw Error("WAV excede límite de 100 MiB");
  const out=new Uint8Array(size),view=new DataView(out.buffer);
  function str(pos,s){for(let i=0;i<s.length;i++)out[pos+i]=s.charCodeAt(i);}
  str(0,"RIFF");view.setUint32(4,size-8,true);str(8,"WAVE");str(12,"fmt ");
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);str(36,"data");
  view.setUint32(40,n*4,true);
  for(let i=0;i<n;i++)for(let c=0;c<2;c++){
   const value=channels[c][i];
   if(!Number.isFinite(value))throw Error("PCM no finito");
   const x=Math.max(-1,Math.min(1,value));
   view.setInt16(44+i*4+c*2,Math.round(x<0?x*32768:x*32767),true);
  }
  return out;
 }
 function schedule(ctx,raw,start=0){
  const p=validate(raw);
  if(!ctx||typeof ctx.createOscillator!=="function"||typeof ctx.createGain!=="function")throw Error("Contexto de audio no disponible");
  const ev=events(p),total=p.bars*4*60/p.bpm;
  const master=ctx.createGain();master.gain.value=.75;
  const compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=-8;compressor.knee.value=3;compressor.ratio.value=8;
  compressor.attack.value=.005;compressor.release.value=.15;
  master.connect(compressor);compressor.connect(ctx.destination);
  const noiseFrames=Math.ceil(ctx.sampleRate*.35),noise=ctx.createBuffer(1,noiseFrames,ctx.sampleRate);
  const wave=noise.getChannelData(0);let seed=0x12345678;
  for(let i=0;i<wave.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;wave[i]=(seed>>>0)/2147483648-1;}
  function envelope(time,peak,length,attack=.003){
   const g=ctx.createGain();g.gain.setValueAtTime(0,time);
   g.gain.linearRampToValueAtTime(peak,time+attack);
   g.gain.exponentialRampToValueAtTime(.0001,time+length);g.connect(master);return g;
  }
  function kick(time,volume){
   const o=ctx.createOscillator();o.type="sine";
   o.frequency.setValueAtTime(145,time);o.frequency.exponentialRampToValueAtTime(47,time+.15);
   o.connect(envelope(time,.51*volume,.21));o.start(time);o.stop(time+.22);
  }
  function bass(time,midiNote,volume){
   const f=440*Math.pow(2,(midiNote-69)/12);
   const o=ctx.createOscillator();o.type="triangle";o.frequency.value=f;
   const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=750;
   o.connect(filter);filter.connect(envelope(time,.26*volume,Math.min(.20,60/p.bpm/4*.90),.009));
   o.start(time);o.stop(time+Math.min(.21,60/p.bpm/4*.90)+.015);
  }
  function percussion(time,kind,volume){
   const o=ctx.createBufferSource();o.buffer=noise;
   const filter=ctx.createBiquadFilter();filter.type="highpass";
   filter.frequency.value=kind==="hat"?6200:kind==="clap"?1600:1000;
   const peak=(kind==="hat"?.085:kind==="clap"?.15:.18)*volume;
   o.connect(filter);filter.connect(envelope(time,peak,kind==="hat"?.045:kind==="clap"?.11:.16));
   o.start(time);o.stop(time+(kind==="hat"?.05:kind==="clap"?.12:.17));
  }
  for(const e of ev){
   const when=start+e.tick/PPQ*60/p.bpm,vol=e.velocity/127;
   if(e.kind==="kick")kick(when,vol);
   else if(e.kind==="bass")bass(when,e.midi,vol);
   else percussion(when,e.kind,vol);
  }
  return {duration:total,notes:ev.length};
 }
 async function render(raw,rate=44100){
  const p=validate(raw);
  if(rate!==44100&&rate!==48000)throw Error("Solo exportación 44.1/48 kHz");
  const offline=typeof OfflineAudioContext!=="undefined"?OfflineAudioContext:null;
  if(!offline)throw Error("El navegador no admite render offline");
  const duration=p.bars*4*60/p.bpm;
  const frames=Math.ceil((duration+.35)*rate);
  const ctx=new offline(2,frames,rate);
  schedule(ctx,p,0);
  const out=await ctx.startRendering();
  if(out.numberOfChannels!==2||out.length!==frames)throw Error("Render de audio inconsistente");
  return {channels:[out.getChannelData(0).slice(),out.getChannelData(1).slice()],
   rate,duration,notes:events(p).length};
 }
 return {STEPS,PPQ,drums,keys,preset,validate,events,isolate,midi,wav,schedule,render};
});
