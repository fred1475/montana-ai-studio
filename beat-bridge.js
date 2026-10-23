/* Montana Music Production LLC — local, single-item Beat Lab -> mixer inbox.
 * Same-origin IndexedDB; no network, no microphone, no automatic track writes.
 * PCM16 stereo WAV 44.1/48 kHz only. CRC32 detects accidental corruption,
 * not authenticity or security against a malicious same-origin script.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaBeatBridge=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const DB="montana-beat-bridge-v1",STORE="inbox",ID="beat",LIMIT=12*1024*1024;
 const AGE_MS=24*60*60*1000;
 const table=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;table[n]=c>>>0;}
 function crc(bytes){
  let c=0xffffffff;
  for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
 }
 function inspect(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<48||bytes.length>LIMIT)
   throw Error("Audio de traspaso demasiado grande o inválido");
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const word=at=>String.fromCharCode(...bytes.subarray(at,at+4));
  if(word(0)!=="RIFF"||word(8)!=="WAVE"||word(12)!=="fmt "||
     word(36)!=="data"||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||
     v.getUint16(22,true)!==2||v.getUint16(34,true)!==16||
     ![44100,48000].includes(v.getUint32(24,true))||
     v.getUint32(28,true)!==v.getUint32(24,true)*4||
     v.getUint16(32,true)!==4||
     v.getUint32(4,true)!==bytes.length-8||
     v.getUint32(40,true)!==bytes.length-44||
     (bytes.length-44)%4!==0)
   throw Error("Solo WAV PCM16 estéreo 44.1/48 kHz válido");
  return {rate:v.getUint32(24,true),frames:(bytes.length-44)/4};
 }
 const STEMS=Object.freeze(["kick","snare","clap","hat","bass"]);
 const STEM_LIMIT=42*1024*1024;
 function validateStems(record,now=Date.now()){
  if(!record||record.id!==ID||record.format!=="montana-beat-stems-transfer"||
     record.version!==2||!Number.isInteger(record.bpm)||record.bpm<60||record.bpm>200||
     !Number.isSafeInteger(record.created)||record.created>now+60000||
     record.created<now-AGE_MS||![44100,48000].includes(record.rate)||
     !Number.isSafeInteger(record.frames)||record.frames<1||
     !Array.isArray(record.stems)||record.stems.length!==STEMS.length)
   throw Error("Envío de instrumentos inválido o caducado");
  let total=0;
  const stems=record.stems.map((stem,i)=>{
   const kind=STEMS[i];
   if(!stem||stem.kind!==kind||typeof stem.filename!=="string"||
      stem.filename!=="montana-stem-"+kind+"-"+(record.rate/1000).toFixed(1)+"k.wav"||
      !Number.isInteger(stem.crc32)||stem.crc32<0||stem.crc32>0xffffffff)
    throw Error("Instrumento o nombre inválido: "+kind);
   const info=inspect(stem.bytes);
   total+=stem.bytes.length;
   if(total>STEM_LIMIT||info.rate!==record.rate||info.frames!==record.frames||
      crc(stem.bytes)!==stem.crc32)
    throw Error("Integridad o alineación de stems inválida");
   return {kind,filename:stem.filename,bytes:stem.bytes.slice(),crc32:stem.crc32};
  });
  return {id:ID,format:record.format,version:2,created:record.created,
   bpm:record.bpm,rate:record.rate,frames:record.frames,stems};
 }
 function validate(record,now=Date.now()){
  if(record?.format==="montana-beat-stems-transfer")return validateStems(record,now);
  if(!record||record.id!==ID||record.format!=="montana-beat-transfer"||
     record.version!==1||!Number.isInteger(record.bpm)||record.bpm<60||record.bpm>200||
     !Number.isSafeInteger(record.created)||record.created>now+60000||
     record.created<now-AGE_MS||typeof record.filename!=="string"||
     !/^montana-beat-lab-[0-9]+k\.wav$/.test(record.filename)||
     !Number.isInteger(record.crc32)||record.crc32<0||record.crc32>0xffffffff)
   throw Error("Traspaso caducado o metadatos inválidos");
  const info=inspect(record.bytes);
  if(info.rate!==record.rate||crc(record.bytes)!==record.crc32)
   throw Error("Integridad del WAV pendiente incorrecta");
  return {id:record.id,format:record.format,version:record.version,
   bpm:record.bpm,rate:info.rate,frames:info.frames,filename:record.filename,
   created:record.created,bytes:record.bytes.slice(),crc32:record.crc32};
 }
 function open(){
  if(typeof indexedDB==="undefined")return Promise.reject(Error("Este navegador no dispone de IndexedDB"));
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))
    request.result.createObjectStore(STORE,{keyPath:"id"});};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error("No se pudo abrir el almacenamiento local"));
  });
 }
 async function transact(mode,fn){
  const db=await open();
  try{
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
    let request,answer;
    try{request=fn(store);if(request)request.onsuccess=()=>{answer=request.result;};}
    catch(err){tx.abort();reject(err);return;}
    tx.oncomplete=()=>resolve(answer);
    tx.onerror=()=>reject(tx.error||Error("Fallo de almacenamiento"));
    tx.onabort=()=>reject(tx.error||Error("Operación de almacenamiento abortada"));
   });
  }finally{db.close();}
 }
 async function save({bytes,bpm,filename,created=Date.now()}){
  if(!Number.isInteger(bpm)||bpm<60||bpm>200)throw Error("BPM de traspaso inválido");
  const source=bytes instanceof Uint8Array?bytes.slice():bytes;
  const info=inspect(source);
  const expected="montana-beat-lab-"+Math.round(info.rate/1000)+"k.wav";
  if(filename!==expected)throw Error("Nombre de traspaso no corresponde al formato");
  const record={id:ID,format:"montana-beat-transfer",version:1,
   created,bpm,rate:info.rate,filename,bytes:source,crc32:crc(source)};
  validate(record,created);
  await transact("readwrite",s=>s.put(record));
  return {rate:info.rate,frames:info.frames,bpm,filename};
 }
 async function saveStems({stems,bpm,created=Date.now()}){
  if(!Array.isArray(stems)||stems.length!==STEMS.length||
     !Number.isInteger(bpm)||bpm<60||bpm>200)
    throw Error("Envío de instrumentos inválido");
  const audio=stems.map((s,i)=>{
   if(!s||s.kind!==STEMS[i]||!(s.bytes instanceof Uint8Array))
    throw Error("Instrumento inválido o fuera de orden");
   const bytes=s.bytes.slice(),info=inspect(bytes);
   return {kind:s.kind,filename:s.filename,bytes,crc32:crc(bytes),rate:info.rate,frames:info.frames};
  });
  const record={id:ID,format:"montana-beat-stems-transfer",version:2,
   bpm,created,rate:audio[0].rate,frames:audio[0].frames,
   stems:audio.map(({kind,filename,bytes,crc32})=>({kind,filename,bytes,crc32}))};
  validateStems(record,created);
  await transact("readwrite",store=>store.put(record));
  return {bpm,rate:record.rate,frames:record.frames,stemCount:record.stems.length};
 }
 async function read(){const item=await transact("readonly",s=>s.get(ID));return item?validate(item):null;}
 async function discard(){await transact("readwrite",s=>s.delete(ID));}
 return {inspect,validate,validateStems,save,saveStems,read,discard,LIMIT,AGE_MS,STEMS,STEM_LIMIT};
});
