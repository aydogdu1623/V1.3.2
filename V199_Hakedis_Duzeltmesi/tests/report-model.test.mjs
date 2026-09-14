import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../report-engine.js',import.meta.url),'utf8');
const integrated=readFileSync(new URL('../assets/claims-v182.js',import.meta.url),'utf8');
new Function(integrated);
if(!integrated.startsWith(source))throw Error('Entegre dosya ile rapor motoru farklı.');
new Function(source)();

class FakeCell{constructor(){this.value=null;}}
class FakeRow{
 constructor(sheet,n){this.sheet=sheet;this.n=n;}
 get values(){return [...this.sheet.cells].filter(([k])=>k.split(':')[0]==this.n).map(([,v])=>v.value);}
 set values(values){values.forEach((v,i)=>{this.sheet.cell(this.n,i+1).value=v;});}
 eachCell(options,cb){if(typeof options==='function')cb=options;for(const[k,v]of this.sheet.cells)if(Number(k.split(':')[0])===this.n)cb(v);}
}
class FakeSheet{
 constructor(name){this.name=name;this.cells=new Map();this.rows=new Map();this.cols=new Map();this.properties={};}
 cell(r,c){const k=r+':'+c;if(!this.cells.has(k))this.cells.set(k,new FakeCell());return this.cells.get(k);}
 getCell(a){const m=a.match(/^([A-Z]+)(\d+)$/);if(!m)throw Error('Bad cell '+a);return this.cell(Number(m[2]),[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0));}
 getRow(n){if(!this.rows.has(n))this.rows.set(n,new FakeRow(this,n));return this.rows.get(n);}
 getColumn(n){if(!this.cols.has(n))this.cols.set(n,{eachCell:(opts,cb)=>{for(const[k,c]of this.cells)if(Number(k.split(':')[1])===n)cb(c);}});return this.cols.get(n);}
 get columns(){const count=Math.max(0,...[...this.cells.keys()].map(k=>Number(k.split(':')[1])));return Array.from({length:count},(_,i)=>this.getColumn(i+1));}
 mergeCells(){}
 addRow(values){const n=1+Math.max(0,...[...this.cells.keys()].map(k=>Number(k.split(':')[0])));this.getRow(n).values=values;}
 eachRow(cb){const nums=[...new Set([...this.cells.keys()].map(k=>Number(k.split(':')[0])))].sort((a,b)=>a-b);for(const n of nums)cb(this.getRow(n));}
}
class FakeWorkbook{constructor(){this.worksheets=[];}addWorksheet(n){const s=new FakeSheet(n);this.worksheets.push(s);return s;}eachSheet(cb){this.worksheets.forEach(cb);}}
function runTests(api){
 const checks=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 ok(api.numeric('')===null&&api.numeric(0)===0&&api.numeric('1.000,25')===1000.25&&api.numeric('1,2,3')===null,'Blank / zero / Turkish decimals');
 ok(api.rate('4/10')===40&&api.rate('101')===null,'Configurable rates');
 const info=api.resolveInfo({overrides:{},snapshot:{company:''},project:{company:'Yeni Firma'}});ok(info.company==='Yeni Firma','Empty fields use later site data');
 const other=api.resolveInfo({snapshot:{company:''},project:{company:'Başka Firma'},readOnly:true});ok(other.company==='','Other admin record never uses current owner company');
 const payload={info:{claimNo:2,company:'Test',employer:'Test',projectName:'Test',claimDate:'2026-09-14',periodStart:'2026-09-01',periodEnd:'2026-09-14',vatRate:20,vatWithholdingRate:'4/10',withholdingRate:0,retentionRate:10,advanceAmount:0,priceDifference:0},rows:[
 {key:'original',facade:'A1 GC2',item:'İmalat',unit:'m²',contractQuantity:100,contractPrice:100,currentQuantity:10,currentPrice:100},
 {key:'copy',facade:'A1 GC2_Kopya',item:'İmalat',unit:'m²',contractQuantity:100,contractPrice:null,currentQuantity:2,currentPrice:null}],
 previousPeriods:[{number:1,rows:[{key:'original',quantity:5,price:80}],extraRows:[],cutRows:[]}]};
 const report=api.prepare(payload);ok(report.rows.length===2&&report.rows[1].facade==='A1 GC2_Kopya','Copy facade included separately');
 ok(report.rows[0].previousAmount===400&&report.rows[0].currentAmount===1000&&report.rows[0].cumulativeAmount===1400,'Previous prices preserved; current and cumulative amounts correct');
 ok(report.rows[1].currentAmount===null&&report.rows[1].contractAmount===null,'Missing prices stay unknown');
 const broken=api.prepare({...payload,info:{...payload.info,claimNo:3}});ok(broken.rows[0].previousAmount===null,'Missing previous claim is not silently zero');
 const {wb}=api.makeWorkbook({Workbook:FakeWorkbook},payload);
 ok(wb.worksheets.length===3&&wb.worksheets[0].name==='Hakediş Kapağı & İcmal'&&wb.worksheets[1].name==='Detaylı Hakediş Cetveli'&&wb.worksheets[2].name==='Sözleşme & Firma Bilgileri','Exactly three requested sheet names');
 const[c,d,s]=wb.worksheets;ok(d.getCell('G6').value===null&&d.getCell('M6').value.formula.includes('COUNT(K6:L6)'),'Blank price and guarded period amount formula');
 ok(d.getCell('J5').value===400&&d.getCell('P5').value.formula.includes('/F5'),'Historical amount and completion formula');
 ok(c.getCell('C26').value.formula.includes('C25*')&&c.getCell('C32').value.formula.includes('SUM(C24:C25)-SUM(C26:C30)'),'KDV added, tevkifat and deductions subtracted');
 ok(d.views[0].xSplit===5&&d.views[0].ySplit===4&&s.getCell('B18').value===20,'Freeze panes and rate mapped to contract sheet');
 let formulas=0;for(const sheet of wb.worksheets)for(const cell of sheet.cells.values())if(cell.value?.formula){formulas++;ok(!/undefined|NaN|#REF!/.test(cell.value.formula),'Formula reference '+formulas);}
 return {passed:checks.length,behaviorChecks:13,formulaChecks:formulas};
}

console.log(JSON.stringify(runTests(globalThis.CepheProFirma199),null,2));
