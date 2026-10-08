import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
function harness(){
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="settingsModal"><div class="modal"><div class="settings-tabs"></div><section id="settingsReport" class="settings-pane"></section></div></div></body></html>',{url:'https://claims.test/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.assign(w,{currentUser:{id:'test-owner',role:'admin'},DATA:{A:{Kuzey:{items:[['W1 - ANKRAJ MONTAJI',100,60,60,'','',0,100,'adet',false,'W1']]}}},dailyEntries:{},v34ItemKey:(b,f,n)=>b+'_'+f+'__'+n,v34ProjectInfo:{company:'Test company'},__v169Financial:{unitWeight:()=>100,data:{'A|Kuzey|W1%20-%20ANKRAJ%20MONTAJI':100},load:async()=>{}},v25EffectiveItem:(b,f,r)=>r,toast:m=>{w.lastToast=m;},confirm:()=>true});
 w.localStorage.setItem('cp_cloud_token','synthetic');let stored={};
 w.fetch=async(url,opts={})=>{if(opts.method==='PUT'){stored=JSON.parse(opts.body).data;return {ok:true,json:async()=>({revision:1})};}return {ok:true,json:async()=>url.includes('list=1')?{records:[]}:{data:stored,revision:0,ownerId:'test-owner'}};};
 w.eval(read('assets/report-poz.js'));w.eval(read('assets/claims-v182.js'));return {dom,w};
}
test('Firma and Taşeron claims show the defined Poz No before the item and persist it into report snapshots',async t=>{
 const {dom,w}=harness();t.after(()=>dom.window.close());
 await w.__claims190.open();
 for(const kind of ['firma','taseron']){
  w.document.getElementById('cl-'+kind).click();
  const table=w.document.querySelector('.cl-claim-table table'),heads=[...table.querySelectorAll('thead tr:first-child th')].map(c=>c.textContent);assert.equal(heads[heads.indexOf('İş Kalemi')-1],'Poz No');
  const cells=table.querySelector('tbody tr').children;assert.equal(cells[3].textContent,'W1');assert.equal(cells[4].textContent,'W1 - ANKRAJ MONTAJI');
  const row=w.__claims182.allRows()[0];assert.equal(row.pozNo,'W1');w.__claims190.model().selected[row.key]=true;w.__claims190.period().entries[row.key]={mode:'quantity',value:5};w.__claims190.period().dirty190=true;
  const report=w.__claims191.currentReport();assert.equal(report.snapshot.rows[0].pozNo,'W1');assert.equal(report.snapshot.rows[0].quantity,5);assert.equal(report.snapshot.rows[0].price,100);
  assert.ok(w.__claims191.saveLocal());
 }
 const saved=JSON.parse(w.localStorage.getItem('cp_claims_draft_v191_test-owner'));
 assert.equal(saved.data.firma.periods190[0].snapshot191.contractRows199[0].code,'W1');
 assert.equal(saved.data.taseron.periods190[0].snapshot191.rows[0].pozNo,'W1');
});
test('Taşeron Excel Poz No insertion preserves all period amount and cumulative formulas',async t=>{
 const {dom,w}=harness();t.after(()=>dom.window.close());w.eval(read('assets/exceljs.min.js'));w.eval(read('assets/claims-report-v191.js'));
 const bytes=fs.readFileSync(new URL('../assets/taseron-hakedis-template-v191.xlsx',import.meta.url));w.fetch=async()=>({ok:true,arrayBuffer:async()=>w.Uint8Array.from(bytes).buffer});
 const make=(n,qty,price)=>({id:'p'+n,number:n,month:'2026-0'+n,snapshot:{rows:[{key:'one',block:'A',facade:'Kuzey',pozNo:'W1',item:'ANKRAJ',unit:'adet',total:100,done:60,quantity:qty,price}],info:{company:'Test'},extraRows:[],cutRows:[]}});
 const out=await w.__claimsReport191.build({ExcelJS:w.ExcelJS,templateUrl:'/fixture',periods:[make(1,5,100),make(2,10,120)],selectedPeriodId:'p2'}),wb=out.wb,h=wb.getWorksheet('Hakediş');
 assert.equal(h.getCell('C7').value,'Poz No');assert.equal(h.getCell('D7').value,'İş Kalemi');assert.equal(h.getCell('C8').value,'W1');assert.equal(h.getCell('D8').value,'ANKRAJ');assert.equal(h.getCell('H8').value,100);assert.equal(h.getCell('I8').value,5);
 assert.equal(h.getCell('J8').value.formula,'IF(AND(H8="",I8=""),"",IF(COUNT(H8:I8)<2,"Eksik giriş",ROUND(H8*I8,2)))');assert.equal(h.getCell('J8').value.result,500);assert.equal(h.getCell('M8').value.result,1200);
 assert.equal(h.getCell('R8').value.result,15);assert.equal(h.getCell('S8').value.formula,'IF($F8="","",$F8-R8)');assert.equal(h.getCell('U8').value.result,1700);assert.equal(h.views[0].xSplit,7);
 assert.match(wb.getWorksheet('Özet').getCell('B15').value.formula,/'Hakediş'!\$H\$6/);
 const encoded=await wb.xlsx.writeBuffer(),reopened=new w.ExcelJS.Workbook();await reopened.xlsx.load(encoded);assert.equal(reopened.getWorksheet('Hakediş').getCell('C8').value,'W1');assert.equal(reopened.getWorksheet('Hakediş').getCell('U8').value.result,1700);
});
