'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function wav(){
 const b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(8000*Math.sin(i*2*Math.PI*220/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__sectionStarts=[];
   const native=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(when,offset,duration){
    window.__sectionStarts.push({when,offset,duration,loop:this.loop});
    return native.apply(this,arguments);
   };
  });
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#sectionListen').isDisabled(),true);
  const original=wav();
  await page.locator('#file1').setInputFiles({name:'seccion-voz.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('seccion-voz'));
  async function marker(label,at){
   await page.locator('#markerName').fill(label);
   await page.locator('#markerSeconds').fill(String(at));
   await page.locator('#markerAdd').click();
  }
  await marker('Intro',.25);
  await marker('Coro',.75);
  assert.equal(await page.locator('#sectionListen').isDisabled(),false);
  await page.locator('#sectionFrom').selectOption('0');
  await page.locator('#sectionTo').selectOption('1');
  await page.locator('#sectionListen').click();
  await page.waitForFunction(()=>document.querySelector('#sectionStatus')?.textContent?.includes('Reproduciendo'));
  const samples=await page.evaluate(()=>window.__sectionStarts.slice());
  assert.equal(samples.length,1,'Section should schedule one intersecting clip');
  assert(Math.abs(samples[0].offset-.25)<.01,'No lead-in from full song');
  assert(Math.abs(samples[0].duration-.5)<.001,'Only 500ms section is scheduled');
  assert.equal(samples[0].loop,false);
  await page.locator('#stop').click();
  assert.equal(await page.locator('#sectionHalt').isDisabled(),true,'Global stop cancels preview');
  assert(!((await page.locator('#sectionStatus').textContent()).includes('No se inició')));
  await page.locator('#sectionFrom').selectOption('1');
  await page.locator('#sectionTo').selectOption('0');
  await page.locator('#sectionListen').click();
  assert((await page.locator('#sectionStatus').textContent()).includes('No se inició'));
  const previous=await page.evaluate(()=>window.__sectionStarts.length);
  assert.equal(previous,1,'Invalid order must not play');
  await page.locator('#sectionFrom').selectOption('0');
  await page.locator('#sectionTo').selectOption('1');
  await page.locator('#sectionListen').click();
  await page.waitForFunction(()=>document.querySelector('#sectionStatus')?.textContent?.includes('Reproduciendo'));
  await page.locator('#markerPicked').selectOption('1');
  await page.locator('#markerRemove').click();
  assert.equal(await page.locator('#sectionHalt').isDisabled(),true,'Marker edits stop stale audition');
  assert.equal(await page.locator('#sectionListen').isDisabled(),true);
  await marker('Puente',.8);
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const file=path.join(process.cwd(),'section-preview-session.json');
  await dl.saveAs(file);const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.deepEqual(saved.songMarkers,[{label:'Intro',seconds:.25},{label:'Puente',seconds:.8}]);
  assert.deepEqual(Buffer.from(saved.tracks[1].data,'base64'),original);
  await page.reload();await page.locator('#sessionFile').setInputFiles(file);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  assert.equal(await page.locator('#sectionListen').isDisabled(),false);
  await page.locator('#sectionFrom').selectOption('0');
  await page.locator('#sectionTo').selectOption('1');
  await page.locator('#sectionListen').click();
  await page.waitForFunction(()=>document.querySelector('#sectionStatus')?.textContent?.includes('Reproduciendo'));
  const after=await page.evaluate(()=>window.__sectionStarts.at(-1));
  assert(Math.abs(after.offset-.25)<.01);
  assert(Math.abs(after.duration-.55)<.001);
  await page.locator('#sectionHalt').click();
  assert((await page.locator('#sectionStatus').textContent()).includes('detenida'));
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  assert.deepEqual(errors,[]);
  console.log('PASS marker section preview: only intersecting source audio, no song lead-in, invalid order guarded, global stop, stale marker changes and signed restore without WAV mutation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
