import test from 'node:test';import assert from 'node:assert/strict';
import {createSiteMapHandler} from '../api/site-map.js';
import {demoMap,validateMap,bindFacade,catalogFromState,resolveFeature,status} from '../assets/site-map/model.js';
import {fromDXF,fromGeoJSON} from '../assets/site-map/importer.js';
import {setSourceProgress,validateGlb} from '../lib/site-map.js';
import {database} from './helpers/test-db.mjs';
const state={cp_dynamic_data:{A:{'Villa 411':{items:[['Concrete',100,25,25,'','',0,60,'m³'],['Wall',200,0,0,'','',0,40,'m²']]}}},cp_daily_entries:{'A_Villa 411__Concrete':[{id:'old',userId:'member-b',value:5,includedInBase:false}]},cp_facade_overrides:{}};
test('live references use cumulative quantities and preserve daily records when setting percentage',()=>{
 const catalog=catalogFromState(state),feature=bindFacade(demoMap().features.find(f=>f.kind==='building'),catalog[0]);
 assert.equal(catalog[0].items[0].progress,30);assert.equal(resolveFeature(feature,catalog).progress,18);
 const updated=setSourceProgress(state,feature.components[0].source,47);
 assert.equal(updated.cp_dynamic_data.A['Villa 411'].items[0][2],47);assert.equal(updated.cp_daily_entries['A_Villa 411__Concrete'][0].id,'old');assert.equal(updated.cp_daily_entries['A_Villa 411__Concrete'][0].includedInBase,true);
 assert.equal(catalogFromState(updated)[0].items[0].progress,47);assert.equal(state.cp_dynamic_data.A['Villa 411'].items[0][2],25);
 assert.deepEqual([status(0),status(1),status(100)],['not_started','in_progress','completed']);
});
test('CAD/GeoJSON validation rejects malformed geometry and preserves local coordinates',()=>{
 const geo={type:'FeatureCollection',units:'m',features:[{type:'Feature',properties:{name:'Villa 411',kind:'building',layer:'BUILDINGS'},geometry:{type:'Polygon',coordinates:[[[0,0],[20,0],[20,10],[0,10],[0,0]]]}}]};
 const map=fromGeoJSON(geo);assert.equal(map.features[0].name,'Villa 411');assert.equal(map.units,'m');assert.equal(map.features[0].components.length,6);
 map.features[0].geometry.coordinates[0][0][0]=Infinity;assert.throws(()=>validateMap(map),/Koordinat/);
 assert.throws(()=>fromGeoJSON({...geo,crs:{name:'EPSG:4326'}}),/Coğrafi/);
 const duplicate=demoMap();duplicate.features.push(duplicate.features[0]);assert.throws(()=>validateMap(duplicate),/tekrarlan/);
});
test('DXF cleanup removes dimensions and preserves transformed INSERT building outlines',()=>{
 const pairs=[0,'SECTION',2,'HEADER',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'VILLA',70,0,10,0,20,0,30,0,0,'LWPOLYLINE',8,'0',90,4,70,1,10,0,20,0,10,10,20,0,10,10,20,5,10,0,20,5,0,'ENDBLK',0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'INSERT',8,'BUILDING',2,'VILLA',10,100,20,200,30,0,41,2,42,2,50,90,0,'LINE',8,'DIMENSIONS',10,0,20,0,11,20,21,20,0,'ENDSEC',0,'EOF'];
 const map=fromDXF(pairs.join('\n')+'\n');assert.equal(map.features.length,1);assert.equal(map.units,'m');assert.equal(map.features[0].kind,'building');
 const coords=map.features[0].geometry.coordinates[0];assert.deepEqual(coords[0],[100,200]);assert.ok(Math.abs(coords[1][0]-100)<1e-7);assert.equal(coords[1][1],220);
});
test('GLB validation blocks external resource loading and invalid binary containers',()=>{
 const make=doc=>{const text=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const b=Buffer.alloc(20+padded.length);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(padded.length,12);b.writeUInt32LE(0x4e4f534a,16);padded.copy(b,20);return b.toString('base64');};
 assert.ok(validateGlb(make({asset:{version:'2.0'},nodes:[],scenes:[{nodes:[]}]})).length>0);
 assert.throws(()=>validateGlb(make({buffers:[{uri:'https://example.com/private'}]})),/dış dosya/);assert.throws(()=>validateGlb('AAAA'),/GLB/);
});
test('project map API persists live updates, enforces project access/roles and rejects stale revisions',async t=>{
 const d=await database(t),handler=createSiteMapHandler({...d.deps,config:()=>({})});
 await d.sql`UPDATE cephepro_project_state SET state=${JSON.stringify(state)}::jsonb,revision=5 WHERE project_key='main'`;
 const map=demoMap();map.source.format='geojson';map.features.find(f=>f.id==='villa-411').components=bindFacade(map.features.find(f=>f.id==='villa-411'),catalogFromState(state)[0]).components;
 assert.equal((await d.call(handler,'GET','founder',null,{}, {'x-project-token':''})).code,403);
 assert.equal((await d.call(handler,'GET','founder')).body.map.features.length,0);
 assert.equal((await d.call(handler,'PUT','member-a',{map,revision:0})).code,403);
 const saved=await d.call(handler,'PUT','founder',{map,revision:0});assert.equal(saved.code,200,JSON.stringify(saved.body));assert.equal(saved.body.revision,1);
 assert.equal((await d.call(handler,'PUT','founder',{map,revision:0})).code,409);
 const change={featureId:'villa-411',componentId:'item-0',progress:47,revision:1,projectRevision:5};
 assert.equal((await d.call(handler,'PATCH','member-a',change)).code,200);
 assert.equal((await d.call(handler,'PATCH','member-b',change)).code,409);
 const loaded=(await d.call(handler,'GET','member-a')).body;assert.equal(loaded.catalog[0].items[0].progress,47);assert.equal(loaded.projectRevision,6);assert.equal(loaded.cadReady,false);
 assert.equal((await d.call(handler,'PATCH','member-a',{featureId:'villa-412',componentId:'part-0',progress:100,revision:1})).code,403);
 assert.equal((await d.call(handler,'POST','founder',{action:'upload-start',name:'site.dwg',size:10})).code,200);
 const proxied=[];const uploader=createSiteMapHandler({...d.deps,config:()=>({url:'https://worker.test',key:'fixture'}),fetch:async(url,opts)=>{proxied.push(JSON.parse(opts.body));return Response.json({ok:true});}});
 for(const size of [40_000_001,250_000_000,250_000_001]){
  const result=await d.call(uploader,'POST','founder',{action:'upload-start',name:'file.DWG',size});
  assert.equal(result.code,size===250_000_001?413:200);
 }
 assert.deepEqual(proxied.map(p=>p.size),[40_000_001,250_000_000]);
 const [stored]=await d.sql`SELECT state FROM cephepro_project_state WHERE project_key='main'`;assert.equal(stored.state.cp_daily_entries['A_Villa 411__Concrete'][0].userId,'member-b');
 const bad=structuredClone(map);bad.features[0].modelId='00000000-0000-0000-0000-000000000000';assert.equal((await d.call(handler,'PUT','founder',{map:bad,revision:1})).code,400);
});
