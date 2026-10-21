'use strict';
/* Browser source -> stereo linked de-esser -> exported PCM16 WAV -> backup.
 * Synthetic anti-phase WAV only; no real hardware or quality certification.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate,tau=2*Math.PI;
function wav(){
 const out=Buffer.alloc(44+frames*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);
 out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);
 out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);
 out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);
 out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);
 out.write('data',36);out.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const t=i/rate;
  const x=Math.round(32767*(.2*Math.sin(tau*220*t)+
   (t>.2&&t<.8?.26*Math.sin(tau*6900*t):0)));
  out.writeInt16LE(x,44+4*i);out.writeInt16LE(-x,46+4*i);
 }
 return out;
}
function verifyPcm(buffer){
 assert.equal(buffer.readUInt16LE(22),2);
 assert.equal(buffer.readUInt32LE(24),rate);
 assert.equal(buffer.readUInt16LE(34),16);
 let peak=0,mismatch=0;
 for(let i=0;i<frames;i+=17){
  const l=buffer.readInt16LE(44+i*4),r=buffer.readInt16LE(46+i*4);
  peak=Math.max(peak,Math.abs(l));mismatch=Math.max(mismatch,Math.abs(l+r));
 }
 assert(peak>1000,'Processed voice must remain present in exported WAV');
 assert(mismatch<=4,'Exported antiphase stereo should survive to quantization precision: '+mismatch);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file1').setInputFiles({name:'deess-stereo-test.wav',mimeType:'audio/wav',buffer:wav()});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('deess-stereo-test'));
  await page.locator('#cleanDetails1 summary').click();
  await page.locator('#deessOn1').check();
  await page.locator('#deessThreshold1').fill('-36');
  await page.locator('#deessStrength1').fill('95');
  const first=await page.evaluate(()=>{
   const original=tracks[1],processed=window.getMixBuffer(1);
   const L=processed.getChannelData(0),R=processed.getChannelData(1);
   const source=original.getChannelData(0),sourceR=original.getChannelData(1);
   let mismatch=0,sourceMismatch=0,power=0,sourceHigh=0,processedHigh=0;
   for(let i=10000;i<32000;i++){
    const l=L[i],r=R[i],s=source[i];
    mismatch=Math.max(mismatch,Math.abs(l+r));
    power+=l*l;
    sourceMismatch=Math.max(sourceMismatch,Math.abs(sourceR[i]+s));
    // Differentiated energy is a coarse sibilance diagnostic, not spectral calibration.
    if(i>10000){
     sourceHigh+=(source[i]-source[i-1])**2;
     processedHigh+=(L[i]-L[i-1])**2;
    }
    if(!Number.isFinite(s)||!Number.isFinite(sourceR[i]))throw Error('Invalid decoded source sample');
   }
   const twice=window.getMixBuffer(1);
   if(twice!==processed)throw Error('Cleaned buffer cache not reused');
   return {mismatch,sourceMismatch,power,highRatio:processedHigh/sourceHigh,
    originalName:originalFiles[1]?.name,
    label:document.getElementById('cleanResult1').textContent};
  });
  assert.equal(first.originalName,'deess-stereo-test.wav');
  assert(first.sourceMismatch<5e-5,'Decoded input must retain near-inverted stereo');
  assert(first.mismatch<=first.sourceMismatch+8e-6,
   'De-esser must not add measurable stereo phase imbalance beyond browser-decoded source: '+JSON.stringify(first));
  assert(first.power>100);
  assert(first.highRatio<.55,'High-band energy must be attenuated by the linked de-esser');
  assert(first.label.includes('aplicada'));
  async function download(button,name){
   const [file]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator(button).click()]);
   const filePath=path.join(process.cwd(),name);await file.saveAs(filePath);return fs.readFileSync(filePath);
  }
  verifyPcm(await download('#export','deess-stereo-master.wav'));
  const snapshot=JSON.parse((await download('#saveSession','deess-stereo-session.json')).toString('utf8'));
  assert.equal(snapshot.tracks[1].clean.deessOn,true);
  assert.equal(snapshot.tracks[1].clean.deessStrength,95);
  assert.equal(snapshot.tracks[1].name,'deess-stereo-test.wav');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({name:'restore-deess-stereo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  assert.equal(await page.locator('#deessOn1').isChecked(),true);
  assert.equal(await page.locator('#deessStrength1').inputValue(),'95');
  verifyPcm(await download('#export','deess-stereo-restored.wav'));
  assert.deepEqual(errors,[]);
  console.log('PASS browser linked de-ess: source unchanged, anti-phase buffer and PCM16 master, attenuated HF, cache and session restore.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
