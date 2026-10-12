import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import {database} from './helpers/test-db.mjs';
import {createClaimsHandler} from '../api/claims.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const fixture=(kind,quantity=7)=>{
 const row={key:'a',b:'A',f:'North',block:'A',facade:'North',pozNo:'W1',code:'W1',item:'ANKRAJ',unit:'adet',total:100,done:30,quantity,price:120,contractQuantity:100,contractPrice:120};
 const snapshot={rows:[row],editorRows:[row],contractRows199:[row],firmaRows199:[row],info:{company:'Published Company',projectName:'Published Project'},extraRows:[{date:'2026-10-01',desc:'Attachment',qty:1,price:10,file:{name:'test.txt',data:'data:text/plain;base64,dGVzdA=='}}],cutRows:[]};
 return {[kind]:{activePeriod190:'p1',periods190:[{id:'p1',number:1,month:'2026-10',selected:{a:true},entries:{a:{mode:'quantity',value:quantity}},prices:{a:{mode:'manual',value:120}},extras:snapshot.extraRows,deductions:[],snapshot191:snapshot}]}};
};
test('latest shared claims are selected by kind and publication, with project and role isolation',async t=>{
 const {sql,deps,call}=await database(t),handler=createClaimsHandler(deps);
 const latest=(user,kind)=>call(handler,'GET',user,null,{latest:'1',kind});
 assert.equal((await latest('admin-b','firma')).code,404);
 assert.equal((await latest('admin-b','bad')).code,400);
 for(const [id,kind,time] of [['admin-a','firma','2026-10-01'],['admin-b','taseron','2026-10-02'],['founder','firma','2026-10-03']]){
  assert.equal((await call(handler,'PUT',id,{revision:0,data:fixture(kind),share:id!=='founder'})).code,200);
  await sql`UPDATE cephepro_claims SET published_at=${time}::timestamptz WHERE project_key='main' AND owner_id=${id}`;
 }
 const firma=await latest('admin-b','firma');assert.equal(firma.code,200);assert.equal(firma.body.ownerId,'admin-a');assert.equal(firma.body.readOnly,true);assert.deepEqual(firma.body.data,fixture('firma'));
 assert.equal((await latest('admin-a','taseron')).body.ownerId,'admin-b');
 assert.equal((await latest('member-a','firma')).code,403);
 assert.equal((await call(handler,'GET','admin-b',null,{latest:'1',kind:'firma'},{'x-project-token':''})).code,403);
 assert.equal((await call(handler,'PUT','admin-b',{revision:1,ownerId:'admin-a',share:true,data:{}})).code,403);
 await sql`INSERT INTO cephepro_projects(project_key,name,company_code,project_code) VALUES('other','Other','OTHER','ONE')`;
 await sql`INSERT INTO cephepro_claims(project_key,owner_id,data,revision,is_shared,published_at) VALUES('other','founder',${JSON.stringify(fixture('firma',99))}::jsonb,1,true,'2026-12-01')`;
 assert.equal((await latest('admin-b','firma')).body.ownerId,'admin-a');
 await call(handler,'PUT','founder',{revision:1,share:true,data:fixture('firma',11)});
 const changed=await latest('admin-b','firma');assert.equal(changed.body.ownerId,'founder');assert.equal(changed.body.revision,2);assert.equal(changed.body.data.firma.periods190[0].snapshot191.rows[0].quantity,11);
});

function client(t){
 const dom=new JSDOM('<div id="settingsModal"><div class="settings-tabs"></div><section id="settingsReport"></section></div>',{url:'https://claims.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.assign(w,{currentUser:{id:'viewer',role:'admin'},DATA:{},dailyEntries:{},v34ProjectInfo:{company:'Wrong local company'},v34ItemKey:(b,f,n)=>b+'_'+f+'__'+n,__v169Financial:{unitWeight:()=>999,data:{},load:async()=>{}},toast:m=>w.lastToast=m,confirm:()=>true});
 w.localStorage.setItem('cp_cloud_token','SYNTHETIC');let kind='firma',quantity=7,fail=false;const requests=[];
 w.fetch=async(url,opts={})=>{
  requests.push({url,opts});if(url.startsWith('/assets/')){const bytes=read(url.slice(1));return {ok:true,arrayBuffer:async()=>w.Uint8Array.from(bytes).buffer};}
  if(url.includes('latest=1')){if(fail)return {ok:false,json:async()=>({error:'Bağlantı kesildi.'})};kind=new URL(url,'https://claims.test').searchParams.get('kind');}
  const shared=url.includes('latest=1')||url.includes('owner=publisher');
  return {ok:true,json:async()=>url.includes('list=1')?{records:[{ownerId:'publisher',ownerName:'Publisher'}]}:{data:shared?fixture(kind,quantity):{},ownerId:shared?'publisher':'viewer',ownerName:shared?'Publisher':'Viewer',revision:shared?quantity:0,publishedAt:'2026-10-11T08:00:00Z'}};
 };
 for(const file of ['assets/exceljs.min.js','assets/claims-report-v191.js','assets/firma-template-v208.js','assets/claims-v182.js'])w.eval(read(file).toString());
 w.JSZip={loadAsync:bytes=>JSZip.loadAsync(Object.prototype.toString.call(bytes)==='[object ArrayBuffer]'?Buffer.from(new w.Uint8Array(bytes)):bytes)};w.v52EnsureExcelJS=async()=>{};
 return {w,requests,update:n=>quantity=n,fail:()=>fail=true};
}
test('Refresh opens the newest publisher record for both kinds and Excel uses its quantities, prices and attachments',async t=>{
 const h=client(t),w=h.w;await w.__claims190.open();
 for(const kind of ['firma','taseron']){
  await w.document.getElementById('cl-'+kind).onclick();
  await w.document.getElementById('cl-refresh').onclick();
  assert.equal(w.__claims191.readOnly(),true);assert.equal(w.document.getElementById('cl-record-owner').value,'publisher');
  assert.equal(w.__claims182.rows()[0].payQuantity,7);assert.equal(w.__claims182.rows()[0].price,120);
  h.update(11);await w.document.getElementById('cl-refresh').onclick();assert.equal(w.__claims182.rows()[0].payQuantity,11);
  const out=await w.__claims182.workbook();assert.equal(out.extra[0].file.name,'test.txt');
  if(kind==='firma'){
   const zip=await w.JSZip.loadAsync(out.bytes),xml=await zip.file('xl/worksheets/sheet2.xml').async('string');
   assert.match(xml,/<c\b[^>]*r="K7"[^>]*>[\s\S]*?<v>120<\/v>/);assert.match(xml,/<c\b[^>]*r="L7"[^>]*>[\s\S]*?<v>1320<\/v>/);
  }else{const sheet=out.wb.getWorksheet('Hakediş');assert.equal(sheet.getCell('I8').value,120);assert.equal(sheet.getCell('J8').value,11);assert.equal(sheet.getCell('K8').value.result,1320);}
  h.update(7);
 }
 const old=JSON.stringify(w.__claims191.currentReport());h.fail();await w.document.getElementById('cl-refresh').onclick();assert.equal(JSON.stringify(w.__claims191.currentReport()),old);assert.equal(w.lastToast,'Bağlantı kesildi.');assert.equal(w.document.getElementById('cl-refresh').disabled,false);
 assert.ok(h.requests.filter(r=>r.url.includes('latest=1')).every(r=>r.opts.cache==='no-store'));
});
