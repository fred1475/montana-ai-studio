'use strict';
/* Five-stem Beat Lab -> mixer E2E, with no hardware or cloud:
 * default empty-lane import, source backup, non-overwrite, CRC and decode preflight.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/beat-lab.html');
  await page.locator('#bars').selectOption('1');
  await page.locator('#bpm').fill('180');
  await page.locator('#bpm').dispatchEvent('change');
  await page.locator('#wavRate').selectOption('48000');
  await page.locator('#sendStemsToMixer').click();
  await page.waitForURL('**/mixer-8.html#beat-stems',{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('cinco instrumentos'),null,{timeout:30000});
  const sent=await page.evaluate(async()=>{
   const x=await MontanaBeatBridge.read();
   return {count:x.stems.length,bpm:x.bpm,rate:x.rate,frames:x.frames,
    lengths:x.stems.map(f=>f.bytes.length),names:x.stems.map(f=>f.filename)};
  });
  assert.equal(sent.count,5);assert.equal(sent.rate,48000);assert.equal(sent.bpm,180);
  assert(sent.lengths.every(v=>v===sent.lengths[0]));
  assert.equal(await page.evaluate(()=>tracks.filter(Boolean).length),0,'Do not automatically populate mixer');
  await page.locator('#beatStemStart').selectOption('3');
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Cinco instrumentos importados'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>tracks.filter(Boolean).length),5);
  assert.equal(await page.evaluate(()=>tracks.slice(0,3).every(x=>!x)),true);
  assert.equal(await page.locator('#bpm').inputValue(),'180');
  for(let i=0;i<5;i++){
   const label=await page.locator('#label'+(i+3)).textContent();
   assert(label.includes(sent.names[i]),'Correct mapped stem '+i);
   const info=await page.evaluate(i=>({size:originalFiles[i]?.size,
    rate:tracks[i]?.sampleRate,frames:tracks[i]?.length}),i+3);
   assert.equal(info.size,sent.lengths[i]);
   // Web Audio decodes at the current AudioContext rate; uploaded bytes
   // retain their original 48k WAV header and sample frames for backups.
   const playbackRate=await page.evaluate(()=>audio().sampleRate);
   assert.equal(info.rate,playbackRate);
   assert(Math.abs(info.frames-Math.round(sent.frames*playbackRate/sent.rate))<=2,
    'Expected browser decode resampling, not source replacement');
   const storedHeader=await page.evaluate(async index=>{
    const data=new DataView(await originalFiles[index].arrayBuffer());
    return {rate:data.getUint32(24,true),frames:data.getUint32(40,true)/4};
   },i+3);
   assert.equal(storedHeader.rate,48000);
   assert.equal(storedHeader.frames,sent.frames);
  }
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null,'Inbox consumed');
  const [saved]=await Promise.all([page.waitForEvent('download',{timeout:40000}),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'beat-five-stems-session.json');
  await saved.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(session.bpm,180);
  for(let i=0;i<5;i++){assert.equal(session.tracks[i+3].name,sent.names[i]);assert(session.tracks[i+3].data.length>300);}
  // Stage same stems again: existing channels cannot be overwritten by default.
  await page.evaluate(async()=>{
   const tracksData=await Promise.all([3,4,5,6,7].map(async(i,j)=>({
    kind:MontanaBeatBridge.STEMS[j],filename:originalFiles[i].name,
    bytes:new Uint8Array(await originalFiles[i].arrayBuffer())
   })));
   await MontanaBeatBridge.saveStems({stems:tracksData,bpm:140});
   await window.refreshBeatTransfer();
  });
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('cinco instrumentos'));
  await page.locator('#beatStemStart').selectOption('3');
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Importación cancelada'));
  assert.equal(await page.locator('#bpm').inputValue(),'180');
  assert.equal((await page.evaluate(()=>MontanaBeatBridge.read())).bpm,140);
  assert.equal(await page.evaluate(()=>tracks.filter(Boolean).length),5);
  // Independent decode preflight must reject bad second stem before applying first.
  const before=await page.evaluate(()=>tracks.map(t=>t?.length||0));
  const rejected=await page.evaluate(async()=>{
   const original=originalFiles[3];
   const invalid=new File([new Uint8Array([1,2,3])],'invalid.wav',{type:'audio/wav'});
   const valid=[3,4,5,6,7].map((i,j)=>({channel:i,file:j===1?invalid:originalFiles[i]}));
   try{await window.montanaPrepareTrackBatch(valid);return 'NOT_REJECTED';}
   catch(e){return e.message;}
  });
  assert.notEqual(rejected,'NOT_REJECTED');
  assert.deepEqual(await page.evaluate(()=>tracks.map(t=>t?.length||0)),before);
  await page.locator('#beatTransferReplace').check();
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Cinco instrumentos importados'),null,{timeout:30000});
  assert.equal(await page.locator('#bpm').inputValue(),'140');
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null);
  // Damage one pending instrument's bytes, do not allow even one to import.
  await page.evaluate(async()=>{
   const stems=await Promise.all([3,4,5,6,7].map(async(i,j)=>({
    kind:MontanaBeatBridge.STEMS[j],filename:originalFiles[i].name,
    bytes:new Uint8Array(await originalFiles[i].arrayBuffer())
   })));
   await MontanaBeatBridge.saveStems({stems,bpm:150});
   const db=await new Promise((resolve,reject)=>{
    const q=indexedDB.open('montana-beat-bridge-v1',1);
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
   });
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('inbox','readwrite'),store=tx.objectStore('inbox');
    const g=store.get('beat');
    g.onsuccess=()=>{const rec=g.result;rec.stems[3].bytes[85]^=255;store.put(rec);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close();
   await window.refreshBeatTransfer();
  });
  assert((await page.locator('#beatTransferStatus').textContent()).toLowerCase().includes('no se pudo recuperar'));
  assert.equal(await page.locator('#beatTransferImport').isDisabled(),true);
  assert.equal(await page.locator('#bpm').inputValue(),'140');
  await page.locator('#beatTransferDiscard').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('descartado'));
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null);
  assert.deepEqual(errors,[]);
  console.log('PASS 5-stem transfer: 48kHz mapped lanes, backups, no overwrite, explicit replacement, atomic decode preflight, CRC corruption and discard.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
