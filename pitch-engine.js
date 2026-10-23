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
  // Prevent opposing stereo channels from cancelling the voice during analysis.
  // Original channel data is never overwritten.
  function vocalReference(channels){
    if(!Array.isArray(channels)||channels.length<1||channels.length>2||
       channels.some(c=>!(c instanceof Float32Array))||
       !channels[0].length||channels.some(c=>c.length!==channels[0].length))
      throw Error('Canales vocales mono/estéreo inválidos');
    const n=channels[0].length;
    if(channels.length===1){
      for(const sample of channels[0])if(!Number.isFinite(sample))throw Error('Muestra vocal inválida');
      return {samples:channels[0].slice(),mode:'mono',correlation:null};
    }
    const [left,right]=channels;
    let powerLeft=0,powerRight=0,cross=0;
    for(let i=0;i<n;i++){
      const l=left[i],r=right[i];
      if(!Number.isFinite(l)||!Number.isFinite(r))throw Error('Muestra vocal inválida');
      powerLeft+=l*l;powerRight+=r*r;cross+=l*r;
    }
    const high=Math.max(powerLeft,powerRight),low=Math.min(powerLeft,powerRight);
    const correlation=powerLeft>1e-12&&powerRight>1e-12?cross/Math.sqrt(powerLeft*powerRight):null;
    const cancelled=correlation!==null&&correlation<-.75;
    const unbalanced=high>1e-12&&low/high<.02;
    const samples=new Float32Array(n);
    if(cancelled||unbalanced){
      samples.set(powerLeft>=powerRight?left:right);
      return {samples,mode:cancelled?'phase-safe-channel':'stronger-channel',correlation};
    }
    for(let i=0;i<n;i++)samples[i]=(left[i]+right[i])*.5;
    return {samples,mode:'stereo-average',correlation};
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
  // A single PSOLA time grid is shared across related stereo channels.
  // Separate peak trackers can land half a period apart on inverted signals,
  // destroying the intended L/R relationship even if pitch detection succeeded.
  function pitchMarkPlan(reference,sampleRate,sourceFrequency){
    if(!(reference instanceof Float32Array)||!reference.length||
       !Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||
       !Number.isFinite(sourceFrequency)||sourceFrequency<=0)
      throw Error('Referencia de afinación inválida');
    const n=reference.length,period=sampleRate/sourceFrequency;
    if(!Number.isFinite(period)||period<2||period>n/4)throw Error('Período de afinación inválido');
    const span=Math.ceil(period),phaseLead=Math.max(1,Math.floor(period*2));
    let first=0,high=-Infinity;
    for(let i=0;i<Math.min(n,phaseLead);i++){
      const v=reference[i];
      if(!Number.isFinite(v))throw Error('Muestra vocal inválida');
      if(v>high){high=v;first=i}
    }
    const marks=[];
    for(let prediction=first;prediction<n;prediction+=period){
      const center=Math.round(prediction),search=Math.max(2,Math.floor(period*.18));
      const lo=Math.max(0,center-search),hi=Math.min(n-1,center+search);
      let mark=lo,peak=-Infinity;
      for(let i=lo;i<=hi;i++){
        const v=reference[i];
        if(!Number.isFinite(v))throw Error('Muestra vocal inválida');
        if(v>peak){peak=v;mark=i}
      }
      marks.push(mark);
    }
    if(marks.length<5)throw Error('Toma demasiado corta para corrección de afinación.');
    return {first,marks,period,span,frames:n};
  }
  function correctChannel(input,sampleRate,sourceFrequency,targetFrequency,sharedPlan){
    if(!(input instanceof Float32Array))throw Error('Canal vocal inválido');
    if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||
       !Number.isFinite(sourceFrequency)||sourceFrequency<=0||sourceFrequency>sampleRate/2||
       !Number.isFinite(targetFrequency)||targetFrequency<=0||targetFrequency>sampleRate/2)
      throw Error('Frecuencias vocales inválidas');
    const n=input.length,ratio=targetFrequency/sourceFrequency;
    // Correct at most 250 cents per correction, to avoid severe artifacts.
    if(!Number.isFinite(ratio)||ratio<Math.pow(2,-250/1200)||ratio>Math.pow(2,250/1200))throw Error('Corrección fuera del rango seguro de 250 cents.');
    const plan=sharedPlan||pitchMarkPlan(input,sampleRate,sourceFrequency);
    const expectedPeriod=sampleRate/sourceFrequency;
    if(plan.frames!==n||!Number.isInteger(plan.first)||plan.first<0||plan.first>=n||
       !Number.isFinite(plan.period)||plan.period<2||plan.period>n/4||
       Math.abs(plan.period-expectedPeriod)>Math.abs(expectedPeriod)*1e-6||
       !Number.isInteger(plan.span)||plan.span!==Math.ceil(plan.period)||
       !Array.isArray(plan.marks)||plan.marks.length<5)
      throw Error('Marcas de afinación incompatibles');
    let previous=-1;
    for(const mark of plan.marks){
      if(!Number.isInteger(mark)||mark<=previous||mark<0||mark>=n)
       throw Error('Marcas de afinación incompatibles');
      previous=mark;
    }
    for(let i=0;i<n;i++)if(!Number.isFinite(input[i]))throw Error('Muestra vocal inválida');
    const {first,marks,period,span}=plan;
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
  // Shared voiced/unvoiced guard: preserve breaths, consonants and pauses
  // rather than running PSOLA over aperiodic segments. The detector operates
  // ONLY on the shared original mono reference, then uses one crossfade gain
  // for every channel, preserving stereo polarity/level relationships.
  // An autocorrelation at the detected pitch period is a conservative proxy
  // for periodic voice; not an assurance of human-voice or formant quality.
  function preserveUnvoiced(channels,corrected,reference,rate,frequency){
    if(!Array.isArray(channels)||!Array.isArray(corrected)||channels.length!==corrected.length||
       !channels.length||channels.length>2||!(reference instanceof Float32Array)||
       !Number.isFinite(rate)||rate<8000||rate>192000||
       !Number.isFinite(frequency)||frequency<=0)
      throw Error('Protección de consonantes inválida');
    const n=reference.length;
    if(!n||channels.some((ch,i)=>!(ch instanceof Float32Array)||
       !(corrected[i] instanceof Float32Array)||ch.length!==n||corrected[i].length!==n))
      throw Error('Canales para protección vocal incompatibles');
    const lag=Math.round(rate/frequency);
    if(lag<2||lag*5>=n)throw Error('Período para protección vocal inválido');
    const width=Math.max(Math.round(rate*.035),lag*3);
    let cross=0,p0=0,p1=0,mix=0;
    const response=1-Math.exp(-1/(rate*.009));
    const result=corrected.map(c=>new Float32Array(c.length));
    for(let i=0;i<n;i++){
      if(!Number.isFinite(reference[i]))throw Error('Muestra vocal inválida');
      if(i>=lag){
        const a=reference[i],b=reference[i-lag];
        cross+=a*b;p0+=a*a;p1+=b*b;
        const expired=i-width;
        if(expired>=lag){
          const x=reference[expired],y=reference[expired-lag];
          cross-=x*y;p0-=x*x;p1-=y*y;
        }
      }
      const pairs=Math.min(width,Math.max(0,i-lag+1));
      const energy=pairs?Math.sqrt(Math.max(0,p0)/pairs):0;
      const denominator=Math.sqrt(Math.max(0,p0)*Math.max(0,p1));
      const correlation=denominator>1e-12?cross/denominator:0;
      const periodicity=Math.max(0,Math.min(1,(correlation-.50)/.30));
      const volume=Math.max(0,Math.min(1,(energy-.003)/.012));
      const target=periodicity*volume;
      mix+=(target-mix)*response;
      for(let ch=0;ch<channels.length;ch++){
        const original=channels[ch][i],shifted=corrected[ch][i];
        if(!Number.isFinite(original)||!Number.isFinite(shifted))throw Error('Muestra vocal inválida');
        result[ch][i]=original*(1-mix)+shifted*mix;
      }
    }
    return result;
  }
  function process(channels,sampleRate,options={}){
    if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(ch=>!(ch instanceof Float32Array)))throw Error('Solo audio mono o estéreo válido');
    if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Frecuencia de muestreo inválida');
    const n=channels[0].length;
    if(!channels.every(ch=>ch.length===n)||n<8192||n>sampleRate*15)throw Error('Solo notas sostenidas de 0.2 a 15 segundos');
    const {key='C',scale='chromatic',strength=100}=options;
    if(!Number.isFinite(strength)||strength<0||strength>100)throw Error('Intensidad inválida');
    const reference=vocalReference(channels);
    const measured=analyze(reference.samples,sampleRate),target=nearestNote(measured.frequency,key,scale);
    const adjustedFrequency=measured.frequency*Math.pow(target.frequency/measured.frequency,strength/100);
    const correctionCents=cents(adjustedFrequency,measured.frequency);
    // Keep the same sample destinations AND source marks in L/R to preserve
    // polarity, channel scaling, and stereo timing under a linear transform.
    const commonPlan=channels.length===2&&Math.abs(correctionCents)>=.3?
      pitchMarkPlan(reference.samples,sampleRate,measured.frequency):null;
    const shifted=channels.map(ch=>Math.abs(correctionCents)<.3?Float32Array.from(ch):
      correctChannel(ch,sampleRate,measured.frequency,adjustedFrequency,commonPlan));
    const output=Math.abs(correctionCents)<.3?shifted:
      preserveUnvoiced(channels,shifted,reference.samples,sampleRate,measured.frequency);
    return {channels:output,analysis:{...measured,referenceMode:reference.mode},target,targetFrequency:adjustedFrequency,correctionCents,duration:n/sampleRate,unvoicedGuardApplied:Math.abs(correctionCents)>=.3};
  }
  return {detectPitch,analyze,nearestNote,process,correctChannel,pitchMarkPlan,preserveUnvoiced,vocalReference,noteName,notes,scales};
});