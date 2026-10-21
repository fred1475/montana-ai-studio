'use strict';
/* Chromium: note-by-note provenance + local QA/A-B package and session safety. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const rate=44100,n=rate;
function wav(hz){
 const b=Buffer.alloc(44+2*n);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
 return b;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/mixer-8.html');
  assert.equal(await page.locator('[id^="pitchNoteAudit"]').count(),7);
  const source=wav(224.5);
  await page.locator('#file1').setInputFiles({name:'notas-original.wav',mimeType:'audio/wav',buffer:source});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('notas-original'));
  await page.locator('#pitchDetails1 summary').click();
  assert((await page.locator('#pitchNoteAudit1').textContent()).includes('Sin notas'));
  await page.locator('#pitchApply1').click();
  await page.waitForFunction(()=>document.querySelector('#pitchState1')?.textContent?.includes('Afinación activa'),null,{timeout:35000});
  const rows=await page.locator('#pitchNoteAudit1 tr').count();
  assert.equal(rows,2,'Header plus measured sustained note');
  const ui=await page.locator('#pitchNoteAudit1').textContent();
  assert(ui.includes('A3')&&ui.includes('cents')&&ui.includes('Hz'));
  const note=await page.evaluate(()=>pitchNoteReports[1]);
  assert.equal(note.mode,'sustain');assert.equal(note.segments.length,1);
  assert.equal(note.segments[0].originalNote,'A3');
  assert.equal(note.segments[0].targetNote,'A3');
  assert(Number.isFinite(note.segments[0].plannedCorrectionCents));
  assert(Number.isFinite(note.segments[0].measuredDeviationCents));
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#pitchAudit1').click()]);
  const reportPath=path.join(process.cwd(),'pitch-note-audit-test.json');await dl.saveAs(reportPath);
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  assert.equal(report.schema,'montana-vocal-audit');
  assert.equal(report.noteAnalysis.mode,'sustain');
  assert.equal(report.noteAnalysis.segments[0].targetNote,'A3');
  assert.equal(report.noteAnalysis.segments[0].originalNote,'A3');
  assert(Number.isFinite(report.noteAnalysis.segments[0].measuredDeviationCents));
  assert(!('pcm' in report.noteAnalysis)&&!('samples' in report.noteAnalysis));
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>new Uint8Array(await originalFiles[1].arrayBuffer()))),source);
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#saveSession').click()]);
  const save=path.join(process.cwd(),'pitch-note-session.json');await backup.saveAs(save);
  const session=JSON.parse(fs.readFileSync(save,'utf8'));
  assert.equal(session.tracks[1].noteAnalysis,undefined,'Derived notes must not become authoritative project state');
  await page.reload();
  await page.locator('#sessionFile').setInputFiles(save);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Sesión restaurada'),null,{timeout:35000});
  const rebuilt=await page.evaluate(()=>pitchNoteReports[1]);
  assert.deepEqual(rebuilt,note,'Note measurements recomputed from source on restore');
  assert.equal(await page.locator('#pitchNoteAudit1 tr').count(),2);
  await page.locator('#file1').setInputFiles({name:'notas-nuevas.wav',mimeType:'audio/wav',buffer:wav(230)});
  await page.waitForFunction(()=>document.querySelector('#label1')?.textContent?.includes('notas-nuevas'));
  assert.equal(await page.evaluate(()=>pitchNoteReports[1]),null);
  assert((await page.locator('#pitchNoteAudit1').textContent()).includes('Sin notas'));
  assert.deepEqual(errors,[]);
  console.log('PASS pitch note audit browser: measured A3 vs target, separate planned cents, QA report, source bytes, deterministic rebuild and stale reset.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
