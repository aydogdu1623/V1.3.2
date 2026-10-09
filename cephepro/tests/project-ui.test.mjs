import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const source=fs.readFileSync(path.join(root,'assets/project-access.js'),'utf8');
const ctx={userId:'owner',token:'PROJECT-A',project:{id:'a',name:'Proje A',companyCode:'FIRMA',projectCode:'A1'}};
const user={id:'owner',role:'admin',name:'Synthetic Owner',username:'owner',email:'owner@example.invalid'};
function mini(t,context=ctx){
 const calls=[],dom=new JSDOM('<html><body><section id="authScreen"></section><main id="privateApp">SECRET</main><div id="cpProjectsList"></div><button id="cpProjectCreate"></button></body></html>',{url:'https://example.invalid/',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 Object.assign(w,{Headers,Response,Request,fetch:async(input,init={})=>{calls.push({input,init});return new Response(JSON.stringify(String(input).includes('/projects')?{projects:[{...ctx.project,configured:true,canManage:true}],activeProject:context?.project||null,canCreate:true}:{state:{},revision:0}),{status:200});}});
 w.localStorage.setItem('cp_cloud_token','ACCOUNT');w.localStorage.setItem('cp_private_owner','owner');if(context)w.sessionStorage.setItem('cp_project_access',JSON.stringify(context));w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,calls};
}
test('project gate requires verified server grant and state hydration before showing the app',async t=>{
 const {w,calls}=mini(t);assert.equal(w.document.documentElement.dataset.cpProject,'locked');
 assert.equal((await w.fetch('/api/state')).status,403);assert.equal(calls.length,0);
 assert.equal(await w.CepheProProjects.ensure(user),true);assert.equal(w.CepheProProjects.isReady(),false);assert.equal(w.document.documentElement.dataset.cpProject,'locked');
 await w.fetch('/api/state');assert.equal(calls.at(-1).init.headers.get('X-Project-Token'),'PROJECT-A');
 w.CepheProProjects.ready();assert.equal(w.document.documentElement.dataset.cpProject,'ready');
 w.CepheProProjects.lock();assert.equal(w.document.documentElement.dataset.cpProject,'locked');assert.equal((await w.fetch('/api/state')).status,403);
 assert.equal(w.sessionStorage.getItem('cp_project_access'),null);
});
test('project caches and drafts are separated; no token is attached to another origin',async t=>{
 const {w,calls}=mini(t);w.localStorage.setItem('cp_puantaj_draft:owner:2026','SECRET-A');w.localStorage.setItem('cp_dynamic_data','A');
 assert.equal(w.localStorage.getItem('cp_scope:a:owner:cp_dynamic_data'),'A');
 await w.CepheProProjects.ensure(user);await w.fetch('https://third-party.invalid/api/state');assert.equal(calls.at(-1).init.headers,undefined);
 w.CepheProProjects.lock();assert.equal(w.localStorage.getItem('cp_dynamic_data'),null);assert.equal(w.localStorage.getItem('cp_puantaj_draft:owner:2026'),null);
 w.localStorage.setItem('cp_dynamic_data','LOCKED');assert.equal(w.localStorage.getItem('cp_scope:a:owner:cp_dynamic_data'),'A');
});
test('failed or absent project grants display code/password fields without unlocking',async t=>{
 const {w}=mini(t,null);assert.equal(await w.CepheProProjects.ensure(user),false);assert.equal(w.CepheProProjects.isReady(),false);
 assert.equal(w.document.getElementById('cpProjectGate').hidden,false);assert.ok(w.document.getElementById('cpCompanyCode'));assert.ok(w.document.getElementById('cpProjectCode'));assert.equal(w.document.getElementById('cpProjectPassword').type,'password');
});
class LocalResources extends ResourceLoader{fetch(url){const u=new URL(url);if(u.hostname==='example.invalid'){const file=path.join(root,u.pathname);if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile())return Promise.resolve(fs.readFileSync(file));}return Promise.resolve(Buffer.from(''));}}
test('complete app boots with an empty protected project and mounts the Projects settings pane',async t=>{
 const errors=[],requests=[],observers=[],timeouts=[],intervals=[],frames=[],console=new VirtualConsole();console.on('jsdomError',e=>{if(e.type==='unhandled exception')errors.push(String(e.detail?.stack||e.cause?.stack||e.message));});
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://example.invalid/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
  const Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(callback){super(callback);observers.push(this);}};
  for(const[name,list]of [['setTimeout',timeouts],['setInterval',intervals],['requestAnimationFrame',frames]]){const original=w[name].bind(w);w[name]=(...args)=>{const id=original(...args);list.push(id);return id;};}
  Object.assign(w,{Headers,Response,Request,TextEncoder,TextDecoder,structuredClone,matchMedia:()=>({matches:false,addListener(){},addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},fetch:async(input,init={})=>{
   const url=new URL(String(input),'https://example.invalid');requests.push(url.pathname);
   let body={};if(url.pathname==='/api/auth'){const action=JSON.parse(init.body||'{}').action;body=action==='list'?{users:[user]}:action==='list_pending'?{requests:[]}:{user};}
   else if(url.pathname==='/api/projects')body={projects:[{...ctx.project,configured:true,canManage:true,unlocked:true}],activeProject:ctx.project,canCreate:true};
   else if(url.pathname==='/api/state')body={state:{},revision:0};else if(url.pathname==='/api/finance')body={data:{},weights:{},revision:0};else if(url.pathname==='/api/photos')body={photos:[]};else if(url.pathname==='/api/activity')body={activities:[],users:[],uploads:[]};
   return new Response(JSON.stringify(body),{status:200});
  }});
  w.localStorage.setItem('cp_cloud_token','ACCOUNT');w.localStorage.setItem('cp_session',JSON.stringify(user));w.localStorage.setItem('cp_private_owner','owner');w.sessionStorage.setItem('cp_project_access',JSON.stringify(ctx));
 }});t.after(async()=>{observers.forEach(x=>x.disconnect());timeouts.forEach(x=>dom.window.clearTimeout(x));intervals.forEach(x=>dom.window.clearInterval(x));frames.forEach(x=>dom.window.cancelAnimationFrame(x));await new Promise(resolve=>setTimeout(resolve,40));observers.forEach(x=>x.disconnect());dom.window.close();});
 await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,400));
 assert.deepEqual([...errors],[]);assert.equal(dom.window.CepheProProjects.isReady(),true);assert.equal(dom.window.CepheProPrivacy.isReady(),true);assert.equal(dom.window.document.querySelector('[data-pane="settingsSave"]').textContent,'Projeler');assert.equal(dom.window.eval('Object.keys(DATA).length'),0);
 assert.ok(requests.includes('/api/state'));assert.ok(dom.window.document.getElementById('cpProjectCreate'));
});
