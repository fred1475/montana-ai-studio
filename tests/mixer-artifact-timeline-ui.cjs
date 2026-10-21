'use strict';
/* Browser tests suspect timestamps and privacy-safe local reporting. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function sine(hz){
 const b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchArtifactAudit"]').count(),7);
  const original=sine(224.5);
  await page.locator('#file1').setInputFiles({name:'artefacto-voz.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('artefacto-voz.wav'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:35000});
  const source=await page.evaluate(()=>pitchArtifactReports[1]);
  assert.equal(source.version,1);assert.equal(source.windowMs,25);
  assert.equal(source.events.length<=24,true);
  assert.deepEqual(Object.keys(source.counts).sort(),['dropout','peak','step']);
  const displayed=await page.locator('#pitchArtifactAudit1').textContent();
  assert(displayed.includes('Sin alertas')||displayed.includes('Puntos a revisar'));
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#pitchAudit1').click()]);
  const target=path.join(process.cwd(),'artifact-vocal-qa.json');await dl.saveAs(target);
  const qa=JSON.parse(fs.readFileSync(target,'utf8'));
  assert.deepEqual(qa.artifactTimeline.events,source.events);
  assert.deepEqual(qa.artifactTimeline.counts,source.counts);
  assert(!('pcm' in qa.artifactTimeline)&&!('samples' in qa.artifactTimeline));
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const save=path.join(process.cwd(),'artifact-session.json');await backup.saveAs(save);
  await page.reload();await page.locator('#sessionFile').setInputFiles(save);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  const rebuilt=await page.evaluate(()=>pitchArtifactReports[1]);
  assert.deepEqual(rebuilt,source,'Timestamped flags reconstructed from original source after restore');
  await page.locator('#file1').setInputFiles({name:'artefacto-nueva.wav',mimeType:'audio/wav',buffer:sine(230)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('artefacto-nueva.wav'));
  assert.equal(await page.evaluate(()=>pitchArtifactReports[1]),null);
  assert((await page.locator('#pitchArtifactAudit1').textContent()).includes('Sin diagnóstico'));
  assert.deepEqual(errors,[]);
  console.log('PASS vocal artifact timeline browser: review timestamps in UI, local QA without PCM, deterministic restoration, source integrity and stale invalidation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
