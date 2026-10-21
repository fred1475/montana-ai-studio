'use strict';
/* Montana AI Studio — browser integration for export-rate selection.
 * 44.1 and 48 kHz PCM16/24, resampling, sessions, CRC and invalid restores.
 * Synthetic test signals only, not a professional converter certification.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {crc32}=require('../mixer-master-audit.js');
const sourceRate=44100;
function sourceTone(){
 const frames=sourceRate,buffer=Buffer.alloc(44+frames*2*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVE',8);
 buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);
 buffer.writeUInt16LE(2,22);buffer.writeUInt32LE(sourceRate,24);
 buffer.writeUInt32LE(sourceRate*4,28);buffer.writeUInt16LE(4,32);buffer.writeUInt16LE(16,34);
 buffer.write('data',36);buffer.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const sample=Math.round(11000*Math.sin(2*Math.PI*1000*i/sourceRate));
  buffer.writeInt16LE(sample,44+i*4);
  buffer.writeInt16LE(sample,46+i*4);
 }
 return buffer;
}
function decodeSample(buffer,frame,bits){
 const p=44+frame*bits/4;
 if(bits===16)return buffer.readInt16LE(p)/32768;
 const unsigned=buffer[p]|(buffer[p+1]<<8)|(buffer[p+2]<<16);
 return (unsigned&0x800000?unsigned-0x1000000:unsigned)/8388608;
}
function inspectWav(buffer,rate,bits){
 assert.equal(buffer.toString('ascii',0,4),'RIFF');
 assert.equal(buffer.toString('ascii',8,12),'WAVE');
 assert.equal(buffer.readUInt16LE(20),1);
 assert.equal(buffer.readUInt16LE(22),2);
 assert.equal(buffer.readUInt32LE(24),rate);
 assert.equal(buffer.readUInt16LE(34),bits);
 assert.equal(buffer.readUInt16LE(32),bits/4);
 assert.equal(buffer.readUInt32LE(28),rate*bits/4);
 assert.equal(buffer.readUInt32LE(40),rate*bits/4,'One second expected');
 assert.equal(buffer.length,44+rate*bits/4);
 // Count transitions away from the first few milliseconds to avoid startup artifacts.
 let crossings=0,peak=0,prev=decodeSample(buffer,Math.round(rate*.10),bits);
 for(let i=Math.round(rate*.10)+1;i<Math.round(rate*.90);i++){
  const value=decodeSample(buffer,i,bits);
  peak=Math.max(peak,Math.abs(value));
  if(prev<=0&&value>0)crossings++;
  prev=value;
 }
 const estimate=crossings/.8;
 assert(Math.abs(estimate-1000)<3,'Resampled 1 kHz test tone must retain pitch, got '+estimate);
 assert(peak>.15&&peak<.8,'No silence or full-scale PCM clipping');
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'44100');
  assert.equal(await page.locator('#wavBits').inputValue(),'16');
  await page.locator('#file1').setInputFiles({name:'tono-1k-44100.wav',mimeType:'audio/wav',buffer:sourceTone()});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('tono-1k-44100.wav'));
  async function save(button,name){
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator(button).click()]);
   const filename=path.join(process.cwd(),name);await download.saveAs(filename);
   return fs.readFileSync(filename);
  }
  const defaultWav=await save('#export','samplerate-44100.wav');
  inspectWav(defaultWav,44100,16);
  await page.locator('#wavSampleRate').selectOption('48000');
  await page.locator('#wavBits').selectOption('24');
  await page.locator('#auditOn').check();
  const videoWav=await save('#export','samplerate-48000-24.wav');
  inspectWav(videoWav,48000,24);
  await page.waitForFunction(()=>document.querySelector('#auditStatus')?.textContent?.includes('Informe del último WAV listo'),null,{timeout:35000});
  const report=JSON.parse((await save('#downloadAudit','samplerate-48000-report.json')).toString('utf8'));
  assert.equal(report.file.sampleRate,48000);
  assert.equal(report.file.bitsPerSample,24);
  assert.equal(report.file.frames,48000);
  assert.equal(report.file.crc32,crc32(videoWav).toString(16).padStart(8,'0'));
  const saved=JSON.parse((await save('#saveSession','samplerate-session.json')).toString('utf8'));
  assert.equal(saved.wavSampleRate,48000);
  assert.equal(saved.wavBits,24);
  await page.reload();
  async function restore(session,name){
   await page.evaluate(()=>document.querySelector('#status').textContent='Validando nuevo archivo de sesión...');
   await page.locator('#sessionFile').setInputFiles({
    name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(session))
   });
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada')||document.querySelector('#status')?.textContent?.includes('No se restauró'),null,{timeout:35000});
  }
  await restore(saved,'samplerate-session.json');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'48000');
  assert.equal(await page.locator('#wavBits').inputValue(),'24');
  const restoredWav=await save('#export','samplerate-restored-48000.wav');
  inspectWav(restoredWav,48000,24);
  for(const badValue of [96000,'48000',0,null]){
   const invalid={...saved,wavSampleRate:badValue};
   await restore(invalid,'samplerate-invalid.json');
   assert((await page.locator('#status').innerText()).includes('No se restauró'),'Invalid setting must reject entire session');
   assert.equal(await page.locator('#wavSampleRate').inputValue(),'48000','Failed restore must preserve active rate');
  }
  const legacy={...saved};delete legacy.manifestSha256;delete legacy.wavSampleRate;
  await page.reload();
  await restore(legacy,'samplerate-legacy.json');
  assert((await page.locator('#status').innerText()).includes('Sesión restaurada'),'Legacy import must succeed');
  assert.equal(await page.locator('#wavSampleRate').inputValue(),'44100','Old sessions default to 44.1 kHz');
  assert.equal(await page.locator('#wavBits').inputValue(),'24','Other session settings must survive');
  assert.deepEqual(errors,[]);
  console.log('PASS master 44.1/48kHz PCM16/24, tone pitch, exact header/CRC, session round-trip and invalid/legacy defaults');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
