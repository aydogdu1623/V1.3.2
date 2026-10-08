import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/puantaj-model.js';
import '../assets/puantaj-formulas.js';
import {database} from './helpers/test-db.mjs';
import {createPuantajHandler} from '../lib/puantaj-service.js';
const M=globalThis.PuantajModel,F=globalThis.PuantajFormula;
const person=(v={})=>({id:'person-1',serial:'T-001',name:'Deneme Personeli',title:'Test',tc:'',iban:'',base:30000,raise1:45000,raise1Month:4,raise2:52000,raise2Month:7,start:'2026-01-01',end:'',...v});
const record=()=>({...M.blank(2026),employees:[person()]});
test('salary switches at both raise boundaries',()=>{const p=person();assert.equal(M.salary(p,3),30000);assert.equal(M.salary(p,4),45000);assert.equal(M.salary(p,6),45000);assert.equal(M.salary(p,7),52000);assert.equal(M.salary(person({raise1:0,raise1Month:0,raise2:0,raise2Month:0}),12),30000);});
test('calendar respects dates, leap days, holidays and overrides',()=>{const d=record(),p=d.employees[0];assert.equal(M.dayCode(d,p,1,1),'RT');assert.equal(M.dayCode(d,p,1,4),'HT');assert.equal(M.dayCode(d,p,2,29),'-');p.start='2026-01-15';assert.equal(M.dayCode(d,p,1,14),'-');d.entries['1:person-1']={codes:{16:'Üİ'},hours:{},advance:0};assert.equal(M.dayCode(d,p,1,16),'Üİ');p.end='2026-01-20';assert.equal(M.dayCode(d,p,1,21),'-');assert.equal(M.active({...p,start:'',end:''},2028,2,29),true);});
test('net, overtime, premium and unpaid match supplied workbook rules',()=>{const d=record(),p=d.employees[0];d.entries['4:person-1']={codes:{5:'PM',6:'Üİ'},hours:{7:2},advance:1500};const r=M.calc(d,p,4);assert.equal(r.base,45000);assert.equal(r.prorated,45000);assert.equal(r.overtime,600);assert.equal(r.premium,2250);assert.equal(r.unpaid,1500);assert.equal(r.net,44850);assert.ok(Math.abs(r.gross-46350/0.7149)<1e-8);});
test('invalid duplicate personnel, dates and overtime are rejected',()=>{const d=record();M.validate(d);d.employees.push(person({id:'person-2'}));assert.throws(()=>M.validate(d),/benzersiz/);d.employees.pop();d.employees[0].start='2026-02-30';assert.throws(()=>M.validate(d));d.employees[0].start='2026-01-01';d.entries['1:person-1']={codes:{},hours:{1:25},advance:0};assert.throws(()=>M.validate(d),/mesai/);});
test('formula interpreter handles lazy branches, Turkish references and lookups',()=>{const e=F.engine({'Personel':{A1:{value:'A'},B1:{value:42000}},'Şubat':{A1:{formula:'IFERROR(1/0,12)'},A2:{formula:'IF(FALSE,1/0,VLOOKUP("A",Personel!A1:B1,2,FALSE))'},A3:{formula:'INDIRECT("Şubat!A1")+ROUND(1.235,2)'},A4:{formula:'DAY(DATE(2028,3,0))'}}});assert.equal(e.cell('Şubat','A1'),12);assert.equal(e.cell('Şubat','A2'),42000);assert.equal(e.cell('Şubat','A3'),13.24);assert.equal(e.cell('Şubat','A4'),29);});
async function harness(t){
 const h=await database(t),handler=createPuantajHandler(h.deps);
 return {...h,call:(method,user,body,query)=>h.call(handler,method,user,body,query)};
}
test('PostgreSQL save keeps payroll private while exposing only permitted upload summaries',async t=>{
 const h=await harness(t);
 assert.equal((await h.call('GET','')).code,401);
 const first=await h.call('PUT','member-a',{ownerId:'admin-a',userName:'FAKE',data:record(),revision:0,workDate:'2026-01-02'});assert.equal(first.code,200);
 assert.equal(first.body.upload.user_name,'User member-a');assert.equal(first.body.upload.details.employeeCount,1);assert.equal(first.body.upload.details.workingCount,1);
 assert.equal((await h.call('GET','admin-a')).body.data,null);assert.equal((await h.call('GET','member-a')).body.data.employees[0].name,'Deneme Personeli');
 assert.equal((await h.call('PUT','member-a',{data:record(),revision:0,workDate:'2026-01-02'})).code,409);
 assert.equal((await h.call('PUT','admin-b',{data:record(),revision:5,workDate:'2026-01-02'})).code,409);
 const admin=await h.call('GET','admin-a',null,{year:'2026',view:'uploads'});assert.equal(admin.body.uploads.length,1);assert.equal(admin.body.uploads[0].canDelete,true);assert.ok(!JSON.stringify(admin.body).includes('Deneme Personeli'));assert.ok(!JSON.stringify(admin.body).includes('30000'));
 assert.equal((await h.call('GET','member-b',null,{year:'2026',view:'uploads'})).body.uploads.length,0);
 await h.db.exec("ALTER TABLE cephepro_activity_log ADD CONSTRAINT fail_test CHECK (username <> 'member-a') NOT VALID");
 assert.equal((await h.call('PUT','member-a',{data:record(),revision:1,workDate:'2026-01-02'})).code,503);
 const saved=await h.call('GET','member-a');assert.equal(saved.body.revision,1);assert.equal(saved.body.uploads.length,1);
});
test('upload history paginates by global ID and isolates member records and years',async t=>{
 const h=await harness(t);for(let n=0;n<52;n++)assert.equal((await h.call('PUT','member-a',{data:record(),revision:n,workDate:'2026-01-02'})).code,200);
 const first=await h.call('GET','member-a',null,{year:'2026',view:'uploads'});assert.equal(first.body.uploads.length,50);assert.equal(first.body.nextBefore,'3');
 const rest=await h.call('GET','member-a',null,{year:'2026',view:'uploads',before:first.body.nextBefore});assert.deepEqual(rest.body.uploads.map(x=>x.details.revision),[2,1]);assert.equal(rest.body.nextBefore,null);
 assert.equal((await h.call('GET','member-a',null,{year:'2026',view:'uploads',before:'oops'})).code,400);
 assert.equal((await h.call('GET','member-a',null,{year:'2027',view:'uploads'})).body.uploads.length,0);
});
test('Puantaj deletion role matrix is enforced atomically using current database roles',async t=>{
 const h=await harness(t),ids={};
 for(const u of ['founder','admin-a','admin-b','member-a','member-b'])ids[u]=(await h.call('PUT',u,{data:record(),revision:0,workDate:'2026-01-02'})).body.upload.id;
 const del=(u,owners)=>h.call('DELETE',u,{ids:owners.map(x=>ids[x]),role:'admin',isFounder:true});
 assert.equal((await del('member-a',['member-b'])).code,403);
 assert.equal((await del('admin-a',['founder'])).code,403);assert.equal((await del('admin-a',['admin-b'])).code,403);
 assert.equal((await del('admin-a',['member-a','founder'])).code,403);
 assert.equal((await h.call('GET','member-a',null,{year:'2026',view:'uploads'})).body.uploads.length,1);
 assert.equal((await del('member-a',['member-a'])).body.deleted,1);
 assert.equal((await del('admin-a',['member-b'])).body.deleted,1);
 assert.equal((await del('admin-a',['admin-a'])).body.deleted,1);
 assert.equal((await del('founder',['founder','admin-b'])).body.deleted,2);
 assert.equal((await h.call('GET','founder',null,{year:'2026',view:'uploads'})).body.uploads.length,0);
 assert.equal((await h.call('GET','member-a')).body.data.employees.length,1);
 assert.equal((await h.db.query('SELECT count(*)::int n FROM cephepro_activity_log WHERE deleted_at IS NOT NULL')).rows[0].n,5);
});
test('daily headcount counts work codes, respects employment dates, and shows latest upload per user/day',async t=>{
 const h=await harness(t),d=record();
 d.employees=[person(),person({id:'absent',serial:'T-002'}),person({id:'late',serial:'T-003',start:'2026-04-10'}),person({id:'sunday',serial:'T-004'})];
 d.entries={'4:person-1':{codes:{5:'PM'},hours:{},advance:0},'4:absent':{codes:{5:'R'},hours:{},advance:0}};
 let r=await h.call('PUT','member-a',{data:d,revision:0,workDate:'2026-04-05'});assert.equal(r.body.upload.details.workingCount,1);
 d.entries['4:absent'].codes[5]='BM';r=await h.call('PUT','member-a',{data:d,revision:1,workDate:'2026-04-05'});assert.equal(r.body.upload.details.workingCount,2);
 const a=await h.call('GET','admin-a',null,{year:'2026',view:'activity',date:'2026-04-05'});assert.equal(a.body.activities.length,1);assert.equal(a.body.activities[0].details.workingCount,2);
 assert.equal((await h.call('GET','member-b',null,{year:'2026',view:'activity',date:'2026-04-05'})).body.activities.length,0);
 assert.equal((await h.call('GET','admin-a',null,{year:'2026',view:'activity',date:'2026-02-30'})).code,400);
 assert.equal((await h.call('PUT','member-a',{data:d,revision:2,workDate:'2100-01-01'})).code,400);
});
