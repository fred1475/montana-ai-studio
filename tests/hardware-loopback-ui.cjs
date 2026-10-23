'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:[
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required'
 ]});
 try{
  const page=await browser.newPage({permissions:['microphone']}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/hardware-loopback.html');
  assert.equal(await page.locator('#measureLoop').isDisabled(),true,'Explicit physical loopback consent required');
  assert.equal(await page.locator('#downloadLoopReport').isDisabled(),true,'No measured result should be downloadable before a loopback');
  assert((await page.locator('#loopResults').innerText()).includes('Pendiente'));
  await page.locator('#scanLoop').click();
  await page.waitForFunction(()=>document.querySelector('#loopStatus')?.textContent?.includes('entrada(s) detectadas'));
  await page.locator('#confirmSafe').check();
  assert.equal(await page.locator('#measureLoop').isDisabled(),false);
  await page.locator('#measureLoop').click();
  await page.waitForFunction(()=>document.querySelector('#loopStatus')?.textContent?.includes('Prueba no concluyente'),null,{timeout:20000});
  const status=await page.locator('#loopStatus').innerText();
  assert(status.includes('No se detectó')||status.includes('Señal de loopback ambigua')||status.includes('Grabación incompleta'),
   'Fake microphone without loopback must never produce verified calibration: '+status);
  assert((await page.locator('#loopResults').innerText()).includes('No se aplicó ninguna compensación'));
  assert.equal(await page.locator('#downloadLoopReport').isDisabled(),true,'No report may be issued on failed measurement');
  assert.equal(await page.locator('#measureLoop').isDisabled(),false);
  await page.locator('#confirmSafe').uncheck();
  assert.equal(await page.locator('#measureLoop').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS loopback browser: opt-in safety gate, non-calibrated fake mic correctly rejected, no false latency/compensation.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
