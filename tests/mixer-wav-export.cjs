'use strict';
/* Master WAV regression: PCM16 legacy default, PCM24 sign extension, dither and browser session.
 * Not a claim of mastering quality or EBU certification.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const codec=require('../mixer-wav-export.js');
const audit=require('../mixer-master-audit.js'),loud=require('../mixer-loudness.js');
const rate=44100;
const left=new Float32Array(4000),right=new Float32Array(4000);
for(let i=0;i<4000;i++){
 left[i]=0.000001*Math.sin(2*Math.PI*i/93);right[i]=-left[i];
}
function read24(b,p){return (b[p]|(b[p+1]<<8)|(b[p+2]<<16))}
function inspect(b,bits,frames){
 assert.equal(b.toString('ascii',0,4),'RIFF');
 assert.equal(b.toString('ascii',8,12),'WAVE');
 assert.equal(b.toString('ascii',12,16),'fmt ');
 assert.equal(b.readUInt16LE(20),1);
 assert.equal(b.readUInt16LE(22),2);
 assert.equal(b.readUInt16LE(34),bits);
 assert.equal(b.readUInt32LE(24),rate);
 assert.equal(b.readUInt16LE(32),bits/4);
 assert.equal(b.readUInt32LE(28),rate*bits/4);
 assert.equal(b.readUInt32LE(40),frames*bits/4);
 assert.equal(b.length,44+frames*bits/4);
}
(async()=>{
 const pcm16=Buffer.from(await codec.encode(left,right,rate).arrayBuffer());
 const pcm24=Buffer.from(await codec.encode(left,right,rate,{bits:24}).arrayBuffer());
 inspect(pcm16,16,left.length);inspect(pcm24,24,left.length);
 assert.equal(pcm16.readInt16LE(44),0);
 let enhanced=0;
 for(let i=0;i<4000;i++){
  const v=read24(pcm24,44+6*i),w=read24(pcm24,47+6*i);
  assert.equal(v,-w,'PCM24 preserves antiphase channels');
  if(v!==0)enhanced++;
 }
 assert(enhanced>3900,'24-bit must retain below-16-bit detail');
 const zeros=new Float32Array(10000);
 const quiet=Buffer.from(await codec.encode(zeros,zeros,rate).arrayBuffer());
 const dithered=Buffer.from(await codec.encode(zeros,zeros,rate,{bits:16,dither:true}).arrayBuffer());
 let nonzero=0;
 for(let i=44;i<quiet.length;i+=2){
  assert.equal(quiet.readInt16LE(i),0,'default no dither remains silent');
  if(dithered.readInt16LE(i)!==0)nonzero++;
 }
 assert(nonzero>1000&&nonzero<13000,'TPDF must add a small bounded random noise floor');
 assert.deepEqual(dithered,Buffer.from(await codec.encode(zeros,zeros,rate,{bits:16,dither:true}).arrayBuffer()),'fixed reproducible seed');
 assert.notDeepEqual(dithered,quiet);
 await assert.rejects(codec.encode(zeros,zeros,rate,{bits:32}),/Profundidad/);
 await assert.rejects(codec.encode(zeros,zeros,rate,{bits:24,dither:true}),/solo/);
 await assert.rejects(codec.encode(zeros,new Float32Array(1),rate),/Canales/);
 const broken=zeros.slice();broken[8]=NaN;
 await assert.rejects(codec.encode(broken,zeros,rate),/valores/);
 const clipLeft=Float32Array.from({length:rate},(_,i)=>i<rate/2?-1:1);
 const clipRight=Float32Array.from({length:rate},()=>0);
 const clip24=await codec.encode(clipLeft,clipRight,rate,{bits:24});
 const clipReport=await audit.analyzeWav(clip24,loud.measure);
 assert.equal(clipReport.file.bitsPerSample,24);
 assert.equal(clipReport.file.frames,rate);
 assert(clipReport.metrics.pcmClippedSamples>1000);
 assert.equal(clipReport.checks.find(c=>c.id==='pcm_clipping').status,'warning');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#wavBits').inputValue(),'16');
  assert.equal(await page.locator('#ditherOn').isChecked(),false);
  const source=Buffer.alloc(44+rate*2*2),dv=source;
  source.write('RIFF',0);source.writeUInt32LE(source.length-8,4);source.write('WAVE',8);
  source.write('fmt ',12);source.writeUInt32LE(16,16);source.writeUInt16LE(1,20);
  source.writeUInt16LE(2,22);source.writeUInt32LE(rate,24);
  source.writeUInt32LE(rate*4,28);source.writeUInt16LE(4,32);source.writeUInt16LE(16,34);
  source.write('data',36);source.writeUInt32LE(rate*4,40);
  for(let i=0;i<rate;i++){
   const x=Math.round(Math.sin(2*Math.PI*440*i/rate)*12000);
   source.writeInt16LE(x,44+i*4);source.writeInt16LE(x,46+i*4);
  }
  await page.locator('#file1').setInputFiles({name:'prueba-24.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('prueba-24.wav'));
  await page.locator('#wavBits').selectOption('24');
  assert.equal(await page.locator('#ditherOn').isDisabled(),true);
  await page.locator('#auditOn').check();
  async function download(button,name){
   const [d]=await Promise.all([page.waitForEvent('download',{timeout:35000}),page.locator(button).click()]);
   const loc=path.join(process.cwd(),name);await d.saveAs(loc);return fs.readFileSync(loc);
  }
  const output=await download('#export','wav24-master-output.wav');
  inspect(output,24,rate);
  await page.waitForFunction(()=>document.querySelector('#auditStatus')?.textContent?.includes('Informe del último WAV listo'));
  const reportFile=JSON.parse((await download('#downloadAudit','wav24-master-report.json')).toString('utf8'));
  assert.equal(reportFile.file.bitsPerSample,24);
  assert.equal(reportFile.file.sizeBytes,output.length);
  assert.equal(reportFile.file.encoding,'PCM signed 24-bit little-endian');
  assert.equal(reportFile.metrics.pcmClippedSamples,0);
  const {crc32}=audit;assert.equal(reportFile.file.crc32,crc32(output).toString(16).padStart(8,'0'));
  const session=JSON.parse((await download('#saveSession','wav24-session.json')).toString('utf8'));
  assert.equal(session.wavBits,24);assert.equal(session.ditherOn,false);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles({name:'session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(session))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#wavBits').inputValue(),'24');
  assert.equal(await page.locator('#ditherOn').isDisabled(),true);
  session.wavBits=32;
  await page.locator('#sessionFile').setInputFiles({name:'bad-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(session))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#wavBits').inputValue(),'24','invalid 32-bit setting must not overwrite good state');
  await page.locator('#wavBits').selectOption('16');
  await page.locator('#ditherOn').check();
  const d16=await download('#export','wav16-dither-output.wav');
  inspect(d16,16,rate);
  const still16=JSON.parse((await download('#saveSession','wav16-dither-session.json')).toString('utf8'));
  assert.equal(still16.wavBits,16);assert.equal(still16.ditherOn,true);
  assert.deepEqual(errors,[]);
  console.log('PASS 24-bit sign and detail, 16-bit TPDF noise, precise WAV headers, browser master, audit CRC and session recovery');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
