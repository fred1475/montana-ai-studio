'use strict';
/* Local audit export: only structured summaries, no PCM/WAV or provider calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function wav(hz){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)
  b.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchAudit"]').count(),7);
  assert.equal(await page.locator('#pitchAudit1').isDisabled(),true);
  const original=wav(224.5);
  await page.locator('#file1').setInputFiles({name:'local-vocal.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('local-vocal'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchMatch1').check();
  await page.locator('#pitchTimbre1').check();
  assert.equal(await page.locator('#pitchAudit1').isDisabled(),true);
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:35000});
  assert.equal(await page.locator('#pitchAudit1').isDisabled(),false);
  const [dl]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator('#pitchAudit1').click()]);
  assert.equal(dl.suggestedFilename(),'montana-qa-vocal-canal-2.json');
  const saved=path.join(process.cwd(),'vocal-audit-acceptance.json');
  await dl.saveAs(saved);
  const raw=fs.readFileSync(saved,'utf8'),audit=JSON.parse(raw);
  assert.equal(audit.schema,'montana-vocal-audit');
  assert.equal(audit.track,2);
  assert.equal(audit.sourceName,'local-vocal.wav');
  assert.equal(audit.pitch.enabled,true);
  assert.equal(audit.pitch.matchLevel,true);
  assert.equal(audit.pitch.protectTimbre,true);
  assert.equal(audit.qa.frames,frames);
  assert.equal(audit.qa.sampleRate,rate);
  assert.equal(audit.qa.channels,1);
  assert(Number.isFinite(audit.qa.metrics.outputPeakDbfs));
  assert(audit.levelMatch&&Number.isFinite(audit.levelMatch.appliedGainDb));
  assert(audit.spectralGuard&&Number.isFinite(audit.spectralGuard.wetPercent));
  assert(!('pcm' in audit)&&!('channels' in audit)&&!('raw' in audit));
  assert(raw.length<12000);
  assert(!raw.includes('base64')&&!raw.includes('Float32Array'));
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const session=path.join(process.cwd(),'vocal-audit-project.json');await backup.saveAs(session);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(session);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  assert.equal(await page.locator('#pitchAudit1').isDisabled(),false);
  await page.locator('#pitchDetails1').evaluate(el=>el.open=true);
  const [restored]=await Promise.all([page.waitForEvent('download'),page.locator('#pitchAudit1').click()]);
  const restoredPath=path.join(process.cwd(),'restored-vocal-audit.json');
  await restored.saveAs(restoredPath);
  const again=JSON.parse(fs.readFileSync(restoredPath,'utf8'));
  assert.deepEqual(again.qa,audit.qa);
  assert.deepEqual(again.pitch,audit.pitch);
  await page.locator('#file1').setInputFiles({name:'new-source.wav',mimeType:'audio/wav',buffer:wav(227)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('new-source'));
  assert.equal(await page.locator('#pitchAudit1').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS local vocal QA export: explicit click, bounded JSON without PCM, current QA, source preserved, session restoration and stale-report invalidation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
