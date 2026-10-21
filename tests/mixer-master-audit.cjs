'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const audit=require('../mixer-master-audit.js'),loud=require('../mixer-loudness.js');
const rate=44100,frames=rate*2;
function referenceWav(){
 const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(15000*Math.sin(2*Math.PI*1000*i/rate)),44+i*2);
 return b;
}
function fromStereoWav(b){
 const n=(b.length-44)/4,left=new Float32Array(n),right=new Float32Array(n);
 for(let i=0;i<n;i++){left[i]=b.readInt16LE(44+4*i)/32768;right[i]=b.readInt16LE(46+4*i)/32768}
 return [left,right];
}
function independentCrc32(bytes){
 let crc=~0;
 for(const byte of bytes){
  crc^=byte;
  for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;
 }
 return (crc^~0)>>>0;
}
(async()=>{
 assert.equal(audit.crc32(Buffer.from('123456789')),0xcbf43926,'CRC32 known official checksum');
 const source=referenceWav();
 const monoStereo=Buffer.alloc(44+frames*4);
 source.copy(monoStereo,0,0,44);
 monoStereo.writeUInt32LE(monoStereo.length-8,4);
 monoStereo.writeUInt16LE(2,22);
 monoStereo.writeUInt32LE(rate*4,28);
 monoStereo.writeUInt16LE(4,32);
 monoStereo.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++){
  const s=source.readInt16LE(44+i*2);
  monoStereo.writeInt16LE(s,44+i*4);
  monoStereo.writeInt16LE(s,46+i*4);
 }
 const report=await audit.analyzeWav(new Blob([monoStereo]),loud.measure,{});
 assert.equal(report.file.crc32,independentCrc32(monoStereo).toString(16).padStart(8,'0'));
 assert.equal(report.file.frames,frames);
 assert.equal(report.file.sampleRate,rate);
 assert(report.metrics.integratedLufs<0&&Number.isFinite(report.metrics.integratedLufs));
 assert.equal(report.metrics.pcmClippedSamples,0);
 assert(report.qualification.includes('No implica certificación'));
 const clipped=Buffer.from(monoStereo);
 clipped.writeInt16LE(32767,44+100*4);
 const clipReport=await audit.analyzeWav(new Blob([clipped]),loud.measure,{});
 assert(clipReport.metrics.pcmClippedSamples>0);
 assert.equal(clipReport.checks.find(x=>x.id==='pcm_clipping').status,'warning');
 assert.notEqual(clipReport.file.crc32,report.file.crc32);
 await assert.rejects(()=>audit.analyzeWav(new Blob([Buffer.from('bad')]),loud.measure),/WAV exportado|hasta 56 MiB|PCM16/);
 console.log('PASS audit engine: canonical PCM16 metadata, exact CRC32 known vector, clipping warning and changed PCM detection');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#auditOn').isChecked(),false,'Report requires explicit opt-in');
  assert.equal(await page.locator('#downloadAudit').isDisabled(),true);
  await page.locator('#file1').setInputFiles({name:'master-audit-tone.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('master-audit-tone'));
  await page.locator('#auditOn').check();
  await page.locator('#loudnessOn').check();
  async function exportMaster(name){
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator('#export').click()]);
   const dest=path.join(process.cwd(),name);
   await download.saveAs(dest);
   return fs.readFileSync(dest);
  }
  const master=await exportMaster('master-audit-output.wav');
  await page.waitForFunction(()=>document.querySelector('#auditStatus')?.textContent?.includes('Informe del último WAV listo'),null,{timeout:30000});
  assert.equal(await page.locator('#downloadAudit').isDisabled(),false);
  const [reportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadAudit').click()]);
  const reportPath=path.join(process.cwd(),'master-audit-output.json');
  await reportDownload.saveAs(reportPath);
  const written=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  assert.equal(written.file.sizeBytes,master.length);
  assert.equal(written.file.crc32,independentCrc32(master).toString(16).padStart(8,'0'),'JSON must match EXACT downloaded WAV');
  assert.equal(written.metrics.pcmClippedSamples,0);
  const [left,right]=fromStereoWav(master);
  const calculated=await loud.measure(left,right,rate);
  assert(Math.abs(written.metrics.integratedLufs-calculated.integratedLufs)<1e-7,'Exact PCM16 integrated LUFS must match');
  assert(Math.abs(written.metrics.truePeakDbtpEstimated-calculated.truePeakDbtp)<1e-7,'Exact PCM16 true peak must match');
  assert((await page.locator('#auditStatus').innerText()).includes(written.file.crc32));
  assert(written.checks.some(x=>x.id==='ebu_true_peak'));
  assert(written.checks.some(x=>x.id==='lra_duration'&&x.status==='provisional'));
  await page.locator('#vol1').fill('40');
  const changed=await exportMaster('master-audit-quieter.wav');
  assert.notEqual(independentCrc32(changed),independentCrc32(master),'Changed levels must change source WAV checksum');
  const latest=await page.evaluate(()=>window.montanaLastAudit);
  assert.equal(latest.file.crc32,independentCrc32(changed).toString(16).padStart(8,'0'));
  const [sessionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const sessionPath=path.join(process.cwd(),'master-audit-session.json');await sessionDownload.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
  assert.equal(session.auditOn,true);
  await page.reload();await page.locator('#sessionFile').setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#auditOn').isChecked(),true);
  assert.equal(await page.locator('#downloadAudit').isDisabled(),true,'Do not reuse previous export report after session restore');
  session.auditOn='yes';
  const invalidPath=path.join(process.cwd(),'master-audit-invalid.json');fs.writeFileSync(invalidPath,JSON.stringify(session));
  await page.locator('#sessionFile').setInputFiles(invalidPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#vol1').inputValue(),'40');
  assert.deepEqual(errors,[]);
  console.log('PASS browser audit: exact exported PCM16 matches JSON CRC32 and measured LUFS/TP, fresh report on level change, recovery safety');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
