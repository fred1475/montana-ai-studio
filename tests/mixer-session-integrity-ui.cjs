'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function tone(){
 const b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  const original=tone();
  await page.locator('#file1').setInputFiles({name:'firma-vocal.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('firma-vocal.wav'));
  await page.locator('#vol1').fill('65');
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator('#saveSession').click()]);
  const where=path.join(process.cwd(),'sha256-session.json');await download.saveAs(where);
  const saved=JSON.parse(fs.readFileSync(where,'utf8'));
  const nodeHash=crypto.createHash('sha256').update(original).digest('hex');
  assert.equal(saved.tracks[1].sourceSha256,nodeHash);
  assert(/^[0-9a-f]{64}$/.test(saved.manifestSha256));
  assert.equal(saved.tracks[1].sourceCrc32.length,8);
  const verified=await page.evaluate(project=>({
   verified:MontanaSessionIntegrity.checkManifest(project),
   sha:MontanaSessionIntegrity.manifest(project)
  }),saved);
  assert.equal(verified.verified,true);
  assert.equal(verified.sha,saved.manifestSha256);
  async function attempt(record,label,shouldAccept=false){
   const data=Buffer.from(JSON.stringify(record));
   await page.locator('#sessionFile').setInputFiles({name:label+'.json',mimeType:'application/json',buffer:data});
   await page.waitForFunction((accept)=>document.querySelector('#status')?.textContent?.includes(accept?'Sesión restaurada':'No se restauró'),shouldAccept,{timeout:35000});
   assert.equal(await page.locator('#vol1').inputValue(),'65','Corrupt restore must preserve active controls');
   assert((await page.locator('#label1').textContent()).includes('firma-vocal.wav'));
  }
  const invalidControl=structuredClone(saved);invalidControl.tracks[1].volume=25;
  await attempt(invalidControl,'tampered-fader');
  const invalidName=structuredClone(saved);invalidName.tracks[1].trackLabel='Distinto';
  await attempt(invalidName,'tampered-name');
  const invalidAudio=structuredClone(saved);
  const modified=Buffer.from(invalidAudio.tracks[1].data,'base64');
  modified[52]^=4;
  invalidAudio.tracks[1].data=modified.toString('base64');
  // Update CRC32 to demonstrate the independent SHA-256 check still rejects.
  invalidAudio.tracks[1].sourceCrc32=await page.evaluate(bytes=>
   MontanaMasterAudit.crc32(new Uint8Array(bytes)).toString(16).padStart(8,'0'),[...modified]);
  invalidAudio.manifestSha256=await page.evaluate(project=>MontanaSessionIntegrity.manifest(project),invalidAudio);
  await attempt(invalidAudio,'tampered-audio-updated-crc');
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'firma-vocal.wav');
  const legacy=structuredClone(saved);
  delete legacy.manifestSha256;
  for(const t of legacy.tracks)delete t.sourceSha256;
  await attempt(legacy,'legacy-session',true);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'firma-vocal.wav');
  const [rescued]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadSource').click()]);
  const srcPath=path.join(process.cwd(),'sha256-restored-source.wav');await rescued.saveAs(srcPath);
  assert.deepEqual(fs.readFileSync(srcPath),original,'Legacy source bytes preserved');
  await attempt(saved,'valid-new-session',true);
  assert.deepEqual(errors,[]);
  console.log('PASS SHA-256 browser: saved audio matches Node crypto, manifest covers mixer controls, changed WAV with updated CRC rejected, no partial restore, legacy compatibility and rescue.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
