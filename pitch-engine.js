/* Montana Music Production LLC — experimental monophonic sustained-note tuner.
 * Original implementation (no third-party runtime dependency).
 * Not licensed or marketed as Antares Auto-Tune. Offline DSP research, not production.
 * Pitch synchronous overlap-add (PSOLA): a single stable f0 is assumed for the entire file.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MontanaPitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const scales = {
    chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
    major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10]
  };
  const midi = f => 69 + 12 * Math.log2(f / 440);
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);
  const cents = (f,g) => 1200*Math.log2(f/g);
  const noteName = m => notes[((Math.round(m)%12)+12)%12] + (Math.floor(Math.round(m)/12)-1);
  function nearestNote(f, key='C', scale='chromatic') {
    if (!(Number.isFinite(f) && f>0) || !notes.includes(key) || !scales[scale]) throw Error('Nota, tonalidad o escala inválida');
    const m=midi(f),root=notes.indexOf(key);let best=null;
    for(let n=Math.round(m)-7;n<=Math.round(m)+7;n++) {
      if (!scales[scale].includes(((n-root)%12+12)%12))continue;
      if (best===null || Math.abs(n-m)<Math.abs(best-m))best=n;
    }
    return {midi:best,note:noteName(best),frequency:freq(best),cents:cents(f,freq(best))};
  }
  function detectPitch(samples,sampleRate,position=.5) {
    if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate<8000) throw Error('Audio no válido');
    const length=4096;
    if(samples.length<length) return null;
    const start=Math.max(0,Math.min(samples.length-length,Math.floor(samples.length*position-length/2)));
    let mean=0,rms=0;
    for(let i=0;i<length;i++)mean+=samples[start+i];mean/=length;
    for(let i=0;i<length;i++){const v=samples[start+i]-mean;rms+=v*v}
    rms=Math.sqrt(rms/length);
    if(rms<.006)return null;
    const minLag=Math.max(2,Math.floor(sampleRate/600)),maxLag=Math.min(Math.ceil(sampleRate/75),length/2);
    const correlations=new Float32Array(maxLag+2);
    let maxCorr=0;
    for(let lag=minLag;lag<=maxLag;lag++){
      let cross=0,a=0,b=0;
      for(let j=0;j<length-lag;j+=2){const x=samples[start+j]-mean,y=samples[start+j+lag]-mean;cross+=x*y;a+=x*x;b+=y*y}
      const value=cross/Math.sqrt(Math.max(a*b,1e-14));
      correlations[lag]=value;
      if(value>maxCorr)maxCorr=value;
    }
    if(maxCorr<.80)return null;
    let chosen=0;
    // Prefer the first strong local maximum to avoid octave-halving.
    for(let lag=minLag+1;lag<maxLag;lag++){
      if(correlations[lag]>=Math.max(.88,maxCorr-.045) && correlations[lag]>=correlations[lag-1] && correlations[lag]>correlations[lag+1]){chosen=lag;break}
    }
    if(!chosen)return null;
    const a=correlations[chosen-1],b=correlations[chosen],c=correlations[chosen+1];
    const denominator=a-2*b+c;
    const dx=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(a-c)/denominator)):0;
    const result=sampleRate/(chosen+dx);
    return {frequency:result,confidence:b,rms};
  }
  function analyze(samples,sampleRate){
    const tries=[.20,.38,.56,.74,.85].map(p=>detectPitch(samples,sampleRate,p)).filter(Boolean);
    if(tries.length<3)throw Error('No se detectó una nota estable. Usa una voz monofónica sostenida, sin acompañamiento.');
    const values=tries.map(p=>p.frequency).sort((a,b)=>a-b),center=values[Math.floor(values.length/2)];
    const spread=Math.max(...values.map(f=>Math.abs(cents(f,center))));
    if(spread>35)throw Error('La afinación cambia dentro del clip; esta beta solo corrige una nota sostenida.');
    return {frequency:center,confidence:tries.reduce((sum,p)=>sum+p.confidence,0)/tries.length,spreadCents:spread};
  }
  function correctChannel(input,sampleRate,sourceFrequency,targetFrequency){
    const n=input.length,period=sampleRate/sourceFrequency,ratio=targetFrequency/sourceFrequency;
    // Correct at most 250 cents per correction, to avoid severe artifacts.
    if(!Number.isFinite(ratio)||ratio<Math.pow(2,-250/1200)||ratio>Math.pow(2,250/1200))throw Error('Corrección fuera del rango seguro de 250 cents.');
    const span=Math.ceil(period),phaseLead=Math.max(1,Math.floor(period*2));
    let first=0,high=-Infinity;
    for(let i=0;i<Math.min(n,phaseLead);i++)if(input[i]>high){high=input[i];first=i}
    // Track positive waveform peaks around predicted times in each input pitch cycle.
    const marks=[];
    for(let prediction=first;prediction<n;prediction+=period){
      const center=Math.round(prediction),search=Math.max(2,Math.floor(period*.18));
      const lo=Math.max(0,center-search),hi=Math.min(n-1,center+search);
      let mark=lo,peak=-Infinity;
      for(let i=lo;i<=hi;i++)if(input[i]>peak){peak=input[i];mark=i}
      marks.push(mark);
    }
    if(marks.length<5)throw Error('Toma demasiado corta para corrección de afinación.');
    const output=new Float32Array(n),weight=new Float32Array(n);
    const newPeriod=period/ratio;
    for(let position=first;position<n+span;position+=newPeriod){
      let idx=Math.round((position-first)/period);
      idx=Math.max(0,Math.min(marks.length-1,idx));
      const src=marks[idx],dst=Math.round(position);
      for(let k=-span;k<=span;k++){
        const j=dst+k,h=src+k;
        if(j<0||j>=n||h<0||h>=n)continue;
        const w=.5+.5*Math.cos(Math.PI*k/span);
        output[j]+=input[h]*w;weight[j]+=w;
      }
    }
    // Don't introduce silence at the edges of clips.
    for(let j=0;j<n;j++)output[j]=weight[j]>.005?output[j]/weight[j]:input[j];
    const fade=Math.min(Math.floor(sampleRate*.022),Math.floor(n/10));
    for(let j=0;j<fade;j++){
      const mix=j/fade;
      output[j]=input[j]*(1-mix)+output[j]*mix;
      output[n-1-j]=input[n-1-j]*(1-mix)+output[n-1-j]*mix;
    }
    return output;
  }
  function process(channels,sampleRate,options={}){
    if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(ch=>!(ch instanceof Float32Array)))throw Error('Solo audio mono o estéreo válido');
    const n=channels[0].length;
    if(!channels.every(ch=>ch.length===n)||n<8192||n>sampleRate*15)throw Error('Solo notas sostenidas de 0.2 a 15 segundos');
    const {key='C',scale='chromatic',strength=100}=options;
    if(!Number.isFinite(strength)||strength<0||strength>100)throw Error('Intensidad inválida');
    const mono=new Float32Array(n);
    for(let i=0;i<n;i++){let s=0;for(const ch of channels)s+=ch[i];mono[i]=s/channels.length}
    const measured=analyze(mono,sampleRate),target=nearestNote(measured.frequency,key,scale);
    const adjustedFrequency=measured.frequency*Math.pow(target.frequency/measured.frequency,strength/100);
    const correctionCents=cents(adjustedFrequency,measured.frequency);
    const output=channels.map(ch=>Math.abs(correctionCents)<.3?Float32Array.from(ch):correctChannel(ch,sampleRate,measured.frequency,adjustedFrequency));
    return {channels:output,analysis:measured,target,targetFrequency:adjustedFrequency,correctionCents,duration:n/sampleRate};
  }
  return {detectPitch,analyze,nearestNote,process,noteName,notes,scales};
});