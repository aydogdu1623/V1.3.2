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
