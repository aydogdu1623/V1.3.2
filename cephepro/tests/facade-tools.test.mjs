import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),tick=()=>new Promise(r=>setTimeout(r,20));
function part(start,end){const i=html.indexOf(start);return html.slice(i,html.indexOf(end,i));}
async function app(t){
 const dom=new JSDOM('<div class="tree"></div><div id="v32Tree"></div><h2 id="v32FacadeHeading"></h2><p id="v32FacadeSub"></p><div id="v32FacadeContent"></div>',{url:'https://facades.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.eval(`var DATA={A:{}},currentUser={role:'admin'},selectedManageBlock='A',selectedManageFacade='104 & 434',currentBlock='A',currentFacade='104 & 434';
 var dailyEntries={},facadeOverrides={},facadePhotos={},v34NoWorkNotes={},attendanceLogs=[],saved,notices=[];
 var v53WorkDraft=null,v32RenderWorkItems=null,blockOrder=['A'],v32Tree=document.getElementById('v32Tree');
 var v32FacadeContent=document.getElementById('v32FacadeContent'),v32FacadeHeading=document.getElementById('v32FacadeHeading'),v32FacadeSub=document.getElementById('v32FacadeSub');
 var v58FacadeSelection={block:'A',selected:new Set(['104 & 434']),anchor:'104 & 434'};
 var records={};var store={set(k,v){records[k]=JSON.parse(JSON.stringify(v));},get(k,d){return records[k]===undefined?d:JSON.parse(JSON.stringify(records[k]));}};
 function toast(s){notices.push(s)}function renderFacade(){}function v34UpdateHeader(){}function savedToastOnly(){}
 function saveStructureState(){window.CepheProStructure.capture(DATA);saved=JSON.parse(JSON.stringify(DATA))}
 function v33BlockLabel(b){return b}function calculatedFacadeProgress(){return 0}
 function v32NormalizeFacadeName(s){return s.trim()}function v45UpdateFacadeSelectionUI(){}
 function v34Today(){return '2026-11-23'}function v34AddDays(){return '2027-01-06'}
 function copyFacade(){}function v58CopyFacades(){}function v45FinishFacadeRename(){}
 function v37OpenRenameBlock(b){window.renamingBlock=b;}
 function v58FacadeSelectionLabel(){return String(v58FacadeSelection.selected.size)}
 function v32RenderTree(){document.getElementById('v32Tree').innerHTML='<div class="v32-block-card"><button data-block="A">A</button></div>'}
 function rebuildTree(){const tree=document.querySelector('.tree');tree.innerHTML='<div class="tree-block"><button class="tree-block-head" data-block="A">A</button><div class="tree-facades"></div></div>';for(const f of Object.keys(DATA.A)){const n=document.createElement('div');n.className='tree-facade';const label=document.createElement('span');label.className='tree-facade-name';label.textContent=f;n.append(label);tree.querySelector('.tree-facades').append(n);}}
 `);
 w.eval(read('assets/structure-state.js'));
 w.eval(part('function v32UniqueFacadeName(', 'function v32EnsureWorkModal('));
 w.eval(part('function v25MoveFacade(', 'copyFacade=function(f){'));
 for(let i=0;i<50;i++)w.DATA.A['104 & '+(434+i*2)]={items:[['W1',100,25,25,'2026-01-01','2026-03-01',60,100,'m²',false,'W1']],schedule:{plannedStart:'2026-01-01',plannedEnd:'2026-03-01',plannedDuration:60}};
 w.eval(part('function v45UpdateBlockSelectionUI(){','// ---------------- CEPHE: çift tık isim düzenleme'));
 w.eval(part('function v58ResetFacadeSelection(', 'function v58CopyFacades('));
 w.eval(part('function v45StartFacadeRename(', 'function v45FinishFacadeRename('));
 w.eval('(function(){const esc=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");'+part('  function refreshFacadeSelectionUI(){','  // -----------------------------\n  // 5) Graph label')+'})();');
 let prices={'A|104%20%26%20434|W1':245.75},revision=1;const writes=[];
 w.localStorage.setItem('cp_cloud_token','fixture');
 w.fetch=async(url,opts={})=>{if(opts.method==='PUT'){prices=JSON.parse(opts.body).data;writes.push({...prices});revision++;}return {ok:true,json:async()=>({data:prices,revision})};};
 w.eval(html.match(/<script id="v169FinancialProgressScript">([\s\S]*?)<\/script>/)[1]);await tick();await w.__v169Financial.load();
 w.eval(read('assets/facade-tools.js'));w.v32RenderTree();w.v32RenderFacades();w.rebuildTree();
 return {w,api:w.CepheProFacadeTools,writes};
}
test('50 facades form a persistent collapsible sidebar group and can be ungrouped without deleting data',async t=>{
 const {w,api}=await app(t),names=Object.keys(w.DATA.A),before=JSON.stringify(w.DATA.A[names[0]].items);
 api.assignGroup('A',names,'Villas 104');
 assert.equal(w.document.querySelectorAll('.tree details').length,1);assert.equal(w.document.querySelector('.tree summary').textContent,'Villas 104 (50)');
 w.DATA=JSON.parse(JSON.stringify(w.saved));w.rebuildTree();assert.equal(w.document.querySelectorAll('.tree details .tree-facade').length,50);
 w.document.querySelector('.cp-manager-group summary').click();assert.equal(api.visibleNames('A').length,50);
 api.assignGroup('A',[names[0]],'');assert.equal(w.document.querySelectorAll('.tree details .tree-facade').length,49);
 assert.equal(Object.keys(w.DATA.A).length,50);assert.equal(JSON.stringify(w.DATA.A[names[0]].items),before);
 assert.equal(w.document.querySelector('#v32Tree .cp-manager-groups > .cp-manager-facade').dataset.facade,names[0]);
});
test('manager shows ungrouped facades beside expandable groups and switches selection without retaining the group filter',async t=>{
 const {w,api}=await app(t),names=Object.keys(w.DATA.A);
 api.assignGroup('A',names.slice(4),'104 NOLU BLOKLAR');
 const tree=w.document.getElementById('v32Tree'),head=tree.querySelector('.v32-block-main');
 const leaf=f=>[...tree.querySelectorAll('.cp-manager-facade')].find(node=>node.dataset.facade===f);
 const visible=()=>[...w.document.querySelectorAll('.v32-facade-row')].filter(row=>!row.hidden);
 assert.deepEqual([...tree.querySelectorAll('.cp-manager-groups > .cp-manager-facade')].map(node=>node.dataset.facade),names.slice(0,4));
 assert.equal(tree.querySelectorAll('.cp-manager-group .cp-manager-facade').length,46);
 assert.equal(tree.querySelector('.cp-manager-group').open,false);
 tree.querySelector('summary').click();assert.equal(tree.querySelector('.cp-manager-group').open,true);assert.equal(visible().length,46);
 leaf(names[10]).click();assert.equal(w.selectedManageFacade,names[10]);assert.equal(leaf(names[10]).getAttribute('aria-current'),'true');assert.equal(w.v58FacadeSelection.selected.size,1);
 leaf(names[3]).click();assert.equal(w.selectedManageFacade,names[3]);assert.equal(visible().length,50);assert.equal(leaf(names[3]).getAttribute('aria-current'),'true');
 assert.equal(leaf(names[10]).hasAttribute('aria-current'),false);
 tree.querySelector('summary').click();head.click();assert.equal(visible().length,50);assert.equal(w.document.querySelector('.cp-facade-group-filter'),null);
 assert.equal(tree.querySelector('.v32-block-main'),head,'leaf renders preserve block double-click target');
 head.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true,cancelable:true}));assert.equal(w.renamingBlock,'A');
 const row=[...w.document.querySelectorAll('.v32-facade-row')].find(row=>row.dataset.f===names[2]);row.click();assert.equal(leaf(names[2]).getAttribute('aria-current'),'true');
});
test('manager keeps repeated renders, other blocks and newly added ungrouped facades consistent',async t=>{
 const {w,api}=await app(t),names=Object.keys(w.DATA.A);
 api.assignGroup('A',names.slice(4),'104');
 w.DATA.B={'B1':{items:[],groupName:'104'},'B2':{items:[]}};w.blockOrder.push('B');w.v32RenderTree();
 for(let i=0;i<3;i++)api.managerTree();
 assert.equal(w.document.querySelectorAll('#v32Tree .cp-manager-groups').length,2);
 assert.equal(w.document.querySelectorAll('#v32Tree .cp-manager-facade').length,52);
 const bCard=[...w.document.querySelectorAll('#v32Tree .v32-block-card')].find(card=>card.querySelector('.v32-block-main').dataset.block==='B');
 bCard.querySelector('summary').click();assert.equal(w.selectedManageBlock,'B');assert.equal(w.selectedManageFacade,'B1');assert.deepEqual(Array.from(api.visibleNames('B')),['B1']);
 w.DATA.B.B3={items:[]};w.selectedManageFacade='B3';w.v32RenderFacades();
 assert.equal(w.document.querySelector('.cp-facade-group-filter'),null);
 const leaf=w.document.querySelector('#v32Tree .cp-manager-facade[data-facade="B3"]');assert.ok(leaf);assert.equal(leaf.parentElement.className,'cp-manager-groups');
 assert.equal(leaf.getAttribute('aria-current'),'true');assert.equal(bCard.querySelector('.tree-count').textContent,'3 cephe');
});
test('copy includes overrides, unit prices, quantities, schedules, notes and independent photo/deficiency records',async t=>{
 const {w,api,writes}=await app(t),key='A_104 & 434';
 w.DATA.A['104 & 434'].groupName='104';w.facadeOverrides[key+'__W1']={total:180,baseDone:25};w.dailyEntries[key+'__W1']=[{id:'day',value:5,date:'2026-01-03'}];
 w.facadePhotos[key]=[{id:'photo',src:'data:image/png;base64,test'}];w.v34NoWorkNotes[key]=[{id:'note',text:'rain'}];w.store.set('cp_deficiencies',[{id:'defect',block:'A',facade:'104 & 434',description:'glass'}]);
 const [to]=await api.copyFacades('A',['104 & 434']);const target='A_'+to;
 assert.equal(w.DATA.A[to].items[0][1],100);assert.equal(w.DATA.A[to].groupName,'104');assert.equal(w.DATA.A[to].schedule.plannedDuration,60);
 assert.equal(w.facadeOverrides[target+'__W1'].total,180);assert.equal(w.dailyEntries[target+'__W1'][0].value,5);
 assert.equal(w.__v169Financial.unitWeight('A',to,'W1'),245.75);assert.equal(writes.at(-1)['A|'+encodeURIComponent(to)+'|W1'],245.75);
 assert.notEqual(w.facadePhotos[target][0].id,'photo');assert.notEqual(w.v34NoWorkNotes[target][0].id,'note');
 const defects=w.store.get('cp_deficiencies',[]);assert.equal(defects.length,2);assert.equal(defects[1].facade,to);assert.notEqual(defects[1].id,'defect');
 w.DATA.A[to].items[0][1]=999;w.dailyEntries[target+'__W1'][0].value=99;assert.equal(w.DATA.A['104 & 434'].items[0][1],100);assert.equal(w.dailyEntries[key+'__W1'][0].value,5);
});
test('double-click enables reliable name editing; Enter moves all references and prices without reordering',async t=>{
 const {w,api}=await app(t);const input=w.document.querySelector('.v32FacadeName');
 w.facadePhotos['A_104 & 434']=[{id:'original-photo',src:'x'}];w.v34NoWorkNotes['A_104 & 434']=[{id:'note'}];
 input.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true,cancelable:true}));assert.equal(input.readOnly,false);
 const press=new w.MouseEvent('mousedown',{bubbles:true,cancelable:true});input.dispatchEvent(press);assert.equal(press.defaultPrevented,false);
 input.value='104 & 999';input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();
 assert.equal(Object.keys(w.DATA.A)[0],'104 & 999');assert.equal(w.DATA.A['104 & 434'],undefined);
 assert.equal(w.__v169Financial.unitWeight('A','104 & 999','W1'),245.75);assert.equal(w.__v169Financial.unitWeight('A','104 & 434','W1'),0);
 assert.equal(w.facadePhotos['A_104 & 999'][0].id,'original-photo');assert.equal(w.v34NoWorkNotes['A_104 & 999'][0].id,'note');
 assert.equal(await api.rename('A','104 & 999','104 & 436'),'104 & 999');
});
test('failed price persistence and member permissions do not create partial facade copies',async t=>{
 const {w,api}=await app(t),before=JSON.stringify(w.DATA);
 w.fetch=async()=>({ok:false,json:async()=>({error:'offline'})});
 await assert.rejects(()=>api.copyFacades('A',['104 & 434']),/offline/);assert.equal(JSON.stringify(w.DATA),before);
 w.currentUser.role='member';assert.equal((await api.copyFacades('A',['104 & 434'])).length,0);assert.equal(api.assignGroup('A',['104 & 434'],'x'),false);assert.equal(await api.rename('A','104 & 434','new'),'104 & 434');
});

test('each facade opens only its own work items even with a multi-selection',async t=>{
 const {w}=await app(t);w.v32OpenWorkItems=()=>{w.opened=[w.selectedManageBlock,w.selectedManageFacade];};
 w.v58FacadeSelection.selected=new w.Set(Object.keys(w.DATA.A));
 const row=[...w.document.querySelectorAll('.v32-facade-row')].find(r=>r.dataset.f==='104 & 440');
 row.querySelector('.cp-open-items').click();
 assert.deepEqual(w.opened,['A','104 & 440']);assert.equal(w.v58FacadeSelection.selected.size,1);
 assert.equal(w.document.getElementById('v32ManageItemsBtn'),null);
});

test('the actual add button and Enter insert facades in natural name order in both trees and after reload',async t=>{
 const {w}=await app(t),old=Object.keys(w.DATA.A);
 const add=(name,enter=false)=>{const input=w.document.getElementById('v32NewFacadeName');input.value=name;if(enter)input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));else w.document.getElementById('v32AddFacadeBtn').click();};
 add('92 & 405');add('92 % 403',true);add('A10');add('A2');
 const expected=['92 % 403','92 & 405',...old,'A2','A10'];
 assert.deepEqual(Object.keys(w.DATA.A),expected);
 assert.deepEqual([...w.document.querySelectorAll('#v32Tree .cp-manager-facade')].map(n=>n.dataset.facade),expected);
 assert.deepEqual([...w.document.querySelectorAll('.tree .tree-facade-name')].map(n=>n.textContent),expected);
 assert.equal(w.selectedManageFacade,'A2');assert.equal(w.DATA.A['92 % 403'].schedule.plannedDuration,45);
 // Simulate unordered server object keys, then the production restore hook.
 w.DATA.A=Object.fromEntries(Object.entries(w.saved.A).reverse());w.CepheProStructure.restore(w.DATA);w.v32RenderFacades();
 assert.deepEqual(Object.keys(w.DATA.A),expected);
});

test('grouped up/down moves use visible siblings, refresh both panels and survive save/reload',async t=>{
 const {w,api}=await app(t),names=Object.keys(w.DATA.A),members=[names[0],names[2],names[4]],other=[names[1],names[3]];
 api.assignGroup('A',members,'104');api.assignGroup('A',other,'Other');
 const summary=()=>[...w.document.querySelectorAll('.cp-manager-group')].find(n=>n.dataset.group==='104');
 summary().querySelector('summary').click();
 const up=f=>[...w.document.querySelectorAll('.v32-facade-row')].find(n=>n.dataset.f===f).querySelector('.v32UpFacade').click();
 const visible=()=>[...w.document.querySelectorAll('.v32-facade-row')].filter(n=>!n.hidden).map(n=>n.dataset.f);
 up(members[2]);const moved=[members[0],members[2],members[1]];
 assert.deepEqual(visible(),moved);assert.equal(w.currentFacade,members[2]);assert.equal(w.selectedManageFacade,members[2]);
 assert.deepEqual([...summary().querySelectorAll('.cp-manager-facade')].map(n=>n.dataset.facade),moved);
 const main=[...w.document.querySelectorAll('.tree details')].find(n=>n.querySelector('summary').textContent==='104 (3)');
 assert.deepEqual([...main.querySelectorAll('.tree-facade-name')].map(n=>n.textContent),moved);
 assert.deepEqual(Object.keys(w.DATA.A).filter(n=>w.DATA.A[n].groupName==='Other'),other);
 assert.equal(w.moveFacadeUp(members[0]),false,'first sibling cannot cross its group boundary');
 w.DATA.A=Object.fromEntries(Object.entries(w.saved.A).reverse());w.CepheProStructure.restore(w.DATA);w.v32RenderFacades();assert.deepEqual(visible(),moved);
 assert.equal(w.v25MoveFacadeDown(members[2]),true);assert.deepEqual(visible(),members);
 w.currentUser.role='member';assert.equal(w.moveFacadeUp(members[2]),false);assert.deepEqual(visible(),members);
});
