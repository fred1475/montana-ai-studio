'use strict';
const assert=require('node:assert/strict');
const M=require('../mixer-song-markers.js');
assert.equal(M.MAX,24);
assert.equal(M.clock(0),'00:00.000');
assert.equal(M.clock(65.125),'01:05.125');
assert.equal(M.clock(300),'05:00.000');
const original=[{label:'Coro',seconds:20},{label:'Intro',seconds:0}];
const clean=M.validate(original);
assert.deepEqual(clean,[{label:'Intro',seconds:0},{label:'Coro',seconds:20}]);
assert.deepEqual(original,[{label:'Coro',seconds:20},{label:'Intro',seconds:0}],'Pure validation');
const inserted=M.append(original,'Verso',12.125);
assert.deepEqual(inserted.map(x=>x.label),['Intro','Verso','Coro']);
assert.equal(inserted[1].seconds,12.125);
const moved=M.move(inserted,1,16.375);
assert.equal(moved[1].seconds,16.375);
assert.equal(inserted[1].seconds,12.125);
assert.deepEqual(M.remove(moved,0).map(x=>x.label),['Verso','Coro']);
assert.deepEqual(M.validate([]),[]);
const max=Array.from({length:24},(_,i)=>({label:'Sección '+i,seconds:i*.125}));
assert.equal(M.validate(max).length,24);
assert.throws(()=>M.append(max,'Más',4),/máximo 24|inválida/);
for(const m of [
 [{label:'',seconds:1}],
 [{label:' ',seconds:1}],
 [{label:'Intro',seconds:-.001}],
 [{label:'Intro',seconds:300.001}],
 [{label:'Intro',seconds:1.0004}],
 [{label:'Intro',seconds:NaN}],
 [{label:'Intro',seconds:Infinity}],
 [{label:'<script>alert(1)</script>',seconds:1}],
 [{label:'a'.repeat(36),seconds:1}],
 [{label:'  Verso',seconds:1}],
 [{label:'Bien\nmal',seconds:1}],
 [{label:'Coro',seconds:1},{label:'Otro',seconds:1}],
 [{label:'Coro',seconds:1},{label:'Otro',seconds:1.00001}],
 [...max,{label:'Más',seconds:100}]
 ])assert.throws(()=>M.validate(m),/inválid|máximo|mismo segundo/);
for(const wrong of [null,{},'texto',new Array(25).fill(null)])
 assert.throws(()=>M.validate(wrong),/inválid|máximo/);
assert.throws(()=>M.remove([],0),/inválido/);
assert.throws(()=>M.move(clean,0,301),/inválid/);
console.log('PASS song markers: millisecond precision, sorted immutable editing, capacity, unique positions, labels and strict validation.');
