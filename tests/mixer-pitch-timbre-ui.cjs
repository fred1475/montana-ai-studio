'use strict';
/* Spectral-character guard browser integration and safe older sessions.
 * Synthetic voiced samples cannot establish formant/perceptual fidelity.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function stereo(hz){
 const b=Buffer.alloc(44+frames*4);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);
 b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const time=i/rate,v=Math.round(8500*Math.sin(2*Math.PI*hz*time)+
   420*Math.sin(2*Math.PI*4*hz*time)+370*Math.sin(2*Math.PI*8*hz*time));
  b.writeInt16LE(v,44+i*4);b.writeInt16LE(-v,46+i*4);
 }
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchTimbre"][type=checkbox]').count(),7);
  assert.equal(await page.locator('#pitchTimbre1').isChecked(),false);
  const wave=stereo(224.5);
  await page.locator('#file1').setInputFiles({name:'timbre-vocal.wav',mimeType:'audio/wav',buffer:wave});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('timbre-vocal'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchTimbre1').check();
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:35000});
  const first=await page.evaluate(()=>({
   enabled:pitchActive[1],guard:pitchTimbreReports[1],
   outputLength:pitchBuffers[1]?.length,sourceLength:tracks[1]?.length,
   sourceName:originalFiles[1]?.name
  }));
  assert.equal(first.enabled,true);
  assert.equal(first.outputLength,first.sourceLength);
  assert.equal(first.sourceName,'timbre-vocal.wav');
  assert.equal(first.guard.enabled,true);
  assert([0,25,50,75,100].includes(first.guard.wetPercent));
  const status=await page.locator('#pitchTimbreStatus1').textContent();
  assert(status.includes('Protección espectral orientativa')||status.includes('señal insuficiente'));
  assert(status.includes('formantes')||status.includes('insuficiente'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const save=path.join(process.cwd(),'timbre-guard-session.json');await download.saveAs(save);
  const project=JSON.parse(fs.readFileSync(save,'utf8'));
  assert.equal(project.tracks[1].pitch.enabled,true);
  assert.equal(project.tracks[1].pitch.protectTimbre,true);
  assert.equal(project.tracks[1].pitch.matchLevel,false);
  assert.equal(project.tracks[1].pitchTimbreReport,undefined);
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),wave);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(save);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  assert.equal(await page.locator('#pitchTimbre1').isChecked(),true);
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  const restored=await page.evaluate(()=>pitchTimbreReports[1]);
  assert.deepEqual(restored,first.guard,'Guard report recalculates deterministically from original');
  const corrupted=JSON.parse(JSON.stringify(project));
  corrupted.tracks[7].pitch.protectTimbre='yes';
  await page.locator('#sessionFile').setInputFiles({name:'bad-timbre.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupted))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#pitchTimbre1').isChecked(),true);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'timbre-vocal.wav');
  const legacy=JSON.parse(JSON.stringify(project));
  delete legacy.manifestSha256;legacy.tracks.forEach(t=>{if(t.pitch)delete t.pitch.protectTimbre});
  await page.locator('#sessionFile').setInputFiles({name:'legacy-timbre.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  assert.equal(await page.locator('#pitchTimbre1').isChecked(),false);
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  assert.equal(await page.evaluate(()=>pitchTimbreReports[1]),null);
  assert((await page.locator('#pitchTimbreStatus1').textContent()).includes('desactivada'));
  await page.locator('#file1').setInputFiles({name:'new-voice.wav',mimeType:'audio/wav',buffer:stereo(229)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('new-voice'));
  assert.equal(await page.evaluate(()=>pitchTimbreReports[1]),null);
  assert.equal(await page.evaluate(()=>pitchActive[1]),false);
  assert.deepEqual(errors,[]);
  console.log('PASS vocal timbre spectral guard UI: optional processing, visible estimate, original WAV, deterministic JSON restore, corrupted settings and legacy compatibility.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
