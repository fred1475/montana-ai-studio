'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate*2,source=Buffer.alloc(44+n*2);
source.write('RIFF',0);source.writeUInt32LE(source.length-8,4);source.write('WAVE',8);
source.write('fmt ',12);source.writeUInt32LE(16,16);source.writeUInt16LE(1,20);
source.writeUInt16LE(1,22);source.writeUInt32LE(rate,24);source.writeUInt32LE(rate*2,28);
source.writeUInt16LE(2,32);source.writeUInt16LE(16,34);
source.write('data',36);source.writeUInt32LE(n*2,40);
for(let j=0;j<n;j++)source.writeInt16LE(Math.round(15000*Math.sin(2*Math.PI*220*j/rate)),44+j*2);
function rms(b,t1,t2){let s=0,count=0;for(let j=Math.round(t1*rate);j<Math.round(t2*rate);j++){const v=b.readInt16LE(44+j*4)/32768;s+=v*v;count++}return Math.sqrt(s/count)}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file0').setInputFiles({name:'fade-test.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('fade-test'));
  async function exportIt(btn,name){
   const [d]=await Promise.all([page.waitForEvent('download'),page.locator(btn).click()]);
   const dest=path.join(process.cwd(),name);await d.saveAs(dest);
   return fs.readFileSync(dest);
  }
  const raw=await exportIt('#export','fade-raw.wav');
  await page.locator('#fadeIn0').fill('0.5');
  await page.locator('#fadeOut0').fill('0.5');
  const faded=await exportIt('#export','fade-enveloped.wav');
  assert.equal(faded.length,raw.length,'Fades preserve exact audio duration');
  assert(rms(faded,.04,.14)<rms(raw,.04,.14)*.25,'First 100ms must fade in');
  assert(rms(faded,.90,1.1)>rms(raw,.90,1.1)*.98,'Middle must retain full level');
  assert(rms(faded,1.85,1.95)<rms(raw,1.85,1.95)*.25,'Last 100ms must fade out');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#exportStem').click()]);
  const stemPath=path.join(process.cwd(),'fade-stem.wav');await d.saveAs(stemPath);
  const stem=fs.readFileSync(stemPath);
  assert.equal(stem.length,faded.length);
  assert(rms(stem,.04,.14)<rms(stem,.90,1.1)*.26,'Stem applies same fade envelope');
  await page.locator('#fadeIn0').fill('0.65');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#fadeIn0').inputValue(),'0.5','Undo restores previous fade');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#fadeIn0').inputValue(),'0.65','Redo reapplies fade');
  await page.locator('#fadeIn0').fill('0.5');
  const [sessionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'fade-session.json');await sessionDownload.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(session.tracks[0].fadeIn,.5);assert.equal(session.tracks[0].fadeOut,.5);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#fadeIn0').inputValue(),'0.5');
  const restored=await exportIt('#export','fade-restored.wav');
  assert(rms(restored,.04,.14)<rms(restored,.90,1.1)*.25);
  session.tracks[0].fadeIn=9;
  const badPath=path.join(process.cwd(),'fade-invalid.json');fs.writeFileSync(badPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(badPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#fadeIn0').inputValue(),'0.5','Bad backup cannot replace good session');
  delete session.manifestSha256;delete session.tracks[0].fadeIn;delete session.tracks[0].fadeOut;
  const legacyPath=path.join(process.cwd(),'fade-legacy.json');fs.writeFileSync(legacyPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(legacyPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#fadeIn0').inputValue(),'0','Legacy session must default to no fades');
  assert.deepEqual(errors,[]);
  console.log('PASS fades: PCM amplitude ramps, duration unchanged, individual stem, undo/redo, session round trip, invalid backup rejection and legacy defaults');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
