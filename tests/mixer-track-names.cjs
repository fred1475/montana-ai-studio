'use strict';
/* Browser acceptance: editable track names, timeline, local backups, old
 * sessions, hostile/invalid names. No microphones or external services. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function toneWav(rate=44100){
 const frames=rate/2,b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*330*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="trackName"]').count(),8);
  assert.equal(await page.locator('#trackName0').inputValue(),'Instrumental');
  assert.equal(await page.locator('#trackName1').inputValue(),'Voz principal');
  const wave=toneWav();
  await page.locator('#file0').setInputFiles({name:'beat-original.wav',mimeType:'audio/wav',buffer:wave});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('beat-original.wav'));
  await page.locator('#trackName0').fill('Ritmo de Montana');
  await page.locator('#trackName0').dispatchEvent('change');
  assert.equal(await page.locator('#trackTitle0').textContent(),'1. Ritmo de Montana');
  await page.waitForFunction(()=>document.querySelector('#timeline')?.textContent?.includes('Ritmo de Montana'));
  await page.locator('#trackName1').fill('Voz · Montana');
  await page.locator('#trackName1').dispatchEvent('change');
  assert.equal(await page.locator('#trackTitle1').textContent(),'2. Voz · Montana');
  await page.locator('#trackName1').fill('    ');
  await page.locator('#trackName1').dispatchEvent('change');
  assert.equal(await page.locator('#trackName1').inputValue(),'Voz · Montana','Blank change must revert');
  assert.equal(await page.locator('#trackTitle1').textContent(),'2. Voz · Montana');
  // No HTML insertion on user-facing labels; invalid character classes are rejected.
  const invalid=await page.evaluate(()=>{
   const old=labels[0];
   let error=null;try{window.setMixerTrackLabel(0,'<img>');}catch(e){error=e.message;}
   return {error,unchanged:labels[0]===old};
  });
  assert(invalid.error.includes('inválido'));assert(invalid.unchanged);
  assert.equal(await page.locator('#label0').textContent(),'beat-original.wav — 0.5 s');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const savedAt=path.join(process.cwd(),'mixer-track-names-session.json');await download.saveAs(savedAt);
  const session=JSON.parse(fs.readFileSync(savedAt,'utf8'));
  assert.equal(session.tracks[0].trackLabel,'Ritmo de Montana');
  assert.equal(session.tracks[0].name,'beat-original.wav','Source filename unchanged');
  assert.equal(session.tracks[1].trackLabel,'Voz · Montana');
  assert.equal(session.tracks[7].trackLabel,'Efectos');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#trackName0')?.value==='Instrumental');
  await page.locator('#sessionFile').setInputFiles(savedAt);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:25000});
  assert.equal(await page.locator('#trackName0').inputValue(),'Ritmo de Montana');
  assert.equal(await page.locator('#trackName1').inputValue(),'Voz · Montana');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'beat-original.wav');
  await page.waitForFunction(()=>document.querySelector('#timeline')?.textContent?.includes('Ritmo de Montana'));
  // A malformed label in a later channel must reject the entire restore.
  const bad=JSON.parse(JSON.stringify(session));bad.tracks[7].trackLabel='<script>';
  await page.locator('#sessionFile').setInputFiles({
   name:'bad-track-name.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(bad))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#trackName0').inputValue(),'Ritmo de Montana');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'beat-original.wav');
  // A session with no trackLabel is supported and resets default names.
  const legacy=JSON.parse(JSON.stringify(session));
  legacy.tracks.forEach(track=>delete track.trackLabel);
  await page.locator('#sessionFile').setInputFiles({
   name:'legacy-mixer.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(legacy))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:25000});
  assert.equal(await page.locator('#trackName0').inputValue(),'Instrumental');
  assert.equal(await page.locator('#trackName1').inputValue(),'Voz principal');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),'beat-original.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS track names: editable 8 lanes, timeline refresh, original unchanged, JSON roundtrip, corrupted-name rollback, legacy sessions.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
