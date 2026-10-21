"use strict";
// Non-destructive 8-track offset + trims undo/redo.
// A history entry records the BEFORE snapshot of an edit, not the audio data.
(function(){
 const ids=Array.from({length:8},(_,i)=>(i===0?["offset","trimStart","trimEnd","repeat","fadeIn","fadeOut"]:["offset","trimStart","trimEnd","alignMs","repeat","fadeIn","fadeOut"]).map(k=>k+i)).flat();
 const get=()=>ids.map(id=>document.getElementById(id).value);
 const same=(a,b)=>a.every((v,i)=>v===b[i]);
 let previous=get(),undo=[],redo=[],applying=false;
 function refresh(){
  $("undoEdit").disabled=undo.length===0;
  $("redoEdit").disabled=redo.length===0;
 }
 function capture(){
  if(applying)return;
  const now=get();
  if(same(previous,now))return;
  undo.push(previous);if(undo.length>80)undo.shift();
  previous=now;redo.length=0;refresh();
 }
 function apply(values){
  applying=true;
  try{
   ids.forEach((id,i)=>{
    const el=$(id);
    if(el.value!==values[i]){
     el.value=values[i];
     el.dispatchEvent(new Event("change",{bubbles:true}));
    }
   });
   previous=get();
  }finally{applying=false}
  refresh();
 }
 $("undoEdit").addEventListener("click",()=>{
  if(!undo.length)return;
  const old=undo.pop();redo.push(get());apply(old);
  report("Edición deshecha. El audio original se conserva.");
 });
 $("redoEdit").addEventListener("click",()=>{
  if(!redo.length)return;
  const next=redo.pop();undo.push(get());apply(next);
  report("Edición rehecha.");
 });
 for(const id of ids)$(id).addEventListener("change",capture);
 // Timeline keyboard movement changes value without a change event to keep focus.
 window.captureTimelineHistory=capture;
 window.resetEditHistory=()=>{
  undo=[];redo=[];previous=get();refresh();
 };
 refresh();
})();
