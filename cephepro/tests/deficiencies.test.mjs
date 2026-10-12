import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {database} from './helpers/test-db.mjs';
import {createStateHandler} from '../api/state.js';
import {mergeDeficiencies} from '../lib/deficiencies.js';
const raw=(name,poz)=>[name,100,0,0,'','',0,0,'adet',false,poz];
const dynamic={A:{Kuzey:{items:[raw('ANKRAJ','W1'),raw('CAM','W2')]},Guney:{items:[raw('CAM','W2')]}}};
const record=(id='entry-0001',userId='member-a',props={})=>({id,userId,date:'2026-10-11',block:'A',facade:'Kuzey',item:'ANKRAJ',description:'Vida eksik',...props});
test('deficiencies validate work items and dates, stamp identity, and never overwrite existing entries',()=>{
 const user={id:'member-a',name:'Test member'},one=mergeDeficiencies([], [record()],user,dynamic);
 assert.equal(one[0].pozNo,'W1');assert.equal(one[0].user,'Test member');assert.equal(one[0].listId,'entry-0001');
 const stale=mergeDeficiencies(one,[record('entry-0001','member-a',{description:'changed'}),record('entry-0002','other')],user,dynamic);
 assert.equal(stale.length,1);assert.equal(stale[0].description,'Vida eksik');
 for(const props of [{date:'2026-02-30'},{item:'NOT IN PROJECT'},{description:''},{description:'x'.repeat(2001)},{listId:'<invalid>'}])assert.throws(()=>mergeDeficiencies([], [record('entry-0002','member-a',props)],user,dynamic),/geçersiz/);
});
test('two users can append from stale snapshots; records persist in protected project state',async t=>{
 const h=await database(t),handler=createStateHandler(h.deps);
 await h.sql`UPDATE cephepro_project_state SET state=${JSON.stringify({cp_dynamic_data:dynamic})}::jsonb WHERE project_key='main'`;
 const a=await h.call(handler,'PUT','member-a',{state:{cp_deficiencies:[record()]}});assert.equal(a.code,200);
 const b=await h.call(handler,'PUT','member-b',{state:{cp_deficiencies:[record('entry-0002','member-b',{item:'CAM',user:'Spoofed'})]}});assert.equal(b.code,200);
 const data=await h.call(handler,'GET','admin-a');assert.equal(data.body.state.cp_deficiencies.length,2);assert.equal(data.body.state.cp_deficiencies[1].user,'User member-b');
 await h.call(handler,'PUT','admin-a',{state:{cp_deficiencies:[]}});
 assert.equal((await h.call(handler,'GET','member-a')).body.state.cp_deficiencies.length,2);
 assert.equal((await h.call(handler,'GET','')).code,401);
 assert.equal((await h.call(handler,'GET','member-a',null,{}, {'x-project-token':'invalid'})).code,403);
 const bad=await h.call(handler,'PUT','member-a',{state:{cp_deficiencies:[record('entry-0003','member-a',{item:'unknown'})]}});assert.equal(bad.code,400);
});
test('UI adds multiple items and explanations, reloads saved entries, filters all reports and clears on lock',t=>{
 const dom=new JSDOM('<div class="v105-daily-titlebar"><button id="v34NoWorkBtn">Çalışma Olmadı</button></div>',{url:'https://deficiencies.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 let saved=[],project='p1';const messages=[];
 Object.assign(w,{DATA:structuredClone(dynamic),currentBlock:'A',currentFacade:'Kuzey',currentUser:{id:'member-a',name:'Test',role:'member'},store:{get:(_,d)=>saved.length?saved:d,set:(_,value)=>{saved=structuredClone(value);}},toast:m=>messages.push(m),v34Today:()=> '2026-10-11',CepheProProjects:{isReady:()=>true,project:()=>({id:project})},v52SelectedFacades:()=>[['A','Kuzey']],v52ReportDates:()=>({start:'2026-10-01',end:'2026-10-31'}),v52ReportState:{items:new Set(['A|Kuzey|ANKRAJ','A|Kuzey|CAM'])},v52ItemKey:(b,f,i)=>[b,f,i].join('|')});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync(new URL('../assets/deficiencies.js',import.meta.url),'utf8'));
 const $=id=>w.document.getElementById(id);assert.equal($('v34NoWorkBtn').previousElementSibling.id,'cpDeficienciesBtn');$('cpDeficienciesBtn').click();
 $('cpDefSave').click();assert.equal(saved.length,0);assert.match(messages.at(-1),/iş kalemi/);
 let group=$('cpDefRows').firstElementChild;group.querySelectorAll('input').forEach(el=>el.checked=true);group.querySelector('textarea').value='Montaj eksik <script>danger</script>';
 $('cpDefAdd').click();group=$('cpDefRows').lastElementChild;group.querySelector('.cp-def-items input').checked=true;group.querySelector('textarea').value='İkinci eksik';$('cpDefSave').click();
 assert.equal(saved.length,3);assert.equal(new Set(saved.map(r=>r.id)).size,3);assert.equal(new Set(saved.map(r=>r.listId)).size,1);assert.equal($('cpDefSave').hidden,true);assert.equal($('cpDefNew').hidden,false);$('cpDefSave').click();assert.equal(saved.length,3);assert.equal($('cpDefHistory').querySelector('script'),null);
 $('cpDefHistoryDetails').open=true;$('cpDefHistoryDetails').dispatchEvent(new w.Event('toggle'));assert.equal($('cpDefHistory').querySelectorAll('[data-def-record]').length,3);assert.equal($('cpDefHistory').querySelectorAll('.cp-def-saved-list').length,1);
 $('cpDefNew').click();assert.equal($('cpDefRows').children.length,1);assert.equal($('cpDefRows').querySelector('textarea').value,'');assert.equal($('cpDefSave').hidden,false);
 assert.equal(w.CepheProDeficiencies.report().rows.length,3);w.v52ReportState.items.delete('A|Kuzey|CAM');assert.equal(w.CepheProDeficiencies.report().rows.length,2);
 w.v52ReportDates=()=>({start:'2026-10-12'});assert.equal(w.CepheProDeficiencies.report().rows.length,0);
 group=$('cpDefRows').firstElementChild;group.querySelector('.cp-def-items input').checked=true;group.querySelector('textarea').value='Yeni liste';$('cpDefSave').click();assert.equal(saved.length,4);assert.notEqual(saved[3].listId,saved[0].listId);
 $('cpDefClose').click();$('cpDeficienciesBtn').click();assert.equal($('cpDefCount').textContent,'Kayıtlı Eksikler (4)');
 project='p2';$('cpDefSave').click();assert.equal(saved.length,4);assert.match(messages.at(-1),/Proje erişiminizi/);
 w.document.dispatchEvent(new w.Event('cephepro:locked'));assert.equal($('cpDefDialog'),null);
});

test('deletion enforces current owner roles, is atomic, preserves project state and cannot be undone by stale uploads',async t=>{
 const h=await database(t),handler=createStateHandler(h.deps);
 const all=['founder','admin-a','admin-b','member-a','member-b'].map((id,i)=>record('delete-000'+i,id));
 await h.sql`UPDATE cephepro_project_state SET state=${JSON.stringify({cp_dynamic_data:dynamic,cp_project_info:{company:'KEEP'},cp_deficiencies:all})}::jsonb WHERE project_key='main'`;
 const view=await h.call(handler,'GET','admin-a',null,{view:'deficiencies'});assert.equal(view.code,200);assert.deepEqual(view.body.records.map(r=>r.canDelete),[false,true,false,true,true]);
 assert.equal((await h.call(handler,'DELETE','member-a',{ids:['delete-0004']})).code,403);
 assert.equal((await h.call(handler,'DELETE','admin-a',{ids:['delete-0003','delete-0002']})).code,403);
 assert.equal((await h.call(handler,'GET','member-a',null,{view:'deficiencies'})).body.records.length,5);
 assert.equal((await h.call(handler,'DELETE','admin-a',{ids:['delete-0003']}, {},{'x-project-token':'invalid'})).code,403);
 for(const [actor,id] of [['member-a','delete-0003'],['admin-a','delete-0004'],['admin-a','delete-0001'],['founder','delete-0002'],['founder','delete-0000']]){
  const result=await h.call(handler,'DELETE',actor,{ids:[id]});assert.equal(result.code,200);assert.equal(result.body.deleted,1);
  assert.equal((await h.call(handler,'DELETE',actor,{ids:[id]})).body.deleted,0);
 }
 assert.equal((await h.call(handler,'GET','founder',null,{view:'deficiencies'})).body.records.length,0);
 assert.equal((await h.call(handler,'PUT','member-a',{state:{cp_deficiencies:all}})).code,200);
 const state=(await h.call(handler,'GET','founder')).body.state;
 assert.equal(state.cp_project_info.company,'KEEP');assert.equal(state.cp_deficiencies.length,5);assert.ok(state.cp_deficiencies.every(r=>r.deletedAt&&!r.description));
 assert.equal((await h.call(handler,'DELETE','founder',{ids:['unknown-000']})).code,404);
 assert.equal((await h.call(handler,'DELETE','founder',{ids:[]})).code,400);
});

test('saved record opens a compact pinnable viewer and authorized deletion removes it from every report',async t=>{
 const dom=new JSDOM('<button id="v34NoWorkBtn"></button>',{url:'https://deficiencies.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 let saved=[record('entry-0001','member-a',{user:'Test',pozNo:'W1',savedAt:'2026-10-11'})];let deleteCalls=0;
 Object.assign(w,{DATA:dynamic,currentBlock:'A',currentFacade:'Kuzey',currentUser:{id:'member-a'},store:{get:()=>saved,set:(_,v)=>saved=v},toast:()=>{},confirm:()=>true,CepheProProjects:{isReady:()=>true,project:()=>({id:'p'})},v52SelectedFacades:()=>[['A','Kuzey']],v52ReportDates:()=>({}),fetch:async(url,options)=>{if(options.method==='DELETE'){deleteCalls++;return {ok:true,json:async()=>({deficiencies:[{id:'entry-0001',userId:'member-a',deletedAt:'now'}]})};}return {ok:true,json:async()=>({records:saved.map(r=>({...r,canDelete:true}))})};},__v89CloudSync:{flush:async()=>true,applyDeficiencies:rows=>saved=rows}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync(new URL('../assets/deficiencies.js',import.meta.url),'utf8'));
 const $=id=>w.document.getElementById(id);$('cpDeficienciesBtn').click();$('cpDefAdd').click();
 const box=$('cpDefRows').querySelector('[data-draft-select]');box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal($('cpDefDeleteDraft').disabled,false);$('cpDefDeleteDraft').click();assert.equal($('cpDefRows').children.length,1);
 $('cpDefRows').querySelector('textarea').value='Unsaved draft';
 $('cpDefHistoryDetails').open=true;$('cpDefHistoryDetails').dispatchEvent(new w.Event('toggle'));$('cpDefHistory').querySelector('[data-def-record]').click();await new Promise(r=>setTimeout(r,0));
 assert.equal($('cpDefDialog').classList.contains('cp-def-detail'),true);assert.equal($('cpDefListBody').hidden,true);assert.equal($('cpDefDeleteSaved').disabled,false);
 $('cpDefPin').click();assert.equal($('cpDefPin').getAttribute('aria-pressed'),'true');$('cpDefPin').click();assert.equal($('cpDefPin').getAttribute('aria-pressed'),'false');
 // Pointer movement changes position, and pinning prevents a new drag.
 const head=$('cpDefDialog').querySelector('.cp-def-head');head.setPointerCapture=()=>{};
 head.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:20,clientY:20,button:0}));head.dispatchEvent(new w.MouseEvent('pointermove',{clientX:100,clientY:90}));assert.equal($('cpDefDialog').style.left,'80px');head.dispatchEvent(new w.MouseEvent('pointerup'));
 $('cpDefPin').click();head.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:0,clientY:0,button:0}));head.dispatchEvent(new w.MouseEvent('pointermove',{clientX:200,clientY:200}));assert.equal($('cpDefDialog').style.left,'80px');
 $('cpDefDeleteSaved').click();await new Promise(r=>setTimeout(r,0));assert.equal(deleteCalls,1);assert.equal(w.CepheProDeficiencies.records().length,0);assert.equal(w.CepheProDeficiencies.report().rows.length,0);assert.equal($('cpDefListBody').hidden,false);assert.equal($('cpDefRows').querySelector('textarea').value,'Unsaved draft');
});
