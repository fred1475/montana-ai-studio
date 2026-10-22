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
  // Timeline contextual editing must identify clips by source field, even
  // when a copied clip sorts before the aligned original in the viewport.
  assert.equal(await page.locator('#timelineDuplicate').isDisabled(),true);
  await page.locator('#alignMs1').fill('200');
  await page.locator('#alignMs1').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#timeline [data-edit-field="offset1"]')?.getAttribute('aria-valuenow')==='0.45');
  assert.deepEqual(await page.evaluate(()=>window.getTrackSegments(1,tracks[1]).map(s=>s.editField)),['offset1']);
  await page.locator('#timeline [data-edit-field="offset1"]').click();
  const selectionDiagnostic=await page.evaluate(()=>({active:document.activeElement?.dataset?.editField||document.activeElement?.id,
   field:document.querySelector('#timeline [data-edit-field="offset1"]')?.dataset?.editField,
   hasFocus:document.querySelector('#timeline [data-edit-field="offset1"]')===document.activeElement,
   status:document.getElementById('timelineSelectedStatus').textContent}));
  assert.match(await page.locator('#timelineSelectedStatus').textContent(),/Pista 2 · original/,JSON.stringify(selectionDiagnostic));
  await page.locator('#timelineDuplicate').click();
  assert.equal(await page.locator('#copyCount1').inputValue(),'1');
  assert.equal(await page.locator('#copySource0_1').inputValue(),'0');
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'1.45');
  assert.match(await page.locator('#timelineSelectedStatus').textContent(),/Pista 2 · copia/);
  await page.locator('#timelineSelectedStart').fill('0.10');
  await page.locator('#timelineApplyStart').click();
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'0.1');
  assert.equal(await page.locator('#offset1').inputValue(),'0.25','Copy move must not subtract alignment');
  assert.deepEqual(await page.locator('#timeline [data-track="1"][data-edit-field]').evaluateAll(nodes=>nodes.map(n=>n.dataset.editField)),['copyOffset0_1','offset1']);
  await page.locator('#timeline [data-edit-field="offset1"]').click();
  await page.locator('#timelineSelectedStart').fill('1.20');
  await page.locator('#timelineApplyStart').click();
  assert.equal(await page.locator('#offset1').inputValue(),'1','Original move must subtract only its own alignment');
  await page.locator('#timeline [data-edit-field="offset1"]').press('ArrowRight');
  assert.equal(await page.locator('#offset1').inputValue(),'1.1','Original keyboard move must respect alignment when sorted second');
  await page.locator('#timeline [data-edit-field="copyOffset0_1"]').press('ArrowRight');
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'0.2','Copy keyboard move must not subtract alignment when sorted first');
  await page.locator('#timelineSelectedStart').fill('-1');
  await page.locator('#timelineApplyStart').click();
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'0.2','Invalid exact start is rejected');
  await page.locator('#timelineDuplicate').click();
  assert.equal(await page.locator('#copyCount1').inputValue(),'2');
  assert.equal(await page.locator('#copySource1_1').inputValue(),'0','Duplicating a copy keeps source identity');
  await page.locator('#timeline [data-edit-field="copyOffset0_1"]').click();
  await page.locator('#timelineRemoveCopy').click();
  assert.equal(await page.locator('#copyCount1').inputValue(),'1');
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'1.2','Deleting a chosen copy shifts remaining copies, not source clips');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#copyCount1').inputValue(),'2','Undo restores removed timeline copy');
  await page.locator('#timeline [data-edit-field="offset1"]').click();
  await page.locator('#timeline [data-edit-field="offset1"]').press('Control+d');
  assert.equal(await page.locator('#copyCount1').inputValue(),'3','Ctrl+D duplicates the selected clip');
  await page.locator('#timeline [data-edit-field="copyOffset2_1"]').click();
  await page.locator('#timeline [data-edit-field="copyOffset2_1"]').press('Delete');
  assert.equal(await page.locator('#copyCount1').inputValue(),'2','Delete removes only the focused copied clip');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#copyCount1').inputValue(),'3','Undo restores keyboard-deleted copy');
  await page.locator('#gridSnapOn').check();
  await page.locator('#timeline [data-edit-field="copyOffset0_1"]').click();
  await page.locator('#timelineSelectedStart').fill('0.1234');
  await page.locator('#timelineApplyStart').click();
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'0.1234','Exact editor keeps 0.1 ms precision with musical grid enabled');
  assert.equal(await page.locator('#timelineSelectedStart').inputValue(),'0.1234','Exact editor presents source precision without rounding it away');
  // The original overlaps the copied clip's center. Keyboard focus must
  // select that underlying clip even when pointer hit-testing cannot.
  await page.locator('#timeline [data-edit-field="copyOffset1_1"]').focus();
  assert.match(await page.locator('#timelineSelectedStatus').textContent(),/Pista 2 · copia/);
  assert.equal(await page.locator('#timelineSelectedStart').inputValue(),'1.2');
  assert.equal(await page.locator('#timelineClipPicker option[value^="1|"]').count(),4,'Picker lists source and each of three copies');
  await page.locator('#timelineClipPicker').selectOption('1|copyOffset0_1');
  assert.equal(await page.locator('#timelineSelectedStart').inputValue(),'0.1234','Picker can select a different copy');
  await page.locator('#timelineClipPicker').selectOption('1|copyOffset1_1');
  assert.equal(await page.locator('#timelineSelectedStart').inputValue(),'1.2','Picker can select overlapped copies without hit-testing');
  await page.locator('#timelineRippleAmount').fill('0.35');
  await page.locator('#timelineRippleMove').click();
  assert.equal(await page.locator('#copyOffset0_1').inputValue(),'0.1234','Ripple keeps earlier copies untouched');
  assert.equal(await page.locator('#copyOffset1_1').inputValue(),'1.55','Ripple shifts the selected copy');
  assert.equal(await page.locator('#offset1').inputValue(),'1.45','Ripple preserves original alignment despite sorted copies');
  assert.equal(await page.locator('#copyOffset2_1').inputValue(),'2.65','Ripple shifts later copies');
  await page.locator('#undoEdit').click();
  assert.equal(await page.locator('#copyOffset1_1').inputValue(),'1.2','One Undo restores the selected copy');
  assert.equal(await page.locator('#offset1').inputValue(),'1.1','One Undo restores the aligned original');
  assert.equal(await page.locator('#copyOffset2_1').inputValue(),'2.3','One Undo restores later copies');
  await page.locator('#timelineRippleAmount').fill('300');
  await page.locator('#timelineRippleMove').click();
  assert.equal(await page.locator('#copyOffset1_1').inputValue(),'1.2','Out-of-range ripple is rejected atomically');
  assert.equal(await page.locator('#offset1').inputValue(),'1.1','Rejected ripple preserves the original');
  assert.equal(await page.locator('#copyOffset2_1').inputValue(),'2.3','Rejected ripple preserves later copies');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),original);
  assert.deepEqual(errors,[]);
  console.log('PASS timeline zoom and clip editing: selection, duplicate, shortcuts, sorted move, ripple atomicity, precision, undo and exact source preservation.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
