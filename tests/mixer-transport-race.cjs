'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

function tone(){
 const rate=44100,samples=rate,buffer=Buffer.alloc(44+samples*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);
 buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);
 buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
 buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
 buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(5000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return buffer;
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file0').setInputFiles({name:'transport.wav',mimeType:'audio/wav',buffer:tone()});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('transport.wav'));

  await page.evaluate(()=>{
   window.__pendingResumes=[];
   window.__realResume=ctx.resume.bind(ctx);
   ctx.resume=()=>new Promise((resolve,reject)=>window.__pendingResumes.push({resolve,reject}));
  });
  await page.locator('#play').click();
  assert.equal(await page.evaluate(()=>window.__pendingResumes.length),1,'Resume must be pending');
  await page.locator('#stop').click();
  await page.evaluate(()=>window.__pendingResumes.shift().resolve());
  await page.waitForTimeout(30);
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[0,0],
   'Stop must cancel playback that was awaiting AudioContext.resume');
  assert.equal(await page.locator('#status').innerText(),'Reproducción detenida',
   'Old async request must not replace Stop status');

  // Out-of-order device initialization: only the most recent Play can create audio.
  await page.locator('#play').click();
  await page.locator('#play').click();
  assert.equal(await page.evaluate(()=>window.__pendingResumes.length),2);
  await page.evaluate(()=>window.__pendingResumes[1].resolve());
  await page.waitForFunction(()=>activeOutputs.length===1);
  await page.evaluate(()=>window.__pendingResumes[0].resolve());
  await page.waitForTimeout(30);
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[1,1],
   'An older Play must not append another master or duplicate the audio');
  await page.locator('#stop').click();
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[0,0]);

  // Resume failures cannot leak half-built audio nodes, and must report a useful error.
  await page.locator('#play').click();
  await page.evaluate(()=>window.__pendingResumes.at(-1).reject(new Error('Prueba de dispositivo rechazado')));
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Prueba de dispositivo rechazado');
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[0,0]);

  // A downstream graph error after sources were scheduled also calls Stop atomically.
  await page.evaluate(()=>{
   ctx.resume=window.__realResume;
   window.__realMetronome=window.startMetronome;
   window.startMetronome=()=>{throw Error('Prueba de conexión fallida')};
  });
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Prueba de conexión fallida');
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[0,0],
   'Partial playback is cleaned up if the metronome setup fails');
  await page.evaluate(()=>{window.startMetronome=window.__realMetronome});

  await page.locator('#play').click();
  await page.waitForFunction(()=>activeOutputs.length===1);
  assert((await page.locator('#status').innerText()).includes('reproduciéndose'));
  await page.locator('#stop').click();
  assert.deepEqual(await page.evaluate(()=>[players.length,activeOutputs.length]),[0,0]);
  assert.deepEqual(errors,[]);
  console.log('PASS transport: stop/resume cancellation, latest-play wins, error cleanup and normal playback.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
