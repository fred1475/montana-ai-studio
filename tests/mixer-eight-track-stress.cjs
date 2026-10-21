'use strict';
/* Synthetic all-eight-track 30-second stress regression. Offline browser only.
 * Verifies duration/PCM headers, ZIP stem alignment, JSON backup restore and
 * absence of browser script exceptions. Not a real hardware RAM benchmark.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const sourceRate=44100,seconds=30,frames=sourceRate*seconds,twopi=Math.PI*2;
function wav(index){
 const bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);
 bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(sourceRate,24);bytes.writeUInt32LE(sourceRate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
 bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
 const frequency=160+index*55;
 for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(4000*Math.sin(twopi*frequency*i/sourceRate)),44+i*2);
 return bytes;
}
function zipEntries(bytes){
 const entries=[];let pos=0;
 while(pos+30<=bytes.length&&bytes.readUInt32LE(pos)===0x04034b50){
  const size=bytes.readUInt32LE(pos+18),nameLen=bytes.readUInt16LE(pos+26),extra=bytes.readUInt16LE(pos+28);
  const name=bytes.toString('utf8',pos+30,pos+30+nameLen);
  const payload=pos+30+nameLen+extra;
  assert(payload+size<=bytes.length,'ZIP size must not exceed file');
  entries.push({name,data:bytes.subarray(payload,payload+size)});
  pos=payload+size;
 }
 assert.equal(bytes.readUInt32LE(pos),0x02014b50,'ZIP central directory');
 return entries;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  const names=[];
  for(let i=0;i<8;i++){
   const name='stress-'+i+'.wav';names.push(name);
   await page.locator('#file'+i).setInputFiles({name,mimeType:'audio/wav',buffer:wav(i)});
   await page.waitForFunction((i)=>document.querySelector('#label'+i)?.textContent?.includes('stress-'+i+'.wav'),i,{timeout:30000});
  }
  const loaded=await page.evaluate(()=>({
   count:tracks.filter(Boolean).length,
   frames:tracks.map(x=>x?.length),
   originalSizes:originalFiles.map(x=>x?.size),
   durations:tracks.map(x=>x?.duration)
  }));
  assert.equal(loaded.count,8);
  assert(loaded.durations.every(x=>Math.abs(x-seconds)<.001));
  assert(loaded.frames.every(x=>Number.isInteger(x)&&x>0));
  assert(loaded.originalSizes.every(x=>x===44+frames*2));
  await page.locator('#wavSampleRate').selectOption('48000');
  await page.locator('#wavBits').selectOption('24');
  await page.locator('#estimateExport').click();
  const summary=await page.locator('#exportEstimateStatus').innerText();
  assert(summary.includes('Duración prevista: 30.00 s'));
  assert(summary.includes('ZIP de 8 stems'));
  assert(summary.includes('Master WAV PCM24'));
  async function download(selector,filename,timeout=120000){
   const [d]=await Promise.all([page.waitForEvent('download',{timeout}),page.locator(selector).click()]);
   const filenamePath=path.join(process.cwd(),filename);
   await d.saveAs(filenamePath);
   return fs.readFileSync(filenamePath);
  }
  const master=await download('#export','long-8-track-master.wav');
  assert.equal(master.toString('ascii',0,4),'RIFF');
  assert.equal(master.readUInt16LE(22),2);
  assert.equal(master.readUInt32LE(24),48000);
  assert.equal(master.readUInt16LE(34),24);
  assert.equal(master.length,44+seconds*48000*6);
  assert(master.subarray(44+10000,44+12000).some(x=>x!==0),'Non-silent sample data required');
  const zip=zipEntries(await download('#exportStems','long-8-track-stems.zip'));
  assert.equal(zip.length,9,'8 stems + manifest');
  assert(zip.at(-1).name==='LEEME-STEMS.txt');
  for(let i=0;i<8;i++){
   const wavFile=zip[i].data;
   assert(zip[i].name.startsWith(String(i+1).padStart(2,'0')+'-'));
   assert.equal(wavFile.toString('ascii',0,4),'RIFF');
   assert.equal(wavFile.readUInt32LE(24),sourceRate);
   assert.equal(wavFile.readUInt16LE(34),16);
   assert.equal(wavFile.length,44+seconds*sourceRate*4,'All stems have the same timeline duration');
  }
  const snapshot=JSON.parse((await download('#saveSession','long-8-track-project.json')).toString('utf8'));
  assert.equal(snapshot.tracks.length,8);
  assert.deepEqual(snapshot.tracks.map(x=>x.name),names);
  assert.equal(snapshot.wavSampleRate,48000);
  assert.equal(snapshot.wavBits,24);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({
   name:'long-8-track-restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:120000});
  const restored=await page.evaluate(()=>({
   labels:tracks.map((x,i)=>originalFiles[i]?.name),
   durations:tracks.map(x=>x?.duration),
   rates:tracks.map(x=>x?.sampleRate)
  }));
  assert.deepEqual(restored.labels,names,'Original sources are restored under expected names');
  assert(restored.durations.every(v=>Math.abs(v-seconds)<.001));
  assert(restored.rates.every(v=>Number.isInteger(v)&&v>=8000&&v<=192000));
  assert.equal(await page.locator('#wavBits').inputValue(),'24');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'48000');
  assert.deepEqual(errors,[]);
  console.log('PASS eight-track 30s synthetic session: 48k PCM24 master, 8 aligned ZIP stems and full source/session recovery.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
