'use strict';
const assert=require('node:assert/strict');
const A=require('../mixer-pan-automation.js'),G=require('../mixer-pan-graph.js');
let curve=A.parse('0:-100, 1:0, 2:100',true);
assert.deepEqual(G.xy(0,-100,2),{x:44,y:15});
assert.deepEqual(G.xy(2,100,2),{x:424,y:152});
assert.deepEqual(G.fromXY(G.xy(1,0,2).x,G.xy(1,0,2).y,2),{time:1,pan:0});
assert.equal(G.horizon(curve,2),2);assert.equal(G.horizon(curve,10),10);
curve=G.move(curve,1,1.15,-30);
assert.equal(A.format(curve),'0:-100, 1.15:-30, 2:100');
assert.equal(A.at(curve,1.15),-.3);
assert.equal(G.move(curve,1,3,0).points[1].time,1.99);
assert.equal(G.move(curve,1,-5,0).points[1].time,.01);
curve=G.insert(curve,.6,-85);
assert.equal(A.format(curve),'0:-100, 0.6:-85, 1.15:-30, 2:100');
curve=G.remove(curve,1);
assert.equal(A.format(curve),'0:-100, 1.15:-30, 2:100');
curve=G.move(curve,0,2.5,90);
assert.deepEqual(curve.points[0],{time:0,pan:90});
for(const fn of [
 ()=>G.remove(curve,0),()=>G.insert(curve,0,0),()=>G.insert(curve,1.15,45),
 ()=>G.horizon(curve,17),()=>G.move(curve,8,0,20),()=>G.xy(Infinity,0,2),
 ()=>G.fromXY(NaN,0,2),()=>G.insert(curve,1,-101)
]) assert.throws(fn,/inválid|inicial|cercano|repetido|rango/);
const full=A.parse('0:0,1:10,2:20,3:30,4:40,5:50,6:60,7:70',true);
assert.throws(()=>G.insert(full,4.5,60),/Máximo/);
assert.equal(A.parse('0:-100, 1:0, 2:100',true).points[1].pan,0,'No shared state mutation');
console.log('PASS panorama graph: coordinates, bounds, keyboard arithmetic, insert/move/delete, limits and immutable curve edits.');
