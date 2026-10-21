'use strict';
/* Audible stereo pan automation: real master/stem WAV PCM and session roundtrips.
 * No microphone, no external providers and no spending.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function tone(rate=44100){
 const n=rate*2,b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(2500*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
function stereoRms(w,start,end){
 assert.equal(w.toString('ascii',0,4),'RIFF');
 assert.equal(w.readUInt32LE(24),44100);assert.equal(w.readUInt16LE(22),2);
 assert.equal(w.readUInt16LE(34),16);
 const n0=Math.round(start*44100),n1=Math.round(end*44100),sum=[0,0];
 for(let n=n0;n<n1;n++)for(let ch=0;ch<2;ch++){
  const x=w.readInt16LE(44+n*4+ch*2)/32768;sum[ch]+=x*x;
 }
 return sum.map(x=>Math.sqrt(x/(n1-n0)));
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="panAutoEnable"]').count(),8);
  assert.equal(await page.locator('#panAutoEnable1').isChecked(),false);
  const original=tone();
  await page.locator('#file1').setInputFiles({name:'mono-adlib.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('mono-adlib.wav'));
  await page.locator('#masterGain').fill('100');
  async function download(button,label){
   const [dl]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator(button).click()]);
   const dest=path.join(process.cwd(),'pan-automation-'+label+'.wav');
   await dl.saveAs(dest);return fs.readFileSync(dest);
  }
  await page.locator('#pan1').fill('70');
  const fixed=await download('#export','fixed');
  const [fixedL,fixedR]=stereoRms(fixed,.15,.3);
  assert(fixedR>fixedL*2,'Disabled automation retains base pan slider');
  await page.locator('#panAutoDetails1 summary').click();
  await page.locator('#panAutoPoints1').fill('0:-100, 0.5:-100, 1:100, 1.5:100');
  await page.locator('#panAutoPoints1').dispatchEvent('change');
  await page.locator('#panAutoEnable1').check();
  const master=await download('#export','master');
  const [m0L,m0R]=stereoRms(master,.2,.35),[m1L,m1R]=stereoRms(master,1.65,1.85);
  assert(m0L>.02&&m0L>m0R*15,'Master starts left');
  assert(m1R>.02&&m1R>m1L*15,'Master finishes right');
  await page.locator('#stemTrack').selectOption('1');
  const stem=await download('#exportStem','stem');
  const [s0L,s0R]=stereoRms(stem,.2,.35),[s1L,s1R]=stereoRms(stem,1.65,1.85);
  assert(s0L>.02&&s0L>s0R*15,'Stem starts left');
  assert(s1R>.02&&s1R>s1L*15,'Stem finishes right');
  assert(Math.abs(s0L-m0L)<.015,'Master and stem use same L/R panning');
  assert(Math.abs(s1R-m1R)<.015,'Master and stem match after panorama movement');
  await page.locator('#panAutoPoints1').fill('0:0, 1:100');
  await page.locator('#panAutoPoints1').dispatchEvent('change');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:-100, 0.5:-100, 1:100, 1.5:100');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:0, 1:100');
  await page.locator('#panAutoPoints1').fill('0:0, 0:100');
  await page.locator('#panAutoPoints1').dispatchEvent('change');
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:0, 1:100','Malformed edit must roll back');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'stereo-pan-automation-session.json');
  await dl.saveAs(sessionPath);const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.deepEqual(session.tracks[1].panAutomation,{enabled:true,points:[{time:0,pan:0},{time:1,pan:100}]});
  assert.deepEqual(session.tracks[0].panAutomation,{enabled:false,points:[{time:0,pan:0}]});
  assert.equal(session.tracks[1].name,'mono-adlib.wav');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:25000});
  assert.equal(await page.locator('#panAutoEnable1').isChecked(),true);
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:0, 1:100');
  const corrupt=JSON.parse(JSON.stringify(session));corrupt.tracks[7].panAutomation.points[0].pan=300;
  await page.locator('#sessionFile').setInputFiles({name:'corrupt-pan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#panAutoEnable1').isChecked(),true);
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:0, 1:100');
  const legacy=JSON.parse(JSON.stringify(session));delete legacy.manifestSha256;legacy.tracks.forEach(t=>delete t.panAutomation);
  await page.locator('#sessionFile').setInputFiles({name:'legacy-pan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:25000});
  assert.equal(await page.locator('#panAutoEnable1').isChecked(),false);
  assert.equal(await page.locator('#panAutoPoints1').inputValue(),'0:0');
  assert.equal(await page.locator('#pan1').inputValue(),'70','Legacy pan slider retained');
  assert.deepEqual(errors,[]);
  console.log('PASS pan automation: true stereo master/stem L/R travel, fixed-pan fallback, Undo/Redo, source bytes, corrupted backup and legacy sessions.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
