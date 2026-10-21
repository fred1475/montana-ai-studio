'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
const wav=Buffer.alloc(44+n*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++){const t=i/rate,amplitude=t>=.2&&t<.4?.36:0;
 wav.writeInt16LE(Math.round(32767*amplitude*Math.sin(2*Math.PI*220*t)),44+2*i);
}
function volume(data,start,end){
 let sum=0,count=0;
 for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
  const x=data.readInt16LE(44+i*4)/32768;sum+=x*x;count++;
 }
 return Math.sqrt(sum/count);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#file1').setInputFiles({name:'loop-base.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('loop-base'));
  await page.locator('#trimStart1').fill('0.2');
  await page.locator('#trimEnd1').fill('0.7');
  await page.locator('#offset1').fill('0.1');
  await page.locator('#repeat1').fill('3');
  async function exportFile(selector,file){
   const [d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
   const p=path.join(process.cwd(),file);await d.saveAs(p);return fs.readFileSync(p);
  }
  const mixed=await exportFile('#export','three-loops-mix.wav');
  assert(Math.abs((mixed.length-44)/4-rate*1.6)<=2,'Three loop regions should be 1.5s plus offset');
  const audible=[volume(mixed,.13,.27),volume(mixed,.63,.77),volume(mixed,1.13,1.27)];
  assert(audible.every(v=>v>.1),'All three loop repetitions must actually play: '+audible.join(', '));
  const silent=[volume(mixed,.41,.51),volume(mixed,.91,1.01),volume(mixed,1.41,1.51)];
  assert(silent.every(v=>v<.002),'Silent sections must repeat without accidental bleed '+silent);
  await page.locator('#stemTrack').selectOption('1');
  const stem=await exportFile('#exportStem','three-loops-stem.wav');
  assert.equal(stem.length,mixed.length,'Individual stem loop duration must match mix');
  assert(volume(stem,.63,.77)>.1,'Second loop must appear in stem WAV too');
  await page.locator('#repeat1').fill('5');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#repeat1').inputValue(),'3','Undo should restore loop count');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#repeat1').inputValue(),'5','Redo should restore loop count');
  await page.locator('#repeat1').fill('3');
  const [sessionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const project=path.join(process.cwd(),'three-loops.json');await sessionDownload.saveAs(project);
  const saved=JSON.parse(fs.readFileSync(project,'utf8'));
  assert.equal(saved.tracks[1].repeat,3);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(project);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#repeat1').inputValue(),'3');
  const restored=await exportFile('#export','three-loops-restored.wav');
  assert.equal(restored.length,mixed.length);
  assert(volume(restored,1.13,1.27)>.1);
  saved.tracks[1].repeat=99;
  const bad=path.join(process.cwd(),'three-loops-invalid.json');fs.writeFileSync(bad,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(bad);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('No se restauró'));
  assert.equal(await page.locator('#repeat1').inputValue(),'3','Invalid repeat must not corrupt session');
  delete saved.tracks[1].repeat;
  const legacy=path.join(process.cwd(),'three-loops-legacy.json');fs.writeFileSync(legacy,JSON.stringify(saved));
  await page.locator('#sessionFile').setInputFiles(legacy);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'));
  assert.equal(await page.locator('#repeat1').inputValue(),'1','Old sessions default to one playback');
  assert.deepEqual(errors,[]);
  console.log('PASS: source loop plays 3 audible repetitions, aligned mix and stem, silence, undo/redo, session save/restore and legacy compatibility');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
