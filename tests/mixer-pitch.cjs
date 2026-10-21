'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pitch=require('../pitch-engine.js');
const rate=44100,frames=44100;
const wave=Buffer.alloc(44+frames*2);
wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVE',8);
wave.write('fmt ',12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);
wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);
wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);
wave.write('data',36);wave.writeUInt32LE(frames*2,40);
for(let j=0;j<frames;j++)wave.writeInt16LE(Math.round(10000*Math.sin(2*Math.PI*224.5*j/rate)),44+j*2);
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchDetails"]').count(),7,'Only seven vocal pitch editors');
  await page.locator('#file1').setInputFiles({name:'voz-desafinada.wav',mimeType:'audio/wav',buffer:wave});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz-desafinada'));
  await page.locator('#pitchDetails1 summary').click();
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  assert.equal(await page.evaluate(()=>pitchBuffers[1]?.length===tracks[1]?.length),true,'Source and corrected duration match');
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'voz-desafinada.wav');
  async function exportWav(filename){
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
   const file=path.join(process.cwd(),filename);await download.saveAs(file);
   const wav=fs.readFileSync(file);
   assert.equal(wav.readUInt32LE(24),rate);
   assert.equal(wav.readUInt16LE(22),2);
   assert.equal(wav.length,44+frames*4,'Pitch correction cannot change export duration');
   const samples=new Float32Array(frames);
   for(let j=0;j<frames;j++)samples[j]=wav.readInt16LE(44+j*4)/32768;
   return {wav,samples};
  }
  const tuned=await exportWav('mixer-pitch-corrected.wav');
  const tunedHz=pitch.detectPitch(tuned.samples,rate,.5)?.frequency;
  assert(tunedHz&&Math.abs(1200*Math.log2(tunedHz/220))<14,'Corrected mix should be A3, measured '+tunedHz);
  await page.locator('#pitchToggle1').click();
  assert.equal(await page.evaluate(()=>pitchActive[1]),false);
  const original=await exportWav('mixer-pitch-original.wav');
  const origHz=pitch.detectPitch(original.samples,rate,.5)?.frequency;
  assert(origHz&&Math.abs(1200*Math.log2(origHz/224.5))<8,'Bypass should restore original pitch '+origHz);
  assert.notDeepEqual(original.wav.subarray(6000,9000),tuned.wav.subarray(6000,9000),'PCM really changes with correction');
  await page.locator('#pitchToggle1').click();
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  // 50% wet must create an independent export, not replace the original.
  await page.locator('#pitchWet1').evaluate(el=>{
   el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));
   el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  assert.equal(await page.evaluate(()=>pitchActive[1]),false,'Changing mix invalidates previous processing');
  assert.equal(await page.locator('#pitchWetValue1').textContent(),'50%');
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:30000});
  assert((await page.locator('#pitchState1').textContent()).includes('Mezcla procesada 50%'));
  const half=await exportWav('mixer-pitch-50-percent.wav');
  let totalError=0,compared=0;
  for(let j=300;j<frames-300;j+=257){
   const a=original.wav.readInt16LE(44+j*4);
   const b=tuned.wav.readInt16LE(44+j*4);
   const c=half.wav.readInt16LE(44+j*4);
   totalError+=Math.abs(c-(a+b)/2);compared++;
  }
  assert(totalError/compared<35,'50% export must approximate original/processed PCM average');
  assert.notDeepEqual(half.wav.subarray(6000,9000),original.wav.subarray(6000,9000));
  assert.notDeepEqual(half.wav.subarray(6000,9000),tuned.wav.subarray(6000,9000));
  const [sessionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'mixer-pitch-session.json');await sessionDownload.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.deepEqual(session.tracks[1].pitch,{mode:'sustain',key:'C',scale:'chromatic',strength:100,wet:50,matchLevel:false,enabled:true});
  assert.equal(session.tracks[1].name,'voz-desafinada.wav');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>pitchActive[1]),true,'Active corrected audio is rebuilt after restore');
  const restored=await exportWav('mixer-pitch-restored.wav');
  assert.equal(await page.locator('#pitchWet1').inputValue(),'50');
  let restorationError=0;
  for(let j=200;j<frames-200;j+=257)
   restorationError=Math.max(restorationError,Math.abs(restored.wav.readInt16LE(44+j*4)-half.wav.readInt16LE(44+j*4)));
  assert(restorationError<=6,'Restored 50% PCM must reproduce the saved blend: '+restorationError);
  // Pitch sessions created before the wet/dry control must default to full wet.
  const previousVersion=JSON.parse(JSON.stringify(session));
  for(const t of previousVersion.tracks)if(t.pitch)delete t.pitch.wet;
  const oldPitchPath=path.join(process.cwd(),'mixer-pitch-previous-wet.json');
  fs.writeFileSync(oldPitchPath,JSON.stringify(previousVersion));
  await page.locator('#sessionFile').setInputFiles(oldPitchPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#pitchWet1').inputValue(),'100');
  const previousVersionWav=await exportWav('mixer-pitch-previous-wet.wav');
  const oldHz=pitch.detectPitch(previousVersionWav.samples,rate,.5)?.frequency;
  assert(oldHz&&Math.abs(1200*Math.log2(oldHz/220))<14,'Legacy pitch setting must default to 100%');
  // Invalid wet mix must be rejected atomically without losing the old audio.
  const rejected=JSON.parse(JSON.stringify(session));
  rejected.tracks[1].pitch.wet=125;
  const rejectedPath=path.join(process.cwd(),'mixer-pitch-invalid-wet.json');
  fs.writeFileSync(rejectedPath,JSON.stringify(rejected));
  await page.locator('#sessionFile').setInputFiles(rejectedPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#pitchWet1').inputValue(),'100');
  assert((await page.locator('#label1').innerText()).includes('voz-desafinada'));

  // Existing projects from before experimental pitch need to load unchanged.
  for(const t of session.tracks)delete t.pitch;
  const legacyPath=path.join(process.cwd(),'mixer-pitch-legacy.json');
  fs.writeFileSync(legacyPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(legacyPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>pitchActive[1]),false,'Legacy projects bypass pitch correction');
  // Malicious/invalid pitch must not destroy the previous, valid project.
  session.tracks[1].pitch={mode:'melody',key:'Z',scale:'chromatic',strength:100,enabled:true};
  const invalidPath=path.join(process.cwd(),'mixer-pitch-invalid.json');
  fs.writeFileSync(invalidPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(invalidPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert((await page.locator('#label1').innerText()).includes('voz-desafinada'),'Rejected session must preserve the existing audio');
  // End-to-end phase-inverted stereo input: preserve source while enabling tuning.
  const antiphase=Buffer.alloc(44+frames*4);
  antiphase.write('RIFF',0);antiphase.writeUInt32LE(antiphase.length-8,4);
  antiphase.write('WAVE',8);antiphase.write('fmt ',12);antiphase.writeUInt32LE(16,16);
  antiphase.writeUInt16LE(1,20);antiphase.writeUInt16LE(2,22);
  antiphase.writeUInt32LE(rate,24);antiphase.writeUInt32LE(rate*4,28);
  antiphase.writeUInt16LE(4,32);antiphase.writeUInt16LE(16,34);
  antiphase.write('data',36);antiphase.writeUInt32LE(frames*4,40);
  for(let j=0;j<frames;j++){
   const v=Math.round(10000*Math.sin(2*Math.PI*224.5*j/rate));
   antiphase.writeInt16LE(v,44+4*j);antiphase.writeInt16LE(-v,46+4*j);
  }
  await page.locator('#file1').setInputFiles({name:'voz-estereo-contra-fase.wav',mimeType:'audio/wav',buffer:antiphase});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('contra-fase'));
  await page.locator('#pitchDetails1').evaluate(el=>{el.open=true});
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Detector protegido contra cancelación de fase'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>pitchActive[1]),true);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'voz-estereo-contra-fase.wav');
  const phaseExport=await exportWav('mixer-pitch-stereo-phase-safe.wav');
  const phaseHz=pitch.detectPitch(phaseExport.samples,rate,.5)?.frequency;
  assert(phaseHz&&Math.abs(1200*Math.log2(phaseHz/220))<19,'Antiphase stereo output should correct first channel to A3: '+phaseHz);
  // Shared PSOLA marks must preserve the inverted right channel in the actual
  // 16-bit stereo export, not just inside an isolated DSP unit test.
  let maximumMismatch=0,leftPeak=0;
  for(let j=0;j<frames;j+=13){
   const a=phaseExport.wav.readInt16LE(44+j*4),b=phaseExport.wav.readInt16LE(46+j*4);
   maximumMismatch=Math.max(maximumMismatch,Math.abs(a+b));
   leftPeak=Math.max(leftPeak,Math.abs(a));
  }
  assert(leftPeak>1000,'Stereo corrected WAV must retain an audible-level source channel');
  assert(maximumMismatch<=3,'PCM16 export must preserve anti-phase stereo to quantization precision: '+maximumMismatch);
  assert.deepEqual(errors,[]);
  console.log('PASS: experimental pitch dry/wet PCM16, 50% session restore, legacy default, invalid wet rejection, antiphase stereo.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
