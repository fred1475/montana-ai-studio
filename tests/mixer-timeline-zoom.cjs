'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const rate=44100,n=rate;
function wav(){
 const b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
 b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(7500*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('#timeline > div').count(),8,'Track lanes remain direct children');
  assert.equal(await page.locator('#timeline').getAttribute('role'),'region');
  assert.equal(await page.locator('#timelineZoomOut').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.montanaTimelineZoomState()),{factor:1,index:0});
  const original=wav();
  await page.locator('#file1').setInputFiles({name:'zoom-preserva.wav',mimeType:'audio/wav',buffer:original});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('zoom-preserva'));
  await page.locator('#offset1').fill('0.25');
  await page.locator('#offset1').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#timeline [data-track="1"]')?.getAttribute('aria-valuenow')==='0.25');
  await page.locator('#timelineZoomIn').click();
  assert.deepEqual(await page.evaluate(()=>window.montanaTimelineZoomState()),{factor:2,index:1});
  const range=await page.locator('#timeline').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
  assert(range.scroll>range.client*1.75,'Zoom expands the scrollable editing ruler');
  await page.locator('#timelineZoomIn').click();
  assert.equal(await page.locator('#timelineZoomStatus').textContent(),'Zoom ×4 · desplázate horizontalmente para ver más');
  const displaced=await page.locator('#timeline').evaluate(e=>{e.scrollLeft=300;return e.scrollLeft});
  assert(displaced>0,'Timeline scrolls horizontally');
  assert.equal(await page.locator('#offset1').inputValue(),'0.25');
  assert.equal(await page.locator('#timeline [data-track="1"]').getAttribute('aria-valuenow'),'0.25');
  await page.locator('#timelineZoomFit').click();
  assert.deepEqual(await page.evaluate(()=>window.montanaTimelineZoomState()),{factor:1,index:0});
  assert.equal(await page.locator('#timelineZoomOut').isDisabled(),true);
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  assert.deepEqual(errors,[]);
  console.log('PASS timeline zoom: independent viewport, scroll, original clip positions and byte-exact source preservation.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
