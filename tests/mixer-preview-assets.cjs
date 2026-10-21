'use strict';
/* Offline development-preview asset completeness gate.
 * Checks every local static script src and every explicit HTML navigation
 * target; never follows remote links or runs untrusted source.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function scan(folder){
 const pages=['mixer-8.html','pitch-lab.html','beat-lab.html',
  'studio.html','hardware-check.html','hardware-loopback.html'];
 const failures=[],observed=new Set();
 for(const name of pages){
  const filename=path.join(folder,name);
  if(!fs.existsSync(filename)){failures.push(name+': missing page');continue;}
  const source=fs.readFileSync(filename,'utf8');
  const tags=source.match(/<(?:script|a|link)\b[^>]*>/gi)||[];
  for(const tag of tags){
   const match=tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
   if(!match)continue;
   const target=match[1].trim();
   if(!target||/^(?:https?:|mailto:|tel:|data:|blob:|#|javascript:)/i.test(target))continue;
   const base=target.split(/[?#]/,1)[0];
   // Script source always required. Anchors/links may be external pathways
   // but only local *.html links are held to the preview bundle.
   if(!/\bsrc\s*=/i.test(tag)&&!/\.html?$/i.test(base))continue;
   const safe=path.posix.normalize(base.replaceAll('\\','/'));
   if(safe.startsWith('/')||safe==='..'||safe.startsWith('../')||safe.includes('/../')){
    failures.push(name+': unsafe local asset '+target);continue;
   }
   const onDisk=path.join(folder,safe);
   observed.add(name+' -> '+safe);
   if(!fs.existsSync(onDisk)||!fs.statSync(onDisk).isFile())
    failures.push(name+': missing dependency '+safe);
  }
 }
 if(failures.length)throw Error('Preview incompleto:\n'+failures.join('\n'));
 return {pages:pages.length,links:observed.size};
}
if(require.main===module){
 const folder=process.argv[2]||path.join(process.cwd(),'mixer-preview');
 try{const stats=scan(folder);console.log('PASS offline preview contains all local scripts and HTML links: '+JSON.stringify(stats));}
 catch(e){console.error(e.message);process.exit(1)}
}
module.exports={scan};
