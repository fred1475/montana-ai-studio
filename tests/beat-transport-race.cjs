'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/beat-lab.html');
  await page.evaluate(()=>{
   window.__resumeQueue=[];
   window.__scheduled=0;
   window.__realResume=AudioContext.prototype.resume;
   window.__realSchedule=B.schedule;
   AudioContext.prototype.resume=function(){
    return new Promise((resolve,reject)=>window.__resumeQueue.push({resolve,reject}));
   };
   B.schedule=(...args)=>{window.__scheduled++;return window.__realSchedule(...args)};
  });

  // Stop while a device permission/audio activation is still unresolved.
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__resumeQueue.length===1);
  await page.locator('#stop').click();
  await page.evaluate(()=>window.__resumeQueue[0].resolve());
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>playing),null);
  assert.equal(await page.evaluate(()=>window.__scheduled),0,'Cancelled audio must not schedule beats');
  assert.equal(await page.locator('#status').innerText(),'Reproducción detenida.');

  // Two rapid Play requests: the earlier one must never win after the later one.
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__resumeQueue.length===2);
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__resumeQueue.length===3);
  await page.evaluate(()=>window.__resumeQueue[2].resolve());
  await page.waitForFunction(()=>window.__scheduled===1);
  await page.evaluate(()=>window.__resumeQueue[1].resolve());
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>window.__scheduled),1,'Only one beat graph scheduled');
  assert((await page.locator('#status').innerText()).startsWith('Reproduciendo'));
  await page.locator('#stop').click();

  // Provider/device errors must cleanly dispose and leave a useful status.
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__resumeQueue.length===4);
  await page.evaluate(()=>window.__resumeQueue[3].reject(Error('Permiso de audio rechazado')));
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Permiso de audio rechazado'));
  assert.equal(await page.evaluate(()=>playing),null);

  // Editing while resume is pending also invalidates a stale request.
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__resumeQueue.length===5);
  await page.locator('#steps button[data-track="kick"][data-step="1"]').click();
  await page.evaluate(()=>window.__resumeQueue[4].resolve());
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>window.__scheduled),1,'Stale beat must not start after editing');
  assert((await page.locator('#status').innerText()).includes('Patrón editado'));

  await page.evaluate(()=>{AudioContext.prototype.resume=window.__realResume});
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.__scheduled===2);
  await page.locator('#stop').click();
  assert.equal(await page.evaluate(()=>playing),null);
  assert.deepEqual(errors,[]);
  console.log('PASS Beat Lab transport: async device cancellation, latest Play wins, errors, edits and recovery.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
