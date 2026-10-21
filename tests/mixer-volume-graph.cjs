'use strict';
const assert=require('node:assert/strict');
const M=require('../mixer-volume-automation.js');
const G=require('../mixer-volume-graph.js');
let state=M.parse('0:100, 1:60, 2:100',true);
assert.deepEqual(G.xy(0,150,2),{x:36,y:15});
assert.deepEqual(G.xy(2,0,2),{x:424,y:152});
const mid=G.xy(1,60,2),back=G.fromXY(mid.x,mid.y,2);
assert.deepEqual(back,{time:1,gain:60});
assert.equal(G.horizon(state,2),2);
assert.equal(G.horizon(state,10),10);
state=G.move(state,1,1.15,70);
assert.equal(M.format(state),'0:100, 1.15:70, 2:100');
assert.equal(M.at(state,1.15),.7);
assert.equal(state.points[0].gain,100);
const moved=G.move(state,1,5,70);
assert.equal(moved.points[1].time,1.99,'Cannot move past next point');
const left=G.move(state,1,-5,20);
assert.equal(left.points[1].time,.01,'Cannot cross anchor');
state=G.insert(state,.6,35);
assert.equal(M.format(state),'0:100, 0.6:35, 1.15:70, 2:100');
state=G.remove(state,1);
assert.equal(M.format(state),'0:100, 1.15:70, 2:100');
state=G.move(state,0,2.5,80);
assert.deepEqual(state.points[0],{time:0,gain:80});
for(const e of [()=>G.remove(state,0),()=>G.insert(state,0,40),
 ()=>G.insert(state,1.15,50),()=>G.horizon(state,13),
 ()=>G.move(state,8,0,20),()=>G.xy(Infinity,5,2),
 ()=>G.fromXY(NaN,0,2)])
 assert.throws(e,/inválid|primer|cercano/);
const fixed=M.parse('0:0,1:10,2:20,3:30,4:40,5:50,6:60,7:70',true);
assert.throws(()=>G.insert(fixed,4.5,60),/Máximo/);
const fresh=M.parse('0:100, 1:60, 2:100',true);
assert.equal(fresh.points[1].gain,60,'No source mutation');
console.log('PASS SVG graph geometry: XY coordinates, 1%/10ms bounds, insertion, movement, deletion and immutable source.');
