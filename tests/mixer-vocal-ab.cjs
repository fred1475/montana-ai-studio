'use strict';
const assert=require('node:assert/strict');
const AB=require('../mixer-vocal-ab.js'),Zip=require('../beat-archive.js');
const rate=44100,n=rate,make=(rate,channels=1,wet=false)=>{
 const len=Math.round(rate*.75);
 const samples=Array.from({length:channels},(_,ch)=>
  Float32Array.from({length:len},(_,i)=>Math.sin(2*Math.PI*221*i/rate)*(.15+ch*.1)*(wet?.7:1)));
 return {numberOfChannels:channels,length:len,sampleRate:rate,
  getChannelData(i){return samples[i]},samples};
};
const report=(buffer)=>({
 schema:'montana-vocal-audit',version:1,sourceName:'voice.wav',
 qa:{sampleRate:buffer.sampleRate,frames:buffer.length,channels:buffer.numberOfChannels},
 pitch:{enabled:true}
});
function files(bytes){
 const b=Buffer.from(bytes),found=[];let o=0;
 for(let i=0;i<4;i++){
  assert.equal(b.readUInt32LE(o),0x04034b50);
  const crc=b.readUInt32LE(o+14),size=b.readUInt32LE(o+18),len=b.readUInt16LE(o+26);
  const name=b.toString('utf8',o+30,o+30+len);
  const data=b.subarray(o+30+len,o+30+len+size);
  assert.equal(Zip.crc32(data),crc);
  found.push({name,data});o+=30+len+size;
 }
 assert.equal(b.readUInt32LE(o),0x02014b50,'Must have central directory');
 return found;
}
(async()=>{
 for(const sr of [44100,48000]){
  for(const channels of [1,2]){
   const dry=make(sr,channels),wet=make(sr,channels,true);
   const originals=dry.samples.map(x=>x.slice());
   const processed=wet.samples.map(x=>x.slice());
   const packed=await AB.makePackage(dry,wet,report(dry));
   assert.equal(packed.rate,sr);
   assert.equal(packed.frames,dry.length);
   assert.equal(packed.sourceChannels,channels);
   const content=files(packed.bytes);
   assert.deepEqual(content.map(f=>f.name),['01-VOZ-ORIGINAL.wav','02-VOZ-AFINADA.wav','03-DIAGNOSTICO.json','LEEME.txt']);
   for(let k=0;k<2;k++){
    const wav=content[k].data;
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt32LE(24),sr);
    assert.equal(wav.readUInt16LE(22),2);
    assert.equal(wav.readUInt16LE(34),16);
    assert.equal(wav.readUInt32LE(40),dry.length*4);
    assert.equal(wav.length,44+dry.length*4);
    const first=wav.readInt16LE(44+101*4);
    const second=wav.readInt16LE(44+101*4+2);
    if(channels===1)assert.equal(first,second,'Mono must be duplicated to stereo');
    else assert.notEqual(first,second,'Stereo L/R must remain separate');
   }
   const meta=JSON.parse(content[2].data.toString('utf8'));
   assert.equal(meta.schema,'montana-vocal-audit');
   assert(!content[3].data.toString('utf8').includes('certified'));
   for(let i=0;i<channels;i++){
    assert.deepEqual(dry.samples[i],originals[i]);
    assert.deepEqual(wet.samples[i],processed[i]);
   }
  }
 }
 const original=make(rate,1),wet=make(rate,1,true),audit=report(original);
 for(const [left,right,metadata] of [
  [original,{...wet,sampleRate:48000},audit],
  [original,make(rate,2,true),audit],
  [original,make(rate*.5,1,true),audit],
  [original,wet,{...audit,pitch:{enabled:false}}],
  [original,wet,{...audit,qa:{...audit.qa,frames:17}}],
  [original,wet,null],
  [{...original,numberOfChannels:4},wet,audit]
 ])await assert.rejects(()=>AB.makePackage(left,right,metadata),/compatible|distinto|corresponde/);
 const bad=make(rate);bad.samples[0][88]=NaN;
 await assert.rejects(()=>AB.makePackage(bad,wet,audit),/inválida/);
 console.log('PASS vocal A/B ZIP: 44.1/48 kHz mono/stereo, WAV PCM16, verified 4-file CRC+directory, immutable sources and corrupt/mismatched input rejection.');
})().catch(e=>{console.error(e);process.exit(1)});
