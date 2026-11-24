import test from 'node:test';
import assert from 'node:assert/strict';
import {fromDXF} from '../assets/site-map/importer.js';
import {assembleContours,simpleOutline} from '../assets/site-map/contours.js';
import {predictLayer} from '../assets/site-map/layer-model.js';
import {footprint} from '../assets/site-map/footprint.js';

const xy=[[100,200],[112,200],[112,205],[106,205],[106,210],[100,210]];
export function fixture(){
 const line=(a,b,l)=>[0,'LINE',8,l,10,a[0],20,a[1],30,0,11,b[0],21,b[1],31,0];
 const lines=[2,0,4,3,1,5].flatMap(i=>i%2?line(xy[(i+1)%6],xy[i],'A-KONUT'):line(xy[i],xy[(i+1)%6],'A-KONUT'));
 return [0,'SECTION',2,'HEADER',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...lines,...line([130,200],[135,209],'A-KONUT'),...line([0,0],[900,300],'DIMENSION'),0,'ENDSEC',0,'EOF'].join('\n')+'\n';
}
test('unordered DXF LINEs become one concave footprint; an open line on the same layer survives and dimensions disappear',()=>{
 const map=fromDXF(fixture(),'sample.dxf');assert.equal(map.units,'m');assert.equal(map.source.mode,'local-classifier');assert.equal(map.features.length,2);
 const f=map.features.find(f=>f.kind==='building'),line=map.features.find(f=>f.geometry.type==='LineString');assert.equal(line.layer,f.layer);assert.equal(line.kind,'boundary');
 const p=footprint(f,'m');assert.equal(p.rings[0].length,6);assert.deepEqual(p.rings[0].map(v=>v.join(',')).sort(),xy.map(([x,y])=>[x-106,y-205].join(',')).sort());
 assert.equal(p.slabs.at(-1).top,6);assert.equal(f.components.length,6);
});
test('branched/open linework never produces a fabricated hull; snap tolerance bridges tiny drafting gaps',()=>{
 const f=assembleContours([[[0,0],[1,0]],[[1.0001,0],[1,1]],[[1,1],[0,1]],[[0,1],[0,0]]],.001);assert.equal(f.closed.length,1);
 const b=assembleContours([[[0,0],[1,0]],[[1,0],[1,1]],[[1,0],[3,0]]],.001);assert.deepEqual([b.closed.length,b.lines.length],[0,3]);
 assert.equal(simpleOutline([[0,0],[2,2],[0,2],[2,0]]),false);assert.equal(simpleOutline(xy),true);
});
test('model recognises labelled classes, abstains on opaque names, and metre conversion preserves holes',()=>{
 assert.equal(predictLayer('A-PLANTINGS')?.kind,'landscape');assert.equal(predictLayer('V-Voirie')?.kind,'road');assert.equal(predictLayer('00-471'),null);
 const p=footprint({height:9,geometry:{type:'Polygon',coordinates:[[[0,0],[20000,0],[20000,10000],[0,10000],[0,0]],[[5000,2000],[7500,2000],[7500,3000],[5000,2000]]]}},'mm');
 assert.equal(p.span,20);assert.equal(p.height,9);assert.equal(p.rings.length,2);assert.equal(p.slabs.at(-1).top,9);
});
