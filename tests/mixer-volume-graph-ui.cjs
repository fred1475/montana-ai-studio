'use strict';
/* Browser tests graphical editing without microphone or remote services. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
function tone(rate=44100){
 const n=rate,b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(2400*Math.sin(2*Math.PI*200*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  await page.locator('#autoDetails0 summary').click();
  assert.equal(await page.locator('#autoSvg0').count(),1);
  assert.equal(await page.locator('#autoSvg7').count(),1);
  assert.equal(await page.locator('#autoSvg0 circle').count(),1);
  await page.locator('#autoZoom0').selectOption('2');
  await page.locator('#autoPoints0').fill('0:100, 0.5:0, 1:0, 1.5:100');
  await page.locator('#autoPoints0').dispatchEvent('change');
  await page.locator('#autoEnable0').check();
  assert.equal(await page.locator('#autoSvg0 circle').count(),4);
  const initial=await page.evaluate(()=>[...document.querySelectorAll('#autoSvg0 circle')].map(x=>x.getAttribute('aria-label')));
  assert(initial.some(x=>x.includes('0.5 s, 0 %')));
  assert.equal(await page.locator('#autoDelete0').isDisabled(),true);
  // Keyboard controls move a point by exactly 1% then remove it.
  await page.locator('#autoSvg0 circle[data-index="1"]').focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:1, 1:0, 1.5:100');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:0, 1:0, 1.5:100');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#autoPoints0').inputValue(),'0:100, 0.5:1, 1:0, 1.5:100');
  // Real pointer drag from second point changes its time and level.
  const point=page.locator('#autoSvg0 circle[data-index="1"]');
  const first=await point.boundingBox();
  const svg=await page.locator('#autoSvg0').boundingBox();
  const toX=svg.x+(36+388*(.7/2))*svg.width/440;
  const toY=svg.y+(15+137*(1-60/150))*svg.height/178;
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2);
  await page.mouse.down();
  await page.mouse.move(toX,toY,{steps:8});
  await page.mouse.up();
  const moved=await page.locator('#autoPoints0').inputValue();
  const movedData=await page.evaluate(()=>window.volumeAutomationState(0));
  assert(movedData.points[1].time>.60&&movedData.points[1].time<.79,
   'Pointer drag moves point horizontally on correct timeline');
  assert(movedData.points[1].gain>=48&&movedData.points[1].gain<=72,
   'Pointer drag updates volume by Y position');
  assert.equal(movedData.points.length,4);
  // Add point by clicking background; maintain ordering and limit 8.
  const addX=svg.x+(36+388*(1.8/2))*svg.width/440;
  const addY=svg.y+(15+137*(1-30/150))*svg.height/178;
  await page.mouse.click(addX,addY);
  assert.equal(await page.locator('#autoSvg0 circle').count(),5);
  assert.equal((await page.evaluate(()=>window.volumeAutomationState(0))).points.length,5);
  const chosen=page.locator('#autoSvg0 circle[data-index="4"]');
  await chosen.focus();await page.keyboard.press('Delete');
  assert.equal(await page.locator('#autoSvg0 circle').count(),4);
  assert.equal(await page.locator('#autoDelete0').isDisabled(),true);
  await page.locator('#autoSvg0 circle[data-index="0"]').focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#autoSvg0 circle').count(),4,'Anchor cannot be deleted');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#autoSvg0 circle').count(),5,'Undo restores removed point');
  await page.locator('#redoEdit').click();
  assert.equal(await page.locator('#autoSvg0 circle').count(),4);
  const source=tone();
  await page.locator('#file1').setInputFiles({name:'graph-source.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('graph-source.wav'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const backup=path.join(process.cwd(),'mixer-volume-graph-session.json');
  await download.saveAs(backup);
  const saved=JSON.parse(fs.readFileSync(backup,'utf8'));
  assert.equal(saved.tracks[0].volumeAutomation.points.length,4);
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(backup);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:30000});
  await page.locator('#autoDetails0 summary').click();
  assert.equal(await page.locator('#autoSvg0 circle').count(),4);
  assert.equal(await page.locator('#autoPoints0').inputValue(),moved);
  assert.equal(await page.locator('#autoEnable0').isChecked(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS graphic automation: eight SVG editors, keyboard, pointer drag, insertion/deletion, undo/redo and JSON restore.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
