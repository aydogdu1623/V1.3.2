import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyMemberEdits} from '../lib/member-edits.js';
const base=()=>({cp_project_info:{name:'Project'},cp_dynamic_data:{A:{North:{items:[['Glass',100,40,40]],schedule:{plannedStart:'2026-09-01'}}}}});
test('member change adds only intended delta to latest total and is idempotent',()=>{
 const edit={id:'edit-1',type:'amount',key:'A_North__Glass',from:20,to:25};
 const once=applyMemberEdits(base(),[edit],'member');assert.equal(once.cp_dynamic_data.A.North.items[0][2],45);
 assert.equal(applyMemberEdits(once,[edit],'member').cp_dynamic_data.A.North.items[0][2],45);
 assert.deepEqual(once.cp_project_info,{name:'Project'});assert.equal(base().cp_dynamic_data.A.North.items[0][2],40);
});
test('unknown rows, invalid quantities and unauthorized edit types fail without writes',()=>{
 for(const edit of [{type:'amount',key:'unknown',from:0,to:2},{type:'amount',key:'A_North__Glass',from:0,to:101},{type:'role',to:'admin'}])
  assert.throws(()=>applyMemberEdits(base(),[{id:'x',...edit}],'member'),{status:400});
});
test('schedule conflict preserves concurrent edit; retry is safe',()=>{
 const edit={id:'s-1',type:'schedule',block:'A',facade:'North',from:{plannedStart:'2026-08-01'},to:{plannedStart:'2026-09-02'}};
 assert.throws(()=>applyMemberEdits(base(),[edit],'member'),{status:409});
 edit.from={plannedStart:'2026-09-01'};
 const changed=applyMemberEdits(base(),[edit],'member');
 assert.equal(changed.cp_dynamic_data.A.North.schedule.plannedStart,'2026-09-02');
 assert.deepEqual(applyMemberEdits(changed,[edit],'member'),changed);
});
