'use strict';
/* Browser pitch-quality acceptance: compare PCM before/after, restore from
 * source, and invalidate stale QA after importing different vocal material.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function wav(hz){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(9500*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',x=>errors.push(x.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchQa"]').count(),7);
  assert((await page.locator('#pitchQa1').textContent()).includes('Sin diagnóstico'));
  await page.locator('#file1').setInputFiles({name:'qa-voice-a.wav',mimeType:'audio/wav',buffer:wav(224.5)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('qa-voice-a'));
  await page.locator('#pitchDetails1').evaluate(el=>el.open=true);
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:30000});
  const report=await page.locator('#pitchQa1').textContent();
  assert(report.includes('QA vocal orientativo'));
  assert(report.includes('RMS original')&&report.includes('Pico corregido'));
  const first=await page.evaluate(()=>({
   report:pitchReports[1],enabled:pitchActive[1],
   original:originalFiles[1]?.name
  }));
  assert.equal(first.original,'qa-voice-a.wav');
  assert.equal(first.enabled,true);
  assert.equal(first.report.channels,1);
  assert.equal(first.report.frames,frames);
  assert(first.report.metrics.outputPeakDbfs<0);
  // Reports are computed local-only and never added to the portable project.
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator('#saveSession').click()]);
  const p=path.join(process.cwd(),'pitch-qa-project.json');await download.saveAs(p);
  const session=JSON.parse(fs.readFileSync(p,'utf8'));
  assert.equal(session.tracks[1].pitch.enabled,true);
  assert.equal(session.tracks[1].qa,undefined);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({name:'pitch-qa-restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(session))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert((await page.locator('#pitchQa1').textContent()).includes('QA vocal orientativo'));
  const second=await page.evaluate(()=>pitchReports[1]);
  assert.deepEqual(second.metrics,first.report.metrics);
  await page.locator('#file1').setInputFiles({name:'qa-voice-b.wav',mimeType:'audio/wav',buffer:wav(230)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('qa-voice-b'));
  assert((await page.locator('#pitchQa1').textContent()).includes('Sin diagnóstico'));
  assert.equal(await page.evaluate(()=>pitchReports[1]),null);
  assert.equal(await page.evaluate(()=>pitchActive[1]),false);
  assert.deepEqual(errors,[]);
  console.log('PASS browser pitch QA: PCM report visible, restored recalculation, no JSON persistence, stale QA invalidated on new voice.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
