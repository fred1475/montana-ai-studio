'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function toneWav(freq){
 const b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*freq*i/rate)),44+i*2);
 return b;
}
function archiveEntries(zip){
 const files=new Map();let position=0;
 while(position+30<=zip.length&&zip.readUInt32LE(position)===0x04034b50){
  assert.equal(zip.readUInt16LE(position+8),0,'Archive must use ZIP STORE');
  const size=zip.readUInt32LE(position+18),len=zip.readUInt16LE(position+26),extra=zip.readUInt16LE(position+28);
  const name=zip.toString('utf8',position+30,position+30+len),start=position+30+len+extra;
  assert(start+size<=zip.length);
  files.set(name,zip.subarray(start,start+size));position=start+size;
 }
 assert.equal(zip.readUInt32LE(position),0x02014b50,'Archive must include ZIP central directory');
 assert(zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))>=0,'Archive must include valid ZIP end-of-central-directory');
 return files;
}
function measure(wav,t1,t2){
 const l=Math.floor(t1*rate),r=Math.floor(t2*rate);
 let energy=0;for(let i=l;i<r;i++){const sample=wav.readInt16LE(44+4*i)/32768;energy+=sample*sample}
 return Math.sqrt(energy/(r-l));
}
function frequencyStrength(wav,f,t1,t2){
 let sine=0,cosine=0;
 const start=Math.floor(t1*rate),end=Math.floor(t2*rate);
 for(let i=start;i<end;i++){
  const v=wav.readInt16LE(44+i*4)/32768,phase=2*Math.PI*f*i/rate;
  sine+=v*Math.sin(phase);cosine+=v*Math.cos(phase);
 }
 return 2*Math.hypot(sine,cosine)/(end-start);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file0').setInputFiles({name:'beat.wav',mimeType:'audio/wav',buffer:toneWav(220)});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('beat.wav'));
  await page.locator('#file1').setInputFiles({name:'vocal.wav',mimeType:'audio/wav',buffer:toneWav(330)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('vocal.wav'));
  await page.locator('#offset1').fill('0.25');
  await page.locator('#mute1').check();
  await page.locator('#solo0').check();
  await page.locator('#vol1').fill('70');
  await page.locator('#masterGain').fill('20');
  await page.locator('#limiterOn').check();
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:30000}),
   page.locator('#exportStems').click()
  ]);
  const zipPath=path.join(process.cwd(),'mixer-two-stems.zip');await download.saveAs(zipPath);
  const zip=fs.readFileSync(zipPath),files=archiveEntries(zip);
  assert.deepEqual([...files.keys()],['01-Instrumental.wav','02-Voz-principal.wav','LEEME-STEMS.txt']);
  const instrumental=files.get('01-Instrumental.wav'),voice=files.get('02-Voz-principal.wav');
  assert.equal(instrumental.length,voice.length,'Every stem has full timeline duration');
  assert.equal(voice.readUInt32LE(24),rate);
  assert.equal(voice.readUInt16LE(22),2);
  assert(Math.abs((voice.length-44)/4-rate*1.25)<=2,'Both stems must include time zero through end of longest stem');
  assert(measure(voice,.05,.15)<.00001,'Voice stem must contain time-zero silence before offset');
  assert(measure(voice,.5,.7)>.07,'Muted vocal must still export audible isolated stem');
  assert(frequencyStrength(voice,330,.55,.75)>.10,'Voice retains its distinct 330Hz note');
  assert(frequencyStrength(voice,220,.55,.75)<.01,'Voice stem cannot contain the 220Hz instrumental');
  assert(frequencyStrength(instrumental,220,.55,.75)>.15,'Instrumental stem should contain the original beat');
  assert(frequencyStrength(instrumental,330,.55,.75)<.01,'Instrumental cannot contain vocal');
  const manifest=files.get('LEEME-STEMS.txt').toString('utf8');
  assert(manifest.includes('No incluyen mute/solo, volumen maestro, limitador maestro'));
  // Individual WAV uses the same timeline as ZIP and the same isolated sound.
  await page.locator('#stemTrack').selectOption('1');
  const [singleDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#exportStem').click()]);
  const singlePath=path.join(process.cwd(),'mixer-single-stem.wav');await singleDownload.saveAs(singlePath);
  const single=fs.readFileSync(singlePath);
  assert.equal(single.length,voice.length);
  let delta=0;for(let i=44;i<single.length;i+=2)delta+=Math.abs(single.readInt16LE(i)-voice.readInt16LE(i));
  assert(delta/(single.length/2)<2,'Single and ZIP vocal stems must render approximately the same PCM samples');
  // Effect tails extend all stems to a common length so external DAWs retain alignment.
  await page.locator('#spaceDetails1 summary').click();
  await page.locator('#reverb1').fill('40');
  const [tailsDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#exportStems').click()]);
  const tailsPath=path.join(process.cwd(),'mixer-stems-with-tails.zip');await tailsDownload.saveAs(tailsPath);
  const tailFiles=archiveEntries(fs.readFileSync(tailsPath));
  assert(tailFiles.get('02-Voz-principal.wav').length>voice.length+rate*4*.8,'Reverb should lengthen every stem to common end');
  assert.equal(tailFiles.get('02-Voz-principal.wav').length,tailFiles.get('01-Instrumental.wav').length);
  // Safety: detect memory budget violations without starting huge offline renders.
  await page.evaluate(()=>{for(let i=0;i<8;i++)tracks[i]={duration:300}});
  await page.locator('#exportStems').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('superaría 145 MB'));
  assert.equal(await page.locator('#exportStems').isDisabled(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS stems: synchronized WAV files in ZIP, truly isolated frequencies, mute/solo bypass, individual WAV, effects tails, memory limit.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
