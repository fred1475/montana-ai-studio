'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
const wav=Buffer.alloc(44+n*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(n*2,40);
for(let j=0;j<n;j++)wav.writeInt16LE(Math.round(10000*Math.sin(2*Math.PI*330*j/rate)),44+j*2);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const page=await browser.newPage({acceptDownloads:true,permissions:['microphone']});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#scanMicInputs').click();
  await page.waitForFunction(()=>document.querySelector('#micInputStatus')?.textContent?.includes('entrada(s) detectadas'));
  assert((await page.locator('#micInput option').count())>=2,'Fake audio interface must be listed');
  const fakeDevice=await page.locator('#micInput option').nth(1).getAttribute('value');
  assert(fakeDevice,'Chromium fake mic must have an id');
  await page.locator('#micInput').selectOption(fakeDevice);
  await page.evaluate(()=>{
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async settings=>{
    window.__montanaMicTestConstraints=settings;
    return original(settings);
   };
  });

  assert.equal(await page.evaluate(()=>recordingSupported()),true,'Headless Chromium must support fake microphone');
  await page.locator('#file0').setInputFiles({name:'beat.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('beat.wav'));
  await page.locator('#recordFormat').selectOption('compressed'); // retain legacy codec test
  await page.locator('#recordTrack').selectOption('2'); // empty channel 3
  assert.equal(await page.locator('#downloadSource').isDisabled(),true);
  await page.locator('#recordStart').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Grabando canal'),null,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__montanaMicTestConstraints?.audio?.deviceId?.exact),fakeDevice,
   'The selected audio interface input must be passed to getUserMedia');
  assert((await page.locator('#micInputStatus').innerText()).includes('Grabando desde:'));

  assert.equal(await page.locator('#recordStart').isDisabled(),true);
  assert.equal(await page.locator('#downloadSource').isDisabled(),true);
  await page.waitForTimeout(1400);
  await page.locator('#recordStop').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Toma guardada en canal 3'),null,{timeout:20000});
  assert((await page.locator('#label2').innerText()).includes('toma-canal-3'));
  assert.equal(await page.locator('#downloadSource').isDisabled(),false);
  const [rawFile]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadSource').click()]);
  const sourcePath=path.join(process.cwd(),'captured-original.webm');await rawFile.saveAs(sourcePath);
  const captured=fs.readFileSync(sourcePath);
  assert(captured.length>4000,'Raw microphone recording should contain real bytes');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'captured-session.json');await download.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert(session.tracks[2].data?.length>1000,'Recorded take must be recoverable from JSON backup');
  assert.equal(session.recordFormat,'compressed','Legacy codec choice must be portable');
  const before=await page.evaluate(()=>originalFiles[2]?.size);
  page.on('dialog',d=>d.accept());
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw Error('Permiso denegado en prueba')}});
  await page.locator('#recordStart').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Error al iniciar la grabación'),null,{timeout:8000});
  assert.equal(await page.evaluate(()=>originalFiles[2]?.size),before,'Mic permission failure cannot destroy last take');
  assert.equal(await page.locator('#downloadSource').isDisabled(),false);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:20000});
  assert.equal(await page.locator('#downloadSource').isDisabled(),false,'Restored take can be rescued as original');
  assert.equal(await page.locator('#recordFormat').inputValue(),'compressed',
   'Codec choice must restore exactly for saved sessions');
  const [restored]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadSource').click()]);
  const dest=path.join(process.cwd(),'captured-source-restored.webm');await restored.saveAs(dest);
  assert.deepEqual(fs.readFileSync(dest),captured,'Restored original recording must be byte-identical');
  // New option: uncompressed WAV from simulated AudioWorklet input, with no network.
  await page.locator('#recordFormat').selectOption('wav');
  await page.locator('#recordTrack').selectOption('3'); // empty channel 4
  await page.locator('#recordStart').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('WAV PCM24'),null,{timeout:10000});
  await page.waitForTimeout(1400);
  await page.locator('#recordStop').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Toma guardada en canal 4'),null,{timeout:20000});
  assert((await page.locator('#label3').innerText()).includes('toma-canal-4.wav'));
  const [wavDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadSource').click()]);
  const wavPath=path.join(process.cwd(),'captured-original-pcm24.wav');
  await wavDownload.saveAs(wavPath);
  const pcm=fs.readFileSync(wavPath);
  assert.equal(pcm.toString('ascii',0,4),'RIFF');
  assert.equal(pcm.toString('ascii',8,12),'WAVE');
  assert.equal(pcm.readUInt16LE(22),1,'Capture must be mono');
  assert.equal(pcm.readUInt16LE(34),24,'Capture must be PCM24');
  assert.equal(pcm.readUInt16LE(20),1,'Capture must be uncompressed integer PCM');
  assert([44100,48000].includes(pcm.readUInt32LE(24)),'Expected simulated browser audio rate');
  assert(pcm.length>pcm.readUInt32LE(24)*3*.8,'WAV should hold real microphone samples');
  assert.equal(pcm.readUInt32LE(40),pcm.length-44);
  assert((await page.locator('#label2').innerText()).includes('toma-canal-3.webm'),
   'Second capture must not replace previous recording');
  const [pcmSave]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const pcmSessionPath=path.join(process.cwd(),'captured-pcm24-session.json');
  await pcmSave.saveAs(pcmSessionPath);
  const pcmSession=JSON.parse(fs.readFileSync(pcmSessionPath,'utf8'));
  assert.equal(pcmSession.recordFormat,'wav');
  assert.equal(Buffer.from(pcmSession.tracks[3].data,'base64').compare(pcm),0,
   'Session must store exactly the uncompressed WAV bytes');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(pcmSessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:20000});
  assert.equal(await page.locator('#recordFormat').inputValue(),'wav');
  assert((await page.locator('#label3').innerText()).includes('toma-canal-4.wav'));
  assert.deepEqual(errors,[]);
  console.log('PASS record: fake microphone overdub, completed capture rescue, embedded session, rejection retains previous, restored raw bytes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
