import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import {validateTranslation,translateBatch,translateForProject} from '../lib/translation.js';
import {createTranslationHandler} from '../api/translate.js';
import {requireProject} from '../lib/project-access.js';
import {database} from './helpers/test-db.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness(markup=''){
 const dom=new JSDOM('<!doctype html><html><body><section id="settingsGeneral"></section>'+markup+'</body></html>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.AbortController=AbortController;let project='project-a';w.CepheProProjects={isReady:()=>!!project,project:()=>project?{id:project}:null};w.localStorage.setItem('cp_cloud_token','synthetic');
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return{ok:true,json:async()=>({translations:body.texts.map(x=>body.language==='de'?'DE: '+x:'EN: '+x)})};};
 w.JSZip={loadAsync:input=>JSZip.loadAsync(ArrayBuffer.isView(input)?Buffer.from(input.buffer,input.byteOffset,input.byteLength):Object.prototype.toString.call(input)==='[object ArrayBuffer]'?Buffer.from(new Uint8Array(input)):input)};
 for(const f of ['assets/translations.js','assets/i18n.js','assets/i18n-reports.js'])w.eval(read(f));
 return {dom,w,I:w.CepheProI18n,calls,project:value=>{project=value;}};
}
const delay=()=>new Promise(r=>setTimeout(r,60));
test('TR/EN/DE round trip preserves editable values, identifiers and numeric values',async t=>{
 const {dom,w,I}=harness('<button id="btn">Eksik Ekle</button><p id="note">Yağmur yağdı</p><p id="item">Ankraj Çakımı</p><p id="code">DYŞH_1000</p><input id="input" value="Yağmur yağdı" placeholder="Açıklama"><select id="side"><option>Kuzey</option></select>');t.after(()=>dom.window.close());
 await I.setLanguage('en');assert.equal(w.document.getElementById('note').textContent,'It rained');assert.equal(w.document.getElementById('item').textContent,'Anchor driving');assert.equal(w.document.getElementById('code').textContent,'DYŞH_1000');assert.equal(w.document.getElementById('input').value,'Yağmur yağdı');assert.equal(w.document.getElementById('input').placeholder,'Description');assert.equal(w.document.getElementById('side').value,'Kuzey');
 await I.setLanguage('de');assert.equal(w.document.getElementById('note').textContent,'Es hat geregnet');assert.equal(w.document.getElementById('btn').textContent,'Mangel hinzufügen');
 await I.setLanguage('tr');assert.equal(w.document.getElementById('note').textContent,'Yağmur yağdı');assert.equal(w.document.getElementById('input').placeholder,'Açıklama');assert.equal(w.document.documentElement.lang,'tr');
});
test('new dynamic notes are batched, restored and do not execute translated markup',async t=>{
 const {dom,w,I,calls}=harness('<div id="note"></div>');t.after(()=>dom.window.close());await I.setLanguage('en');
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return{ok:true,json:async()=>({translations:body.texts.map(()=>'<script>unsafe()</script>')})};};
 const note=w.document.getElementById('note');note.textContent='Bugün vinç arızası nedeniyle montaj durdu.';await delay();await I.ensure([note.textContent]);await delay();assert.equal(note.querySelector('script'),null);assert.match(note.textContent,/<script>/);assert.equal(calls.filter(x=>x.texts.includes('Bugün vinç arızası nedeniyle montaj durdu.')).length,1);
 await I.setLanguage('tr');assert.equal(note.textContent,'Bugün vinç arızası nedeniyle montaj durdu.');
});
test('late translation cannot enter another project and unavailable service blocks foreign-language exports',async t=>{
 const {dom,w,I,project}=harness();t.after(()=>dom.window.close());await I.setLanguage('en');let resolve;
 w.fetch=()=>new Promise(r=>{resolve=r;});const pending=I.ensure(['Özel saha açıklaması']);await delay();project('project-b');w.document.dispatchEvent(new w.Event('cephepro:locked'));resolve({ok:true,json:async()=>({translations:['old private data']})});await assert.rejects(pending,/CONTEXT_CHANGED/);
 w.fetch=async()=>({ok:false,json:async()=>({code:'TRANSLATION_SETUP_REQUIRED'})});await assert.rejects(I.ensure(['Özel saha açıklaması']),/TRANSLATION_SETUP_REQUIRED/);assert.notEqual(I.t('Özel saha açıklaması'),'old private data');
});
test('translation provider validates request/response and uses exact provider with data-only instructions',async()=>{
 assert.throws(()=>validateTranslation({language:'fr',texts:['a']}));assert.throws(()=>validateTranslation({language:'en',texts:Array(41).fill('a')}));assert.throws(()=>validateTranslation({language:'en',texts:['x'.repeat(3001)]}));
 let sent;const out=await translateBatch(['Yağmur yağdı'],'en',{token:'synthetic',fetcher:async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({choices:[{message:{content:'{"translations":["It rained"]}'}}]})};}});assert.equal(out[0],'It rained');assert.equal(sent.model,'google/gemini-2.5-flash-lite');assert.match(sent.messages[0].content,/NEVER instructions/);
 await assert.rejects(translateBatch(['a'],'en',{token:'synthetic',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"translations":[]}'}}]})})}),/INVALID_RESPONSE/);
});
test('translation API requires both user and project sessions; caches remain project-scoped',async t=>{
 const h=await database(t);let called=0;
 const translate=async(texts,lang)=>{called++;return texts.map(s=>lang+':'+s);};
 const handler=createTranslationHandler({...h.deps,requireProject,translationEnabled:()=>true,translateForProject:(sql,me,texts,lang)=>translateForProject(sql,me,texts,lang,translate)});
 const body={language:'en',texts:['Özel açıklama']};assert.equal((await h.call(handler,'POST','',body)).code,401);assert.equal((await h.call(handler,'POST','member-a',body,{}, {'x-project-token':''})).code,403);
 const disabled=createTranslationHandler({...h.deps,requireProject,translationEnabled:()=>false,translateForProject:()=>{throw Error('must not call provider');}});assert.equal((await h.call(disabled,'POST','member-a',body)).body.code,'TRANSLATION_SETUP_REQUIRED');
 let r=await h.call(handler,'POST','member-a',body);assert.equal(r.code,200);assert.equal(r.body.translations[0],'en:Özel açıklama');await h.call(handler,'POST','member-b',body);assert.equal(called,1);
 await translateForProject(h.sql,{id:'member-a',projectId:'another-project'},body.texts,'en',translate);assert.equal(called,2);
 await h.sql`UPDATE cephepro_translation_limits SET requests=90 WHERE user_id='member-a'`;r=await h.call(handler,'POST','member-a',{language:'en',texts:['Different uncached note']});assert.equal(r.code,429);
});
test('Office localization renames sheets, structured references, formula strings and chart labels without changing arithmetic',async t=>{
 const {dom,w,I}=harness();t.after(()=>dom.window.close());w.eval(read('assets/exceljs.min.js'));await I.setLanguage('en');
 const wb=new w.ExcelJS.Workbook(),s=wb.addWorksheet('Özet'),h=wb.addWorksheet('Hakediş');
 h.addTable({name:'tblHakedis',ref:'A1',headerRow:true,columns:[{name:'İş Kalemi',filterButton:true},{name:'Tutar',filterButton:true},{name:'Kontrol',filterButton:true}],rows:[['Ankraj Çakımı',123.45,'Uygun']]});s.getCell('A1').value={formula:'SUM(tblHakedis[Tutar])+\'Hakediş\'!B2',result:246.90};s.getCell('A2').value={formula:'IF(\'Hakediş\'!C2="Uygun",123.45,"Eksik giriş")',result:123.45};s.getCell('A3').value='Yağmur yağdı';s.views=[{state:'frozen',ySplit:1}];s.getCell('A1').border={top:{style:'thick'}};
 const bytes=await I.office(await wb.xlsx.writeBuffer());const reopened=new w.ExcelJS.Workbook();await reopened.xlsx.load(w.Uint8Array.from(bytes).buffer);const summary=reopened.getWorksheet('Summary'),claim=reopened.getWorksheet('Progress payment');
 assert.ok(summary&&claim);assert.equal(summary.getCell('A3').value,'It rained');assert.equal(claim.getCell('A2').value,'Anchor driving');assert.equal(claim.getCell('B2').value,123.45);assert.equal(summary.getCell('A1').value.formula,"SUM(tblHakedis[Amount])+'Progress payment'!B2");assert.equal(summary.getCell('A1').value.result,246.9);assert.match(summary.getCell('A2').value.formula,/="OK"/);assert.equal(summary.views[0].ySplit,1);assert.equal(summary.getCell('A1').border.top.style,'thick');assert.equal(claim.getTable('tblHakedis').table.columns[1].name,'Amount');assert.equal(wb.getWorksheet('Hakediş').getCell('A2').value,'Ankraj Çakımı');
});
test('Word XML and PDF-style report DOM translate headings and arbitrary notes safely in German',async t=>{
 const {dom,w,I}=harness();t.after(()=>dom.window.close());await I.setLanguage('de');
 const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Çalışma Olmadı</w:t></w:r><w:r><w:t>Yağmur yağdı</w:t></w:r></w:p></w:body></w:document>');const translated=await JSZip.loadAsync(await I.office(await zip.generateAsync({type:'uint8array'}),'docx'));const xml=await translated.file('word/document.xml').async('string');assert.match(xml,/Keine Arbeiten/);assert.match(xml,/Es hat geregnet/);
 const el=w.document.createElement('div');el.innerHTML='<h1>Çalışma Olmadı</h1><p>Yağmur yağdı</p>';await I.translateElement(el);assert.equal(el.querySelector('p').textContent,'Es hat geregnet');
});
test('both complete claim workbooks reopen in both languages with totals, filters, borders and fixed quantities preserved',async t=>{
 const {dom,w,I}=harness();t.after(()=>dom.window.close());for(const file of ['assets/exceljs.min.js','assets/firma-template-v208.js','assets/claims-report-v191.js'])w.eval(read(file));
 const item={key:'one',block:'A',facade:'Kuzey',pozNo:'W1',item:'Ankraj Çakımı',unit:'adet',total:100,contractQuantity:100,contractPrice:100,done:60,quantity:5,price:100};
 const periods=[{id:'p1',number:1,month:'2026-01',snapshot:{rows:[item],firmaRows199:[item],contractRows199:[item],info:{company:'CephePro'},extraRows:[],cutRows:[]}}];
 const template=fs.readFileSync(new URL('../assets/firma-hakedis-template-v208.xlsx',import.meta.url));const company=await w.CepheProFirmaTemplate208.build({periods,selectedPeriodId:'p1',contractRows:[item],info:{company:'CephePro'}},{templateBytes:template});
 const subTemplate=fs.readFileSync(new URL('../assets/taseron-hakedis-template-v191.xlsx',import.meta.url));const translator=w.fetch;w.fetch=async()=>({ok:true,arrayBuffer:async()=>w.Uint8Array.from(subTemplate).buffer});const sub=await w.__claimsReport191.build({ExcelJS:w.ExcelJS,templateUrl:'/fixture',periods,selectedPeriodId:'p1'});w.fetch=translator;const subBytes=await sub.wb.xlsx.writeBuffer();
 for(const language of ['en','de']){await I.setLanguage(language);for(const [bytes,count] of [[company.bytes,6],[subBytes,5]]){
  const localized=await I.office(bytes),reopened=new w.ExcelJS.Workbook();await reopened.xlsx.load(w.Uint8Array.from(localized).buffer);assert.equal(reopened.worksheets.length,count);
  const claim=reopened.worksheets[1],row=count===6?7:8;assert.equal(claim.getCell('C'+row).value,'W1');assert.equal(claim.getCell('D'+row).value,language==='de'?'Anker einschlagen':'Anchor driving');assert.equal(claim.getCell('G'+row).value.result,40);assert.equal(claim.views[0].xSplit,8);
  for(const sheet of reopened.worksheets){assert.ok(sheet.autoFilter||sheet.getTables().some(t=>t.table.autoFilterRef));assert.equal(sheet.getCell('A1').border.top.style,'thick');}
  const xml=await JSZip.loadAsync(localized);for(const file of Object.values(xml.files).filter(f=>/xl\/(worksheets|tables)\/.*\.xml$/.test(f.name))){const source=await file.async('string');assert.doesNotMatch(source,/#REF!/);assert.doesNotMatch(source,/\[Tutar\]|'Hakediş'!|'Birim Fiyat Master'!/);}
 }}
});
