import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
const read=f=>fs.readFileSync(new URL('../assets/'+f,import.meta.url),'utf8');
function app(t,saved){
 const dom=new JSDOM('<section id="settingsGeneral"></section><p id="amount">Tutar: 123,45 TL</p><input id="price" value="123.45">',{url:'https://currency.test',runScripts:'outside-only'});const w=dom.window;t.after(()=>w.close());
 if(saved)w.localStorage.setItem('cephepro_currency',saved);
 w.AbortController=AbortController;w.CepheProProjects={isReady:()=>true,project:()=>({id:'fixture'})};
 w.JSZip={loadAsync:input=>JSZip.loadAsync(ArrayBuffer.isView(input)?Buffer.from(input.buffer,input.byteOffset,input.byteLength):Object.prototype.toString.call(input)==='[object ArrayBuffer]'?Buffer.from(new Uint8Array(input)):input)};
 for(const f of ['translations.js','currency.js','i18n.js','i18n-reports.js','exceljs.min.js'])w.eval(read(f));return w;
}
test('currency sits beside language, persists, reverses labels and leaves price inputs untouched',async t=>{
 const w=app(t);const c=w.CepheProCurrency,I=w.CepheProI18n;
 assert.equal(w.document.getElementById('cpLanguageSelect').nextElementSibling.id,'cpCurrencySettings');
 for(const [code,label] of [['USD','USD'],['EUR','EUR'],['TRY','TL']]){c.set(code);assert.equal(w.document.getElementById('amount').textContent,'Tutar: 123,45 '+label);assert.equal(w.document.getElementById('price').value,'123.45');assert.equal(w.localStorage.getItem('cephepro_currency'),code);}
 c.set('USD');const old=I.context();c.set('EUR');assert.notEqual(I.context(),old);assert.equal(c.set('GBP'),false);assert.equal(c.code(),'EUR');
 const reopened=app(t,'EUR');assert.equal(reopened.CepheProCurrency.code(),'EUR');assert.equal(reopened.document.getElementById('cpCurrencySelect').value,'EUR');
});
for(const language of ['tr','en'])for(const currency of ['TRY','USD','EUR'])test(`${language}/${currency}: Excel, Word and PDF denomination preserves amounts and formulas`,async t=>{
 const w=app(t),I=w.CepheProI18n,C=w.CepheProCurrency;await I.setLanguage(language);C.set(currency);const symbol={TRY:'₺',USD:'$',EUR:'€'}[currency],label=currency==='TRY'?'TL':currency;
 const wb=new w.ExcelJS.Workbook(),s=wb.addWorksheet('Rapor');s.getCell('A1').value='Tutar (TL)';s.getCell('A2').value=123.45;s.getCell('A2').numFmt='"₺"#,##0.00';s.getCell('B2').value={formula:'A2*2',result:246.9};s.getCell('B2').numFmt='[$₺-tr-TR]#,##0.00';s.getCell('C2').value=100;s.getCell('C2').numFmt='0.00%';
 const output=await I.office(await wb.xlsx.writeBuffer());const next=new w.ExcelJS.Workbook();await next.xlsx.load(w.Uint8Array.from(output).buffer);const sheet=next.worksheets[0];assert.equal(sheet.getCell('A2').value,123.45);assert.equal(sheet.getCell('B2').formula,'A2*2');assert.equal(sheet.getCell('B2').result,246.9);assert.equal(sheet.getCell('C2').numFmt,'0.00%');assert.ok(sheet.getCell('A2').numFmt.includes(symbol));assert.ok(sheet.getCell('B2').numFmt.includes(symbol));assert.ok(sheet.getCell('A1').value.includes(label));assert.equal(s.getCell('A1').value,'Tutar (TL)');
 const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tutar (TL)</w:t></w:r><w:r><w:t>123,45 ₺</w:t></w:r></w:p></w:body></w:document>');
 const doc=await JSZip.loadAsync(await I.office(await zip.generateAsync({type:'uint8array'}),'docx'));const xml=await doc.file('word/document.xml').async('string');assert.ok(xml.includes(label));assert.ok(xml.includes('123,45 '+symbol));
 const el=w.document.createElement('div');el.innerHTML='<p>Tutar (TL)</p><p>123,45 ₺</p>';await I.translateElement(el);assert.ok(el.textContent.includes(label));assert.ok(el.textContent.includes('123,45 '+symbol));
});
