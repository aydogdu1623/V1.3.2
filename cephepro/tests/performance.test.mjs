import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import JSZip from 'jszip';
import {JSDOM,VirtualConsole} from 'jsdom';
import {database} from './helpers/test-db.mjs';
import {createStateHandler} from '../api/state.js';
import {createFinanceHandler} from '../api/finance.js';
import {logActivities,sessionUser} from '../lib/authutil.js';
const runtime=fs.readFileSync(new URL('../assets/performance.js',import.meta.url),'utf8');
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('another user update is applied without reloading, unchanged polls do not repaint and unsaved input is preserved',async t=>{
 const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="v38SaveStatus"><span id="v38SaveText"></span></div><input id="edit"><div id="v32WorkModal" style="display:grid"></div>',{url:'https://sync.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;t.after(()=>w.close());
 let rev=1,draws=0,draftDraws=0;const requests=[],cache={};
 Object.assign(w,{DATA:{},currentUser:{id:'admin-a',role:'admin'},dailyEntries:{},facadeOverrides:{},blockOrder:[],v34NoWorkNotes:{},v34ProjectInfo:{},attendanceLogs:[],v38SaveTimer:0,v53WorkDraft:null,v38EnsureSaveStatus:()=>{},v34UpdateHeader:()=>{},renderFacade:()=>draws++,rebuildTree:()=>{},renderBlockChartByType:()=>{},v32RenderWorkItems:()=>draftDraws++,v53NewDraft:(b,f)=>({b,f,dirty:false,items:w.DATA[b]?.[f]?.items||[]}),store:{get:(k,f)=>cache[k]??f,set:(k,v)=>cache[k]=v,remove:k=>delete cache[k]},v120ApiUrl:path=>path,CepheProProjects:{isVerified:()=>true,isReady:()=>true,ready:()=>{},project:()=>({id:'main'})}});
 w.fetch=async url=>{
  requests.push(url);
  const body=url.endsWith('?since='+rev)?{unchanged:true,revision:rev}:{revision:rev,state:{cp_dynamic_data:{A:{North:{items:[['Test',100,rev,rev]]}}}}};
  return {ok:true,json:async()=>body};
 };

 w.localStorage.setItem('cp_cloud_token','TEST');
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),script=html.match(/<script id="v89CloudSync">([\s\S]*?)<\/script>/)[1];
 w.eval(script.slice(0,script.indexOf('  async function fetchCloudUsers()'))+'window.cloudTest={pullState};})();');
 await w.cloudTest.pullState();assert.equal(draws,1);await w.cloudTest.pullState({bootstrap:false});assert.equal(draws,1);assert.equal(requests.at(-1),'/api/state?since=1');
 w.v53WorkDraft={b:'A',f:'North',dirty:false};rev=2;await w.cloudTest.pullState({reload:true,bootstrap:false});assert.equal(draws,2);assert.equal(draftDraws,1);assert.equal(w.v53WorkDraft.items[0][2],2);assert.equal(w.sessionStorage.getItem('cp_cloud_reload_once'),null);
 w.document.getElementById('edit').focus();rev=3;const count=requests.length;await w.cloudTest.pullState({bootstrap:false});assert.equal(requests.length,count);assert.equal(w.DATA.A.North.items[0][2],2);
 w.document.getElementById('edit').blur();w.v53WorkDraft.dirty=true;await w.cloudTest.pullState({bootstrap:false});assert.equal(requests.length,count);
 w.v53WorkDraft.dirty=false;await w.cloudTest.pullState({bootstrap:false});assert.equal(w.DATA.A.North.items[0][2],3);assert.deepEqual(errors,[]);
});
test('switching settings does not rebuild unrelated hidden reports and user tables',t=>{
 const dom=new JSDOM('<div id="settingsModal"><section id="settingsGeneral" class="settings-pane active"></section><section id="settingsReport" class="settings-pane"></section><section id="settingsUsers" class="settings-pane"></section></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let reports=0,users=0;
 Object.assign(w,{currentUser:null,currentProjectFileName:'',currentProjectName:{},renderSettingsUsers:()=>users++,populateSettingsReport:()=>reports++});
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');w.eval(html.slice(html.indexOf('function refreshSettings(){'),html.indexOf('function renderSettingsUsers(){')));
 w.refreshSettings();assert.equal(users,0);assert.equal(reports,0);
 w.document.getElementById('settingsGeneral').classList.remove('active');w.document.getElementById('settingsReport').classList.add('active');w.refreshSettings();assert.equal(reports,1);assert.equal(users,0);
});
test('revision polling omits unchanged payloads and still authenticates and isolates protected data',async t=>{
 const d=await database(t),state=createStateHandler({...d.deps,logActivities}),finance=createFinanceHandler(d.deps);
 const original={cp_dynamic_data:{A:{North:{items:[['Test',100,0,0]]}}},cp_daily_entries:{}};
 await d.sql`UPDATE cephepro_project_state SET state=${JSON.stringify(original)}::jsonb,revision=5 WHERE project_key='main'`;
 const same=await d.call(state,'GET','admin-a',null,{since:'5'});assert.deepEqual(same.body,{unchanged:true,revision:5});
 const changed=await d.call(state,'GET','admin-a',null,{since:'4'});assert.equal(changed.body.state.cp_dynamic_data.A.North.items[0][0],'Test');
 assert.equal((await d.call(state,'GET','admin-a',null,{since:'5'},{'x-project-token':''})).code,403);
 assert.ok((await d.call(state,'GET','admin-a',null,{since:'999999999999999999999'})).body.state);
 await d.call(finance,'PUT','admin-a',{data:{a:200,b:100}});
 const prices=await d.call(finance,'GET','admin-a');assert.equal(prices.body.data.a,200);
 assert.deepEqual((await d.call(finance,'GET','admin-a',null,{since:String(prices.body.revision)})).body,{unchanged:true,revision:prices.body.revision});
 assert.equal((await d.call(finance,'GET','member-a',null,{since:String(prices.body.revision)})).code,403);
 const weights=await d.call(finance,'GET','member-a',null,{view:'weights'});assert.equal(weights.body.weights.a,2/3);assert.equal(weights.body.data,undefined);
 assert.equal((await d.call(finance,'GET','member-a',null,{view:'weights',since:String(weights.body.revision)})).body.unchanged,true);
 const response=await d.call(state,'PUT','admin-a',{state:{...original,cp_dynamic_data:{A:{North:{items:[['One',10,0,0],['Two',20,0,0]]}}}}});assert.equal(response.code,200);
 const logs=await d.sql`SELECT summary FROM cephepro_activity_log WHERE project_key='main' AND action_type='project_change'`;assert.equal(logs.length,3);
 let writes=0;const counted=(parts,...values)=>{if(parts.join('').includes('UPDATE cephepro_users'))writes++;return d.sql(parts,...values);};
 await sessionUser(counted,d.sessions.founder);const initial=writes;await sessionUser(counted,d.sessions.founder);assert.equal(writes,initial,'unchanged founder checks do not repeatedly lock/write the user row');
});
test('cosmetic repair batches yield, ignore text-only edits, and keyed work coalesces',async t=>{
 const dom=new JSDOM('<body><button>Test</button></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());w.eval(runtime);const p=w.CepheProPerformance;let repair=0,tasks=0;
 p.observeElements('button',()=>repair++,'repair');for(let i=0;i<50;i++)p.background('same',()=>tasks++);
 assert.equal(repair,0);assert.equal(tasks,0);await tick(70);assert.equal(tasks,1);assert.equal(repair,1);
 for(let i=0;i<30;i++)w.document.querySelector('button').textContent=String(i);await tick(60);assert.equal(repair,1);
 w.document.body.insertAdjacentHTML('beforeend','<button>New</button>'.repeat(60));await tick(130);assert.equal(repair,61);
 assert.equal(await p.run('serialize',{},()=>'{"fallback":true}'),'{"fallback":true}');
});
test('real background worker builds both Excel formats without blocking the caller and serializes sync payloads',async t=>{
 const worker=new Worker(new URL('./helpers/browser-worker.mjs',import.meta.url));t.after(()=>worker.terminate());let seq=0;const pending=new Map();
 worker.on('message',m=>{const job=pending.get(m.id);pending.delete(m.id);m.error?job.reject(Error(m.error)):job.resolve(m.result);});
 worker.on('error',e=>{for(const job of pending.values())job.reject(e);pending.clear();});
 const run=(task,payload)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,task,payload});});
 assert.equal(await run('serialize',{state:{name:'İş kalemi'},revision:1}),'{"state":{"name":"İş kalemi"},"revision":1}');
 const row={key:'one',code:'W1',pozNo:'W1',block:'A',facade:'North',item:'ANKRAJ',unit:'adet',contractQuantity:100,contractPrice:120,quantity:11,price:120,total:100,done:30};
 const payload={selectedPeriodId:'p1',periods:[{id:'p1',number:1,month:'2026-10',snapshot:{info:{company:'Synthetic Company'},rows:[row],contractRows199:[row],firmaRows199:[row],extraRows:[],cutRows:[]}}],readOnly:true};
 let beats=0;const timer=setInterval(()=>beats++,5);t.after(()=>clearInterval(timer));
 const firma=await run('firma-excel',payload);assert.ok(beats>0);let zip=await JSZip.loadAsync(firma.bytes),xml=await zip.file('xl/worksheets/sheet2.xml').async('string');assert.match(xml,/<c\b[^>]*r="L7"[^>]*>[\s\S]*?<v>1320<\/v>/);
 const taseron=await run('taseron-excel',{...payload,templateUrl:'/assets/taseron-hakedis-template-v191.xlsx'});zip=await JSZip.loadAsync(taseron.bytes);const sheets=Object.keys(zip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p));assert.ok(sheets.length>=2);xml=(await Promise.all(sheets.map(p=>zip.file(p).async('string')))).join('');assert.match(xml,/<v>1320<\/v>/);assert.deepEqual(taseron.extra,[]);
});
