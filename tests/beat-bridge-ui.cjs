'use strict';
/* Browser E2E: Beat Lab -> same-origin IndexedDB inbox -> explicit safe mixer import.
 * No microphone; confirms byte-for-byte source, disabled default overwrite, saved JSON.
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
  await page.locator('#bpm').fill('120');
  await page.locator('#bpm').dispatchEvent('change');
  await page.locator('#sendToMixer').click();
  await page.waitForURL('**/mixer-8.html#beat-transfer',{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Beat pendiente'),null,{timeout:15000});
  assert.equal(await page.evaluate(()=>tracks[0]),null,'Navigation must not auto-apply audio');
  assert.equal(await page.locator('#bpm').inputValue(),'100','Tempo also requires acceptance');
  assert.equal(await page.locator('#beatTransferImport').isDisabled(),false);
  assert.equal(await page.locator('#label0').textContent(),'Sin audio');
  const stored=await page.evaluate(async()=>{
   const p=await MontanaBeatBridge.read();return {bpm:p.bpm,rate:p.rate,length:p.bytes.length,crc:p.crc32,filename:p.filename};
  });
  assert.equal(stored.bpm,120);assert.equal(stored.rate,44100);
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Beat importado'),null,{timeout:15000});
  assert((await page.locator('#label0').textContent()).includes(stored.filename));
  assert.equal(await page.locator('#bpm').inputValue(),'120');
  assert.equal(await page.evaluate(()=>originalFiles[0]?.size),stored.length);
  assert.equal(await page.evaluate(()=>tracks[0]?.numberOfChannels),2);
  assert.equal(await page.evaluate(()=>tracks[0]?.sampleRate),44100);
  assert.equal(await page.locator('#beatTransferImport').isDisabled(),true);
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null);
  const [save]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const backupPath=path.join(process.cwd(),'beat-direct-import-backup.json');await save.saveAs(backupPath);
  const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  assert.equal(backup.tracks[0].name,stored.filename);
  assert.equal(backup.bpm,120);
  assert(backup.tracks[0].data.length>1000);
  // A fresh pending beat must not overwrite an existing instrumental.
  await page.evaluate(async()=>{
   const source=originalFiles[0],bytes=new Uint8Array(await source.arrayBuffer());
   await MontanaBeatBridge.save({bytes,bpm:135,filename:source.name});
   await window.refreshBeatTransfer();
  });
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Beat pendiente'));
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Importación cancelada'));
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),stored.filename);
  assert.equal(await page.locator('#bpm').inputValue(),'120');
  assert.equal((await page.evaluate(()=>MontanaBeatBridge.read())).bpm,135);
  await page.locator('#beatTransferReplace').check();
  await page.locator('#beatTransferImport').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('Beat importado'));
  assert.equal(await page.locator('#bpm').inputValue(),'135');
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null);
  // Corrupt a pending payload: it must never be loaded as audio.
  await page.evaluate(async()=>{
   const source=originalFiles[0],bytes=new Uint8Array(await source.arrayBuffer());
   await MontanaBeatBridge.save({bytes,bpm:140,filename:source.name});
   const db=await new Promise((resolve,reject)=>{
    const q=indexedDB.open('montana-beat-bridge-v1',1);
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
   });
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('inbox','readwrite'),store=tx.objectStore('inbox');
    const get=store.get('beat');
    get.onsuccess=()=>{const record=get.result;record.bytes[60]^=255;store.put(record);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close();
   await window.refreshBeatTransfer();
  });
  assert((await page.locator('#beatTransferStatus').textContent()).includes('no se pudo recuperar'));
  assert.equal(await page.locator('#beatTransferImport').isDisabled(),true);
  assert.equal(await page.evaluate(()=>originalFiles[0]?.name),stored.filename);
  await page.locator('#beatTransferDiscard').click();
  await page.waitForFunction(()=>document.querySelector('#beatTransferStatus')?.textContent?.includes('descartado'));
  assert.equal(await page.evaluate(()=>MontanaBeatBridge.read()),null);
  assert.deepEqual(errors,[]);
  console.log('PASS Beat Lab direct transfer: confirmed import, source backup, nonoverwrite default, explicit replacement, CRC tamper rejection and discard.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
