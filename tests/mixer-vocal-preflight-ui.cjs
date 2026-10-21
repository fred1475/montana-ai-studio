'use strict';
// Chromium source preflight must never mutate the original project or upload it.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function wav(stereo){
 const channels=stereo?2:1,stride=channels*2,data=Buffer.alloc(44+frames*stride);
 data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVE',8);
 data.write('fmt ',12);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);
 data.writeUInt16LE(channels,22);data.writeUInt32LE(rate,24);
 data.writeUInt32LE(rate*stride,28);data.writeUInt16LE(stride,32);
 data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*stride,40);
 for(let i=0;i<frames;i++){
  const v=Math.round(.28*32767*Math.sin(2*Math.PI*220*i/rate));
  data.writeInt16LE(v,44+i*stride);
  if(stereo)data.writeInt16LE(-v,46+i*stride);
 }
 return data;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="vocalPreflightDetails"]').count(),7);
  assert.equal(await page.locator('#vocalPreflightDetails0').count(),0);
  await page.locator('#vocalPreflightDetails1 summary').click();
  const out=page.locator('#vocalPreflightResult1'),button=page.locator('#analyzeVocalSource1');
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#vocalPreflightResult1')?.textContent?.includes('Primero importa'));
  const original=wav(true);
  await page.locator('#file1').setInputFiles({name:'contra-phase.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('contra-phase'));
  assert((await out.innerText()).includes('Diagnóstico no ejecutado'));
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#vocalPreflightResult1')?.textContent?.includes('contrafase'));
  const report=await out.innerText();
  assert(report.includes('Correlación L/R: -1.000'));
  assert(report.includes('RMS:'));
  assert(report.includes('Muestras cercanas a escala completa: 0'));
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'contra-phase.wav');
  // Reimporting a new source clears a previously correct diagnostic.
  const mono=wav(false);
  await page.locator('#file1').setInputFiles({name:'mono.wav',mimeType:'audio/wav',buffer:mono});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('mono.wav'));
  assert((await out.innerText()).includes('Diagnóstico no ejecutado'));
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#vocalPreflightResult1')?.textContent?.includes('Correlación L/R: N/D'));
  assert(!(await out.innerText()).includes('contrafase'),'Old phase result must not survive source replacement');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const jsonPath=path.join(process.cwd(),'preflight-session.json');
  await download.saveAs(jsonPath);
  const snapshot=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  assert.equal(snapshot.tracks[1].name,'mono.wav');
  assert.equal(snapshot.tracks[1].data!==null,true);
  assert.equal(snapshot.tracks[1].vocalPreflight,undefined,'Calculated diagnostics are not persisted');
  await page.locator('#sessionFile').setInputFiles(jsonPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert((await out.innerText()).includes('Diagnóstico no ejecutado'),'Restoration must reset stale findings');
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#vocalPreflightResult1')?.textContent?.includes('Correlación L/R: N/D'));
  assert.deepEqual(errors,[]);
  console.log('PASS browser vocal source preflight: empty source, antiphase, mono, resets and restoration without PCM changes.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
