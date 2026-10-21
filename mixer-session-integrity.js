/* Montana Music Production LLC — local, portable SHA-256 integrity checks.
 * Fingerprints protect against accidental corruption, NOT authenticity or
 * malicious changes (no MAC, signer or encryption). Works on file://, too.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else root.MontanaSessionIntegrity=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const K=[
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
 ];
 const INIT=[
  0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
  0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
 ];
 const rotate=(x,n)=>x>>>n|x<<32-n;
 function hash(bytes){
  if(!(bytes instanceof Uint8Array))throw Error("SHA-256 requiere bytes");
  const state=INIT.slice(),block=new Uint8Array(64),words=new Uint32Array(64);
  let used=0,consumed=0,done=false;
  const transform=()=>{
   for(let i=0;i<16;i++){
    const j=i*4;
    words[i]=(block[j]<<24|block[j+1]<<16|block[j+2]<<8|block[j+3])>>>0;
   }
   for(let i=16;i<64;i++){
    const x=words[i-15],y=words[i-2];
    const a=rotate(x,7)^rotate(x,18)^x>>>3;
    const b=rotate(y,17)^rotate(y,19)^y>>>10;
    words[i]=(words[i-16]+a+words[i-7]+b)>>>0;
   }
   let [a,b,c,d,e,f,g,h]=state;
   for(let i=0;i<64;i++){
    const s1=rotate(e,6)^rotate(e,11)^rotate(e,25);
    const t1=(h+s1+((e&f)^(~e&g))+K[i]+words[i])>>>0;
    const s0=rotate(a,2)^rotate(a,13)^rotate(a,22);
    const t2=(s0+((a&b)^(a&c)^(b&c)))>>>0;
    h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
   }
   for(let i=0;i<8;i++)state[i]=(state[i]+[a,b,c,d,e,f,g,h][i])>>>0;
  };
  for(let i=0;i<bytes.length;i++){
   block[used++]=bytes[i];consumed++;
   if(used===64){transform();used=0;}
  }
  block[used++]=0x80;
  if(used>56){
   block.fill(0,used);transform();used=0;
  }
  block.fill(0,used,56);
  const bitHi=Math.floor(consumed/0x20000000),bitLo=(consumed*8)>>>0;
  block[56]=bitHi>>>24;block[57]=bitHi>>>16;block[58]=bitHi>>>8;block[59]=bitHi;
  block[60]=bitLo>>>24;block[61]=bitLo>>>16;block[62]=bitLo>>>8;block[63]=bitLo;
  transform();done=true;
  return state.map(x=>x.toString(16).padStart(8,"0")).join("");
 }
 const utf8=text=>new TextEncoder().encode(text);
 function manifest(session){
  if(!session||typeof session!=="object"||Array.isArray(session)||
    !Array.isArray(session.tracks)||session.tracks.length!==8)
   throw Error("Sesión no compatible con huella SHA-256");
  const {manifestSha256,tracks,...settings}=session;
  const slim={...settings,tracks:tracks.map(t=>{
   if(!t||typeof t!=="object"||Array.isArray(t))throw Error("Canal de sesión inválido");
   const {data,...withoutAudio}=t;
   return withoutAudio;
  })};
  return hash(utf8(JSON.stringify(slim)));
 }
 const valid=value=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
 function checkManifest(session){
  if(session.manifestSha256===undefined)return false; // Legacy session
  if(!valid(session.manifestSha256)||manifest(session)!==session.manifestSha256)
   throw Error("Integridad SHA-256 de ajustes fallida; la sesión podría estar dañada");
  for(const track of session.tracks){
   if(track.data!==null&&!valid(track.sourceSha256))
    throw Error("La sesión firmada necesita una huella SHA-256 por cada audio");
   if(track.data===null&&track.sourceSha256!==undefined)
    throw Error("Huella SHA-256 sin audio");
  }
  return true;
 }
 function checkAudio(track,bytes){
  if(track.sourceSha256===undefined)return false; // Legacy session
  if(!valid(track.sourceSha256)||hash(bytes)!==track.sourceSha256)
   throw Error("Integridad del audio SHA-256 fallida");
  return true;
 }
 return {hash,manifest,checkManifest,checkAudio,valid};
});
