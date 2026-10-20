'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pitch=require('../pitch-engine.js');
const rate=44100,length=rate;
function wav(frequency){
 const out=Buffer.alloc(44+length*2);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
 out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
 out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
 out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(length*2,40);
 for(let i=0;i<length;i++)out.writeInt16LE(frequency===0?0:Math.round(9000*Math.sin(2*Math.PI*frequency*i/rate)),44+i*2);
 return out;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/pitch-lab.html');
  assert((await page.locator('h1').innerText()).includes('Laboratorio de afinación'));
  await page.locator('#file').setInputFiles({name:'a3-desafinada.wav',mimeType:'audio/wav',buffer:wav(224.5)});
  await page.locator('#process').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Fragmento procesado'),null,{timeout:30000});
  assert((await page.locator('#results').innerText()).includes('Objetivo: A3'));
  assert.equal(await page.locator('#download').isDisabled(),false);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
  const filename=path.join(process.cwd(),'pitch-lab-output.wav');await download.saveAs(filename);
  const audio=fs.readFileSync(filename);
  assert.equal(audio.toString('ascii',0,4),'RIFF');
  assert.equal(audio.readUInt16LE(22),1);
  assert.equal(audio.readUInt32LE(24),rate);
  assert.equal(audio.length,44+rate*2,'The corrected note preserves original duration exactly');
  const data=new Float32Array(rate);
  for(let i=0;i<rate;i++)data[i]=audio.readInt16LE(44+i*2)/32768;
  const corrected=pitch.analyze(data,rate).frequency;
  assert(Math.abs(1200*Math.log2(corrected/220))<12,'Browser exported WAV must be A3; was '+corrected+'Hz');
  await page.locator('#file').setInputFiles({name:'silencio.wav',mimeType:'audio/wav',buffer:wav(0)});
  await page.locator('#process').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se pudo corregir'));
  assert.equal(await page.locator('#download').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: monophonic offline pitch correction UI, accurate exported WAV, equal duration and silence guard.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});