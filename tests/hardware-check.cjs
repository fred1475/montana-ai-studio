"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const DSP=require("../hardware-diagnostics.js");
const rate=48000,n=rate*5;
const synthetic=new Float32Array(n);
for(let i=0;i<n;i++){
 const t=i/rate;
 synthetic[i]=t<2?.001*Math.sin(2*Math.PI*90*t):.18*Math.sin(2*Math.PI*220*t);
}
const report=DSP.inspect(synthetic,rate,2);
assert(Math.abs(report.durationSeconds-5)<.001);
assert(report.firstSecondsNoiseRmsDbfs< -59,"Noise floor synthetic PCM correctly measured");
assert(report.laterSpeechRmsDbfs> -25&&report.laterSpeechRmsDbfs< -15,"Voice RMS measured after quiet segment");
assert(report.nearFullScaleSamples===0);
const saturated=synthetic.slice();saturated[rate*3]=1;saturated[rate*3+1]=-1;
const badReport=DSP.inspect(saturated,rate,2);
assert(badReport.nearFullScaleSamples>=2);
assert(badReport.observations.some(s=>s.includes("SATURACIÓN")));
const bytes=Buffer.from(DSP.wavMono(synthetic,rate));
assert.equal(bytes.toString("ascii",0,4),"RIFF");
assert.equal(bytes.toString("ascii",8,12),"WAVE");
assert.equal(bytes.readUInt16LE(22),1,"Mono test");
assert.equal(bytes.readUInt16LE(34),16);
assert.equal(bytes.readUInt32LE(24),rate);
assert.equal(bytes.length,44+synthetic.length*2);
assert.throws(()=>DSP.inspect(new Float32Array([NaN]),rate),/inválidas/);
assert.throws(()=>DSP.wavMono(new Float32Array([]),rate),/inválida/);
console.log("PASS diagnostic DSP: independent 2s quiet + voice RMS, peak/clipping flags, lossless PCM routing to WAV format");
(async()=>{
 const browser=await chromium.launch({headless:true,args:[
  "--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required"
 ]});
 try{
  const context=await browser.newContext({acceptDownloads:true,permissions:["microphone"]});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.addInitScript(()=>{window.__MONTANA_HW_TEST_DURATION__=2.7});
  await page.goto("http://127.0.0.1:8765/hardware-check.html");
  assert.equal(await page.locator("#downloadTestWav").isDisabled(),true);
  assert.equal(await page.locator("#downloadTestJson").isDisabled(),true);
  assert((await page.locator("#testResults").innerText()).includes("Pendiente"));
  await page.locator("#scanDevices").click();
  await page.waitForFunction(()=>document.querySelector("#testStatus")?.textContent?.includes("Entradas de audio detectadas"));
  const count=await page.locator("#inputDevice option").count();
  assert(count>=2,"Fake Chromium audio input must be discoverable");
  await page.locator("#startTest").click();
  await page.waitForFunction(()=>document.querySelector("#testStatus")?.textContent?.includes("Grabando muestra local"),null,{timeout:15000});
  assert.equal(await page.locator("#stopTest").isDisabled(),false);
  await page.waitForFunction(()=>document.querySelector("#testStatus")?.textContent?.includes("Diagnóstico local terminado"),null,{timeout:20000});
  assert.equal(await page.locator("#startTest").isDisabled(),false);
  assert.equal(await page.locator("#stopTest").isDisabled(),true);
  assert.equal(await page.locator("#downloadTestWav").isDisabled(),false);
  assert.equal(await page.locator("#downloadTestJson").isDisabled(),false);
  const text=await page.locator("#testResults").innerText();
  assert(text.includes("Pico digital:")&&text.includes("Nivel promedio RMS:"));
  assert(text.includes("Primeros 2 s")&&text.includes("NO calibra latencia"));
  const [downloadWav]=await Promise.all([page.waitForEvent("download"),page.locator("#downloadTestWav").click()]);
  const target=path.join(process.cwd(),"hardware-fake-input.wav");await downloadWav.saveAs(target);
  const audio=fs.readFileSync(target);
  assert.equal(audio.toString("ascii",0,4),"RIFF");
  assert.equal(audio.readUInt16LE(22),1);
  assert(audio.length>rate*2,"Downloaded real fake-mic PCM has samples");
  const [downloadReport]=await Promise.all([page.waitForEvent("download"),page.locator("#downloadTestJson").click()]);
  const file=path.join(process.cwd(),"hardware-fake-report.json");await downloadReport.saveAs(file);
  const json=JSON.parse(fs.readFileSync(file,"utf8"));
  assert.equal(json.format,"montana-hardware-diagnostic");
  assert.equal(json.localOnly,true);
  assert(json.analysis.durationSeconds>=2);
  assert(json.analysis.measuredPeakDbfs!==null);
  assert(json.limitation.includes("NO mide ni compensa latencia"));
  assert(!errors.length,errors.join("\n"));
  console.log("PASS Chromium with fake mic: device discovery/permissions, capture, automatic stop, actual PCM WAV and JSON diagnostics");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
