'use strict';
/* Pan graph UI acceptance: mouse/touch-style pointer, keyboard, undo/redo
 * and saved session; existing stereo PCM coverage lives in pan-automation-ui.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function wav(){
 const rate=44100,n=rate,b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="panSvg"]').count(),8);
  assert.equal(await page.locator('#panAutoPoints0').inputValue(),'0:0');
  await page.locator('#panAutoDetails0 summary').click();
  assert.equal(await page.locator('#panSvg0 circle').count(),1);
  await page.locator('#panZoom0').selectOption('2');
  await page.locator('#panAutoPoints0').fill('0:-100, 0.5:-50, 1:50, 1.5:100');
  await page.locator('#panAutoPoints0').dispatchEvent('change');
  await page.locator('#panAutoEnable0').check();
  assert.equal(await page.locator('#panSvg0 circle').count(),4);
  assert((await page.locator('#panSvg0 circle[data-index="1"]').getAttribute('aria-label')).includes('0.5 s, pan -50'));
  await page.locator('#panSvg0 circle[data-index="1"]').focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#panAutoPoints0').inputValue(),'0:-100, 0.5:-51, 1:50, 1.5:100');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#panAutoPoints0').inputValue(),'0:-100, 0.5:-50, 1:50, 1.5:100');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#panAutoPoints0').inputValue(),'0:-100, 0.5:-51, 1:50, 1.5:100');
  const point=page.locator('#panSvg0 circle[data-index="1"]');
  await point.scrollIntoViewIfNeeded();
  const first=await point.boundingBox(),svg=await page.locator('#panSvg0').boundingBox();
  assert(first&&svg);
  const toX=svg.x+(44+380*(.7/2))*svg.width/440;
  const toY=svg.y+(15+137*((20+100)/200))*svg.height/178;
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2);
  await page.mouse.down();
  await page.mouse.move(toX,toY,{steps:8});await page.mouse.up();
  const moved=await page.evaluate(()=>window.panAutomationState(0));
  assert(moved.points[1].time>.6&&moved.points[1].time<.79,
   'Drag should move horizontally, observed '+JSON.stringify({moved,svg,toX,toY}));
  assert(moved.points[1].pan>=4&&moved.points[1].pan<=36,
   'Drag should update stereo position, observed '+JSON.stringify(moved.points));
  assert.equal(moved.points.length,4);
  const movedText=await page.locator('#panAutoPoints0').inputValue();
  // Clicking the graph background creates another, ordered point.
  const box=await page.locator('#panSvg0').boundingBox();
  const addX=box.x+(44+380*(1.8/2))*box.width/440;
  const addY=box.y+(15+137*((-70+100)/200))*box.height/178;
  await page.mouse.click(addX,addY);
  assert.equal(await page.locator('#panSvg0 circle').count(),5);
  assert.equal((await page.evaluate(()=>window.panAutomationState(0))).points.length,5);
  await page.locator('#panSvg0 circle[data-index="4"]').focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#panSvg0 circle').count(),4);
  await page.locator('#panSvg0 circle[data-index="0"]').focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#panSvg0 circle').count(),4,'Cannot delete 0-second anchor');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#panSvg0 circle').count(),5);
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#panSvg0 circle').count(),4);
  const source=wav();
  await page.locator('#file1').setInputFiles({name:'pan-graph-original.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('pan-graph-original.wav'));
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const savedAt=path.join(process.cwd(),'pan-graph-session.json');
  await dl.saveAs(savedAt);
  const saved=JSON.parse(fs.readFileSync(savedAt,'utf8'));
  assert.equal(saved.tracks[0].panAutomation.enabled,true);
  assert.equal(saved.tracks[0].panAutomation.points.length,4);
  assert.equal(saved.tracks[1].name,'pan-graph-original.wav');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(savedAt);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  await page.locator('#panAutoDetails0 summary').click();
  assert.equal(await page.locator('#panSvg0 circle').count(),4);
  assert.equal(await page.locator('#panAutoPoints0').inputValue(),movedText);
  assert.equal(await page.locator('#panAutoEnable0').isChecked(),true);
  assert.equal(await page.evaluate(()=>originalFiles[1]?.name),'pan-graph-original.wav');
  assert.deepEqual(errors,[]);
  console.log('PASS pan SVG: 8 channel graphs, keyboard, pointer movement, insertion, protected anchor, undo/redo and session reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
