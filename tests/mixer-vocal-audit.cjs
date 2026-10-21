'use strict';
const assert=require('node:assert/strict'),A=require('../mixer-vocal-audit.js');
const qa={version:1,channels:2,frames:44100,sampleRate:44100,
 metrics:{sourcePeakDbfs:-5,outputPeakDbfs:-6,
 sourceRmsDbfs:-18,outputRmsDbfs:-18,rmsDeltaDb:0,
 peakIncreaseDb:-1,highBandDeltaDb:2.2,dropoutWindowCount:0,
 firstDropoutSeconds:null,firstDropoutChannel:null,newLargeSteps:0,
 privateDanger:"DO NOT EXPORT"},
 warnings:[{id:"spectral_balance_shift",message:"Internal text that should not leak"}],
 privateSamples:new Float32Array([.123456])
};
const pitch={mode:'sustain',key:'C',scale:'chromatic',strength:100,wet:70,
 enabled:true,matchLevel:true,protectTimbre:true,hiddenSecret:"NEVER COPY"};
const args={track:2,sourceName:'voice.wav',pitch,qa,
 level:{appliedGainDb:-.4,limited:false,status:'matched',samples:[1,2]},
 timbre:{wetPercent:75,originalMaxBandShiftDb:8,outputMaxBandShiftDb:4,status:'reduced_correction',channels:[1,2]},
 createdAt:'2026-10-21T12:00:00.000Z'};
const result=A.create(args),text=JSON.stringify(result);
assert.equal(result.schema,'montana-vocal-audit');
assert.equal(result.version,1);
assert.equal(result.track,2);assert.equal(result.qa.channels,2);
assert.equal(result.levelMatch.appliedGainDb,-.4);
assert.equal(result.spectralGuard.wetPercent,75);
assert.deepEqual(result.qa.warnings,['spectral_balance_shift']);
assert(!text.includes('DO NOT EXPORT')&&!text.includes('Internal text')&&
 !text.includes('privateDanger')&&!text.includes('hiddenSecret')&&
 !text.includes('Float32Array')&&!text.includes('NEVER COPY'));
assert(text.length<12000);
assert.notStrictEqual(result.pitch,pitch);
pitch.strength=0;qa.metrics.sourcePeakDbfs=33;
assert.equal(result.pitch.strength,100,'No source object aliasing');
assert.equal(result.qa.metrics.sourcePeakDbfs,-5);
for(const bad of [
 {...args,track:1},{...args,track:9},
 {...args,sourceName:'bad\nname'},
 {...args,pitch:{...pitch,matchLevel:"yes"}},
 {...args,qa:{...qa,metrics:{...qa.metrics,sourceRmsDbfs:NaN}}},
 {...args,qa:{...qa,warnings:[{id:'<script>',message:'bad'}]}},
 {...args,createdAt:'not-a-date'},
 {...args,timbre:{wetPercent:Infinity}}
])assert.throws(()=>A.create(bad),/inválid|no finita/);
console.log('PASS voice QA report schema: bounded local JSON, excludes audio/private fields, deep immutability, invalid metrics/warnings rejected.');
