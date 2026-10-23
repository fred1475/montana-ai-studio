'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rate=44100,n=rate*2,tau=Math.PI*2;
const voice=Buffer.alloc(44+n*2);
voice.write('RIFF',0);voice.writeUInt32LE(voice.length-8,4);voice.write('WAVE',8);
voice.write('fmt ',12);voice.writeUInt32LE(16,16);voice.writeUInt16LE(1,20);
voice.writeUInt16LE(1,22);voice.writeUInt32LE(rate,24);voice.writeUInt32LE(rate*2,28);
voice.writeUInt16LE(2,32);voice.writeUInt16LE(16,34);
voice.write('data',36);voice.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++){
 const t=i/rate;
 const x=t<1?.25*Math.sin(tau*220*t)+.26*Math.sin(tau*7100*t):.008*Math.sin(tau*220*t);
 voice.writeInt16LE(Math.round(32767*x),44+2*i);
}
function wavSamples(buffer){
 assert.equal(buffer.toString('ascii',0,4),'RIFF');
 assert.equal(buffer.readUInt32LE(24),rate);
 assert.equal(buffer.readUInt16LE(22),2);
 assert.equal(buffer.length,44+n*4);
 const a=new Float32Array(n);
 for(let i=0;i<n;i++)a[i]=buffer.readInt16LE(44+i*4)/32768;
 return a;
}
function rms(arr,from,to){let v=0;for(let i=from;i<to;i++)v+=arr[i]**2;return Math.sqrt(v/(to-from))}
function amp(arr,f,start,end){let si=0,co=0;for(let i=start;i<end;i++){let a=tau*i*f/rate;si+=arr[i]*Math.sin(a);co+=arr[i]*Math.cos(a)}return 2*Math.hypot(si,co)/(end-start)}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});let errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="cleanDetails"]').count(),7,'Vocal cleanup only on 7 voice channels');
  await page.locator('#file1').setInputFiles({name:'voice-clean-test.wav',mimeType:'audio/wav',buffer:voice});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voice-clean-test'));
  async function exported(fileName){
   const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
   const p=path.join(process.cwd(),fileName);await d.saveAs(p);
   return wavSamples(fs.readFileSync(p));
  }
  const raw=await exported('cleanup-original.wav');
  await page.locator('#cleanDetails1 summary').click();
  await page.locator('#gateOn1').check();
  await page.locator('#deessOn1').check();
  await page.locator('#gateThreshold1').fill('-33');
  await page.locator('#gateReduction1').fill('-45');
  await page.locator('#deessThreshold1').fill('-32');
  await page.locator('#deessStrength1').fill('90');
  const clean=await exported('cleanup-treated.wav');
  assert(rms(clean,rate*1.3,rate*1.85)<rms(raw,rate*1.3,rate*1.85)*.12,'Browser WAV noise gate must reduce quiet material');
  const start=Math.round(rate*.2),end=Math.round(rate*.8);
  assert(amp(clean,7100,start,end)<amp(raw,7100,start,end)*.7,'De-esser must reduce actual sibilant band');
  assert(amp(clean,220,start,end)>amp(raw,220,start,end)*.85,'Keep vocal fundamental');
  assert((await page.locator('#cleanResult1').innerText()).includes('aplicada'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'mixer-clean-session.json');await download.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(saved.tracks[1].name,'voice-clean-test.wav');
  assert.equal(saved.tracks[1].clean.gateOn,true);
  assert.equal(saved.tracks[1].clean.deessOn,true);
  assert.equal(saved.tracks[1].clean.deessStrength,90);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#gateOn1').isChecked(),true);
  assert.equal(await page.locator('#deessOn1').isChecked(),true);
  assert.equal(await page.locator('#deessStrength1').inputValue(),'90');
  const restored=await exported('cleanup-restored.wav');
  assert(rms(restored,rate*1.3,rate*1.85)<rms(raw,rate*1.3,rate*1.85)*.12,'Restored cleaning must still attenuate noise');
  saved.tracks[1].clean.gateThreshold=-999;
  const badPath=path.join(process.cwd(),'mixer-clean-invalid.json');fs.writeFileSync(badPath,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(badPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert((await page.locator('#label1').innerText()).includes('voice-clean-test.wav'),'Invalid settings must preserve existing project');
  assert.deepEqual(errors,[]);
  console.log('PASS mixer cleanup: real WAV gate/de-esser, vocal fundamental preserved, restore with original source, invalid session rejection');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
