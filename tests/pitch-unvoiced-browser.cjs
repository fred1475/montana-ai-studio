'use strict';
/* Browser acceptance of experimental breath/consonant preservation:
 * original WAV source -> offline pitch lab -> WAV with broadband center burst.
 * No live voice recording or microphone access.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,frames=Math.floor(1.4*rate),tau=2*Math.PI;
function inputWav(){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 let random=0x1234abed;
 for(let i=0;i<frames;i++){
  random^=random<<13;random^=random>>>17;random^=random<<5;
  const t=i/rate,noise=(random>>>0)/2147483648-1;
  const x=t>.48&&t<.66?.065*noise:.29*Math.sin(tau*224.5*t);
  b.writeInt16LE(Math.round(x*32767),44+i*2);
 }
 return b;
}
function segmentDiff(a,b,start,end){
 let total=0,n=0;
 for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
  const v=(a.readInt16LE(44+i*2)-b.readInt16LE(44+i*2))/32768;
  total+=v*v;n++;
 }
 return Math.sqrt(total/n);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/pitch-lab.html');
  const original=inputWav();
  await page.locator('#file').setInputFiles({name:'nota-con-consonante.wav',mimeType:'audio/wav',buffer:original});
  await page.locator('#process').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Fragmento procesado'),null,{timeout:35000});
  assert((await page.locator('#results').innerText()).includes('Objetivo: A3'));
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator('#download').click()]);
  const file=path.join(process.cwd(),'pitch-guard-browser.wav');await download.saveAs(file);
  const output=fs.readFileSync(file);
  assert.equal(output.length,original.length,'Duration preserved after tone+noise correction');
  assert.equal(output.readUInt16LE(22),1);
  assert.equal(output.readUInt32LE(24),rate);
  const consonantError=segmentDiff(original,output,.55,.60);
  const voicedDifference=segmentDiff(original,output,.78,.90);
  assert(consonantError<.003,'Aperiodic burst changed excessively: '+consonantError);
  assert(voicedDifference>.010,'Periodic note must still be corrected: '+voicedDifference);
  const meta=await page.evaluate(()=>({
   src:raw?.channels[0]?.length,
   dst:processed?.channels[0]?.length,
   guard:typeof MontanaPitch.preserveUnvoiced
  }));
  assert.equal(meta.src,frames);
  assert.equal(meta.dst,frames);
  assert.equal(meta.guard,'function');
  assert.deepEqual(errors,[]);
  console.log('PASS browser pitch lab: original source kept, broadband consonant preserved, tone corrected and exact WAV duration.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
