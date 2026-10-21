"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const rate=44100,n=Math.round(rate*.8);
const wav=Buffer.alloc(44+n*2);
wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVE",8);
wav.write("fmt ",12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write("data",36);wav.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++){
 const f=i/n<.5?220:880;
 wav.writeInt16LE(Math.round(10000*Math.sin(2*Math.PI*f*i/rate)),44+i*2);
}
function strength(buf,hz,start,end){
 let si=0,co=0,count=0;
 for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
  const x=buf.readInt16LE(44+4*i)/32768,phase=2*Math.PI*hz*i/rate;
  si+=x*Math.sin(phase);co+=x*Math.cos(phase);count++;
 }
 return 2*Math.hypot(si,co)/count;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/mixer-8.html");
  await page.locator("#file1").setInputFiles({name:"overlap-frequencies.wav",mimeType:"audio/wav",buffer:wav});
  await page.waitForFunction(()=>document.querySelector("#label1")?.textContent?.includes("overlap-frequencies"));
  await page.locator("#splitDetails1 summary").click();
  await page.locator("#splitHalf1").click();
  await page.locator("#splitOffset1").fill(".2");
  await page.locator("#crossfadeDetails1 summary").click();
  assert.equal(await page.locator("#crossfadeOn1").isChecked(),false,"Crossfade must be opt-in");
  async function exportTo(name,selector="#export"){
   const [d]=await Promise.all([page.waitForEvent("download",{timeout:30000}),page.locator(selector).click()]);
   const target=path.join(process.cwd(),name);await d.saveAs(target);return fs.readFileSync(target);
  }
  const raw=await exportTo("crossfade-disabled.wav");
  await page.locator("#crossfadeOn1").check();
  assert.equal(await page.locator("#crossfadeCurve1").isDisabled(),false);
  const config=await page.evaluate(()=>prepareCrossfadePlan(1,getTrackSegments(1,tracks[1])));
  assert.equal(config.ramps[0].fadeOut.duration,.2);
  assert.equal(config.ramps[1].fadeIn.start,.2);
  const equal=await exportTo("crossfade-equal-power.wav");
  assert.equal(equal.length,raw.length,"Fade does not change WAV duration");
  // At beginning of overlap B is attenuated; at end A is attenuated.
  const firstEdge880=strength(equal,880,.212,.242),rawFirst880=strength(raw,880,.212,.242);
  const lastEdge220=strength(equal,220,.36,.388),rawLast220=strength(raw,220,.36,.388);
  assert(firstEdge880<rawFirst880*.48,"Crossfade should fade in B, got "+firstEdge880+"/"+rawFirst880);
  assert(lastEdge220<rawLast220*.5,"Crossfade should fade out A, got "+lastEdge220+"/"+rawLast220);
  assert(strength(equal,220,.212,.242)>strength(raw,220,.212,.242)*.88,
   "A retains sound at beginning of overlap");
  assert(strength(equal,880,.36,.388)>strength(raw,880,.36,.388)*.87,
   "B retains sound at end of overlap");
  // Linear and equal-power have different midpoint gains. Both must change REAL PCM.
  await page.locator("#crossfadeCurve1").selectOption("linear");
  const linear=await exportTo("crossfade-linear.wav");
  const aEqual=strength(equal,220,.286,.314),aLinear=strength(linear,220,.286,.314);
  assert(aEqual>aLinear*1.25,"Equal power should differ audibly from linear at center: "+aEqual+"/"+aLinear);
  await page.locator("#stemTrack").selectOption("1");
  const stem=await exportTo("crossfade-stem.wav","#exportStem");
  assert.equal(stem.length,linear.length);
  assert(strength(stem,880,.212,.242)<rawFirst880*.5,
   "WAV stem must also fade in the overlapping second clip");
  // Undo redo checkbox activation and selected curve.
  await page.locator("#crossfadeCurve1").selectOption("equal-power");
  await page.locator("#undoEdit").click();
  assert.equal(await page.locator("#crossfadeCurve1").inputValue(),"linear");
  await page.locator("#redoEdit").click();
  assert.equal(await page.locator("#crossfadeCurve1").inputValue(),"equal-power");
  const [d]=await Promise.all([page.waitForEvent("download"),page.locator("#saveSession").click()]);
  const sessionPath=path.join(process.cwd(),"crossfade-session.json");await d.saveAs(sessionPath);
  const saved=JSON.parse(fs.readFileSync(sessionPath,"utf8"));
  assert.deepEqual(saved.tracks[1].crossfade,{enabled:true,curve:"equal-power"});
  await page.reload();
  await page.locator("#sessionFile").setInputFiles(sessionPath);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#crossfadeOn1").isChecked(),true);
  assert.equal(await page.locator("#crossfadeCurve1").inputValue(),"equal-power");
  const restored=await exportTo("crossfade-restored.wav");
  assert.equal(restored.length,equal.length);
  assert(strength(restored,880,.212,.242)<rawFirst880*.5);
  saved.tracks[1].crossfade.curve="unsafe-code";
  const badPath=path.join(process.cwd(),"crossfade-invalid.json");
  fs.writeFileSync(badPath,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(badPath);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("No se restauró"));
  assert.equal(await page.locator("#crossfadeCurve1").inputValue(),"equal-power");
  delete saved.tracks[1].crossfade;
  const oldPath=path.join(process.cwd(),"crossfade-legacy.json");fs.writeFileSync(oldPath,JSON.stringify(saved));
  await page.locator("#sessionFile").setInputFiles(oldPath);
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Sesión restaurada"));
  assert.equal(await page.locator("#crossfadeOn1").isChecked(),false,"Older sessions keep crossfade off");
  const oldWav=await exportTo("crossfade-legacy.wav");
  assert(Math.abs(strength(oldWav,880,.212,.242)-rawFirst880)<.008,
   "Legacy session should preserve non-crossfaded mix");
  assert.deepEqual(errors,[]);
  console.log("PASS: real equal-power vs linear PCM crossfades, B fade-in A fade-out, aligned WAV stem, undo/redo, valid and legacy JSON");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
