'use strict';
/* Beat bundle E2E: ZIP CRC, sample-aligned stems, MIDI, project, download. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {crc32}=require('../beat-archive.js');
function entries(data){
 const result=new Map(),central=[],offsets=[];
 let pos=0;
 while(pos+30<=data.length&&data.readUInt32LE(pos)===0x04034b50){
  const offset=pos,method=data.readUInt16LE(pos+8),crc=data.readUInt32LE(pos+14);
  const compressed=data.readUInt32LE(pos+18),size=data.readUInt32LE(pos+22);
  const len=data.readUInt16LE(pos+26),extra=data.readUInt16LE(pos+28);
  const filename=data.toString('utf8',pos+30,pos+30+len);
  const begin=pos+30+len+extra;
  assert.equal(method,0,'Bundle uses STORE');
  assert.equal(compressed,size);assert(begin+size<=data.length);
  const bytes=data.subarray(begin,begin+size);
  assert.equal(crc32(bytes),crc,'ZIP CRC must match exact contents');
  assert(!result.has(filename));result.set(filename,bytes);offsets.push({offset,crc,size,filename});
  pos=begin+size;
 }
 const centralStart=pos;
 for(const file of offsets){
  assert.equal(data.readUInt32LE(pos),0x02014b50);
  assert.equal(data.readUInt32LE(pos+16),file.crc);
  assert.equal(data.readUInt32LE(pos+20),file.size);
  assert.equal(data.readUInt32LE(pos+42),file.offset);
  const len=data.readUInt16LE(pos+28),extra=data.readUInt16LE(pos+30),comment=data.readUInt16LE(pos+32);
  assert.equal(data.toString('utf8',pos+46,pos+46+len),file.filename);
  pos+=46+len+extra+comment;
 }
 assert.equal(data.readUInt32LE(pos),0x06054b50);
 assert.equal(data.readUInt16LE(pos+8),result.size);
 assert.equal(data.readUInt32LE(pos+12),pos-centralStart);
 assert.equal(data.readUInt32LE(pos+16),centralStart);
 assert.equal(pos+22,data.length);
 return result;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/beat-lab.html');
  await page.locator('#bars').selectOption('1');
  await page.locator('#bpm').fill('180');
  await page.locator('#bpm').dispatchEvent('change');
  await page.locator('#wavRate').selectOption('48000');
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:120000}),
   page.locator('#exportBundle').click()
  ]);
  const target=path.join(process.cwd(),'beat-lab-package-test.zip');
  await download.saveAs(target);
  const z=entries(fs.readFileSync(target));
  assert.deepEqual([...z.keys()],[
   '00-RITMO-COMPLETO.wav','01-kick.wav','02-snare.wav',
   '03-clap.wav','04-hat.wav','05-bass.wav','PATRON.mid','PATRON.json','LEEME.txt'
  ]);
  const master=z.get('00-RITMO-COMPLETO.wav'),size=master.length;
  const expectedRate=48000,expectedSeconds=4*60/180+.35;
  let distinct=0,nonEmpty=0;
  for(const name of [...z.keys()].filter(n=>n.endsWith('.wav'))){
   const wave=z.get(name);
   assert.equal(wave.length,size,'All stems must have exact same duration');
   assert.equal(wave.toString('ascii',0,4),'RIFF');assert.equal(wave.readUInt16LE(22),2);
   assert.equal(wave.readUInt16LE(34),16);assert.equal(wave.readUInt32LE(24),expectedRate);
   assert.equal(wave.readUInt32LE(40),wave.length-44);
   assert(Math.abs((wave.length-44)/(expectedRate*4)-expectedSeconds)<.001);
   if(name!=='00-RITMO-COMPLETO.wav'&&!wave.equals(master))distinct++;
   let max=0;for(let i=44;i<wave.length;i+=164)max=Math.max(max,Math.abs(wave.readInt16LE(i)));
   if(max>4)nonEmpty++;
  }
  assert.equal(distinct,5,'Isolated channels are not a copy of the master');
  assert(nonEmpty>=3,'Preset must contain nonempty tracks');
  const midi=z.get('PATRON.mid');assert.equal(midi.toString('ascii',0,4),'MThd');
  const pattern=JSON.parse(z.get('PATRON.json').toString('utf8'));
  assert.equal(pattern.bars,1);assert.equal(pattern.bpm,180);
  assert(z.get('LEEME.txt').toString('utf8').includes('compresión independiente'));
  assert((await page.locator('#status').innerText()).includes('ZIP generado'));
  assert.deepEqual(errors,[]);
  console.log('PASS Beat Lab ZIP browser: nine CRC-checked entries, six synchronized 48k WAV, MIDI, JSON and guide.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
