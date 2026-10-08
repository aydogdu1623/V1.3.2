import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
const root=new URL('../',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8');
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
function harness(){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://reports.test/',runScripts:'outside-only'}),w=dom.window;
 const raw=(name,poz)=>[name,'m²',50,100,25,'','','','','',poz];
 const rows=[['Blok A','Kuzey','W1 - ANKRAJ MONTAJI','m²',50,100,25,25,'2026-01-01','2026-02-01'],['Blok A','Kuzey','W2 - ANKRAJ MONTAJI','m²',50,200,100,50,'2026-01-01','2026-02-01']];
 Object.assign(w,{DATA:{A:{Kuzey:{items:[raw(rows[0][2],'W1'),raw(rows[1][2],'W2'),raw('BOYA - İLAVE','')]}}},CEPHEPRO_VERSION:'V210',v33BlockLabel:b=>b==='A'?'Blok A':b,v57TableRows:()=>rows.map(r=>[...r]),v52SelectedFacades:()=>[['A','Kuzey']],v52AllBlocks:()=>['A'],v52ReportState:{blocks:new Set(['A'])},v34ProjectInfo:{company:'TEST FİRMA',projectName:'Poz No Kontrolü'},v52ReportDates:()=>({start:'2026-01-01',end:'2026-02-01'}),calculatedFacadeProgress:()=>125/300*100,v57GeneralRows:()=>[{label:'GENEL',value:125/300*100}],v57SameRows:()=>[],v57Cfg:()=>({}),v58ReportCrewStats:()=>({workerDays:2,workingDays:1}),v52WorkforceStats:()=>({workerDays:2,days:1,avgCrew:2,m2Production:125,m2PerWorkerDay:62.5,remainingM2:175,remainingDays:3,requiredCrew:1}),v34Schedule:()=>({plannedStart:'2026-01-01',plannedEnd:'2026-02-01',plannedDuration:32,actualStart:'2026-01-01',actualEnd:'2026-01-02'}),v37EngineerAnalysis:()=>({actualDays:2}),v47CompletionResult:()=>({text:'Sonuç: Test'}),v58DailyDetailRows:()=>[['2026-01-01','Blok A','Kuzey',rows[0][2],'m²',25,2,'Test','5×5']],v58DailyFacadeRows:()=>[['2026-01-01','Blok A','Kuzey',2,25]],v34NoWorkNotes:{},v34NoteKey:(b,f)=>b+'_'+f,facadePhotos:{},v91ExcelTitleCase:s=>s,v52EnsureExcelJS:async()=>{},v57Setup:ws=>{ws.pageSetup={orientation:'landscape',paperSize:9};},v57Logo:()=>{},toast:()=>{},__v177Progress:{totals:()=>({progress:125/300*100})},JSZip,TextEncoder,TextDecoder});
 w.__v134History={filters:{},visible:()=>[{block:'A',facade:'Kuzey',day:'2026-01-01',item:rows[0][2],unit:'m²',amount:25,workers:2,user:'Test'}]};
 for(const name of ['v57BS','v57Border','v57Fill'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],dom.getInternalVMContext());
 w.eval(read('assets/report-poz.js'));
 w.eval(read('assets/exceljs.min.js'));
 w.JSZip={loadAsync:input=>JSZip.loadAsync(ArrayBuffer.isView(input)?Buffer.from(input.buffer,input.byteOffset,input.byteLength):Object.prototype.toString.call(input)==='[object ArrayBuffer]'?Buffer.from(new Uint8Array(input)):input)};
 const start=html.indexOf('(function(){',html.indexOf('// V68 — Excel 3'));
 const end=html.indexOf('  // Final exporter wins over V66.',start);
 w.eval(html.slice(start,end)+'window.testExport=exportExcelV126;})();');
 const docStart=html.indexOf('>',html.indexOf('<script id="v126FinalReportAndUserScript"'))+1;
 const docEnd=html.indexOf('  const excel126=',docStart);
 w.eval(html.slice(docStart,docEnd)+'window.testDocx=buildDocx146;window.testHtml=reportHtml126;})();');
 return {dom,w,rows};
}
test('Poz No resolves saved metadata, preserves legacy hyphens and report keys',()=>{
 const {dom,w,rows}=harness(),api=w.CepheProReportPoz;
 assert.equal(api.position('W1 - ANKRAJ MONTAJI','Blok A','Kuzey'),'W1');
 assert.equal(api.position('BOYA - İLAVE','A','Kuzey'),'');
 const t=api.table(['Blok','Cephe','İş Kalemi','Toplam'],rows.map(r=>r.slice(0,3).concat(r[5])));
 assert.deepEqual(Array.from(t.headers),['Blok','Cephe','İş Kalemi','Poz No','Toplam']);
 assert.equal(t.rows[0][3],'W1');assert.equal(t.rows[1][3],'W2');assert.equal(t.rows[0][4],100);assert.equal(t.rows[0][2],rows[0][2]);
 assert.equal(api.table(t.headers,t.rows).headers.length,5);dom.window.close();
});
test('PDF report HTML includes adjacent Poz No columns in detail, facade and work history tables',()=>{
 const {dom,w}=harness(),markup=w.testHtml(),doc=new JSDOM(markup).window.document;
 const tables=[...doc.querySelectorAll('table')].filter(t=>[...t.querySelectorAll('th')].some(th=>th.textContent==='İş Kalemi'));
 assert.equal(tables.length,3);
 for(const t of tables){const heads=[...t.querySelectorAll('thead th')].map(x=>x.textContent),i=heads.indexOf('İş Kalemi');assert.equal(heads[i+1],'Poz No');const cells=t.querySelector('tbody tr').children;assert.equal(cells[i+1].textContent,'W1');assert.equal(cells.length,heads.length);}
 dom.window.close();
});
test('Word table construction includes code cells without changing summary totals',async()=>{
 const {dom,w}=harness();let document;
 class Node{constructor(options){this.options=options;this.kind=this.constructor.name;}}
 const types=['Document','Paragraph','TextRun','Table','TableRow','TableCell','ImageRun','Footer'];
 w.docx=Object.fromEntries(types.map(type=>[type,class extends Node{constructor(options){super(options);this.kind=type;}}]));
 for(const key of ['PageNumber','AlignmentType','WidthType','BorderStyle','ShadingType','PageOrientation','VerticalAlign','HeightRule'])w.docx[key]=new Proxy({},{get:(_,k)=>String(k)});
 w.docx.Packer={toBlob:async doc=>{document=doc;return new w.Blob(['fixture']);}};
 w.__v158ReportChartPng=()=> 'data:image/png;base64,iVBORw0KGgo=';
 await w.testDocx();
 const all=[];const walk=o=>{if(!o||typeof o!=='object')return;if(o.kind==='Table')all.push(o);Object.values(o).forEach(v=>typeof v==='object'&&walk(v));};walk(document);
 const cellText=c=>c.options.children[0].options.children[0].options.text;
 const tables=all.filter(t=>t.options.rows[0].options.children.some(c=>cellText(c)==='İş Kalemi'));
 assert.equal(tables.length,3);for(const t of tables){const header=t.options.rows[0].options.children.map(cellText),i=header.indexOf('İş Kalemi');assert.equal(header[i+1],'Poz No');assert.equal(cellText(t.options.rows[1].options.children[i+1]),'W1');assert.equal(t.options.rows[1].options.children.length,header.length);}
 assert.ok(JSON.stringify(document).includes('300'));dom.window.close();
});
test('real Excel workbook preserves formula targets, filters and native chart after Poz No insertion',{timeout:15000},async t=>{
 const {dom,w}=harness();t.after(()=>w.close());let blob;
 w.v52DownloadBlob=b=>{blob=b;};await w.testExport();assert.ok(blob?.size>0);
 const bytes=await new Promise((resolve,reject)=>{const r=new w.FileReader();r.onload=()=>resolve(new Uint8Array(r.result));r.onerror=reject;r.readAsArrayBuffer(blob);});
 const wb=new w.ExcelJS.Workbook();await wb.xlsx.load(new w.Uint8Array(bytes));const ws=wb.getWorksheet('Rapor');
 assert.equal(ws.getCell('C7').value,'İş Kalemi');assert.equal(ws.getCell('D7').value,'Poz No');assert.equal(ws.getCell('D8').value,'W1');assert.equal(ws.getCell('D9').value,'W2');
 assert.equal(ws.getCell('G8').value,100);assert.equal(ws.getCell('H8').value,25);assert.equal(ws.getCell('I8').formula,'IFERROR(H8/G8*100,0)');assert.equal(ws.getCell('I8').result,25);
 assert.equal(ws.autoFilter,'A7:K9');assert.equal(ws.getColumn(11).hidden,false);assert.equal(ws.getColumn(22).hidden,true);assert.equal(ws.views[0].ySplit,7);
 assert.match(wb.getWorksheet('Takvim').getCell('I2').formula,/Rapor!\$H:\$H.*Rapor!\$G:\$G/);
 const history=wb.getWorksheet('Çalışma Geçmişi');assert.equal(history.getCell('F4').value,'İş Kalemi');assert.equal(history.getCell('G4').value,'Poz No');assert.equal(history.getCell('G5').value,'W1');assert.equal(history.getCell('I5').value,25);assert.equal(history.autoFilter,'A4:L5');
 const daily=wb.getWorksheet('Günlük Çalışma');assert.equal(daily.getCell('E2').value,'W1');assert.equal(daily.getCell('G2').value,25);
 const zip=await JSZip.loadAsync(bytes),chart=await zip.file('xl/charts/chart1.xml').async('string');
 assert.match(chart,/Rapor!\$B\$8:\$E\$9/);assert.match(chart,/Rapor!\$G\$8:\$G\$9/);assert.match(chart,/Rapor!\$H\$8:\$H\$9/);assert.match(chart,/Rapor!\$I\$8:\$I\$9/);assert.match(chart,/>W1</);
 for(const sheet of wb.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{if(cell.formula)assert.doesNotMatch(cell.formula,/#REF!/);}));
 dom.window.close();
});
