const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({acceptDownloads:true});
 page.on('dialog',d=>d.accept());
 try {
  await page.goto('http://127.0.0.1:8765/studio.html', {waitUntil:'load'});
  await page.getByRole('button',{name:'Letras'}).click();
  await page.locator('#songTitle').fill('Prueba automatizada Montana');
  await page.locator('#songLyrics').fill('[Verso]\nLa prueba está funcionando.');
  await page.locator('#saveSong').click();
  await assertEventually(page, async()=>await page.locator('#songStatus').innerText(), 'guardada localmente');
  // Exercise audio-included backups with actual IndexedDB blob, without a mic.
  await page.evaluate(async()=>{
    const blob=new Blob([new Uint8Array([82,73,70,70,1,2,3,4])],{type:'audio/wav'});
    await saveProject({kind:'audio',title:'Grabación prueba WAV',blob});
  });
  await page.getByRole('button',{name:'Proyectos'}).click();
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#backupAll').click()]);
  const saveTo=path.join(process.cwd(),'test-backup.json');
  await dl.saveAs(saveTo);
  const fs=require('node:fs'); const backup=JSON.parse(fs.readFileSync(saveTo,'utf8'));
  assert.equal(backup.format,'montana-studio-backup');
  assert.equal(backup.projects.length,2);
  assert(backup.projects.some(p=>p.kind==='audio'&&p.audio.base64),'Audio is included');
  const originalCount=await page.evaluate(async()=>(await allProjects()).length);
  await page.locator('#restoreBackup').setInputFiles(saveTo);
  await assertEventually(page,async()=>await page.locator('#backupStatus').innerText(),'Restaurados');
  const after=await page.evaluate(async()=>{
    const rows=await allProjects();
    return Promise.all(rows.map(async p=>({kind:p.kind,title:p.title,size:p.blob?.size||null,bytes:p.blob?Array.from(new Uint8Array(await p.blob.arrayBuffer())):null})));
  });
  assert.equal(after.length,originalCount+2,'Restore must not replace existing projects');
  const audio=after.filter(x=>x.kind==='audio');
  assert.equal(audio.length,2);
  assert.equal(audio[1].size,8);
  assert.deepEqual(audio[1].bytes,[82,73,70,70,1,2,3,4]);
  console.log('PASS: Backup includes letters/audio; restore preserves existing projects.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
async function assertEventually(page,fn,expected){
 await page.waitForFunction(({selector,expected})=>document.querySelector(selector)?.textContent?.includes(expected),{selector:expected==='Restaurados'?'#backupStatus':'#songStatus',expected},{timeout:10000});
}
