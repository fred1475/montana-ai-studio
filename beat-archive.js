/* Montana Music Production LLC — portable ZIP STORE archive for Beat Lab.
 * Bounded, uncompressed CRC32 ZIP without external libraries.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaBeatArchive=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const MAX_ARCHIVE=72*1024*1024,encoder=new TextEncoder();
 const table=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
 function crc32(bytes){
  if(!(bytes instanceof Uint8Array))throw Error("Datos ZIP inválidos");
  let crc=0xffffffff;
  for(let i=0;i<bytes.length;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
 }
 function makeZip(files){
  if(!Array.isArray(files)||files.length<1||files.length>12)throw Error("Lista ZIP inválida");
  const source=[],names=new Set();let projected=22;
  for(const file of files){
   if(!file||typeof file.name!=="string"||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(file.name)||
      file.name.includes("..")||names.has(file.name)||
      !(file.bytes instanceof Uint8Array)||file.bytes.length>0xffffffff)
    throw Error("Archivo ZIP inválido");
   const name=encoder.encode(file.name);
   projected+=30+46+2*name.length+file.bytes.length;
   if(!Number.isSafeInteger(projected)||projected>MAX_ARCHIVE)
    throw Error("ZIP excede límite de memoria");
   names.add(file.name);source.push({name,bytes:file.bytes,crc:crc32(file.bytes)});
  }
  const out=new Uint8Array(projected),view=new DataView(out.buffer);
  const u16=(at,x)=>view.setUint16(at,x,true),u32=(at,x)=>view.setUint32(at,x>>>0,true);
  let pos=0;const central=[];
  for(const f of source){
   const offset=pos;
   u32(pos,0x04034b50);u16(pos+4,20);u16(pos+6,0);u16(pos+8,0);
   u16(pos+10,0);u16(pos+12,0);u32(pos+14,f.crc);
   u32(pos+18,f.bytes.length);u32(pos+22,f.bytes.length);
   u16(pos+26,f.name.length);u16(pos+28,0);out.set(f.name,pos+30);
   pos+=30+f.name.length;out.set(f.bytes,pos);pos+=f.bytes.length;
   central.push({f,offset});
  }
  const centralAt=pos;
  for(const {f,offset} of central){
   u32(pos,0x02014b50);u16(pos+4,20);u16(pos+6,20);
   u16(pos+8,0);u16(pos+10,0);u16(pos+12,0);u16(pos+14,0);
   u32(pos+16,f.crc);u32(pos+20,f.bytes.length);u32(pos+24,f.bytes.length);
   u16(pos+28,f.name.length);u16(pos+30,0);u16(pos+32,0);
   u16(pos+34,0);u16(pos+36,0);u32(pos+38,0);u32(pos+42,offset);
   out.set(f.name,pos+46);pos+=46+f.name.length;
  }
  const centralBytes=pos-centralAt;
  u32(pos,0x06054b50);u16(pos+4,0);u16(pos+6,0);
  u16(pos+8,files.length);u16(pos+10,files.length);
  u32(pos+12,centralBytes);u32(pos+16,centralAt);u16(pos+20,0);
  pos+=22;
  if(pos!==out.length)throw Error("Longitud ZIP inconsistente");
  return out;
 }
 return {crc32,makeZip,MAX_ARCHIVE};
});
