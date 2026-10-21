'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate,source=Buffer.alloc(44+frames*2);
source.write('RIFF',0);source.writeUInt32LE(source.length-8,4);source.write('WAVE',8);
source.write('fmt ',12);source.writeUInt32LE(16,16);source.writeUInt16LE(1,20);
source.writeUInt16LE(1,22);source.writeUInt32LE(rate,24);source.writeUInt32LE(rate*2,28);
source.writeUInt16LE(2,32);source.writeUInt16LE(16,34);
source.write('data',36);source.writeUInt32LE(frames*2,40);
for(let j=0;j<frames;j++){
 const freq=j<frames/2?330:660;
 source.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*freq*j/rate)),44+2*j);
}
function energy(wav,start,end){
 let v=0,count=0;
 for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
  const x=wav.readInt16LE(44+4*i)/32768;v+=x*x;count++;
 }
 return Math.sqrt(v/count);
}
function frequency(wav,hz,start,end){
 let sn=0,cs=0,points=0;
 for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
  const x=wav.readInt16LE(44+4*i)/32768,phase=2*Math.PI*i*hz/rate;
  sn+=x*Math.sin(phase);cs+=x*Math.cos(phase);points++;
 }
 return 2*Math.hypot(sn,cs)/points;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="splitDetails"]').count(),8,'Split control for each mixer channel');
  await page.locator('#file1').setInputFiles({name:'two-tone-source.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('two-tone-source'));
  await page.locator('#splitDetails1 summary').click();
  await page.locator('#splitHalf1').click();
  assert.equal(await page.locator('#splitMode1').inputValue(),'1');
  assert.equal(await page.locator('#splitAt1').inputValue(),'0.5');
  await page.locator('#splitOffset1').fill('1.5');
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1]).length),2);
  const parts=await page.evaluate(()=>getTrackSegments(1,tracks[1]).map(({offset,start,duration})=>({offset,start,duration})));
  assert.deepEqual(parts,[{offset:0,start:0,duration:.5},{offset:1.5,start:.5,duration:.5}]);
  await page.waitForFunction(()=>document.querySelectorAll('#timeline [data-track="1"][data-part]').length===2);
  async function exportIt(button,name){
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator(button).click()]);
   const target=path.join(process.cwd(),name);await download.saveAs(target);return fs.readFileSync(target);
  }
  const master=await exportIt('#export','split-two-fragments.wav');
  assert.equal(master.length,44+rate*2*4,'Split timeline ends exactly at 2 seconds');
  assert(frequency(master,330,.15,.35)>.15,'First clip must contain 330Hz');
  assert(frequency(master,660,.15,.35)<.01,'Second tone cannot bleed into first clip');
  assert(energy(master,.8,1.1)<.001,'Inserted gap must contain silence');
  assert(frequency(master,660,1.65,1.85)>.15,'Moved clip must contain 660Hz at later position');
  assert(frequency(master,330,1.65,1.85)<.01,'First clip cannot contaminate second');
  await page.locator('#stemTrack').selectOption('1');
  const stem=await exportIt('#exportStem','split-two-fragments-stem.wav');
  assert.equal(stem.length,master.length,'Stem must retain both segments and gap');
  assert(energy(stem,.8,1.1)<.001);
  assert(frequency(stem,660,1.65,1.85)>.15);
  await page.locator('#splitOffset1').fill('1.2');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#splitOffset1').inputValue(),'1.5','Undo restores fragment positioning');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#splitOffset1').inputValue(),'1.2','Redo reapplies fragment position');
  await page.locator('#splitOffset1').fill('1.5');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'split-session.json');await download.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.deepEqual(saved.tracks[1].split,{enabled:true,at:.5,rightOffset:1.5});
  assert(saved.tracks[1].data.length>1000,'Backup embeds original audio');
  await page.reload();await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#splitMode1').inputValue(),'1');
  assert.equal(await page.locator('#splitOffset1').inputValue(),'1.5');
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1]).length),2);
  const restored=await exportIt('#export','split-session-restored.wav');
  assert.equal(restored.length,master.length);
  assert(frequency(restored,660,1.65,1.85)>.15);
  saved.tracks[1].split.at=2;
  const invalidPath=path.join(process.cwd(),'split-invalid.json');
  fs.writeFileSync(invalidPath,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(invalidPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#splitMode1').inputValue(),'1','Invalid split cannot corrupt open project');
  assert.equal(await page.locator('#splitOffset1').inputValue(),'1.5');
  delete saved.tracks[1].split;
  const legacyPath=path.join(process.cwd(),'split-legacy.json');
  fs.writeFileSync(legacyPath,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(legacyPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#splitMode1').inputValue(),'0','Old sessions default to unsplit clips');
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1]).length),1);
  assert.deepEqual(errors,[]);
  console.log('PASS clip split: two frequencies separated by real silence, aligned master and stem PCM, undo/redo, session and legacy restore, invalid backup rejected');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
