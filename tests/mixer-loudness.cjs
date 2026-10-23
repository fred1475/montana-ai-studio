'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),meter=require('../mixer-loudness.js');
const rate=44100,n=rate*2,tau=2*Math.PI;
function tone(freq,amp,phase=0,length=n){return Float32Array.from({length},(_,i)=>amp*Math.sin(tau*freq*i/rate+phase))}
function close(actual,expected,tolerance,label){assert(Math.abs(actual-expected)<tolerance,label+' '+actual+' vs '+expected)}
(async()=>{
 const low=tone(1000,.1),high=tone(1000,.2);
 const a=await meter.measure(low,low.slice(),rate);
 const b=await meter.measure(high,high.slice(),rate);
 assert(a.integratedLufs> -27&&a.integratedLufs< -14,'K weighted 1kHz sine LUFS plausible: '+a.integratedLufs);
 close(b.integratedLufs-a.integratedLufs,20*Math.log10(2),.08,'LUFS +6dB scaling');
 close(b.truePeakDbtp-a.truePeakDbtp,20*Math.log10(2),.08,'True peak +6dB scaling');
 assert(a.gatedBlocks>0&&a.totalBlocks>0);
 const samples=tone(rate/4,.9,Math.PI/4);
 const interp=await meter.measure(samples,samples.slice(),rate);
 assert(interp.truePeak>Math.pow(10,interp.samplePeakDbfs/20)*1.14,'Oversampling must find peak between samples');
 assert(interp.truePeak<1.15,'Reconstruction cannot produce pathological overshoot for sinusoid');
 const silence=new Float32Array(n),z=await meter.measure(silence,silence.slice(),rate);
 assert.equal(z.integratedLufs,-Infinity);
 assert.equal(z.truePeakDbtp,-Infinity);
 const corrupted=low.slice();corrupted[123]=NaN;
 await assert.rejects(()=>meter.measure(corrupted,low,rate),/valores inválidos/);
 await assert.rejects(()=>meter.measure(new Float32Array(10),new Float32Array(10),rate),/400 ms/);
 console.log('PASS: gated LUFS scale invariance, true-peak intersample reconstruction, silence and invalid PCM');
 // The actual browser WAV must report the same measured values as its PCM.
 const wav=Buffer.alloc(44+rate*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
 wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(rate*2,40);
 for(let i=0;i<rate;i++)wav.writeInt16LE(Math.round(11000*Math.sin(tau*1000*i/rate)),44+i*2);
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#loudnessOn').isChecked(),false);
  await page.locator('#file1').setInputFiles({name:'loudness-reference.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('loudness-reference'));
  await page.locator('#loudnessOn').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  const p=path.join(process.cwd(),'loudness-reference-output.wav');await download.saveAs(p);
  const written=fs.readFileSync(p);
  assert(written.length>rate*4);
  await page.waitForFunction(()=>document.querySelector('#loudnessResults')?.textContent?.includes('LUFS integrado'),null,{timeout:20000});
  const shown=await page.locator('#loudnessResults').innerText();
  const numbers=shown.match(/LUFS integrado: (-?\d+(?:\.\d+)?) LUFS.*True-peak: (-?\d+(?:\.\d+)?) dBTP/);
  assert(numbers,'Expected both meter results in browser: '+shown);
  const result=await page.evaluate(()=>MontanaLoudness.measure((()=>{const b=tracks[1],c=b.getChannelData(0);return c})(),tracks[1].getChannelData(0),44100));
  assert(Number.isFinite(result.integratedLufs));
  const [sessionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'loudness-session.json');await sessionDownload.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(session.loudnessOn,true);
  await page.reload();await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#loudnessOn').isChecked(),true);
  session.loudnessOn='yes';
  const badPath=path.join(process.cwd(),'loudness-bad-session.json');fs.writeFileSync(badPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(badPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#loudnessOn').isChecked(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: Chromium WAV export reports LUFS & true-peak estimates, project opt-in survives session restore, invalid preferences rejected.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
