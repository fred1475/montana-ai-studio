"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const rate=44100,frames=Math.round(rate*1.2);
const wav=Buffer.alloc(44+frames*2);
wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVE",8);
wav.write("fmt ",12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write("data",36);wav.writeUInt32LE(frames*2,40);
for(let i=0;i<frames;i++){
 const freq=i/rate<.4?220:i/rate<.8?440:880;
 wav.writeInt16LE(Math.round(12500*Math.sin(2*Math.PI*freq*i/rate)),44+i*2);
}
function amplitude(data,hz,from,to){
 let si=0,co=0,n=0;
 for(let i=Math.floor(from*rate);i<Math.floor(to*rate);i++){
  const a=data.readInt16LE(44+i*4)/32768,phase=2*Math.PI*hz*i/rate;
  si+=a*Math.sin(phase);co+=a*Math.cos(phase);n++;
 }
 return 2*Math.hypot(si,co)/n;
}
function rms(data,from,to){
 let sum=0,n=0;
 for(let i=Math.floor(from*rate);i<Math.floor(to*rate);i++){
  const a=data.readInt16LE(44+i*4)/32768;sum+=a*a;n++;
 }
 return Math.sqrt(sum/n);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/mixer-8.html");
  await page.locator("#file1").setInputFiles({name:"multiclip-original.wav",mimeType:"audio/wav",buffer:wav});
  await page.waitForFunction(()=>document.querySelector("#label1")?.textContent?.includes("multiclip-original"));
  await page.locator("#splitDetails1 summary").click();
  await page.locator("#splitHalf1").click();
  await page.locator("#splitAt1").fill("0.4");
  await page.locator("#splitOffset1").fill("1.5");
  await page.locator("#splitAdd1").click();
  assert.equal(await page.locator("#splitCount1").inputValue(),"3");
  assert.equal(await page.locator("#splitAt2_1").inputValue(),"0.8");
  assert.equal(await page.locator("#splitOffset2_1").inputValue(),"1.9");
  await page.locator("#splitAdd1").click();
  assert.equal(await page.locator("#splitCount1").inputValue(),"4");
  assert.equal(await page.locator("#splitAt3_1").inputValue(),"1");
  assert.equal(await page.locator("#splitOffset3_1").inputValue(),"2.1");
  assert.equal(await page.locator("#splitAdd1").isDisabled(),true);
  const actual=await page.evaluate(()=>getTrackSegments(1,tracks[1]).map(s=>({
   offset:Number(s.offset.toFixed(2)),start:Number(s.start.toFixed(2)),duration:Number(s.duration.toFixed(2))
  })));
  assert.deepEqual(actual,[
   {offset:0,start:0,duration:.4},{offset:1.5,start:.4,duration:.4},
   {offset:1.9,start:.8,duration:.2},{offset:2.1,start:1,duration:.2}
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#timeline [data-track="1"][data-part]').length===4);
  const move=page.locator('#timeline [data-track="1"][data-part="4"]');
  await move.focus();await move.press("ArrowRight");
  assert.equal(await page.locator("#splitOffset3_1").inputValue(),"2.2","Keyboard nudge moves only fourth clip");
  await page.locator("#undoEdit").click();
  assert.equal(await page.locator("#splitOffset3_1").inputValue(),"2.1","Undo must restore fourth clip position");
  await page.locator("#redoEdit").click();
  assert.equal(await page.locator("#splitOffset3_1").inputValue(),"2.2","Redo must reapply fourth clip position");
  await page.locator("#splitOffset3_1").fill("2.1");
  async function render(button,name){
   const [download]=await Promise.all([page.waitForEvent("download",{timeout:30000}),page.locator(button).click()]);
   const dest=path.join(process.cwd(),name);await download.saveAs(dest);
   return fs.readFileSync(dest);
  }
  const audio=await render("#export","four-clips-mix.wav");
  assert.equal(audio.length,44+Math.ceil(2.3*rate)*4,"Four fragments must reach exactly 2.3 seconds");
  assert(amplitude(audio,220,.13,.28)>.13,"First fragment 220 Hz");
  assert(amplitude(audio,440,1.58,1.74)>.13,"Second fragment 440 Hz");
  assert(amplitude(audio,880,1.94,2.03)>.13,"Third fragment 880 Hz");
  assert(amplitude(audio,880,2.14,2.24)>.13,"Fourth fragment also 880 Hz");
  assert(rms(audio,.8,1.2)<.001,"Inserted gap is silent");
  assert(amplitude(audio,440,.13,.28)<.015,"No leakage of second clip into first");
  await page.locator("#stemTrack").selectOption("1");
  const stem=await render("#exportStem","four-clips-stem.wav");
  assert.equal(stem.length,audio.length,"Single stem aligned with master");
  assert(amplitude(stem,880,2.14,2.24)>.13);
  assert(rms(stem,.8,1.2)<.001);
  // Removing one part must change the effective project timeline but not the original file.
  await page.locator("#splitLess1").click();
  assert.equal(await page.locator("#splitCount1").inputValue(),"3");
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1]).length),3);
  await page.locator("#undoEdit").click();
  assert.equal(await page.locator("#splitCount1").inputValue(),"4","Undo restores last fragment");
  await page.locator("#redoEdit").click();
  assert.equal(await page.locator("#splitCount1").inputValue(),"3");
  await page.locator("#undoEdit").click();
  const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#saveSession").click()]);
  const sessionFile=path.join(process.cwd(),"four-clips-session.json");await download.saveAs(sessionFile);
  const saved=JSON.parse(fs.readFileSync(sessionFile,"utf8"));
  assert.deepEqual(saved.tracks[1].split,{
   enabled:true,at:.4,rightOffset:1.5,
   extras:[{at:.8,offset:1.9},{at:1,offset:2.1}]
  });
  await page.reload();await page.locator("#sessionFile").setInputFiles(sessionFile);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#splitCount1").inputValue(),"4");
  assert.equal(await page.locator("#splitOffset3_1").inputValue(),"2.1");
  const restored=await render("#export","four-clips-restored.wav");
  assert.equal(restored.length,audio.length);
  assert(amplitude(restored,880,2.14,2.24)>.13);
  saved.tracks[1].split.extras[1].at=.65; // Non-monotonic cut, reject transaction.
  const invalid=path.join(process.cwd(),"four-clips-invalid.json");fs.writeFileSync(invalid,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(invalid);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("No se restauró"));
  assert.equal(await page.locator("#splitCount1").inputValue(),"4","Bad cuts cannot corrupt open project");
  assert.equal(await page.locator("#splitAt3_1").inputValue(),"1");
  // Two-clip legacy sessions have exactly the older schema without extras.
  saved.tracks[1].split={enabled:true,at:.6,rightOffset:.6};
  const two=path.join(process.cwd(),"four-clips-legacy-two.json");fs.writeFileSync(two,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(two);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#splitCount1").inputValue(),"2","Old two-fragment project still works");
  assert.equal(await page.evaluate(()=>getTrackSegments(1,tracks[1]).length),2);
  assert.deepEqual(errors,[]);
  console.log("PASS multiclip: four regions, separate timeline positions, real PCM frequencies, gap, stems, keyboard undo/redo, adding/removing and backwards-compatible atomic restore");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
