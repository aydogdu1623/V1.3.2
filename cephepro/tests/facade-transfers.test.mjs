import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/test-db.mjs';
import {createStateHandler} from '../api/state.js';

test('copy and rename retain all authors daily records, quantities and grouping through PostgreSQL reloads',async t=>{
 const h=await database(t),handler=createStateHandler(h.deps);
 const source={items:[['Glass',100,15,15,'','',0,100,'m²']],groupName:'Villas 104'};
 const state={cp_dynamic_data:{A:{North:source}},cp_daily_entries:{A_North__Glass:[{id:'daily-admin',userId:'admin-a',value:5,includedInBase:true},{id:'daily-member',userId:'member-a',value:10,includedInBase:true}]},cp_deficiencies:[{id:'defect-original',userId:'member-a',block:'A',facade:'North',item:'Glass',date:'2026-11-15',description:'Fix',listId:'defect-original'}]};
 await h.sql`UPDATE cephepro_project_state SET state=${JSON.stringify(state)}::jsonb WHERE project_key='main'`;
 const copy=structuredClone(state);copy.cp_dynamic_data.A.Copy={...structuredClone(source),facadeTransfer:{from:'North',mode:'copy'}};
 copy.cp_daily_entries.A_Copy__Glass=structuredClone(state.cp_daily_entries.A_North__Glass);
 let r=await h.call(handler,'PUT','admin-a',{state:copy});assert.equal(r.code,200);assert.equal(r.body.corrected,true);
 const loaded=(await h.call(handler,'GET','admin-a')).body.state;
 assert.equal(loaded.cp_dynamic_data.A.Copy.items[0][2],15);assert.equal(loaded.cp_dynamic_data.A.Copy.groupName,'Villas 104');assert.equal(loaded.cp_dynamic_data.A.Copy.facadeTransfer,undefined);
 assert.deepEqual(loaded.cp_daily_entries.A_Copy__Glass.map(x=>x.userId),['admin-a','member-a']);assert.notEqual(loaded.cp_daily_entries.A_Copy__Glass[0].id,'daily-admin');
 const rename=structuredClone(loaded);rename.cp_dynamic_data.A.Renamed={...rename.cp_dynamic_data.A.North,facadeTransfer:{from:'North',mode:'rename'}};delete rename.cp_dynamic_data.A.North;
 rename.cp_daily_entries.A_Renamed__Glass=rename.cp_daily_entries.A_North__Glass;delete rename.cp_daily_entries.A_North__Glass;
 r=await h.call(handler,'PUT','admin-a',{state:rename});assert.equal(r.code,200);
 const final=(await h.call(handler,'GET','admin-a')).body.state;
 assert.equal(final.cp_daily_entries.A_North__Glass,undefined);assert.equal(final.cp_daily_entries.A_Renamed__Glass.length,2);assert.equal(final.cp_dynamic_data.A.Renamed.items[0][2],15);assert.equal(final.cp_deficiencies[0].facade,'Renamed');
 r=await h.call(handler,'PUT','admin-a',{state:final});assert.equal(r.code,200);assert.equal((await h.call(handler,'GET','admin-a')).body.state.cp_daily_entries.A_Renamed__Glass.length,2);
 const attempt=structuredClone(final);attempt.cp_dynamic_data.A.Illegal={...source,facadeTransfer:{from:'Renamed',mode:'copy'}};
 await h.call(handler,'PUT','member-a',{state:attempt});assert.equal((await h.call(handler,'GET','admin-a')).body.state.cp_dynamic_data.A.Illegal,undefined);
});
