"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),pitch=require("../pitch-engine.js");
const rate=44100,n=rate;
function wav(){
 const b=Buffer.alloc(44+n*2);
 b.write("RIFF",0);b.writeUInt32LE(b.length-8,4);b.write("WAVE",8);
 b.write("fmt ",12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write("data",36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/time-lab.html");
  assert.match(await page.locator("h1").textContent(),/Laboratorio de duración/);
  assert.equal(await page.locator("#download").isDisabled(),true);
  const original=wav();
  await page.locator("#file").setInputFiles({name:"time-original.wav",mimeType:"audio/wav",buffer:original});
  await page.locator("#ratio").evaluate(el=>{el.value="120";el.dispatchEvent(new Event("input",{bubbles:true}))});
  await page.locator("#process").click();
  await page.waitForFunction(()=>document.getElementById("status")?.textContent?.startsWith("Audio procesado"),null,{timeout:30000});
  assert.match(await page.locator("#results").textContent(),/1.000 s → salida: 1.200 s/);
  const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
  const filename=path.join(process.cwd(),"time-stretch-out.wav");await download.saveAs(filename);
  const wave=fs.readFileSync(filename);
  assert.equal(wave.readUInt16LE(22),1);
  assert.equal(wave.readUInt32LE(24),rate);
  assert.equal(wave.length,44+Math.round(n*1.2)*2);
  const samples=new Float32Array(Math.round(n*1.2));
  for(let i=0;i<samples.length;i++)samples[i]=wave.readInt16LE(44+i*2)/32768;
  const detected=pitch.analyze(samples,rate).frequency;
  assert(Math.abs(1200*Math.log2(detected/220))<12,"Export pitch must remain near 220 Hz");
  assert.deepEqual(Buffer.from(await page.locator("#file").evaluate(async el=>new Uint8Array(await el.files[0].arrayBuffer()))),original);
  await page.locator("#ratio").evaluate(el=>{el.value="90";el.dispatchEvent(new Event("input",{bubbles:true}))});
  assert.equal(await page.locator("#download").isDisabled(),true,"Changing ratio invalidates stale audio");
  await page.locator("#process").click();
  await page.waitForFunction(()=>document.getElementById("status")?.textContent?.startsWith("Audio procesado"),null,{timeout:30000});
  assert.match(await page.locator("#results").textContent(),/0.900 s/);
  const [shortDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
  const shorter=path.join(process.cwd(),"time-stretch-short.wav");await shortDownload.saveAs(shorter);
  assert.equal(fs.readFileSync(shorter).length,44+Math.round(n*.9)*2);
  assert.deepEqual(errors,[]);
  console.log("PASS time lab UI: WAV duration and frequency, local source integrity, stale export guard, shortening and lengthening.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
