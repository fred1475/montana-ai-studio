'use strict';
/* Actual browser export verifies master stereo QA refers to the downloaded
 * WAV bytes, not an in-memory pre-quantization signal. Synthetic input only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{crc32}=require('../mixer-master-audit.js');
const rate=44100,frames=rate;
function antiphaseWav(){
 const b=Buffer.alloc(44+frames*4);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const x=Math.round(15000*Math.sin(2*Math.PI*440*i/rate));
  b.writeInt16LE(x,44+i*4);b.writeInt16LE(-x,46+i*4);
 }
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  const source=antiphaseWav();
  await page.locator('#file1').setInputFiles({name:'stereo-phase-source.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('stereo-phase-source'));
  await page.locator('#auditOn').check();
  await page.locator('#wavBits').selectOption('24');
  const [exportDownload]=await Promise.all([
   page.waitForEvent('download',{timeout:35000}),page.locator('#export').click()
  ]);
  const wavPath=path.join(process.cwd(),'master-stereo-phase-24.wav');
  await exportDownload.saveAs(wavPath);
  const exactWav=fs.readFileSync(wavPath);
  await page.waitForFunction(()=>document.querySelector('#auditStatus')?.textContent?.includes('Informe del último WAV listo'),null,{timeout:35000});
  const status=await page.locator('#auditStatus').innerText();
  assert(status.includes('Correlación L/R:'));
  assert(status.includes('Caída al sumar mono:'));
  const [jsonDownload]=await Promise.all([
   page.waitForEvent('download',{timeout:35000}),page.locator('#downloadAudit').click()
  ]);
  const jsonPath=path.join(process.cwd(),'master-stereo-phase-24.json');
  await jsonDownload.saveAs(jsonPath);
  const report=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  assert.equal(report.file.bitsPerSample,24);
  assert.equal(report.file.sampleRate,rate);
  assert.equal(report.file.crc32,crc32(exactWav).toString(16).padStart(8,'0'),'Audit must match downloaded exact WAV');
  assert(report.metrics.stereoCorrelation<-.98,'Anti-phase should survive the browser mixing graph');
  assert(report.metrics.monoFoldDownDeltaDb===null||report.metrics.monoFoldDownDeltaDb< -65,'Mono summation should nearly cancel');
  assert.equal(report.checks.find(x=>x.id==='stereo_phase').status,'warning');
  assert.equal(report.checks.find(x=>x.id==='mono_compatibility').status,'warning');
  assert.equal(report.checks.find(x=>x.id==='pcm_clipping').status,'clear');
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'stereo-phase-source.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS browser master stereo audit: antiphase PCM24 output, warnings, exact CRC32 and unchanged original source.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
