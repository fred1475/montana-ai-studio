'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {analyze,normalize}=require('../mixer-export-levels.js');
const r=44100,n=r;
const left=Float32Array.from({length:4096},(_,i)=>.32*Math.sin(2*Math.PI*i/67));
const right=Float32Array.from({length:4096},(_,i)=>.16*Math.sin(2*Math.PI*i/67));
const preserved=left.slice();
const original=analyze(left,right);
const result=normalize(left,right,-3);
assert(result.after.peakDb>-3.01&&result.after.peakDb< -2.99,'Normalization targets sample peak');
assert(Math.abs(original.peak-0.32)<.01);
assert(result.appliedGainDb>1);
assert(Math.abs(analyze(left,right).peakDb+3)<.02);
for(let i=1;i<left.length;i+=64)if(Math.abs(preserved[i])>.02){
 assert(Math.abs(left[i]/preserved[i]-right[i]/(.5*preserved[i]))<1e-5,'Stereo gains are linked');
}
const silent=new Float32Array(400);
assert.equal(normalize(silent,new Float32Array(400),-1).appliedGainDb,0,'Silent audio stays silent');
const tiny=Float32Array.from({length:100},()=>.0001);
assert(normalize(tiny,tiny.slice(),-1).appliedGainDb<=12.001,'Gain ceiling protects quiet sources');
assert.throws(()=>normalize(new Float32Array(4),new Float32Array(5),-1),/Canales PCM inválidos/);
assert.throws(()=>normalize(new Float32Array(4),new Float32Array(4),0),/Pico objetivo inválido/);
const wav=Buffer.alloc(44+n*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(r,24);wav.writeUInt32LE(r*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++)wav.writeInt16LE(Math.round(11500*Math.sin(2*Math.PI*330*i/r)),44+i*2);
function peakPCM(buffer){
 let peak=0;for(let i=44;i<buffer.length;i+=2)peak=Math.max(peak,Math.abs(buffer.readInt16LE(i))/32768);
 return peak;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file1').setInputFiles({name:'voz-master.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz-master.wav'));
  async function saveOutput(name){
   const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
   const dest=path.join(process.cwd(),name);await d.saveAs(dest);
   return fs.readFileSync(dest);
  }
  const raw=await saveOutput('normalization-bypass.wav');
  await page.locator('#normalizeTarget').fill('-3');
  await page.locator('#normalizeOn').check();
  const processed=await saveOutput('normalization-on.wav');
  const outputPeak=20*Math.log10(peakPCM(processed));
  assert(Math.abs(outputPeak+3)<.25,'Rendered PCM must be approximately -3dBFS, got '+outputPeak);
  assert(peakPCM(processed)>peakPCM(raw)*1.5,'Normalization must amplify actual PCM');
  const status=await page.locator('#status').innerText();
  assert(status.includes('RMS estéreo')&&status.includes('Normalización aplicada'),'Report RMS and applied gain');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'normalization-session.json');await download.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(saved.normalizeOn,true);assert.equal(saved.normalizeTarget,-3);
  await page.reload();await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#normalizeOn').isChecked(),true);
  assert.equal(await page.locator('#normalizeTarget').inputValue(),'-3');
  const restored=await saveOutput('normalization-restored.wav');
  assert(Math.abs(20*Math.log10(peakPCM(restored))+3)<.25);
  saved.normalizeTarget=1;
  const invalidPath=path.join(process.cwd(),'normalization-invalid.json');
  fs.writeFileSync(invalidPath,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(invalidPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#normalizeTarget').inputValue(),'-3','Bad backup must not overwrite valid settings');
  assert.deepEqual(errors,[]);
  console.log('PASS sample RMS/crest, capped peak normalization, real exported PCM, stereo balance and normalized session restoration');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
