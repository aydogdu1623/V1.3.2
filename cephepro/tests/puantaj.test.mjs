import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/puantaj-model.js';
import '../assets/puantaj-formulas.js';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
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
 const db=new PGlite();t.after(()=>db.close());
 const schema=fs.readFileSync(new URL('../lib/schema.js',import.meta.url),'utf8').match(/CREATE TABLE IF NOT EXISTS cephepro_activity_log \([\s\S]*?\)`/)[0].slice(0,-1);
 await db.exec(schema);
 const sql=async(strings,...values)=>{const q=strings.reduce((out,part,i)=>out+part+(i<values.length?'$'+(i+1):''),'');return (await db.query(q,values)).rows;};
 const handler=createPuantajHandler({getSql:()=>sql,noStore:()=>true,bearer:r=>r.headers.authorization,sessionUser:async(_,token)=>token==='member'?{id:'member',role:'member'}:token?{id:token,name:'Admin '+token,username:token,role:'admin'}:null});
 return {db,async call(method,token,body,query={year:'2026'}){const res={status(s){this.code=s;return this;},json(v){this.body=v;return this;},end(){return this;}};await handler({method,headers:{authorization:token},body,query},res);return res;}};
}
test('PostgreSQL save and upload log are atomic, owner scoped, and revision protected',async t=>{
 const h=await harness(t);
 assert.equal((await h.call('GET','')).code,401);assert.equal((await h.call('PUT','member',{data:record(),revision:0})).code,403);
 const first=await h.call('PUT','owner-a',{ownerId:'owner-b',userName:'FAKE',data:record(),revision:0});assert.equal(first.code,200);
 assert.equal(first.body.upload.user_name,'Admin owner-a');assert.equal(first.body.upload.details.employeeCount,1);assert.equal(first.body.upload.details.revision,1);
 assert.equal((await h.call('GET','owner-b')).body.data,null);assert.equal((await h.call('GET','owner-a')).body.data.employees[0].name,'Deneme Personeli');assert.equal((await h.call('GET','owner-a',null,{year:'2027'})).body.data,null);
 assert.equal((await h.call('PUT','owner-a',{data:record(),revision:0})).code,409);assert.equal((await h.call('PUT','new-owner',{data:record(),revision:5})).code,409);
 assert.equal((await h.call('PUT','owner-a',{data:record(),revision:1})).body.revision,2);
 const history=await h.call('GET','owner-a',null,{year:'2026',view:'uploads',ownerId:'owner-b'});assert.equal(history.body.uploads.length,2);assert.deepEqual(history.body.uploads.map(x=>x.details.revision),[2,1]);
 assert.equal((await h.call('GET','owner-b',null,{year:'2026',view:'uploads',ownerId:'owner-a'})).body.uploads.length,0);assert.equal((await h.call('GET','member',null,{year:'2026',view:'uploads'})).code,403);
 // A log insert failure rolls back the data write too.
 await h.db.exec("ALTER TABLE cephepro_activity_log ADD CONSTRAINT fail_test CHECK (username <> 'owner-a') NOT VALID");
 const failed=await h.call('PUT','owner-a',{data:record(),revision:2});assert.equal(failed.code,503);
 const saved=await h.call('GET','owner-a');assert.equal(saved.body.revision,2);assert.equal(saved.body.uploads.length,2);
});
test('upload history paginates without losing older records and validates its cursor',async t=>{
 const h=await harness(t);for(let n=0;n<52;n++){const r=await h.call('PUT','owner-a',{data:record(),revision:n});assert.equal(r.code,200);}
 const first=await h.call('GET','owner-a',null,{year:'2026',view:'uploads'});assert.equal(first.body.uploads.length,50);assert.equal(first.body.nextBefore,3);
 const rest=await h.call('GET','owner-a',null,{year:'2026',view:'uploads',before:3});assert.deepEqual(rest.body.uploads.map(x=>x.details.revision),[2,1]);assert.equal(rest.body.nextBefore,null);
 assert.equal((await h.call('GET','owner-a',null,{year:'2026',view:'uploads',before:'oops'})).code,400);
 assert.equal((await h.call('GET','owner-a',null,{year:'2027',view:'uploads'})).body.uploads.length,0);
});
