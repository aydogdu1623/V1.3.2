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
