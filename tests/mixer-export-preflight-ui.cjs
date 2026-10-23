'use strict';
// Browser acceptance of pre-render capacity planning. No microphone or
// physical device, no long costly render in the over-limit branch.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const rate=44100,frames=rate;
function wave(f){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*f*i/rate)*10000),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  const button=page.locator('#estimateExport'),out=page.locator('#exportEstimateStatus');
  await button.click();
  assert((await out.innerText()).includes('Primero importa'));
  await page.locator('#file0').setInputFiles({name:'long-test-beat.wav',mimeType:'audio/wav',buffer:wave(220)});
  await page.waitForFunction(()=>document.querySelector('#label0')?.textContent?.includes('long-test-beat'));
  await button.click();
  const first=await out.innerText();
  assert(first.includes('Duración prevista: 1.00 s'));
  assert(first.includes('Master WAV PCM16'));
  assert(first.includes('ZIP de 1 stems PCM16'));
  assert(first.includes('Este cálculo no exporta'));
  assert.equal(await page.locator('#downloadAudit').isDisabled(),true);
  await page.locator('#file1').setInputFiles({name:'long-test-vocal.wav',mimeType:'audio/wav',buffer:wave(440)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('long-test-vocal'));
  await page.locator('#wavSampleRate').selectOption('48000');
  await page.locator('#stemSampleRate').selectOption('48000');
  await page.locator('#wavBits').selectOption('24');
  await page.locator('#stemBits').selectOption('24');
  await page.locator('#auditOn').check();
  await page.locator('#offset1').fill('10');
  await button.click();
  const planned=await out.innerText();
  assert(planned.includes('Duración prevista: 11.00 s'));
  assert(planned.includes('Master WAV PCM24'));
  assert(planned.includes('48.0 kHz'));
  assert(planned.includes('ZIP de 2 stems PCM24'));
  assert(planned.includes('Buffer temporal mínimo orientativo'));
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'long-test-vocal.wav');
  // Two long PCM24 tracks exceed the 145MiB ZIP cap, but estimation must
  // refuse BEFORE beginning any OfflineAudioContext processing.
  await page.locator('#offset1').fill('300');
  await button.click();
  assert((await out.innerText()).includes('ZIP de stems superaría 145 MB'));
  assert.equal(await page.locator('#exportStems').isDisabled(),false);
  // Oversize master: prove its click path rejects without getMixBuffer().
  await page.evaluate(()=>{
    tracks[0]={duration:300};
    document.getElementById('repeat0').value='8';
    window.getMixBuffer=()=>{throw Error('MUST_NOT_ALLOCATE_VOCAL_DSP')};
  });
  await page.locator('#export').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('La duración supera el tamaño máximo de WAV'));
  assert(!(await page.locator('#status').innerText()).includes('MUST_NOT_ALLOCATE_VOCAL_DSP'));
  assert.equal(await page.locator('#export').isDisabled(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS browser export planning: original PCM intact; budgets for short/long multitrack; refuse before costly DSP render.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
