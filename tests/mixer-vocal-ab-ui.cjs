'use strict';
/* Browser acceptance for offline A/B listening package: source vs corrected
 * WAV + QA, without PCM mutation, upload or session side effects.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function tone(hz){
 const b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(7700*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
 return b;
}
function unzipStored(buffer){
 const b=Buffer.from(buffer),out=[];let p=0;
 for(let i=0;i<4;i++){
  assert.equal(b.readUInt32LE(p),0x04034b50,'Expected local ZIP header');
  const size=b.readUInt32LE(p+18),len=b.readUInt16LE(p+26);
  const name=b.toString('utf8',p+30,p+30+len);
  out.push({name,bytes:b.subarray(p+30+len,p+30+len+size)});
  p+=30+len+size;
 }
 assert.equal(b.readUInt32LE(p),0x02014b50);
 return out;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchAB"]').count(),7);
  assert.equal(await page.locator('#pitchAB1').isDisabled(),true);
  const source=tone(224.5);
  await page.locator('#file1').setInputFiles({name:'abba-voice-original.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('abba-voice-original.wav'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchMatch1').check();
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:35000});
  assert.equal(await page.locator('#pitchAB1').isDisabled(),false);
  const readPackage=async(label)=>{
   const [dl]=await Promise.all([page.waitForEvent('download',{timeout:45000}),page.locator('#pitchAB1').click()]);
   assert.equal(dl.suggestedFilename(),'montana-voz-AB-canal-2.zip');
   const saved=path.join(process.cwd(),'vocal-ab-'+label+'.zip');
   await dl.saveAs(saved);
   return unzipStored(fs.readFileSync(saved));
  };
  const files=await readPackage('first');
  assert.deepEqual(files.map(x=>x.name),['01-VOZ-ORIGINAL.wav','02-VOZ-AFINADA.wav','03-DIAGNOSTICO.json','LEEME.txt']);
  for(const {bytes} of files.slice(0,2)){
   assert.equal(bytes.toString('ascii',0,4),'RIFF');
   assert.equal(bytes.readUInt16LE(22),2);
   assert.equal(bytes.readUInt32LE(24),rate);
   assert.equal(bytes.readUInt32LE(40),rate*4);
  }
  const qa=JSON.parse(files[2].bytes.toString('utf8'));
  assert.equal(qa.schema,'montana-vocal-audit');
  assert.equal(qa.sourceName,'abba-voice-original.wav');
  assert.equal(qa.pitch.enabled,true);
  assert.equal(qa.pitch.matchLevel,true);
  assert.equal(qa.qa.frames,n);
  assert(!files[2].bytes.toString('utf8').includes('Float32Array'));
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'abba-voice-original.wav');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),source);
  // Listen to the dry original while corrected buffer remains available.
  await page.locator('#pitchToggle1').click();
  assert.equal(await page.evaluate(()=>pitchActive[1]),false);
  assert.equal(await page.locator('#pitchAB1').isDisabled(),false);
  const drySelected=await readPackage('dry-selected');
  assert.equal(JSON.parse(drySelected[2].bytes.toString('utf8')).pitch.enabled,true,
   'Package must label the included processed take, not which playback toggle is selected');
  assert.deepEqual(files[1].bytes,drySelected[1].bytes);
  // Backup restore re-renders from source and keeps the comparison available.
  await page.locator('#pitchToggle1').click();
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const session=path.join(process.cwd(),'vocal-ab-session.json');await dl.saveAs(session);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(session);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  await page.locator('#pitchDetails1').evaluate(el=>el.open=true);
  assert.equal(await page.locator('#pitchAB1').isDisabled(),false);
  const restored=await readPackage('restored');
  assert.deepEqual(restored[0].bytes,files[0].bytes);
  assert.deepEqual(restored[1].bytes,files[1].bytes);
  // Import a new take: previous corrected A/B must not be reused.
  await page.locator('#file1').setInputFiles({name:'new-vocal.wav',mimeType:'audio/wav',buffer:tone(229)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('new-vocal.wav'));
  assert.equal(await page.locator('#pitchAB1').isDisabled(),true);
  assert.equal(await page.evaluate(()=>pitchBuffers[1]),null);
  assert.deepEqual(errors,[]);
  console.log('PASS vocal A/B browser: explicit ZIP export, aligned PCM16 dry/wet, QA, toggle independence, deterministic backup restore, immutable source and stale-reuse prevention.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
