import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const draftSource=section('let v53WorkDraft=null;','// Quick work item button gets final route.');
const renameSource=section('function v25RenameItemData(','function v25MovePrefix(');
const financeSource=html.match(/<script id="v169FinancialProgressScript">([\s\S]*?)<\/script>/)[1];
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

async function harness(t,items=[]){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<div id="v32WorkModal"><div class="modal"><div class="panel-body"><h2 id="v32WorkTitle"></h2><div id="v32WorkBody"></div></div></div></div>',{url:'https://work-items.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,run=source=>vm.runInContext(source,dom.getInternalVMContext());t.after(()=>{w.close();assert.deepEqual(errors,[])});
  run(`
    var DATA={A:{North:{items:[]}}},dailyEntries={},facadeOverrides={},saved=null,notices=[];
    var selectedManageBlock='A',selectedManageFacade='North',currentBlock='A',currentFacade='North';
    var currentUser={id:'synthetic-owner',role:'admin'},V34_UNITS=['m²','adet'];
    var store={set(){}};
    function v32EnsureWorkModal(){}
    function v34Today(){return '2026-10-06'}
    function v34AddDays(){return '2026-11-05'}
    function v34ItemUnit(row){return row[8]||'m²'}
    function v34ItemKey(b,f,name){return b+'_'+f+'__'+name}
    var v25ItemKey=v34ItemKey;
    function v25EffectiveItem(b,f,row){const result=[...row];result[2]+= (dailyEntries[v34ItemKey(b,f,row[0])]||[]).reduce((sum,e)=>sum+e.value,0);return result}
    function saveStructureState(){saved=JSON.parse(JSON.stringify(DATA))}
    function renderFacade(){}
    function rebuildTree(){}
    function v53Saved(){}
    function v45BindAllSmartNumbers(){}
    function toast(message){notices.push(message)}
  `);
  w.DATA.A.North.items=JSON.parse(JSON.stringify(items));
  const priceKey=name=>'A|North|'+encodeURIComponent(name);
  const prices=Object.fromEntries(items.map(row=>[priceKey(row[0]),150]));
  w.localStorage.setItem('cp_cloud_token','synthetic-test-token');
  w.fetch=async()=>({ok:true,json:async()=>({data:prices,revision:1})});
  run(renameSource);run(draftSource);run(financeSource);
  run('v32RenderWorkItems()');await w.__v169Financial.load();await tick();
  const $=selector=>w.document.querySelector(selector);
  const input=(selector,value)=>{const el=$(selector);assert.ok(el,selector);el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const click=selector=>$(selector).click();
  const reopen=async()=>{run('v53WorkDraft=null;v32RenderWorkItems()');await tick();};
  return {w,$,input,click,reopen,priceKey};
}

test('Poz No saves separately, displays with the name, and survives a reload',async t=>{
  const h=await harness(t);h.click('#v34AddWorkItem');await tick();
  assert.equal(h.$('.v209WiPoz').nextElementSibling.className,'v34WiName');
  h.input('.v209WiPoz',' W1 ');h.input('.v34WiName','ANKRAJ MONTAJI');
  h.input('.v34WiTotal',100);h.input('.v169-unit-price',150);h.click('#v53SaveWorkItems');await tick();
  assert.equal(h.w.saved.A.North.items[0][0],'W1 - ANKRAJ MONTAJI');
  assert.equal(h.w.saved.A.North.items[0][10],'W1');
  h.w.DATA=JSON.parse(JSON.stringify(h.w.saved));await h.reopen();
  assert.equal(h.$('.v209WiPoz').value,'W1');assert.equal(h.$('.v34WiName').value,'ANKRAJ MONTAJI');
  assert.equal(h.$('.v169-unit-price').value,'150');
});

test('adding or changing a position number preserves daily quantities and unit prices',async t=>{
  const h=await harness(t,[['ANKRAJ - İLAVE',100,20,20,'2026-10-01','2026-11-01',30,100,'m²',false]]);
  h.w.dailyEntries['A_North__ANKRAJ - İLAVE']=[{date:'2026-10-02',value:5}];await h.reopen();
  assert.equal(h.$('.v209WiPoz').value,'');assert.equal(h.$('.v34WiName').value,'ANKRAJ - İLAVE');
  h.input('.v209WiPoz','W1');h.click('#v34AddWorkItem');await tick();
  assert.equal(h.$('.v169-unit-price').value,'150','price remains after the form rerenders');
  h.click('#v53SaveWorkItems');await tick();
  assert.equal(h.w.DATA.A.North.items.length,1);assert.equal(h.w.DATA.A.North.items[0][2],20);
  assert.equal(h.w.dailyEntries['A_North__W1 - ANKRAJ - İLAVE'][0].value,5);
  assert.equal(h.w.dailyEntries['A_North__ANKRAJ - İLAVE'],undefined);
  assert.equal(h.w.__v169Financial.unitWeight('A','North','W1 - ANKRAJ - İLAVE'),150);
  await h.reopen();h.input('.v209WiPoz','W2');h.click('#v53SaveWorkItems');await tick();
  assert.equal(h.w.DATA.A.North.items[0][0],'W2 - ANKRAJ - İLAVE');
  assert.equal(h.w.dailyEntries['A_North__W2 - ANKRAJ - İLAVE'][0].value,5);
  assert.equal(h.w.__v169Financial.unitWeight('A','North','W2 - ANKRAJ - İLAVE'),150);
});

test('a position number without a work item name cannot replace saved data',async t=>{
  const h=await harness(t);h.click('#v34AddWorkItem');await tick();h.input('.v209WiPoz','W1');h.click('#v53SaveWorkItems');
  assert.equal(h.w.saved,null);assert.match(h.w.notices.at(-1),/iş kalemi adını/);
});

test('distinct position numbers allow the same description, duplicate complete labels are rejected',async t=>{
  const h=await harness(t,[['W1 - ANKRAJ MONTAJI',100,0,0,'','',0,50,'m²',false,'W1']]);
  h.click('#v34AddWorkItem');await tick();h.input('.v209WiPoz[data-i="1"]','W2');h.input('.v34WiName[data-i="1"]','ANKRAJ MONTAJI');h.click('#v53SaveWorkItems');await tick();
  assert.equal(h.w.DATA.A.North.items.length,2);await h.reopen();
  const before=JSON.stringify(h.w.DATA),pricesBefore=JSON.stringify(h.w.__v169Financial.data);h.input('.v209WiPoz[data-i="1"]','W1');h.click('#v53SaveWorkItems');
  assert.equal(JSON.stringify(h.w.DATA),before);assert.match(h.w.notices.at(-1),/Aynı isimde/);
  assert.equal(JSON.stringify(h.w.__v169Financial.data),pricesBefore);
});
