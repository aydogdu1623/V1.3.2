import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.JSZip=require('jszip');
await import('../assets/firma-template-v208.js');
const api=globalThis.CepheProFirmaTemplate208;
const templateBytes=fs.readFileSync(new URL('../assets/firma-hakedis-template-v208.xlsx',import.meta.url));
const item=(i,props={})=>({key:'key-'+i,code:'POZ-'+i,block:'A',facade:'GC'+i,item:'İmalat '+i,unit:'m²',contractQuantity:500,contractPrice:100,...props});
function fixture(count=2,end=15){
 const contractRows=Array.from({length:count},(_,i)=>item(i));
 const periods=Array.from({length:end},(_,i)=>({id:'p'+(i+1),number:i+1,snapshot:{info:{company:'Test Firma',projectName:'Test Cephe Projesi',contractDate:'2026-01-01'},contractRows199:structuredClone(contractRows),firmaRows199:contractRows.map(r=>({...r,quantity:2,price:i<1?100:i<3?120:i<7?150:i<11?180:200})),extraRows:i===0?[{date:'2026-01-15',type:'EK İŞ',desc:'Ek profil',qty:2,price:30,file:{name:'test.txt',data:'data:text/plain;base64,dGVzdA=='}}]:[],cutRows:i===0?[{date:'2026-01-15',type:'CEZA',desc:'Deneme kesintisi',amount:10}]:[]}}));
 return{selectedPeriodId:'p'+end,periods,contractRows,info:{company:'Test Firma',projectName:'Test Cephe Projesi',contractDate:'2026-01-01'}};
}
const xml=(zip,i)=>zip.file('xl/worksheets/sheet'+i+'.xml').async('string');
const cell=(s,ref)=>s.match(new RegExp('<c\\b[^>]*\\br="'+ref+'"[^>]*>([\\s\\S]*?)<\\/c>'))?.[1];
const value=(s,ref)=>Number(cell(s,ref)?.match(/<v>([^<]+)<\/v>/)?.[1]);
test('six original sheets, all 15 periods, revision boundaries, attachments and exact layout resources',async()=>{
 const input=fixture(),before=JSON.stringify(input),out=await api.build(input,{templateBytes});
 assert.equal(JSON.stringify(input),before);assert.deepEqual(out.sheetNames,['Özet','Hakediş Takip','Tutanak ve Ekler','Kesintiler','Tüm İmalatlar Master','Birim Fiyat Master']);assert.equal(out.extra.length,1);
 const zip=await JSZip.loadAsync(out.bytes),source=await JSZip.loadAsync(templateBytes);
 for(const p of ['xl/styles.xml','xl/theme/theme1.xml'])assert.equal(await zip.file(p).async('string'),await source.file(p).async('string'));
 for(let i=1;i<=6;i++){const a=await xml(source,i),b=await xml(zip,i);if(![2,6].includes(i))assert.equal(a.match(/<cols>[\s\S]*?<\/cols>/)?.[0],b.match(/<cols>[\s\S]*?<\/cols>/)?.[0]);assert.equal(a.match(/<sheetViews>[\s\S]*?<\/sheetViews>/)?.[0],b.match(/<sheetViews>[\s\S]*?<\/sheetViews>/)?.[0]);assert.doesNotMatch(b,/_xludf\./);}
 const track=await xml(zip,2),summary=await xml(zip,1),prices=await xml(zip,6);
 assert.match(cell(track,'C6'),/Poz No/);assert.match(cell(track,'D6'),/İş Kalemi/);assert.match(cell(track,'C7'),/POZ-0/);assert.match(cell(track,'D7'),/İmalat 0/);assert.match(cell(prices,'A6'),/POZ-0/);assert.match(cell(prices,'B6'),/İmalat 0/);assert.match(cell(track,'K7'),/VLOOKUP\(D7, &apos;Birim Fiyat Master&apos;!B\$6/);
 assert.equal(value(track,'K7'),100);assert.equal(value(track,'O7'),120);assert.equal(value(track,'W7'),150);assert.equal(value(track,'AM7'),180);assert.equal(value(track,'BC7'),200);
 assert.equal(value(track,'BN7'),30);assert.equal(value(track,'BP7'),400);assert.match(cell(track,'G7'),/<f>F7-BM7<\/f>/);
 assert.equal(value(prices,'G6'),2);assert.equal(value(prices,'I6'),4);assert.equal(value(prices,'K6'),8);assert.equal(value(prices,'M6'),12);
 assert.equal(value(summary,'B9'),400);assert.equal(value(summary,'C9'),60);assert.equal(value(summary,'D9'),10);assert.equal(value(summary,'F9'),45);assert.equal(value(summary,'G9'),405);
 assert.equal(value(summary,'B23'),800);assert.equal(value(summary,'G23'),720);
 assert.doesNotMatch((await xml(zip,1)),/Merkez Ofis|Alüminyum/);
 if(process.env.CEPHEPRO_EXPORT_TEST_FILE)fs.writeFileSync(process.env.CEPHEPRO_EXPORT_TEST_FILE,out.bytes);
});
test('rows extend without changing columns; totals and SUMIF ranges include rows past 100',async()=>{
 const input=fixture(26,2);input.periods[1].snapshot.extraRows=Array.from({length:100},(_,i)=>({type:'EK',desc:'İş '+i,qty:1,price:2}));
 const out=await api.build(input,{templateBytes}),zip=await JSZip.loadAsync(out.bytes),track=await xml(zip,2),summary=await xml(zip,1),extras=await xml(zip,3);
 assert.match(track,/A33:E33/);assert.equal(value(track,'L33'),5200);assert.match(cell(summary,'B9'),/L7:L32/);assert.match(cell(summary,'C10'),/B6:B106/);assert.equal(value(summary,'C10'),200);assert.equal(value(extras,'G107'),260);
});
test('historical owner snapshots and distinct item prices are retained',()=>{
 const input=fixture(2,2);input.readOnly=true;input.contractRows=[item(99,{contractPrice:99999})];input.info={company:'OTHER OWNER'};
 for(const p of input.periods){for(const r of p.snapshot.contractRows199)r.item='ORTAK İŞ';for(const r of p.snapshot.firmaRows199)r.item='ORTAK İŞ';p.snapshot.firmaRows199[1].price=50;}
 const data=api.prepare(input);assert.equal(data.info.company,'Test Firma');assert.equal(data.rows.length,2);assert.notEqual(data.rows[0].label,data.rows[1].label);assert.equal(data.rows[1].prices[0],50);
});
test('incomplete history, duplicate periods, missing paid prices and unsupported revisions fail explicitly',()=>{
 let p=fixture(1,2);p.periods.shift();assert.throws(()=>api.prepare(p),/zinciri/);
 p=fixture(1,2);p.periods[1].number=1;assert.throws(()=>api.prepare(p),/zinciri/);
 p=fixture(1,2);p.periods[0].snapshot.firmaRows199[0].price=null;assert.throws(()=>api.prepare(p),/fiyat eksik/);
 p=fixture(1,7);p.periods.forEach((r,i)=>r.snapshot.firmaRows199[0].price=100+i*10);assert.throws(()=>api.prepare(p),/dört revizyondan fazla/);
 p=fixture(1,16);assert.throws(()=>api.prepare(p),/1–15/);
});
test('zero quantities, zero prices, empty exports and formula-like text stay safe',async()=>{
 const p=fixture(1,1);p.contractRows[0].item='=1+1 <script>';p.periods[0].snapshot.contractRows199=structuredClone(p.contractRows);p.periods[0].snapshot.firmaRows199[0].quantity=0;p.periods[0].snapshot.firmaRows199[0].price=0;
 const out=await api.build(p,{templateBytes}),zip=await JSZip.loadAsync(out.bytes),track=await xml(zip,2);assert.match(cell(track,'D7'),/inline|<is>/);assert.match(cell(track,'D7'),/&lt;script&gt;/);assert.equal(value(track,'K7'),0);assert.equal(value(track,'L7'),0);
 const empty=await api.build(fixture(0,1),{templateBytes});assert.equal(empty.totals[0],0);
});
