'use strict';
/* Prove browser ZIP assembly does not read whole PCM stem Blobs into extra
 * ArrayBuffers, and every stored ZIP CRC/size matches the actual WAV bytes.
 * No real mic, real recording or perceptual quality claims.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {crc32}=require('../mixer-master-audit.js');
const rate=44100,frames=rate;
function monoWav(freq){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(11500*Math.sin(2*Math.PI*freq*i/rate)),44+2*i);
 return b;
}
function entries(data){
 const list=[];let p=0;
 while(p+30<=data.length&&data.readUInt32LE(p)===0x04034b50){
  assert.equal(data.readUInt16LE(p+8),0,'ZIP STORE only');
  const expectedCrc=data.readUInt32LE(p+14);
  const size=data.readUInt32LE(p+18);
  const nameLength=data.readUInt16LE(p+26),extraLength=data.readUInt16LE(p+28);
  const name=data.toString('utf8',p+30,p+30+nameLength);
  const start=p+30+nameLength+extraLength;
  assert(start+size<=data.length);
  const contents=data.subarray(start,start+size);
  assert.equal(crc32(contents),expectedCrc,'ZIP CRC must match entry '+name);
  list.push({name,bytes:contents});
  p=start+size;
 }
 assert.equal(data.readUInt32LE(p),0x02014b50,'ZIP central directory must exist');
 assert(data.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))>p,'ZIP end record required');
 return list;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file0').setInputFiles({name:'zip-beat.wav',mimeType:'audio/wav',buffer:monoWav(220)});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('zip-beat'));
  await page.locator('#file1').setInputFiles({name:'zip-voice.wav',mimeType:'audio/wav',buffer:monoWav(440)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('zip-voice'));
  await page.locator('#stemSampleRate').selectOption('48000');
  await page.locator('#stemBits').selectOption('24');
  // Existing imported File.arrayBuffer calls are finished. From here, WAV
  // Blob.arrayBuffer() is prohibited, even if the audio is only one second.
  await page.evaluate(()=>{
   const old=Blob.prototype.arrayBuffer;
   Blob.prototype.arrayBuffer=function(){
    if(this.type==='audio/wav')throw Error('FULL_WAV_BUFFER_FORBIDDEN');
    return old.call(this);
   };
  });
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:35000}),
   page.locator('#exportStems').click()
  ]);
  const zipPath=path.join(process.cwd(),'stems-streamed-crc.zip');
  await download.saveAs(zipPath);
  const files=entries(fs.readFileSync(zipPath));
  assert.deepEqual(files.map(x=>x.name),['01-Instrumental.wav','02-Voz-principal.wav','LEEME-STEMS.txt']);
  for(const file of files.slice(0,2)){
   assert.equal(file.bytes.toString('ascii',0,4),'RIFF');
   assert.equal(file.bytes.readUInt32LE(24),48000);
   assert.equal(file.bytes.readUInt16LE(34),24);
   assert.equal(file.bytes.length,44+48000*6);
  }
  const manifest=files[2].bytes.toString('utf8');
  assert(manifest.includes('48.0 kHz')&&manifest.includes('PCM24'));
  assert((await page.locator('#status').innerText()).includes('ZIP de 2 stems'));
  assert.equal(await page.locator('#exportStems').isDisabled(),false);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'zip-voice.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS streamed stem ZIP: PCM24 at 48kHz, correct STORE/CRC32 and headers, no whole-WAV Blob.arrayBuffer() calls.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
