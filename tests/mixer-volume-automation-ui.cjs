'use strict';
/* Render real PCM16 master & isolated stem through song-timeline automation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function tone(rate=44100){
 const count=rate*2,b=Buffer.alloc(44+count*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)b.writeInt16LE(Math.round(2600*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
function rms(w,start,end){
 assert.equal(w.toString('ascii',0,4),'RIFF');
 assert.equal(w.readUInt32LE(24),44100);
 assert.equal(w.readUInt16LE(22),2);assert.equal(w.readUInt16LE(34),16);
 const from=Math.round(start*44100),to=Math.round(end*44100);let sum=0;
 for(let i=from;i<to;i++){const a=w.readInt16LE(44+i*4)/32768;sum+=a*a;}
 return Math.sqrt(sum/(to-from));
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#autoEnable0').isChecked(),false);
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100');
  const source=tone();
  await page.locator('#file0').setInputFiles({name:'automation-reference.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('automation-reference.wav'));
  await page.locator('#masterGain').fill('100');
  async function exportWav(button,name){
   const [dl]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator(button).click()]);
   const target=path.join(process.cwd(),'automation-'+name+'.wav');await dl.saveAs(target);
   return fs.readFileSync(target);
  }
  const normal=await exportWav('#export','dry');
  const baseline=rms(normal,.14,.28);
  assert(baseline>.04&&baseline<.15);
  await page.locator('#autoPoints0').fill('0:100, 0.5:0, 1:0, 1.5:100');
  await page.locator('#autoPoints0').dispatchEvent('change');
  await page.locator('#autoEnable0').check();
  assert((await page.locator('#autoPreview0').innerText()).includes('Activa'));
  const mixed=await exportWav('#export','master');
  assert(Math.abs(rms(mixed,.14,.28)/baseline-.58)<.06,'First ramp is sample-applied');
  assert(rms(mixed,.70,.92)<baseline*.02,'Quiet passage nearly silent');
  assert(rms(mixed,1.67,1.9)>baseline*.94,'Song volume recovers after ramp');
  await page.locator('#stemTrack').selectOption('0');
  const stem=await exportWav('#exportStem','stem');
  assert(rms(stem,.7,.92)<baseline*.02,'Stem includes automation dip');
  assert(rms(stem,1.67,1.9)>baseline*.94,'Stem restores volume');
  await page.locator('#autoPoints0').fill('0:100, 0.5:20, 1:20, 1.5:100');
  await page.locator('#autoPoints0').dispatchEvent('change');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:0, 1:0, 1.5:100');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:20, 1:20, 1.5:100');
  // Reject malformed curve without corrupting the last accepted setting.
  await page.locator('#autoPoints0').fill('0:100, 0.5:88, 0.5:20');
  await page.locator('#autoPoints0').dispatchEvent('change');
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:20, 1:20, 1.5:100');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'automation-session.json');await download.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(session.tracks[0].volumeAutomation.enabled,true);
  assert.equal(session.tracks[0].volumeAutomation.points.length,4);
  assert.equal(session.tracks[7].volumeAutomation.enabled,false);
  assert.equal(session.tracks[0].name,'automation-reference.wav');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[0].arrayBuffer()))),source);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#autoEnable0').isChecked(),true);
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:20, 1:20, 1.5:100');
  // Corrupted 8th lane in backup cannot change the active project.
  const bad=JSON.parse(JSON.stringify(session));
  bad.tracks[7].volumeAutomation={enabled:true,points:[{time:0,gain:100},{time:-3,gain:50}]};
  await page.locator('#sessionFile').setInputFiles({
   name:'bad-automation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#autoEnable0').isChecked(),true);
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:20, 1:20, 1.5:100');
  const legacy=JSON.parse(JSON.stringify(session));
  legacy.tracks.forEach(t=>delete t.volumeAutomation);
  await page.locator('#sessionFile').setInputFiles({
   name:'legacy-automation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#autoEnable0').isChecked(),false);
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'automation-reference.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS volume automation browser: master and stem real PCM time-varying gain, undo/redo, invalid edit rollback, JSON and legacy recovery.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
