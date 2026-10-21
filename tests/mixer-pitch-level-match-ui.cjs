'use strict';
/* Browser acceptance for opt-in vocal level matching: deterministic stereo
 * restored from immutable source, QA display and corrupted settings rejection.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function stereoWav(hz){
 const b=Buffer.alloc(44+frames*4);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const v=Math.round(10500*Math.sin(2*Math.PI*hz*i/rate));
  b.writeInt16LE(v,44+i*4);b.writeInt16LE(Math.round(v*.52),46+i*4);
 }
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchMatch"][type=checkbox]').count(),7);
  assert.equal(await page.locator('#pitchMatch1').isChecked(),false);
  const original=stereoWav(224.5);
  await page.locator('#file1').setInputFiles({name:'voz-match-original.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz-match-original'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchMatch1').check();
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:30000});
  const status=await page.locator('#pitchMatchStatus1').textContent();
  assert(status.includes('Igualación RMS orientativa'),status);
  const report=await page.evaluate(()=>({
   match:pitchLevelReports[1],qa:pitchReports[1],
   samples:tracks[1]?.length,corrected:pitchBuffers[1]?.length,
   left:tracks[1]?.getChannelData(0)[8000],right:tracks[1]?.getChannelData(1)[8000],
   srcName:originalFiles[1]?.name
  }));
  assert.equal(report.srcName,'voz-match-original.wav');
  assert.equal(report.samples,report.corrected);
  assert(report.match&&Number.isFinite(report.match.appliedGainDb));
  assert(report.match.appliedGain>0);
  assert(report.qa&&report.qa.channels===2);
  assert.equal(report.qa.metrics.dropoutWindowCount,0);
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const dest=path.join(process.cwd(),'mixer-pitch-level-match-session.json');
  await dl.saveAs(dest);
  const project=JSON.parse(fs.readFileSync(dest,'utf8'));
  assert.equal(project.tracks[1].pitch.enabled,true);
  assert.equal(project.tracks[1].pitch.matchLevel,true);
  assert.equal(project.tracks[1].pitch.wet,100);
  assert.equal(project.tracks[1].name,'voz-match-original.wav');
  assert.equal(project.tracks[1].pitchMatchReport,undefined,'No report stored as a source of truth');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(dest);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#pitchMatch1').isChecked(),true);
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  const restored=await page.evaluate(()=>pitchLevelReports[1]);
  assert(Math.abs(restored.appliedGainDb-report.match.appliedGainDb)<1e-6,'Rebuild from source after session restore');
  assert((await page.locator('#pitchMatchStatus1').textContent()).includes('Igualación RMS orientativa'));
  const corrupt=JSON.parse(JSON.stringify(project));
  corrupt.tracks[7].pitch={...corrupt.tracks[7].pitch,matchLevel:"true"};
  await page.locator('#sessionFile').setInputFiles({
   name:'bad-level.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#pitchMatch1').isChecked(),true);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'voz-match-original.wav');
  const legacy=JSON.parse(JSON.stringify(project));
  legacy.tracks.forEach(t=>{if(t.pitch)delete t.pitch.matchLevel;});
  await page.locator('#sessionFile').setInputFiles({
   name:'legacy-level.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#pitchMatch1').isChecked(),false,'Legacy is opt-out by default');
  assert.equal(await page.evaluate(()=>pitchActive[1]),true,'Legacy pitch stays usable');
  assert((await page.locator('#pitchMatchStatus1').textContent()).includes('desactivada'));
  await page.locator('#file1').setInputFiles({name:'voice-new.wav',mimeType:'audio/wav',buffer:stereoWav(223)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voice-new.wav'));
  assert.equal(await page.evaluate(()=>pitchLevelReports[1]),null,'No stale matched-level report after new voice');
  assert.equal(await page.evaluate(()=>pitchActive[1]),false);
  assert.deepEqual(errors,[]);
  console.log('PASS vocal level-match browser: opt-in stereo pitch, QA notice, immutable source, active project roundtrip, malformed and legacy restore, stale reset.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
