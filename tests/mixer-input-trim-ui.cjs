'use strict';
/* Input trim acceptance: actual exported PCM, separate stems, source integrity,
 * legacy sessions, Undo/Redo and corrupt input rejection. No microphone.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function tone(rate=44100){
 const frames=rate,b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(3800*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
function rms(w){
 assert.equal(w.toString('ascii',0,4),'RIFF');
 assert.equal(w.readUInt16LE(22),2);assert.equal(w.readUInt16LE(34),16);
 const frames=Math.min(44100,Math.floor((w.length-44)/4));
 let sum=0;
 for(let i=0;i<frames;i++){const v=w.readInt16LE(44+i*4)/32768;sum+=v*v;}
 return Math.sqrt(sum/frames);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="inputTrim"][type=range]').count(),8);
  assert.equal(await page.locator('#inputTrim0').inputValue(),'0');
  const original=tone();
  await page.locator('#file0').setInputFiles({name:'dry-vocal.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('dry-vocal.wav'));
  await page.locator('#masterGain').fill('100');
  async function setTrim(db){
   await page.locator('#inputTrim0').fill(String(db));
   await page.locator('#inputTrim0').dispatchEvent('change');
   assert.equal(await page.locator('#inputTrimVal0').textContent(),String(db)+' dB');
  }
  async function exportWav(which){
   const [dl]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator(which).click()]);
   const target=path.join(process.cwd(),'trim-'+which.slice(1)+'-'+(await page.locator('#inputTrim0').inputValue())+'.wav');
   await dl.saveAs(target);return fs.readFileSync(target);
  }
  const unity=await exportWav('#export');const base=rms(unity);
  assert(base>.03&&base<.2,'Audible unity gain');
  await setTrim(-6);
  const cut=await exportWav('#export');
  assert(Math.abs(rms(cut)/base-Math.pow(10,-6/20))<.015,
   'Exported master applies input trim before fader and effects');
  await page.locator('#stemTrack').selectOption('0');
  const stemCut=await exportWav('#exportStem');
  assert(rms(stemCut)>.01);
  await setTrim(6);
  const boosted=await exportWav('#export');
  assert(Math.abs(rms(boosted)/base-Math.pow(10,6/20))<.025,'Pre-gain boosts master');
  const stemBoost=await exportWav('#exportStem');
  assert(Math.abs(rms(stemBoost)/rms(stemCut)-Math.pow(10,12/20))<.04,
   'Isolated stem obeys same input trim as master');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#inputTrim0').inputValue(),'-6');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#inputTrim0').inputValue(),'6');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'input-gain-session.json');await dl.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(saved.tracks[0].inputTrim,6);
  assert.equal(saved.tracks[1].inputTrim,0);
  assert.equal(saved.tracks[0].name,'dry-vocal.wav');
  const restoredSource=await page.evaluate(async()=>new Uint8Array(await originalFiles[0].arrayBuffer()));
  assert.deepEqual(Buffer.from(restoredSource),original,'Gain must not rewrite source WAV');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#inputTrim0').inputValue(),'6');
  assert.equal(await page.locator('#inputTrimVal0').textContent(),'6 dB');
  const corrupt=JSON.parse(JSON.stringify(saved));corrupt.tracks[7].inputTrim=99;
  await page.locator('#sessionFile').setInputFiles({name:'bad-gain.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#inputTrim0').inputValue(),'6','Bad backup cannot replace session');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'dry-vocal.wav');
  const legacy=JSON.parse(JSON.stringify(saved));legacy.tracks.forEach(t=>delete t.inputTrim);
  await page.locator('#sessionFile').setInputFiles({name:'legacy-gain.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#inputTrim0').inputValue(),'0','Legacy unity gain');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'dry-vocal.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS mixer input trim: real PCM master/stem -6/+6 dB, undo/redo, source bytes, sessions, corrupt backup and legacy.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
