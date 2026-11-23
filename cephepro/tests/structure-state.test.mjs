import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {database} from './helpers/test-db.mjs';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../assets/structure-state.js',import.meta.url),'utf8'),ctx);const S=ctx.CepheProStructure;
test('facade order survives an actual JSONB round trip and subsequent moves',async t=>{
 const {sql}=await database(t);
 let data={C:{'94 & 451':{items:[]},'102 & 437':{items:[]},'92 & 453':{items:[]}}};
 S.capture(data);
 let [row]=await sql`SELECT ${JSON.stringify(data)}::jsonb AS value`;
 S.restore(row.value);assert.deepEqual(Object.keys(row.value.C),Object.keys(data.C));
 data={C:Object.fromEntries(['92 & 453','94 & 451','102 & 437'].map(k=>[k,row.value.C[k]]))};S.capture(data);
 [row]=await sql`SELECT ${JSON.stringify(data)}::jsonb AS value`;S.restore(row.value);
 assert.deepEqual(Object.keys(row.value.C),['92 & 453','94 & 451','102 & 437']);
});
test('repeated facade schedule edits synchronize all rows without changing quantities or actual dates',()=>{
 const row=['W1',100,25,25,'2026-11-09','2026-12-09',31,100,'m²'];
 const d={C:{F:{items:[row],schedule:{plannedStart:'2026-11-17',plannedEnd:'2027-04-15',plannedDuration:150,actualStart:'2026-11-18'}}}};
 S.sync(d);assert.deepEqual(row.slice(4,7),['2026-11-17','2027-04-15',150]);
 d.C.F.schedule.plannedStart='2026-12-01';d.C.F.schedule.plannedEnd='2027-04-29';S.capture(d);
 assert.deepEqual(row.slice(4,7),['2026-12-01','2027-04-29',150]);assert.deepEqual(row.slice(0,4),['W1',100,25,25]);assert.equal(d.C.F.schedule.actualStart,'2026-11-18');
});

test('natural insertion recognizes mixed separators, numeric segments and Turkish letters without renaming or undoing manual order',()=>{
 const data={C:{}};
 for(const name of ['92 & 405','92 % 403','A10','A2','Ç1','C1']){data.C[name]={items:[]};S.placeNewFacade(data,'C',name);}
 assert.deepEqual(Object.keys(data.C),['92 % 403','92 & 405','A2','A10','C1','Ç1']);
 assert.equal(S.compareNames('92 & 403','92 % 403'),0);
 S.moveFacade(data,'C','A10',-1);const manual=Object.keys(data.C);
 data.C['A11']={items:[]};S.placeNewFacade(data,'C','A11');
 assert.deepEqual(Object.keys(data.C).filter(n=>n!=='A11'),manual);
 S.capture(data);S.restore(data);assert.deepEqual(Object.keys(data.C).filter(n=>n!=='A11'),manual);
});

test('grouped and ungrouped moves stay among siblings and persist through JSONB',async t=>{
 const {sql}=await database(t);
 const names=['F2','U1','F10','G1','F20','U2'];
 const data={C:Object.fromEntries(names.map(name=>[name,{items:[],groupName:name.startsWith('F')?'F':name==='G1'?'G':''}]))};
 const original=data.C.F20;
 assert.equal(S.moveFacade(data,'C','F20',-1),true);assert.equal(data.C.F20,original);
 assert.deepEqual(Object.keys(data.C),['F2','U1','F20','G1','F10','U2']);
 assert.equal(S.moveFacade(data,'C','F2',-1),false);assert.equal(S.moveFacade(data,'C','F10',1),false);
 assert.equal(S.moveFacade(data,'C','U2',-1),true);
 const expected=['F2','U2','F20','G1','F10','U1'];assert.deepEqual(Object.keys(data.C),expected);
 S.capture(data);const [row]=await sql`SELECT ${JSON.stringify(data)}::jsonb AS value`;S.restore(row.value);
 assert.deepEqual(Object.keys(row.value.C),expected);
 assert.equal(row.value.C.F20.groupName,'F');assert.equal(S.moveFacade(data,'C','missing',-1),false);
});
