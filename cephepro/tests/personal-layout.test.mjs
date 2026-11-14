import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {database} from './helpers/test-db.mjs';
import {createLayoutHandler} from '../api/layout.js';
const ids=['overview','chartPanel','facadePanel','timelinePanel'];
const layout=left=>({width:1200,mode:'wide',snapshot:Object.fromEntries(ids.map((id,i)=>[id,{display:i===3?'none':'',position:'absolute',left:left+'px',top:(i*100)+'px',width:'500px',height:'300px',zIndex:'20'}]))});
test('layouts persist by authenticated user, reject stale writes and unsafe styles, and retain deletion tombstones',async t=>{
 const d=await database(t),handler=createLayoutHandler(d.deps);
 assert.equal((await d.call(handler,'GET','unknown')).code,401);
 assert.equal((await d.call(handler,'PUT','member-a',{layout:layout(50),baseRevision:0,userId:'member-b'})).code,200);
 assert.equal((await d.call(handler,'GET','member-b')).body.layout,null);
 assert.deepEqual((await d.call(handler,'GET','member-a')).body.layout,layout(50));
 assert.equal((await d.call(handler,'PUT','member-a',{layout:layout(70),baseRevision:0})).code,409);
 assert.equal((await d.call(handler,'PUT','member-a',{layout:layout(70),baseRevision:1})).body.revision,2);
 const unsafe=layout(1);unsafe.snapshot.overview.background='url(https://invalid)';
 assert.equal((await d.call(handler,'PUT','member-a',{layout:unsafe,baseRevision:2})).code,400);
 assert.equal((await d.call(handler,'PUT','member-a',{layout:null,baseRevision:2})).code,200);
 assert.equal((await d.call(handler,'GET','member-a')).body.revision,3);
 assert.equal((await d.call(handler,'PUT','member-a',{layout:layout(1),baseRevision:0})).code,409);
});
async function browser(t,d,username,width=1200){
 const dom=new JSDOM('<div id="workspace">'+ids.map(id=>`<section id="${id}"></section>`).join('')+'</div><button id="v39SavePersonalLayout">Save</button><button id="v39LoadPersonalLayout">Load</button>',{url:'https://layout.test',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>w.close());const cache=new Map(),messages=[];
 w.currentUser={id:username};w.localStorage.setItem('cp_cloud_token',username);
 w.store={get:(k,v)=>cache.has(k)?cache.get(k):v,set:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)};
 w.toast=s=>messages.push(s);Object.defineProperty(w.document.getElementById('workspace'),'clientWidth',{value:width});
 w.v34CapturePanelLayout=()=>Object.fromEntries(ids.map(id=>[id,Object.fromEntries(['display','position','left','top','width','height','zIndex'].map(k=>[k,w.document.getElementById(id).style[k]]))]));
 w.v34ApplySnapshot=s=>{for(const id of ids)Object.assign(w.document.getElementById(id).style,s[id]);};w.v39ApplyLayout=()=>{};
 const handler=createLayoutHandler(d.deps);
 w.fetch=async(url,options)=>{const result=await d.call(handler,options.method,w.currentUser.id,options.body?JSON.parse(options.body):undefined);return {ok:result.code===200,json:async()=>result.body};};
 w.eval(fs.readFileSync(new URL('../assets/personal-layout.js',import.meta.url),'utf8'));
 await w.CepheProPersonalLayout.load();return {w,cache,messages};
}
test('saving on one browser restores on another, scales widths and keeps another account isolated',async t=>{
 const d=await database(t),a=await browser(t,d,'member-a');
 a.w.v34ApplySnapshot(layout(60).snapshot);await a.w.CepheProPersonalLayout.save();assert.match(a.messages.at(-1),/buluta kaydedildi/);
 const b=await browser(t,d,'member-a',800);
 assert.equal(b.w.document.getElementById('overview').style.left,'40px');assert.equal(b.w.document.getElementById('overview').style.width,'333.33px');assert.equal(b.w.document.getElementById('timelinePanel').style.display,'none');
 const other=await browser(t,d,'member-b');assert.equal(other.w.document.getElementById('overview').style.left,'');
 // Existing browser-only snapshots migrate once and are available to a fresh device.
 other.cache.set('cp_personal_snapshot_member-b',layout(25).snapshot);
 await other.w.CepheProPersonalLayout.load({force:true});
 const migrated=await browser(t,d,'member-b');assert.equal(migrated.w.document.getElementById('overview').style.left,'25px');
 // A second-device save makes the original device's stale write fail rather than erase it.
 b.w.v34ApplySnapshot(layout(90).snapshot);await b.w.CepheProPersonalLayout.save();await a.w.CepheProPersonalLayout.save();assert.match(a.messages.at(-1),/başka cihazda/);
});
