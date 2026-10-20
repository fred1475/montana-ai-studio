const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await assert.equal(await page.locator('article.track').count(),8);
  // Synthesize a valid 1s mono WAV with silent PCM16 samples.
  const wav=Buffer.alloc(44+44100*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
  wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
  wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);
  wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(88200,40);
  await page.locator('#file0').setInputFiles({name:'instrumental.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('instrumental.wav'));
  await page.locator('#file1').setInputFiles({name:'voz.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('voz.wav'));
  await page.locator('#vol1').fill('60');
  await assert.equal(await page.locator('#val1').innerText(),'60%');
  await page.locator('#pan1').fill('-30');
  await assert.equal(await page.locator('#panval1').innerText(),'Izq 30');
  await page.locator('#mute1').check();
  await page.locator('#solo0').check();
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('reproduciéndose'));
  await page.locator('#stop').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  const dest=path.join(process.cwd(),'mixer-smoke-output.wav');await download.saveAs(dest);
  const out=fs.readFileSync(dest);
  assert.equal(out.toString('ascii',0,4),'RIFF');
  assert.equal(out.toString('ascii',8,12),'WAVE');
  assert.equal(out.readUInt16LE(22),2);
  assert.equal(out.readUInt32LE(24),44100);
  assert(out.length>100000,'Expected exported audio data');
  assert.deepEqual(errors,[]);
  console.log('PASS: 8 tracks, audio import, volume, panorama, mute/solo, playback, PCM WAV export.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
