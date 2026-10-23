'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function wav(){
 const data=Buffer.alloc(44+n*2);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);
 data.write('WAVE',8);data.write('fmt ',12);data.writeUInt32LE(16,16);
 data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);
 data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write('data',36);data.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)data.writeInt16LE(Math.round(9000*Math.sin(i*2*Math.PI*220/rate)),44+i*2);
 return data;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#markerAdd').count(),1);
  assert.equal(await page.locator('#markerPlace').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),[]);
  const source=wav();
  await page.locator('#file1').setInputFiles({name:'montana-marcadores.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('montana-marcadores'));
  async function add(name,seconds){
   await page.locator('#markerName').fill(name);
   await page.locator('#markerSeconds').fill(String(seconds));
   await page.locator('#markerAdd').click();
  }
  await add('Coro',1.25);
  await add('Intro',0);
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),[
   {label:'Intro',seconds:0},{label:'Coro',seconds:1.25}
  ]);
  assert((await page.locator('#timeline').textContent()).includes('Intro'));
  assert((await page.locator('#timeline').textContent()).includes('Coro'));
  assert.equal(await page.locator('#markerPicked option').count(),2);
  await add('Duplicado',1.25);
  assert.equal(await page.locator('#markerPicked option').count(),2);
  assert((await page.locator('#status').textContent()).includes('No se añadió marcador'));
  await page.locator('#markerPicked').selectOption('1');
  await page.locator('#markerTargetTrack').selectOption('1');
  await page.locator('#markerPlace').click();
  assert.equal(await page.locator('#offset1').inputValue(),'1.25','Selected track moved to marker');
  const trackOffset=await page.evaluate(()=>getTrackSegments(1,tracks[1])[0].offset);
  assert(Math.abs(trackOffset-1.25)<1e-6);
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#offset1').inputValue(),'0','Undo restores track start');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#offset1').inputValue(),'1.25','Redo reinstates marker alignment');
  const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const savedPath=path.join(process.cwd(),'marker-session.json');await file.saveAs(savedPath);
  const session=JSON.parse(fs.readFileSync(savedPath,'utf8'));
  assert.equal(session.songMarkers.length,2);
  assert.equal(session.songMarkers[1].seconds,1.25);
  assert.equal(session.tracks[1].offset,1.25);
  assert(/^[a-f0-9]{64}$/.test(session.manifestSha256));
  assert.deepEqual(Buffer.from(session.tracks[1].data,'base64'),source);
  const bad=structuredClone(session);
  bad.songMarkers[0].label='Manipulado';
  await page.locator('#sessionFile').setInputFiles({
   name:'corrupt-song-markers.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(bad))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'),null,{timeout:30000});
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),session.songMarkers);
  assert.equal(await page.locator('#offset1').inputValue(),'1.25');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(savedPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),session.songMarkers);
  assert.equal(await page.locator('#offset1').inputValue(),'1.25');
  assert((await page.locator('#timeline').textContent()).includes('Coro'));
  await page.locator('#markerPicked').selectOption('0');
  await page.locator('#markerRemove').click();
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),[{label:'Coro',seconds:1.25}]);
  const old=structuredClone(session);delete old.songMarkers;delete old.manifestSha256;
  await page.locator('#sessionFile').setInputFiles({
   name:'legacy-song-markers.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(old))
  });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.deepEqual(await page.evaluate(()=>montanaMarkerState()),[],'Previous sessions have no markers');
  assert.equal(await page.locator('#markerPlace').isDisabled(),true);
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),source);
  assert.deepEqual(errors,[]);
  console.log('PASS arrangement markers browser: add/sort/duplicate, actual timeline offsets, Undo/Redo, signed JSON rejection, restore, legacy compatibility and WAV source integrity.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
