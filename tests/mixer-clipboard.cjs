"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const rate=44100,n=rate;
const wave=Buffer.alloc(44+n*2);
wave.write("RIFF",0);wave.writeUInt32LE(wave.length-8,4);wave.write("WAVE",8);
wave.write("fmt ",12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);
wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);
wave.write("data",36);wave.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++){
 const freq=i<n/2?330:660;
 wave.writeInt16LE(Math.round(11000*Math.sin(2*Math.PI*freq*i/rate)),44+i*2);
}
function frequency(buf,hz,from,to){
 let s=0,c=0,number=0;
 for(let i=Math.ceil(from*rate);i<Math.floor(to*rate);i++){
  const x=buf.readInt16LE(44+4*i)/32768,p=2*Math.PI*hz*i/rate;
  s+=x*Math.sin(p);c+=x*Math.cos(p);number++;
 }
 return 2*Math.hypot(s,c)/number;
}
function rms(buf,from,to){
 let v=0,number=0;
 for(let i=Math.ceil(from*rate);i<Math.floor(to*rate);i++){
  const x=buf.readInt16LE(44+4*i)/32768;v+=x*x;number++;
 }
 return Math.sqrt(v/number);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/mixer-8.html");
  assert.equal(await page.locator('[id^="copyDetails"]').count(),8);
  await page.locator("#file1").setInputFiles({name:"two-note-source.wav",mimeType:"audio/wav",buffer:wave});
  await page.waitForFunction(()=>document.querySelector("#label1")?.textContent?.includes("two-note-source"));
  await page.locator("#splitDetails1 summary").click();
  await page.locator("#splitHalf1").click();
  await page.locator("#copyDetails1 summary").click();
  await page.locator("#copySelect1").selectOption("0");
  await page.locator("#copyAt1").fill("1.5");
  await page.locator("#copyPaste1").click();
  assert.equal(await page.locator("#copyCount1").inputValue(),"1");
  await page.locator("#copySelect1").selectOption("1");
  await page.locator("#copyAt1").fill("2.25");
  await page.locator("#copyPaste1").click();
  assert.equal(await page.locator("#copyCount1").inputValue(),"2");
  const clips=await page.evaluate(()=>getTrackSegments(1,tracks[1]).map(c=>({
   start:c.start,offset:c.offset,duration:c.duration,copied:c.copied,field:c.editField
  })));
  assert.deepEqual(clips,[
   {start:0,offset:0,duration:.5,copied:false,field:"offset1"},
   {start:.5,offset:.5,duration:.5,copied:false,field:"splitOffset1"},
   {start:0,offset:1.5,duration:.5,copied:true,field:"copyOffset0_1"},
   {start:.5,offset:2.25,duration:.5,copied:true,field:"copyOffset1_1"}
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#timeline [data-track="1"][data-part]').length===4);
  async function exportIt(sel,name){
   const [d]=await Promise.all([page.waitForEvent("download",{timeout:30000}),page.locator(sel).click()]);
   const target=path.join(process.cwd(),name);await d.saveAs(target);return fs.readFileSync(target);
  }
  const mix=await exportIt("#export","copy-paste-mix.wav");
  assert(Math.abs((mix.length-44)/4-rate*2.75)<=2,"Pasted clips extend the song to 2.75 seconds");
  assert(frequency(mix,330,.12,.28)>.1,"Original 330Hz clip audible");
  assert(frequency(mix,660,.62,.78)>.1,"Original 660Hz clip audible");
  assert(rms(mix,1.15,1.3)<.001,"Gap should remain silent");
  assert(frequency(mix,330,1.62,1.78)>.1,"First pasted copy reuses 330Hz source");
  assert(frequency(mix,660,2.34,2.56)>.1,"Second pasted copy reuses 660Hz source");
  assert(frequency(mix,330,2.34,2.56)<.008,"No accidental first-copy contamination");
  await page.locator("#stemTrack").selectOption("1");
  const stem=await exportIt("#exportStem","copy-paste-stem.wav");
  assert.equal(stem.length,mix.length);
  assert(frequency(stem,660,2.34,2.56)>.1);
  // Keyboard move and undo on a pasted clip.
  const pasted=page.locator('#timeline [data-track="1"][data-part="4"]');
  await pasted.focus();
  await pasted.press("ArrowRight");
  assert.equal(await page.locator("#copyOffset1_1").inputValue(),"2.35");
  await page.locator("#undoEdit").click();
  assert.equal(await page.locator("#copyOffset1_1").inputValue(),"2.25");
  await page.locator("#redoEdit").click();
  assert.equal(await page.locator("#copyOffset1_1").inputValue(),"2.35");
  await page.locator("#copyOffset1_1").fill("2.25");
  await page.locator("#copyPaste1").click();
  await page.locator("#copyPaste1").click();
  assert.equal(await page.locator("#copyCount1").inputValue(),"4");
  assert.equal(await page.locator("#copyPaste1").isDisabled(),true);
  await page.locator("#copyRemove1").click();
  assert.equal(await page.locator("#copyCount1").inputValue(),"3");
  await page.locator("#copyRemove1").click();
  assert.equal(await page.locator("#copyCount1").inputValue(),"2");
  const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#saveSession").click()]);
  const sessionPath=path.join(process.cwd(),"copied-clips.json");await download.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,"utf8"));
  assert.deepEqual(saved.tracks[1].clipCopies,{copies:[
   {sourceIndex:0,offset:1.5},{sourceIndex:1,offset:2.25}
  ]});
  assert(saved.tracks[1].data.length>1000,"Original source embedded in backup, not duplicated");
  await page.reload();
  await page.locator("#sessionFile").setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#copyCount1").inputValue(),"2");
  assert.equal(await page.locator("#copyOffset1_1").inputValue(),"2.25");
  const restored=await exportIt("#export","copy-paste-restored.wav");
  assert.equal(restored.length,mix.length);
  assert(frequency(restored,660,2.34,2.56)>.1);
  // A pasted copy can now have its own audible length, while retaining
  // the exact source bytes, through export, undo, portable snapshots, restore.
  await page.locator("#copyDetails1 summary").click();
  await page.locator("#copyDuration1_1").fill("0.15");
  await page.locator("#copyDuration1_1").dispatchEvent("change");
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1])
   .find(x=>x.editField==="copyOffset1_1").duration),.15);
  await page.locator("#undoEdit").click();
  assert.equal(await page.locator("#copyDuration1_1").inputValue(),"0");
  await page.locator("#redoEdit").click();
  assert.equal(await page.locator("#copyDuration1_1").inputValue(),"0.15");
  const trimmed=await exportIt("#export","copy-paste-trimmed.wav");
  assert(Math.abs((trimmed.length-44)/4/rate-2.4)<1/rate,
   "Independent copy trim controls the exact exported song endpoint");
  assert(frequency(trimmed,660,2.29,2.35)>.1,"Trimmed copy retains the original 660 Hz audio");
  const snapshot=await page.evaluate(()=>createMixerSnapshot());
  assert.equal(snapshot.tracks[1].clipCopies.copies[1].duration,.15);
  await page.evaluate(s=>restoreMixerSnapshot(s),snapshot);
  assert.equal(await page.locator("#copyDuration1_1").inputValue(),"0.15");
  const restoredTrim=await exportIt("#export","copy-paste-restored-trim.wav");
  assert.deepEqual(restoredTrim,trimmed,"Saved and restored copy trim renders byte-identically");
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>
   new Uint8Array(await originalFiles[1].arrayBuffer()))),wave,"Trim never rewrites source");

  saved.tracks[1].clipCopies.copies[1].sourceIndex=15;
  const invalid=path.join(process.cwd(),"copied-clips-invalid.json");fs.writeFileSync(invalid,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(invalid);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("No se restauró"));
  assert.equal(await page.locator("#copyCount1").inputValue(),"2","Invalid source reference cannot corrupt open project");
  delete saved.manifestSha256;delete saved.tracks[1].clipCopies;
  const legacy=path.join(process.cwd(),"copied-clips-legacy.json");fs.writeFileSync(legacy,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(legacy);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#copyCount1").inputValue(),"0","Legacy sessions default to no pasted copies");
  assert.deepEqual(errors,[]);
  console.log("PASS copy/paste: exact source-reference WAV clones, stems, silence, keyboard undo, max-four guard, save/recover/legacy projects");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
