'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function sampleWav(hz){
 const b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(11000*Math.sin(2*Math.PI*hz*i/rate)),44+2*i);
 return b;
}
function entries(zip){
 const files=new Map();let p=0;
 while(p+30<zip.length&&zip.readUInt32LE(p)===0x04034b50){
  const n=zip.readUInt16LE(p+26),extra=zip.readUInt16LE(p+28),size=zip.readUInt32LE(p+18);
  const name=zip.toString('utf8',p+30,p+30+n);
  const start=p+30+n+extra;assert(start+size<=zip.length);
  files.set(name,zip.subarray(start,start+size));p=start+size;
 }
 assert.equal(zip.readUInt32LE(p),0x02014b50);
 return files;
}
function inspect(blob,bits){
 assert.equal(blob.toString('ascii',0,4),'RIFF');
 assert.equal(blob.readUInt16LE(20),1);assert.equal(blob.readUInt16LE(22),2);
 assert.equal(blob.readUInt32LE(24),rate);assert.equal(blob.readUInt16LE(34),bits);
 assert.equal(blob.readUInt16LE(32),bits/4);
 assert.equal(blob.length,44+frames*bits/4);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#stemBits').inputValue(),'16');
  assert.equal(await page.locator('#wavBits').inputValue(),'16');
  await page.locator('#file0').setInputFiles({name:'ritmo.wav',mimeType:'audio/wav',buffer:sampleWav(220)});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('ritmo.wav'));
  await page.locator('#file1').setInputFiles({name:'voz.wav',mimeType:'audio/wav',buffer:sampleWav(330)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz.wav'));
  await page.locator('#stemBits').selectOption('24');
  assert.equal(await page.locator('#wavBits').inputValue(),'16','Stem bits must not change master bits');
  async function save(button,name){
   const [d]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator(button).click()]);
   const full=path.join(process.cwd(),name);await d.saveAs(full);return fs.readFileSync(full);
  }
  const single=await save('#exportStem','stems24-single.wav');
  inspect(single,24);
  const zip=await save('#exportStems','stems24-bundle.zip');
  const files=entries(zip);
  assert.deepEqual([...files.keys()],['01-Instrumental.wav','02-Voz-principal.wav','LEEME-STEMS.txt']);
  const beat=files.get('01-Instrumental.wav'),voice=files.get('02-Voz-principal.wav');
  inspect(beat,24);inspect(voice,24);
  assert(files.get('LEEME-STEMS.txt').toString('utf8').includes('PCM24'));
  // 24-bit detail: original stereo 16-bit input is processed as Float32 then
  // encoded in PCM24, and each stem remains isolated.
  const read24=(b,p)=>{let x=b[p]|(b[p+1]<<8)|(b[p+2]<<16);return (x&0x800000?x-0x1000000:x)/8388608};
  let peakBeat=0,peakVoice=0;
  for(let i=0;i<frames;i+=17){
   peakBeat=Math.max(peakBeat,Math.abs(read24(beat,44+i*6)));
   peakVoice=Math.max(peakVoice,Math.abs(read24(voice,44+i*6)));
  }
  assert(peakBeat>.1&&peakVoice>.1);
  const restored=JSON.parse((await save('#saveSession','stems24-project.json')).toString('utf8'));
  assert.equal(restored.stemBits,24);
  assert.equal(restored.wavBits,16);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({name:'stems24-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restored))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  assert.equal(await page.locator('#stemBits').inputValue(),'24');
  assert.equal(await page.locator('#wavBits').inputValue(),'16');
  const master=await save('#export','stems24-master-independent.wav');
  inspect(master,16);
  // Invalid settings must reject the snapshot and retain the active project.
  const broken={...restored,stemBits:32};
  await page.locator('#sessionFile').setInputFiles({name:'stems24-invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#stemBits').inputValue(),'24');
  assert((await page.locator('#label1').innerText()).includes('voz.wav'));
  const legacy={...restored};delete legacy.manifestSha256;delete legacy.stemBits;
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({name:'stems24-legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#stemBits').inputValue(),'16','Old snapshots must default to PCM16 stems');
  assert.deepEqual(errors,[]);
  console.log('PASS PCM24 stems: stereo RIFF/ZIP, independent master depth, source recovery, invalid and legacy JSON preferences.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
