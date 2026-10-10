import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=name=>fs.readFileSync(new URL('../assets/'+name,import.meta.url),'utf8');
const warning='Yetkiniz yetersiz. Sadece adminler geçiş yapabilir.';
test('restricted payroll tabs stay visible and warn members; downgrade closes salary views',async t=>{
 const dom=new JSDOM('<html><body><button id="layoutManagerBtn"></button></body></html>',{url:'https://example.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());const messages=[];
 w.currentUser={id:'member',role:'member'};w.toast=w.showToast=m=>messages.push(m);w.localStorage.setItem('cp_cloud_token','TEST');w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(source('puantaj-model.js'));const data=w.PuantajModel.blank(2026);data.employees=[{id:'p',serial:'P1',name:'Synthetic',title:'',tc:'',iban:'TR000000000000000000000000',base:30000,raise1:0,raise2:0,raise1Month:0,raise2Month:0,start:'2026-01-01',end:''}];
 w.fetch=async()=>new Response(JSON.stringify({data,revision:1,versions:[],uploads:[],canManage:w.currentUser.role==='admin'}));w.eval(source('puantaj.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 await w.document.getElementById('puantajBtn').onclick();
 for(const tab of ['dashboard','bank','receipt']){const b=w.document.getElementById('pt-tab-'+tab);assert.equal(b.hidden,false);b.click();assert.equal(messages.at(-1),warning);assert.equal(w.document.getElementById('pt-tab-monthly').getAttribute('aria-selected'),'true');}
 assert.doesNotMatch(w.document.getElementById('pt-content').textContent,/30.000|BANK|Net Ödeme/);
 w.document.getElementById('pt-tab-personnel').click();w.document.querySelector('[data-edit]').click();assert.equal(w.document.querySelector('[name=base]'),null);
 w.currentUser.role='admin';w.document.dispatchEvent(new w.Event('cephepro:user-ready'));await w.document.getElementById('puantajBtn').onclick();w.document.getElementById('pt-tab-bank').click();assert.match(w.document.getElementById('pt-content').textContent,/TR000000/);
 w.currentUser.role='member';w.document.dispatchEvent(new w.Event('cephepro:user-ready'));assert.equal(w.document.getElementById('pt-tab-monthly').getAttribute('aria-selected'),'true');assert.doesNotMatch(w.document.getElementById('pt-content').textContent,/TR000000|30.000/);
});
test('both claim choices remain visible but members cannot open an editor or load claims',async t=>{
 const dom=new JSDOM('<html><body><div id="settingsModal"><div class="settings-tabs"></div><section id="settingsReport"></section></div></body></html>',{url:'https://example.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let requests=0;const messages=[];
 w.currentUser={id:'member',role:'member'};w.toast=w.showToast=m=>messages.push(m);w.fetch=async()=>{requests++;return new Response('{}');};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.eval(source('claims-v182.js'));
 assert.equal(w.document.getElementById('cl-tab').hidden,false);await w.__claims190.open();
 for(const id of ['cl-firma','cl-taseron']){const button=w.document.getElementById(id);assert.equal(button.hidden,false);button.click();assert.equal(messages.at(-1),warning);assert.equal(w.document.getElementById('cl-editor-dialog').open,false);}
 assert.equal(requests,0);
});

test('daily activity supports round row selection, select-all, clear and opening selected packets',async t=>{
 const dom=new JSDOM('<html><body><div id="v113ActivityList"></div></body></html>',{url:'https://example.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');w.eval(html.match(/<script id="v177ActivityPackets">([\s\S]*?)<\/script>/)[1]);
 const root=w.document.getElementById('v113ActivityList'),now=new Date().toISOString(),expiry=new Date(Date.now()+60000).toISOString();
 const data={currentUserId:'member',serverTime:now,activities:['a','b'].map(id=>({id,user_id:id,user_name:'User '+id,created_at:now,expires_at:expiry,details:{item:'Test',amount:1}}))};w.__v177Activity.render(root,data);
 const check=root.querySelector('[data-activity-check]');assert.ok(check.classList.contains('v102-check'));check.click();assert.equal(root.querySelector('[data-activity-all]').indeterminate,true);
 root.querySelector('[data-activity-all]').click();assert.equal(root.querySelectorAll('[data-activity-check]:checked').length,2);root.querySelector('[data-activity-open]').click();assert.equal(w.document.querySelectorAll('.v178-activity-panel').length,2);
 root.querySelector('[data-activity-clear]').click();assert.equal(root.querySelectorAll('[data-activity-check]:checked').length,0);
 root.querySelector('[data-activity-all]').click();w.__v177Activity.render(root,{...data,activities:data.activities.slice(1)});assert.equal(root.querySelectorAll('[data-activity-check]:checked').length,1);
 w.__v177Activity.render(root,{...data,currentUserId:'different'});assert.equal(root.querySelectorAll('[data-activity-check]:checked').length,0);
});

test('member cloud picker selects only permitted uploads and can clear the batch',async t=>{
 const dom=new JSDOM('<html><body><div id="v113ActivityList"></div></body></html>',{url:'https://example.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.currentUser={id:'member',role:'member'};w.toast=()=>{};w.localStorage.setItem('cp_cloud_token','TEST');
 w.fetch=async()=>new Response(JSON.stringify({canDeleteMany:true,currentUserId:'member',uploads:[{user_id:'member',user_name:'Member',work_date:'2026-10-10',count:1,canDelete:true},{user_id:'member',user_name:'Member',work_date:'2026-10-09',count:2,canDelete:true},{user_id:'other',user_name:'Other',work_date:'2026-10-10',count:1,canDelete:false}]}));w.eval(source('claims-v182.js'));await w.__activity187.deletePanel();
 w.document.querySelector('[data-upload-all]').click();assert.equal(w.document.querySelectorAll('[data-upload]:checked').length,2);assert.equal(w.document.querySelector('[data-upload="2"]').checked,false);
 w.document.getElementById('cl-upload-clear').click();assert.equal(w.document.querySelectorAll('[data-upload]:checked').length,0);assert.equal(w.document.getElementById('cl-delete-selected').disabled,true);
});

test('payroll activity bulk selection excludes protected rows and submits only authorized visible IDs',async t=>{
 const dom=new JSDOM('<html><body><button id="layoutManagerBtn"></button></body></html>',{url:'https://example.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let deleted;
 w.currentUser={id:'member',role:'member'};w.localStorage.setItem('cp_cloud_token','TEST');w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(source('puantaj-model.js'));const date='2026-10-10',activities=['1','2','3'].map(id=>({id,user_id:id==='3'?'other':'member',user_name:'Synthetic',role:'member',canDelete:id!=='3',created_at:date,details:{workDate:date,workingCount:2}}));
 w.fetch=async(url,init)=>{if(init?.method==='DELETE'){deleted=JSON.parse(init.body);return new Response('{"deleted":2}');}return new Response(JSON.stringify(String(url).includes('view=activity')?{activities}:{data:null,revision:0,uploads:[],versions:[]}));};
 w.eval(source('puantaj.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await w.document.getElementById('puantajBtn').onclick();w.document.getElementById('pt-tab-activity').click();await new Promise(r=>setTimeout(r,0));
 w.document.querySelector('[data-upload-all]').click();assert.equal(w.document.querySelectorAll('[data-upload-check]:checked').length,2);assert.equal(w.document.querySelector('[data-upload-check="3"]').disabled,true);
 w.document.querySelector('[data-action="clear-uploads"]').click();assert.equal(w.document.querySelectorAll('[data-upload-check]:checked').length,0);
 w.document.querySelector('[data-upload-all]').click();w.document.querySelector('[data-action="delete-uploads"]').click();await new Promise(r=>setTimeout(r,0));assert.deepEqual(deleted.ids,['1','2']);
});
