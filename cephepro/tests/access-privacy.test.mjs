import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {database} from './helpers/test-db.mjs';
import {createActivityHandler} from '../api/activity.js';
import {createAuthHandler} from '../api/auth.js';
import {publicProjectState} from '../api/state.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('daily cloud deletion allows founder/all, admin/own+members, member/own only',async t=>{
 const h=await database(t),handler=createActivityHandler(h.deps),ids=['founder','admin-a','admin-b','member-a','member-b'];
 for(const id of ids)await h.sql`INSERT INTO cephepro_daily_activity_snapshots(user_id,work_date,user_name,username,role,records,expires_at) SELECT id,'2026-01-02'::date,name,username,role,'[]'::jsonb,now()+interval '48 hours' FROM cephepro_users WHERE id=${id}`;
 const del=(user,target)=>h.call(handler,'DELETE',user,{scope:'one',userId:target,workDate:'2026-01-02',isFounder:true});
 assert.equal((await del('','member-a')).code,401);
 assert.equal((await del('member-a','member-b')).code,403);
 assert.equal((await del('admin-a','admin-b')).code,403);assert.equal((await del('admin-a','founder')).code,403);
 assert.equal((await h.call(handler,'DELETE','admin-a',{scope:'selected',uploads:[{userId:'member-a',workDate:'2026-01-02'},{userId:'founder',workDate:'2026-01-02'}]})).code,403);
 assert.equal((await h.call(handler,'GET','member-a',null,{view:'uploads'})).body.uploads.length,1);
 assert.equal((await del('member-a','member-a')).body.deleted,1);
 assert.equal((await del('admin-a','member-b')).body.deleted,1);
 assert.equal((await del('admin-a','admin-a')).body.deleted,1);
 assert.equal((await h.call(handler,'DELETE','member-b',{scope:'all'})).code,403);
 assert.equal((await h.call(handler,'DELETE','founder',{scope:'all'})).body.deleted,2);
});
test('anonymous and newly registered accounts cannot retrieve founder profile or user lists',async t=>{
 const h=await database(t),handler=createAuthHandler(h.deps);
 assert.equal((await h.call(handler,'POST','',{action:'list'})).code,401);
 assert.equal((await h.call(handler,'POST','member-a',{action:'list'})).code,403);
 const registration=await h.call(handler,'POST','',{action:'register',name:'New User',username:'new-user',email:'new-user@example.invalid',password:'new-test-password'});
 assert.equal(registration.code,202);assert.equal(registration.body.pending,true);assert.equal(registration.body.token,undefined);
 assert.equal(registration.body.user.name,'New User');assert.doesNotMatch(JSON.stringify(registration.body),/PRIVATE-founder|User founder|aydogdu1623/);
 const own=await h.call(handler,'POST','member-a',{action:'me'});assert.equal(own.body.user.id,'member-a');assert.equal(own.body.user.profileData.phone,'PRIVATE-member-a');assert.doesNotMatch(JSON.stringify(own.body),/PRIVATE-founder/);
 const list=await h.call(handler,'POST','admin-a',{action:'list'});assert.equal(list.code,200);assert.equal(list.body.users.find(x=>x.id==='founder').profileData,undefined);
});
test('project responses use an explicit allowlist and cannot carry account, token, or payroll caches',()=>{
 const input={cp_dynamic_data:{A:{}},cp_project_info:{projectName:'Test'},cp_users:[{name:'PRIVATE-founder'}],cp_user_profiles:{secret:1},cp_session:{token:'secret'},cp_cloud_token:'secret',cp_puantaj_saved:{salary:30000},cp_unknown_private:'secret'};
 const out=publicProjectState(input);assert.deepEqual(Object.keys(out),['cp_dynamic_data','cp_project_info']);assert.doesNotMatch(JSON.stringify(out),/secret|salary|PRIVATE/);assert.ok(input.cp_users);
});
test('login hides cached identity and remains locked until a verified session is ready',()=>{
 const style=html.match(/<style id="cp-session-privacy">([\s\S]*?)<\/style>/)[1];
 const dom=new JSDOM(`<!doctype html><html><head><style>${style}</style></head><body><div id="authScreen"><input id="loginUser"><div id="rememberedProfileArea"><span id="rememberedUsername">PRIVATE-founder</span><span id="rememberedEmail">private@example.invalid</span><span id="rememberedAvatar">P</span></div><datalist id="loginSuggestions"></datalist></div><div class="app">PRIVATE-project</div></body></html>`,{url:'https://privacy.test/',runScripts:'outside-only'}),w=dom.window;
 for(const key of ['cp_users','cp_user_profiles','cp_session','cp_remembered_account','cp_last_login_id'])w.localStorage.setItem(key,JSON.stringify({name:'PRIVATE-founder'}));
 w.eval(fs.readFileSync(new URL('../assets/session-privacy.js',import.meta.url),'utf8'));
 const api=w.CepheProPrivacy;assert.equal(w.document.documentElement.dataset.cpAuth,'locked');assert.equal(w.getComputedStyle(w.document.querySelector('.app')).display,'none');assert.equal(w.document.getElementById('rememberedEmail').textContent,'');assert.equal(w.localStorage.getItem('cp_users'),null);
 api.ready({id:'member-a'});assert.equal(api.isReady(),false);
 w.localStorage.setItem('cp_cloud_token','synthetic');api.accept({id:'member-a'});api.ready({id:'founder'});assert.equal(api.isReady(),false);api.ready({id:'member-a'});assert.equal(api.isReady(),true);
 api.lock();assert.equal(api.isReady(),false);assert.equal(w.getComputedStyle(w.document.querySelector('.app')).display,'none');dom.window.close();
});
