'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
const wav=Buffer.alloc(44+n*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);
wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++)wav.writeInt16LE(Math.round(10000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#autosaveEnabled').isChecked(),false,'Backups must be opt-in');
  assert.equal(await page.locator('#restoreRecovery').isDisabled(),true);
  await page.locator('#file1').setInputFiles({name:'backup-principal.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('backup-principal.wav'));
  await page.locator('#vol1').fill('45');
  await page.locator('#alignMs1').fill('70');
  await page.locator('#fadeIn1').fill('.2');
  await page.locator('#trackName1').fill('Toma definitiva Montana');
  await page.locator('#trackName1').dispatchEvent('change');
  await page.locator('#autosaveEnabled').check();
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent?.includes('Recuperación local guardada'),null,{timeout:30000});
  const stored=await page.evaluate(async()=>{
   return await new Promise((resolve,reject)=>{
    const req=indexedDB.open('montana-studio-local-recovery-v1',1);
    req.onsuccess=()=>{
     const t=req.result.transaction('snapshots','readonly');
     const get=t.objectStore('snapshots').get('latest');
     get.onsuccess=()=>resolve(get.result?.session);
     get.onerror=()=>reject(get.error);
    };
    req.onerror=()=>reject(req.error);
   });
  });
  assert.equal(stored.tracks[1].name,'backup-principal.wav');
  assert.equal(stored.tracks[1].volume,45);
  assert.equal(stored.tracks[1].alignMs,70);
  assert.equal(stored.tracks[1].fadeIn,.2);
  assert.equal(stored.tracks[1].trackLabel,'Toma definitiva Montana');
  assert(stored.tracks[1].data?.length>1000,'Snapshot must embed original WAV bytes');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent?.includes('Recuperación local encontrada'));
  assert.equal(await page.locator('#autosaveEnabled').isChecked(),true,'Consent preference remains');
  assert.equal(await page.locator('#label1').innerText(),'Sin audio','Auto restore must NOT silently overwrite a project');
  assert.equal(await page.locator('#trackName1').inputValue(),'Voz principal',
   'Auto recovery must not silently restore names either');
  await page.locator('#restoreRecovery').click();
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent?.includes('Sesión recuperada'),null,{timeout:30000});
  assert.equal(await page.locator('#vol1').inputValue(),'45');
  assert.equal(await page.locator('#alignMs1').inputValue(),'70');
  assert.equal(await page.locator('#fadeIn1').inputValue(),'0.2');
  assert.equal(await page.locator('#trackName1').inputValue(),'Toma definitiva Montana');
  assert((await page.locator('#label1').innerText()).includes('backup-principal.wav'));
  const [source]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadSource').click()]);
  const srcPath=path.join(process.cwd(),'autosave-restored-source.wav');await source.saveAs(srcPath);
  assert.deepEqual(fs.readFileSync(srcPath),wav,'Restored original must be byte-identical');
  // An invalid stored backup cannot damage the active project.
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open('montana-studio-local-recovery-v1',1);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('snapshots','readwrite');
    const req=tx.objectStore('snapshots').get('latest');
    req.onsuccess=()=>{
     const entry=req.result;entry.session.tracks[1].volume=999;
     tx.objectStore('snapshots').put(entry);
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });
  });
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#restoreRecovery').click();
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent?.includes('No se restauró la recuperación'));
  assert.equal(await page.locator('#vol1').inputValue(),'45','Invalid backup leaves current settings alone');
  assert.equal(await page.locator('#trackName1').inputValue(),'Toma definitiva Montana',
   'Invalid backup must preserve active track labels');
  assert((await page.locator('#label1').innerText()).includes('backup-principal.wav'),'Invalid backup leaves audio intact');
  await page.locator('#clearRecovery').click();
  await page.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent?.includes('no existe respaldo'));
  assert.equal(await page.locator('#restoreRecovery').isDisabled(),true);
  assert((await page.locator('#label1').innerText()).includes('backup-principal.wav'),'Delete backup never deletes open tracks');
  await page.locator('#autosaveEnabled').uncheck();
  assert.deepEqual(errors,[]);
  console.log('PASS: IndexedDB opt-in, lossless source recovery, persistence after reload, no silent restore, invalid backup isolation and safe deletion');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
