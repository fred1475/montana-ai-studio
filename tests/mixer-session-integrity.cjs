'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../mixer-session-integrity.js');
for(const text of ['', 'abc','hello world','Montana Music Production LLC','🪐🎙️ Puerto Rico']){
 const bytes=Buffer.from(text,'utf8');
 assert.equal(S.hash(bytes),crypto.createHash('sha256').update(bytes).digest('hex'));
}
for(const n of [1,7,31,55,56,63,64,65,119,120,121,1024,65536,1048576]){
 const bytes=Buffer.alloc(n);for(let i=0;i<n;i++)bytes[i]=(i*131+i>>>4)&255;
 assert.equal(S.hash(bytes),crypto.createHash('sha256').update(bytes).digest('hex'),'byte length '+n);
}
assert.throws(()=>S.hash('not-bytes'),/requiere bytes/);
assert.equal(S.valid('a'.repeat(64)),true);
assert.equal(S.valid('A'.repeat(64)),false);
assert.equal(S.valid('x'.repeat(64)),false);
const raw=Buffer.from('RIFF simple WAV mock for hash test');
const blank=Array.from({length:8},()=>({volume:80,pan:0,data:null}));
const snapshot={format:'montana-mixer-session',version:1,bpm:100,
 tracks:blank.map((t,i)=>i===1?{...t,name:'voice.wav',data:raw.toString('base64'),
  sourceSha256:S.hash(raw)}:t)};
snapshot.manifestSha256=S.manifest(snapshot);
assert.equal(S.checkManifest(snapshot),true);
assert.equal(S.checkAudio(snapshot.tracks[1],raw),true);
const modifiedSettings=structuredClone(snapshot);modifiedSettings.tracks[1].pan=80;
assert.throws(()=>S.checkManifest(modifiedSettings),/Integridad SHA-256/);
const modifiedMetadata=structuredClone(snapshot);modifiedMetadata.bpm=101;
assert.throws(()=>S.checkManifest(modifiedMetadata),/Integridad SHA-256/);
const damagedFile=Buffer.from(raw);damagedFile[4]^=2;
assert.throws(()=>S.checkAudio(snapshot.tracks[1],damagedFile),/Integridad SHA-256/);
const alteredAudio=structuredClone(snapshot);
alteredAudio.tracks[1].data=damagedFile.toString('base64');
assert.equal(S.checkManifest(alteredAudio),true,'Manifest excludes large embedded base64; per-file digest detects alteration');
assert.throws(()=>S.checkAudio(alteredAudio.tracks[1],damagedFile),/Integridad SHA-256/);
const malformed=structuredClone(snapshot);malformed.tracks[1].sourceSha256='abc';
malformed.manifestSha256=S.manifest(malformed);
assert.throws(()=>S.checkManifest(malformed),/huella SHA-256/);
const unclaimed=structuredClone(snapshot);unclaimed.tracks[2].sourceSha256=S.hash(raw);
unclaimed.manifestSha256=S.manifest(unclaimed);
assert.throws(()=>S.checkManifest(unclaimed),/sin audio/);
const old=structuredClone(snapshot);
delete old.manifestSha256;delete old.tracks[1].sourceSha256;
assert.equal(S.checkManifest(old),false,'Legacy sessions are accepted');
assert.equal(S.checkAudio(old.tracks[1],raw),false);
assert.equal(S.manifest(snapshot),snapshot.manifestSha256,'Hash excludes itself');
console.log('PASS SHA-256 session checks: RFC vectors and 16 chunk lengths, metadata edits, source changes, malicious fields, legacy compatibility.');
