'use strict';
/* 48k stems independent of master: exact WAV/ZIP byte headers, resampling
 * pitch, alignment, session validation and legacy format defaults.
 * Synthetic browser fixtures, not resampler quality certification.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const srcRate=44100,seconds=1,frames=srcRate;
function wav(freq){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(srcRate,24);
 b.writeUInt32LE(srcRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(10500*Math.sin(2*Math.PI*freq*i/srcRate)),44+i*2);
 return b;
}
function archive(buffer){
 const files=new Map();let p=0;
 while(p+30<=buffer.length&&buffer.readUInt32LE(p)===0x04034b50){
  const size=buffer.readUInt32LE(p+18),nameLen=buffer.readUInt16LE(p+26),extraLen=buffer.readUInt16LE(p+28);
  const name=buffer.toString('utf8',p+30,p+30+nameLen),start=p+30+nameLen+extraLen;
  assert(start+size<=buffer.length);files.set(name,buffer.subarray(start,start+size));p=start+size;
 }
 assert.equal(buffer.readUInt32LE(p),0x02014b50,'ZIP central directory required');
 return files;
}
function checkWav(buffer,rate,bits){
 assert.equal(buffer.toString('ascii',0,4),'RIFF');
 assert.equal(buffer.toString('ascii',8,12),'WAVE');
 assert.equal(buffer.readUInt16LE(20),1);assert.equal(buffer.readUInt16LE(22),2);
 assert.equal(buffer.readUInt32LE(24),rate);assert.equal(buffer.readUInt16LE(34),bits);
 const stride=bits/4;
 assert.equal(buffer.readUInt16LE(32),stride);
 assert.equal(buffer.readUInt32LE(28),rate*stride);
 assert.equal(buffer.length,44+buffer.readUInt32LE(40));
 assert.equal((buffer.length-44)%stride,0);
 return (buffer.length-44)/stride;
}
function sample(buffer,at,bits){
 const p=44+at*bits/4;
 if(bits===16)return buffer.readInt16LE(p)/32768;
 const n=buffer[p]|buffer[p+1]<<8|buffer[p+2]<<16;
 return (n&0x800000?n-0x1000000:n)/8388608;
}
function pitchEstimate(buffer,rate,bits,startSec,endSec){
 let prev=sample(buffer,Math.floor(startSec*rate),bits),crossings=0;
 for(let i=Math.floor(startSec*rate)+1;i<Math.floor(endSec*rate);i++){
  const v=sample(buffer,i,bits);
  if(prev<=0&&v>0)crossings++;
  prev=v;
 }
 return crossings/(endSec-startSec);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#stemSampleRate').inputValue(),'44100');
  assert.equal(await page.locator('#stemBits').inputValue(),'16');
  await page.locator('#file0').setInputFiles({name:'beat-1k.wav',mimeType:'audio/wav',buffer:wav(1000)});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('beat-1k.wav'));
  await page.locator('#file1').setInputFiles({name:'voz-500.wav',mimeType:'audio/wav',buffer:wav(500)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz-500.wav'));
  await page.locator('#offset1').fill('0.25');
  await page.locator('#stemSampleRate').selectOption('48000');
  await page.locator('#stemBits').selectOption('24');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'44100');
  assert.equal(await page.locator('#wavBits').inputValue(),'16');
  async function download(selector,name){
   const [file]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator(selector).click()]);
   const destination=path.join(process.cwd(),name);await file.saveAs(destination);
   return fs.readFileSync(destination);
  }
  const zip=archive(await download('#exportStems','stem-48k-24.zip'));
  assert.deepEqual([...zip.keys()],['01-Instrumental.wav','02-Voz-principal.wav','LEEME-STEMS.txt']);
  const beat=zip.get('01-Instrumental.wav'),voice=zip.get('02-Voz-principal.wav');
  const expectedFrames=Math.ceil(1.25*48000);
  assert.equal(checkWav(beat,48000,24),expectedFrames);
  assert.equal(checkWav(voice,48000,24),expectedFrames);
  assert(Math.abs(pitchEstimate(beat,48000,24,.1,.9)-1000)<3,'1k source cannot transpose at 48k');
  assert(Math.abs(pitchEstimate(voice,48000,24,.4,1.1)-500)<3,'Voice note cannot transpose at 48k');
  for(let i=100;i<.20*48000;i+=900)assert(Math.abs(sample(voice,i,24))<1e-6,'Voice timeline offset must remain silent');
  const readme=zip.get('LEEME-STEMS.txt').toString('utf8');
  assert(readme.includes('48.0 kHz')&&readme.includes('PCM24'));
  await page.locator('#stemTrack').selectOption('1');
  const single=await download('#exportStem','stem-individual-48k24.wav');
  assert.equal(checkWav(single,48000,24),expectedFrames);
  const project=JSON.parse((await download('#saveSession','stem-rate-project.json')).toString('utf8'));
  assert.equal(project.stemSampleRate,48000);assert.equal(project.stemBits,24);
  assert.equal(project.wavSampleRate,44100);
  await page.reload();
  async function restore(data,name){
   await page.locator('#sessionFile').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada')||document.querySelector('#status')?.textContent?.includes('No se restauró'),null,{timeout:35000});
  }
  await restore(project,'stem-rate-valid.json');
  assert.equal(await page.locator('#stemSampleRate').inputValue(),'48000');
  assert.equal(await page.locator('#stemBits').inputValue(),'24');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'44100');
  const master=await download('#export','stem-rate-master.wav');
  assert.equal(checkWav(master,44100,16),Math.ceil(1.25*44100));
  const invalid={...project,stemSampleRate:'48000'};
  await restore(invalid,'stem-rate-invalid.json');
  assert((await page.locator('#status').innerText()).includes('No se restauró'),'Numeric strings must not bypass validation');
  assert.equal(await page.locator('#stemSampleRate').inputValue(),'48000','Rejected session must keep active format');
  const legacy={...project};delete legacy.stemSampleRate;
  await page.reload();await restore(legacy,'stem-rate-legacy.json');
  assert.equal(await page.locator('#stemSampleRate').inputValue(),'44100');
  assert.equal(await page.locator('#stemBits').inputValue(),'24');
  const fallback=await download('#exportStem','stem-legacy-44100.wav');
  assert.equal(checkWav(fallback,44100,24),Math.ceil(1.25*44100));
  assert.deepEqual(errors,[]);
  console.log('PASS stems multirate: WAV PCM24 48k ZIP/single, resampled 1k/500Hz tone, timeline, independent master, legacy and invalid session preferences.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
