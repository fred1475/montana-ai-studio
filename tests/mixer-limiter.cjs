'use strict';
const assert=require('node:assert/strict');
const {limitStereo}=require('../mixer-limiter.js');
const rate=44100,n=rate,ceiling=Math.pow(10,-3/20);
function maxAbs(a,b){let peak=0;for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]),Math.abs(b[i]));return peak}
const l=new Float32Array(n),r=new Float32Array(n);
for(let i=0;i<n;i++){l[i]=1.7*Math.sin(2*Math.PI*310*i/rate);r[i]=.85*Math.sin(2*Math.PI*310*i/rate)}
const originalL=l.slice(),originalR=r.slice();
const info=limitStereo(l,r,rate,-3);
assert(info.peakIn>1.6);
assert(maxAbs(l,r)<=ceiling+.000001,'Limiter exceeds sample peak ceiling');
assert(info.peakOut>ceiling*.93,'Loud input must still approach ceiling');
assert(info.maximumReductionDb>5,'Limiter must report actual attenuation');
for(let i=4000;i<n-4000;i+=101){
 if(Math.abs(originalL[i])>.15)assert(Math.abs(l[i]/originalL[i]-r[i]/originalR[i])<.000002,'Stereo gains must be linked');
}
const quietL=new Float32Array(n),quietR=new Float32Array(n);
for(let i=0;i<n;i++)quietL[i]=quietR[i]=.1*Math.sin(2*Math.PI*440*i/rate);
const untouched=quietL.slice();limitStereo(quietL,quietR,rate,-1);
assert.deepEqual(quietL,untouched,'Signal below ceiling must be exactly unchanged');
const transientL=new Float32Array(n),transientR=new Float32Array(n);
transientL[12000]=2.4;transientR[12000]=-1.2;
const transientInfo=limitStereo(transientL,transientR,rate,-1);
assert(transientInfo.peakOut<=Math.pow(10,-1/20)+.000001);
assert(transientL[11900]===0&&transientR[11900]===0,'Limiter may not synthesize any audio in silence');
const broken=new Float32Array(n);broken[10]=Infinity;
assert.throws(()=>limitStereo(broken,new Float32Array(n),rate),/Señal de audio inválida/);
assert.throws(()=>limitStereo(new Float32Array(4),new Float32Array(5),rate),/Canales estéreo inválidos/);
assert.throws(()=>limitStereo(new Float32Array(10),new Float32Array(10),rate,0),/Techo del limitador inválido/);
console.log('PASS limiter: 3dB ceiling, linked stereo, transparent below ceiling, impulse attack, invalid inputs');
