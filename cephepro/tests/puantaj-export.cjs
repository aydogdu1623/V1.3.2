const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const dom=new JSDOM('<!doctype html><html><head></head><body><header><span id="v38SaveStatus">Bulut güncel</span><button id="layoutManagerBtn">Panel</button><button id="logoutBtn">Çıkış</button></header></body></html>',{url:'https://puantaj.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.JSZip=require('jszip');
for(const n of ['model','formulas','export'])w.eval(fs.readFileSync(root+'/assets/puantaj-'+n+'.js','utf8'));
const M=w.PuantajModel;
function employee(i,props={}){return {id:'test-'+i,serial:'TEST-'+i,name:'Test Personel '+i,title:'Test görevi',tc:'',iban:'',base:30000,raise1:45000,raise1Month:4,raise2:52000,raise2Month:7,start:'2026-01-01',end:'',...props};}
(async()=>{
 const templateBytes=fs.readFileSync(root+'/assets/puantaj-template.bin');
 const data=M.blank(2026);data.employees=[employee(1),employee(2,{raise1:0,raise1Month:0,raise2:0,raise2Month:0,start:'2026-04-15',end:'2026-07-20'}),employee(3,{name:'=1+1 <script>alert(1)</script>',base:33000,start:'2026-01-01',end:'2026-01-20'})];
 data.entries['4:test-1']={codes:{5:'PM',6:'Üİ'},hours:{7:2},advance:1500};
 data.entries['7:test-2']={codes:{3:'BM',8:'R',9:'Yİ'},hours:{4:1.5},advance:100};
 const before=JSON.stringify(data);let out=await w.PuantajExport.build(data,{month:4,personId:'test-1',templateBytes});assert.equal(JSON.stringify(data),before);assert.equal(Object.keys(out.sheets).length,18);
 for(let month=1;month<=12;month++)for(let i=0;i<data.employees.length;i++){
  const sh=M.months[month-1],r=6+2*i,p=data.employees[i],calc=M.calc(data,p,month);
  for(const [col,key] of Object.entries({E:'base',AQ:'hours',AS:'overtime',AT:'prorated',AU:'premium',AV:'unpaid',AW:'advance',AX:'gross',AY:'net'}))assert.ok(Math.abs(out.engine.cell(sh,col+r)-calc[key])<1e-6,`${sh} ${col+r}: ${out.engine.cell(sh,col+r)} != ${calc[key]}`);
  assert.equal(out.engine.cell(sh,'AK'+r),calc.counts.X);
  for(let d=1;d<=31;d++)assert.equal(out.engine.cell(sh,w.PuantajFormula.colName(d+5)+r),M.dayCode(data,p,month,d));
 }
 assert.equal(out.engine.cell('Yönetici Paneli','N9'),44850);assert.equal(out.engine.cell('Banka Maaş Transfer Listesi','G8'),44850);assert.equal(out.engine.cell('Ücret Hesap Pusulası (Makbuz)','E23'),44850);
 fs.mkdirSync(root+'/../puantaj-review',{recursive:true});fs.writeFileSync(root+'/../puantaj-review/generated-test.xlsx',out.bytes);
 const originalZip=await w.JSZip.loadAsync(templateBytes),newZip=await w.JSZip.loadAsync(out.bytes);
 assert.equal(await originalZip.file('xl/styles.xml').async('string'),await newZip.file('xl/styles.xml').async('string'));
 assert.equal(await originalZip.file('xl/theme/theme1.xml').async('string'),await newZip.file('xl/theme/theme1.xml').async('string'));
 console.log('PASS: 18 sheets; every month/person salary, days, totals agree with model; dashboard/bank/receipt agree; styles preserved; no input mutation.');
 out=await w.PuantajExport.build(M.blank(2026),{templateBytes});for(const sh of M.months)assert.equal(out.engine.cell(sh,'AY46'),0);console.log('PASS: empty roster exports without formula errors.');
 const leap=M.blank(2028);leap.employees=Array.from({length:20},(_,i)=>employee(i+1,{start:'2028-02-01',end:''}));out=await w.PuantajExport.build(leap,{templateBytes});assert.equal(out.engine.cell('Şubat','AY44'),30000);assert.equal(out.engine.cell('Şubat','AY46'),600000);console.log('PASS: leap year and all 20 personnel slots.');
 // DOM integration: test only synthetic session and fake API, no production data.
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval('var currentUser={id:"test-owner",role:"admin"};');w.localStorage.setItem('cp_cloud_token','synthetic-test-token');w.confirm=()=>true;
 let cloud={data:null,revision:0};const calls=[];
 w.fetch=async(url,opts={})=>{calls.push({url,opts});if(opts.method==='PUT'){const b=JSON.parse(opts.body);cloud={data:b.data,revision:b.revision+1,updatedAt:new Date().toISOString()};return {ok:true,json:async()=>cloud};}return {ok:true,json:async()=>cloud};};
 w.eval(fs.readFileSync(root+'/assets/puantaj.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));const $=s=>w.document.querySelector(s),click=s=>$(s).click(),tick=()=>new Promise(r=>setTimeout(r,25));
 assert.equal($('#v38SaveStatus').nextElementSibling.id,'puantajBtn');assert.equal($('#puantajBtn').nextElementSibling.id,'layoutManagerBtn');click('#puantajBtn');await tick();assert.equal($('#puantajDialog').open,true);
 click('[data-go="personnel"]');click('[data-action="new-person"]');$('[name="name"]').value='Ekran Testi';$('[name="base"]').value='30000';$('#pt-person-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.match($('#pt-content').textContent,/Ekran Testi/);
 click('#pt-save');await tick();assert.match($('#pt-status').textContent,/Kaydedildi/);assert.equal(cloud.data.employees[0].name,'Ekran Testi');click('#pt-reload');await tick();assert.match($('#pt-content').textContent,/Ekran Testi/);
 for(const tab of ['dashboard','monthly','bank','receipt','annual','holidays','personnel']){click('[data-tab="'+tab+'"]');assert.ok($('#pt-content').textContent.length>20);}
 click('[data-tab="monthly"]');const hours=$('[data-hours]:not(:disabled)');hours.value='2';hours.dispatchEvent(new w.Event('change',{bubbles:true}));assert.match($('#pt-status').textContent,/Kaydedilmemiş/);
 // Snapshot conflict/failure does not claim a successful save.
 w.fetch=async()=>({ok:false,json:async()=>({error:'REVISION_CONFLICT TEST'})});click('#pt-save');await tick();assert.match($('#pt-status').textContent,/REVISION_CONFLICT/);assert.ok(w.sessionStorage.length>0);
 click('#logoutBtn');assert.equal($('#puantajDialog').open,false);assert.equal($('#pt-content').innerHTML,'');assert.equal(w.sessionStorage.length,0);
 console.log('PASS: right-of-cloud-status placement; open; add employee; save; reload; all 7 tabs; edit hours; failed save preserves draft; logout clears private content.');
 w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
