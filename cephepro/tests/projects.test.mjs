import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {database} from './helpers/test-db.mjs';
import {createProjectsHandler} from '../lib/projects-service.js';
import {createStateHandler} from '../api/state.js';
import {createFinanceHandler} from '../api/finance.js';
import {createClaimsHandler} from '../api/claims.js';
import {createPhotosHandler} from '../api/photos.js';
import {createActivityHandler} from '../api/activity.js';
import {createPuantajHandler} from '../lib/puantaj-service.js';
import {createAuthHandler} from '../api/auth.js';
import {passwordHash,tokenHash} from '../lib/authutil.js';
const credentials={name:'İkinci Şantiye',companyCode:'FIRMA1',projectCode:'PROJE2',password:'SYNTHETIC-second'};
async function second(d,user='founder'){
 const h=createProjectsHandler(d.deps);const created=await d.call(h,'POST',user,{action:'create',...credentials});assert.equal(created.code,201,JSON.stringify(created.body));
 const opened=await d.call(h,'POST',user,{action:'unlock',...credentials});assert.equal(opened.code,200);d.projectTokens[user]=opened.body.token;return {id:created.body.id,h};
}
test('account login alone cannot access or modify any project API, even as founder',async t=>{
 const d=await database(t);
 for(const factory of [createStateHandler,createFinanceHandler,createClaimsHandler,createPhotosHandler,createActivityHandler,createPuantajHandler]){
  for(const method of ['GET','PUT','DELETE']){
   const result=await d.call(factory(d.deps),method,'founder',{}, {year:'2026'}, {'x-project-token':''});
   assert.ok([403,405].includes(result.code),`${factory.name} ${method} ${result.code}`);if(result.code===403)assert.equal(result.body.code,'PROJECT_LOCKED');
  }
 }
 const users=await d.call(createAuthHandler(d.deps),'POST','founder',{action:'list'},{},{'x-project-token':''});assert.equal(users.code,403);
});
test('project CRUD validates permissions, stores only salted hashes and invalidates access on password change/delete',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps);
 assert.equal((await d.call(h,'POST','member-a',{action:'create',...credentials})).code,403);
 assert.equal((await d.call(h,'POST','founder',{action:'create',...credentials,password:'short'})).code,400);
 const {id}=await second(d);const [stored]=await d.sql`SELECT * FROM cephepro_projects WHERE project_key=${id}`;
 assert.notEqual(stored.password_hash,credentials.password);assert.equal(stored.password_hash,passwordHash(credentials.password,stored.password_salt));
 let list=(await d.call(h,'GET','member-a')).body;assert.equal(list.projects.length,1);assert.equal(list.activeProject.id,'main');
 const wrong=await d.call(h,'POST','member-a',{action:'unlock',...credentials,password:'wrong'});assert.equal(wrong.code,403);
 const unlocked=await d.call(h,'POST','member-a',{action:'unlock',...credentials});assert.equal(unlocked.code,200);d.projectTokens['member-a']=unlocked.body.token;
 list=(await d.call(h,'GET','member-a')).body;assert.equal(list.projects.length,1);assert.equal(list.selectedCompany,'FIRMA1');assert.deepEqual(list.companies,['FIRMA1','TEST']);assert.ok(!JSON.stringify(list).includes(stored.password_hash));assert.ok(!JSON.stringify(list).includes('password_salt'));
 assert.equal((await d.call(h,'POST','admin-a',{action:'edit',id,name:'Forged',...credentials})).code,403);
 const changed=await d.call(h,'POST','founder',{action:'password',id,currentPassword:credentials.password,password:'SYNTHETIC-new'});assert.equal(changed.code,200);
 assert.equal((await d.call(createStateHandler(d.deps),'GET','member-a')).code,403);
 assert.equal((await d.call(h,'POST','member-a',{action:'unlock',...credentials})).code,403);
 const reopen=await d.call(h,'POST','founder',{action:'unlock',...credentials,password:'SYNTHETIC-new'});d.projectTokens.founder=reopen.body.token;
 assert.equal((await d.call(h,'POST','founder',{action:'delete',id})).code,200);
 assert.equal((await d.call(createStateHandler(d.deps),'GET','founder')).code,403);
 assert.equal((await d.call(h,'POST','member-a',{action:'unlock',...credentials,password:'SYNTHETIC-new'})).code,403);
 assert.equal((await d.call(h,'POST','founder',{action:'restore',id})).code,200);
 assert.equal((await d.call(h,'POST','founder',{action:'unlock',...credentials,password:'SYNTHETIC-new'})).code,200);
});
test('all data stores isolate identical owners, dates, years and photo IDs across projects',async t=>{
 const d=await database(t),state=createStateHandler(d.deps),finance=createFinanceHandler(d.deps),claims=createClaimsHandler(d.deps),photos=createPhotosHandler(d.deps),activity=createActivityHandler(d.deps),puantaj=createPuantajHandler(d.deps);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const data={year:Number(day.slice(0,4)),employees:[],entries:{},months:{}};
 // Use the model's canonical empty payroll shape.
 const payroll=globalThis.PuantajModel.blank(data.year);
 const put=async(label)=>{
  assert.equal((await d.call(state,'PUT','founder',{state:{cp_project_info:{projectName:label},cp_dynamic_data:{},cp_daily_entries:{}}})).code,200);
  assert.equal((await d.call(finance,'PUT','founder',{data:{price:label==='MAIN'?11:22}})).code,200);
  assert.equal((await d.call(claims,'PUT','founder',{revision:0,data:{marker:label},share:true})).code,200);
  assert.equal((await d.call(photos,'POST','founder',{action:'upsert',photoId:'same-id',facadeKey:'A1',photo:{id:'same-id',marker:label}})).code,200);
  assert.equal((await d.call(puantaj,'PUT','founder',{data:payroll,revision:0,workDate:day})).code,200);
  const a=await d.call(activity,'POST','founder',{actionType:'publish_daily_snapshot',workDate:day,records:[{id:'one',block:'A',facade:'C',item:label,amount:1,enteredAt:new Date().toISOString(),unit:'m²',workDate:day}]});assert.equal(a.code,200,JSON.stringify(a.body));
 };
 await put('MAIN');const oldToken=d.projectTokens.founder;const {id,h}=await second(d);
 assert.equal((await d.call(state,'GET','founder')).body.revision,0);
 assert.deepEqual((await d.call(finance,'GET','founder')).body.data,{});
 assert.deepEqual((await d.call(claims,'GET','founder')).body.data,{});
 assert.deepEqual((await d.call(photos,'GET','founder')).body.photos,[]);
 assert.equal((await d.call(puantaj,'GET','founder',null,{year:String(data.year)})).body.data,null);
 assert.deepEqual((await d.call(activity,'GET','founder',null,{view:'uploads'})).body.uploads,[]);
 await put('SECOND');
 assert.equal((await d.call(state,'GET','founder',null,{}, {'x-project-token':oldToken})).code,403);
 const open=await d.call(h,'POST','founder',{action:'unlock',companyCode:'TEST',projectCode:'MAIN',password:'SYNTHETIC-project'});d.projectTokens.founder=open.body.token;
 assert.equal((await d.call(state,'GET','founder')).body.state.cp_project_info.projectName,'MAIN');
 assert.equal((await d.call(finance,'GET','founder')).body.data.price,11);
 assert.equal((await d.call(claims,'GET','founder')).body.data.marker,'MAIN');
 assert.equal((await d.call(photos,'GET','founder')).body.photos[0].photo.marker,'MAIN');
 assert.equal((await d.call(activity,'GET','founder',null,{view:'uploads'})).body.uploads.length,1);
 const pp=await d.sql`SELECT project_key,revision FROM cephepro_puantaj WHERE owner_id='founder'`;assert.equal(pp.length,2);assert.ok(pp.every(row=>row.revision===1));
 await d.call(activity,'DELETE','founder',{scope:'all'});assert.equal((await d.sql`SELECT * FROM cephepro_daily_activity_snapshots WHERE project_key=${id}`).length,1);
 await d.call(photos,'POST','founder',{action:'delete',photoId:'same-id'});assert.equal((await d.sql`SELECT * FROM cephepro_photos WHERE project_key=${id}`).length,1);
});
test('grants bind to the account session and expire; guessed passwords are rate limited',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps),state=createStateHandler(d.deps);
 assert.equal((await d.call(state,'GET','member-a',null,{}, {'x-project-token':d.projectTokens.founder})).code,403);
 await d.sql`UPDATE cephepro_project_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${tokenHash(d.projectTokens.founder)}`;
 assert.equal((await d.call(state,'GET','founder')).code,403);
 for(let i=0;i<10;i++)assert.equal((await d.call(h,'POST','founder',{action:'unlock',companyCode:'NONE',projectCode:'NONE',password:'bad'})).code,403);
 assert.equal((await d.call(h,'POST','founder',{action:'unlock',companyCode:'TEST',projectCode:'MAIN',password:'SYNTHETIC-project'})).code,429);
});
test('existing main data stays locked until founder setup, and additive migration is repeatable',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps);
 await d.sql`UPDATE cephepro_projects SET company_code=null,project_code=null,password_hash=null,password_salt=null WHERE project_key='main'`;
 await d.sql`UPDATE cephepro_project_state SET state='{"cp_project_info":{"projectName":"EXISTING"}}'::jsonb,revision=5 WHERE project_key='main'`;
 assert.equal((await d.call(createStateHandler(d.deps),'GET','founder')).code,403);
 assert.equal((await d.call(h,'POST','admin-a',{action:'setup',id:'main',...credentials})).code,403);
 assert.equal((await d.call(h,'POST','founder',{action:'setup',id:'main',...credentials})).code,200);
 const access=await d.call(h,'POST','founder',{action:'unlock',...credentials});d.projectTokens.founder=access.body.token;
 const state=(await d.call(createStateHandler(d.deps),'GET','founder')).body;assert.equal(state.revision,5);assert.equal(state.state.cp_project_info.projectName,'EXISTING');
 const source=fs.readFileSync(new URL('../lib/schema.js',import.meta.url),'utf8');await vm.runInNewContext(source.slice(source.indexOf('async function initializeSchema'))+';initializeSchema(sql)',{sql:d.sql});
 assert.equal((await d.call(createStateHandler(d.deps),'GET','founder')).body.revision,5);
});

test('founder recovery remains valid after another admin changes passwords and never authorizes other accounts',async t=>{
 const d=await database(t),salt='1234567890abcdef1234567890abcdef',key='SYNTHETIC-founder-recovery';
 const h=createProjectsHandler({...d.deps,recoverySecret:()=>salt+':'+passwordHash(key,salt)});
 const {id}=await second(d,'admin-a');
 assert.equal((await d.call(h,'POST','admin-a',{action:'password',id,currentPassword:credentials.password,password:'SYNTHETIC-changed-by-admin'})).code,200);
 const unlock={action:'unlock',...credentials,password:key};
 for(const person of ['admin-a','admin-b','member-a'])assert.equal((await d.call(h,'POST',person,{...unlock,isFounder:true,email:'aydogdu1623@gmail.com'})).code,403);
 assert.equal((await d.call(h,'POST','unknown',unlock)).code,401);
 assert.equal((await d.call(h,'POST','founder',{...unlock,projectCode:'WRONG'})).code,403);
 let opened=await d.call(h,'POST','founder',unlock);assert.equal(opened.code,200);d.projectTokens.founder=opened.body.token;
 assert.equal((await d.call(createStateHandler(d.deps),'GET','founder')).code,200);
 assert.equal((await d.call(h,'POST','founder',{action:'password',id,currentPassword:key,password:'SYNTHETIC-changed-again'})).code,200);
 assert.equal((await d.call(h,'POST','founder',unlock)).code,200);
 assert.equal((await d.call(h,'POST','founder',{action:'unlock',companyCode:'TEST',projectCode:'MAIN',password:key})).code,200);
 for(const badSecret of [undefined,'malformed']){
  const noRecovery=createProjectsHandler({...d.deps,recoverySecret:()=>badSecret});
  assert.equal((await d.call(noRecovery,'POST','founder',unlock)).code,403);
 }
 assert.equal((await d.call(h,'POST','founder',{action:'delete',id},{},{'x-project-token':''})).code,200);
 assert.equal((await d.call(h,'POST','founder',unlock)).code,403);
});
test('locked project deletion is limited to founder or owning admin and revokes access without losing stored data',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps),{id}=await second(d,'admin-a');
 await d.sql`UPDATE cephepro_project_state SET state='{"marker":"PRESERVED"}'::jsonb WHERE project_key=${id}`;
 const noGrant={'x-project-token':''};
 for(const person of ['member-a','admin-b'])assert.equal((await d.call(h,'POST',person,{action:'delete',id},{},noGrant)).code,403);
 assert.equal((await d.call(h,'POST','admin-a',{action:'delete',id},{},noGrant)).code,200);
 assert.equal((await d.call(createStateHandler(d.deps),'GET','admin-a')).code,403);
 assert.equal((await d.call(createStateHandler(d.deps),'GET','founder')).code,200);
 assert.equal((await d.sql`SELECT state FROM cephepro_project_state WHERE project_key=${id}`)[0].state.marker,'PRESERVED');
 assert.equal((await d.call(h,'POST','founder',{action:'restore',id},{},noGrant)).code,200);
 assert.equal((await d.call(h,'POST','founder',{action:'delete',id},{},noGrant)).code,200);
 const list=(await d.call(h,'GET','founder',null,{companyCode:'FIRMA1'})).body.projects;assert.ok(list.find(p=>p.id===id).deletedAt);
});

test('duplicate project codes create independent projects with visible automatic codes, including deleted and concurrent duplicates',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps),body={action:'create',...credentials};
 const first=await d.call(h,'POST','founder',body);assert.equal(first.code,201);assert.equal(first.body.project.projectCode,'PROJE2');assert.equal(first.body.codeAdjusted,false);
 const second=await d.call(h,'POST','founder',body);assert.equal(second.code,201);assert.equal(second.body.project.projectCode,'PROJE2_2');assert.equal(second.body.codeAdjusted,true);
 assert.notEqual(first.body.id,second.body.id);
 await d.call(h,'POST','founder',{action:'delete',id:first.body.id});
 const concurrent=await Promise.all([d.call(h,'POST','founder',body),d.call(h,'POST','founder',body)]);assert.ok(concurrent.every(r=>r.code===201));
 const codes=new Set([first,second,...concurrent].map(r=>r.body.project.projectCode));assert.equal(codes.size,4);
 for(const response of [second,...concurrent]){
  const id=response.body.id;
  assert.equal((await d.sql`SELECT * FROM cephepro_project_state WHERE project_key=${id}`).length,1);
  assert.equal((await d.sql`SELECT * FROM cephepro_financial_state WHERE project_key=${id}`).length,1);
  assert.equal((await d.sql`SELECT * FROM cephepro_project_members WHERE project_key=${id}`).length,1);
  assert.equal((await d.call(h,'POST','founder',{action:'unlock',...credentials,projectCode:response.body.project.projectCode})).code,200);
 }
 const another=await d.call(h,'POST','founder',{...body,companyCode:'ANOTHER'});assert.equal(another.body.project.projectCode,'PROJE2');assert.equal(another.body.codeAdjusted,false);
 const long={...body,projectCode:'X'.repeat(40)};await d.call(h,'POST','founder',long);const duplicate=await d.call(h,'POST','founder',long);assert.equal(duplicate.code,201);assert.equal(duplicate.body.project.projectCode.length,40);assert.ok(duplicate.body.project.projectCode.endsWith('_2'));
});
test('company directory shows all sibling projects only after authorized company access, while project data stays locked',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps);
 for(const companyCode of ['FIRMA_A','FIRMA_B'])for(let i=1;i<=4;i++)assert.equal((await d.call(h,'POST','founder',{action:'create',...credentials,companyCode,projectCode:'PROJE_'+i})).code,201);
 assert.equal((await d.call(h,'GET','member-a',null,{companyCode:'FIRMA_B'})).code,403);
 const open=async companyCode=>{const r=await d.call(h,'POST','member-a',{action:'unlock',companyCode,projectCode:'PROJE_1',password:credentials.password});assert.equal(r.code,200);d.projectTokens['member-a']=r.body.token;};
 await open('FIRMA_A');let list=(await d.call(h,'GET','member-a')).body;assert.equal(list.selectedCompany,'FIRMA_A');assert.equal(list.projects.length,4);assert.ok(list.projects.every(p=>p.companyCode==='FIRMA_A'&&!p.canManage));assert.ok(!list.companies.includes('FIRMA_B'));
 const sibling=list.projects.find(p=>!p.unlocked);assert.equal((await d.call(createStateHandler(d.deps),'GET','member-a',null,{projectId:sibling.id},{'x-project-token':''})).code,403);
 assert.equal((await d.call(h,'POST','member-a',{action:'unlock',companyCode:'FIRMA_B',projectCode:'PROJE_1',password:'wrong'})).code,403);
 assert.equal((await d.call(h,'GET','member-a',null,{companyCode:'FIRMA_B'})).code,403);
 await open('FIRMA_B');list=(await d.call(h,'GET','member-a')).body;assert.equal(list.selectedCompany,'FIRMA_B');assert.equal(list.projects.length,4);assert.ok(list.projects.every(p=>p.companyCode==='FIRMA_B'));assert.ok(list.companies.includes('FIRMA_A'));
 const selected=(await d.call(h,'GET','member-a',null,{companyCode:'FIRMA_A'})).body;assert.equal(selected.projects.length,4);assert.equal(selected.activeProject.companyCode,'FIRMA_B');assert.equal(selected.selectedCompany,'FIRMA_A');
 const b2=list.projects.find(p=>p.projectCode==='PROJE_2');await d.call(h,'POST','founder',{action:'delete',id:b2.id});assert.equal((await d.call(h,'GET','member-a')).body.projects.length,3);
});

test('legacy production singleton id reproduces the create error; migration preserves rows and allows many projects',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps);
 await d.sql`ALTER TABLE cephepro_project_state ADD COLUMN id integer NOT NULL DEFAULT 1`;
 await d.sql`ALTER TABLE cephepro_project_state DROP CONSTRAINT cephepro_project_state_pkey`;
 await d.sql`ALTER TABLE cephepro_project_state ADD PRIMARY KEY(id)`;
 await d.sql`ALTER TABLE cephepro_project_state ADD UNIQUE(project_key)`;
 await d.sql`UPDATE cephepro_project_state SET state='{"marker":"KEEP"}'::jsonb,revision=190 WHERE project_key='main'`;
 const failed=await d.call(h,'POST','founder',{action:'create',...credentials});assert.equal(failed.code,503);assert.doesNotMatch(failed.body.error,/kod başka/);
 const migration=fs.readFileSync(new URL('../migrations/216-legacy-project-id.sql',import.meta.url),'utf8');await d.db.exec(migration);await d.db.exec(migration);
 for(const companyCode of ['SAME_COMPANY','OTHER_COMPANY'])for(const projectCode of ['PROJECT_1','PROJECT_2'])assert.equal((await d.call(h,'POST','founder',{action:'create',...credentials,companyCode,projectCode})).code,201);
 const rows=await d.sql`SELECT id,project_key,state,revision FROM cephepro_project_state`;
 assert.equal(rows.length,5);assert.equal(new Set(rows.map(r=>r.id)).size,5);const main=rows.find(r=>r.project_key==='main');assert.equal(main.id,1);assert.equal(main.state.marker,'KEEP');assert.equal(Number(main.revision),190);
 const schema=fs.readFileSync(new URL('../lib/schema.js',import.meta.url),'utf8');await vm.runInNewContext(schema.slice(schema.indexOf('async function initializeSchema'))+';initializeSchema(sql)',{sql:d.sql});
 assert.equal((await d.call(h,'POST','founder',{action:'create',...credentials})).code,201);
});
test('permanent deletion requires trash, managing role and typed code, removes only target data and never recreates main',async t=>{
 const d=await database(t),h=createProjectsHandler(d.deps),{id}=await second(d,'admin-a');
 assert.equal((await d.call(h,'POST','admin-a',{action:'purge',id,confirmProjectCode:credentials.projectCode})).code,409);
 await d.call(h,'POST','admin-a',{action:'delete',id});
 for(const person of ['member-a','admin-b'])assert.equal((await d.call(h,'POST',person,{action:'purge',id,confirmProjectCode:credentials.projectCode})).code,403);
 assert.equal((await d.call(h,'POST','admin-a',{action:'purge',id,confirmProjectCode:'WRONG'})).code,400);
 assert.equal((await d.call(h,'POST','admin-a',{action:'purge',id,confirmProjectCode:credentials.projectCode})).code,200);
 for(const table of ['cephepro_projects','cephepro_project_state','cephepro_financial_state','cephepro_project_members','cephepro_project_sessions']){
  assert.equal((await d.db.query('SELECT * FROM '+table+' WHERE project_key=$1',[id])).rows.length,0);
  assert.ok((await d.db.query('SELECT * FROM '+table+" WHERE project_key='main'")).rows.length>0);
 }
 assert.equal((await d.call(h,'POST','admin-a',{action:'restore',id})).code,403);
 await d.call(h,'POST','founder',{action:'delete',id:'main'});assert.equal((await d.call(h,'POST','founder',{action:'purge',id:'main',confirmProjectCode:'MAIN'})).code,200);
 const source=fs.readFileSync(new URL('../lib/schema.js',import.meta.url),'utf8');await vm.runInNewContext(source.slice(source.indexOf('async function initializeSchema'))+';initializeSchema(sql)',{sql:d.sql});
 for(const table of ['cephepro_projects','cephepro_project_state','cephepro_financial_state'])assert.equal((await d.db.query('SELECT * FROM '+table+" WHERE project_key='main'")).rows.length,0);
 assert.equal((await d.call(h,'POST','founder',{action:'create',...credentials,companyCode:'TEST',projectCode:'MAIN'})).code,201);
});
