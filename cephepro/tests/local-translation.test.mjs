import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function browser(t){
 const dom=new JSDOM('<section id="settingsGeneral"></section>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.fetch=()=>{throw Error('No translation network request is permitted');};
 w.AbortController=AbortController;w.CepheProProjects={isReady:()=>true,project:()=>({id:'synthetic'})};
 w.eval(read('assets/local-translation.js'));return w;
}
function localize(w){for(const file of ['assets/translations.js','assets/ai-translations.js','assets/i18n.js'])w.eval(read(file));return w.CepheProI18n;}
test('browser adapter downloads only in a user gesture and reuses the model without network calls',async t=>{
 const w=browser(t),calls=[],adapter=w.CepheProLocalTranslation;let active=false;
 Object.defineProperty(w.navigator,'userActivation',{value:{get isActive(){return active;}}});
 w.Translator={availability:async()=>{calls.push('availability');return 'downloadable';},create:async()=>{assert.equal(active,true);calls.push('create');return {translate:async s=>s.replace('montajı','installation'),destroy(){calls.push('destroy');}};}};
 await assert.rejects(adapter.prepare('en'),/DOWNLOAD_REQUIRED/);active=true;
 const pending=adapter.prepare('en',{interactive:true});assert.equal(calls.at(-1),'create','create must precede the first await in the gesture');active=false;await pending;
 assert.deepEqual(Array.from(await adapter.translate(['W1 montajı 12.5 m²'],'en')),['W1 installation 12.5 m²']);assert.equal(calls.filter(c=>c==='create').length,1);
 w.document.dispatchEvent(new w.Event('cephepro:locked'));await Promise.resolve();assert.equal(calls.at(-1),'destroy');
});
test('unavailable models never block report preparation, but changing project still cancels it',async t=>{
 const w=browser(t),I=localize(w);await I.setLanguage('en');
 const state=await I.ensureReport(['İş Kalemi','Özel özgün saha notumuz']);assert.equal(state.complete,false);assert.equal(I.t('İş Kalemi'),'Work item');assert.match(w.document.getElementById('cpReportTranslationWarning').textContent,/original language/);
 let finish;w.CepheProLocalTranslation.translate=()=>new Promise(resolve=>{finish=resolve;});
 const job=I.ensureReport(['Başka bir özel not']);w.CepheProProjects.project=()=>({id:'different'});finish(['Another private note']);await assert.rejects(job,/CONTEXT_CHANGED/);
});
test('model output cannot change quantities or item codes and locked projects discard pending output',async t=>{
 const w=browser(t),I=w.CepheProLocalTranslation;let value='W2 assembly 13.5 m²',finish;
 w.Translator={availability:async()=> 'available',create:async()=>({translate:async()=>value??new Promise(resolve=>{finish=resolve;}),destroy(){}})};
 assert.deepEqual(Array.from(await I.translate(['W1 montajı 12.5 m²'],'en')),[null]);value=null;
 const job=I.translate(['Gizli açıklama'],'en');await new Promise(r=>setTimeout(r,0));w.document.dispatchEvent(new w.Event('cephepro:locked'));finish('Private note');await assert.rejects(job,/CONTEXT_CHANGED/);
});
test('actual AI summary and detail paragraphs translate offline in English and German',async t=>{
 const w=browser(t),I=localize(w),html=read('index.html');
 const begin=html.indexOf('function v54CleanSentence('),end=html.indexOf('// Ana AI panel:',begin);w.eval(html.slice(begin,end));
 Object.assign(w,{currentBlock:'A',currentFacade:'Kuzey',v52WorkforceStats:()=>({requiredCrew:7,m2PerWorkerDay:12.35}),v47CompletionResult:()=>({text:'Sonuç: Cephe devam ediyor; planlanan bitişe 8 gün kaldı.'}),v34NoWorkNotes:{A_Kuzey:[{reason:'Yağmur yağdı'}]},v34NoteKey:()=> 'A_Kuzey'});
 const model={targets:[{name:'W1 - ANKRAJ MONTAJI',daily:14.5,unit:'adet'}]};
 const texts=[w.v54EngineerSummary(model),w.v54ManagementComment(model),
  'Mevcut üretim hızı korunursa tahmini bitiş 25.10.2026; plan bitişine göre yaklaşık 5 gün gecikme riski oluşuyor. Üretim, bugünkü plan eğrisinin belirgin gerisinde.',
  'W1 - ANKRAJ MONTAJI için kalan 45.0 adet iş, pursantaj etkisi ve kalan miktar birlikte değerlendirildiğinde ilk kontrol edilmesi gereken darboğaz. Bu kaleme günlük net üretim hedefi ve sorumlu ekip ata.',
  'Güney aynı blokta referans cephe olarak kullanılabilir. Ekip sırası, lojistik akışı ve günlük üretim düzenini bu cepheyle karşılaştır.',
  'Son “Çalışma Olmadı” kaydı: “Yağmur yağdı”. Hava bağımlı işleri uygun zaman penceresine taşı; iç hazırlık, prefabrikasyon ve lojistik işlerini aynı güne kaydır.'];
 for(const lang of ['en','de']){
  await I.setLanguage(lang);for(const source of texts){const translated=I.local(source);assert.notEqual(translated,undefined,source);assert.doesNotMatch(translated,/üretim|kayıt|gün |kalem|Yağmur|ANKRAJ/);assert.deepEqual(translated.match(/\d+(?:[.,]\d+)*/g),source.match(/\d+(?:[.,]\d+)*/g));}
  assert.match(I.t(texts[0]),/W1/);assert.match(I.t(texts[1]),lang==='en'?/It rained/:/Es hat geregnet/);
 }
});

test('a changed quantity is retried with protected tokens and restored exactly',async t=>{
 const w=browser(t),calls=[];
 w.Translator={availability:async()=> 'available',create:async()=>({translate:async source=>{calls.push(source);return source.includes('ZXQKEEP')?source.replace('montajı','installation'):'W1 installation 12,5 m²';}})};
 const result=await w.CepheProLocalTranslation.translate(['W1 montajı 12.5 m²'],'en');
 assert.equal(result[0],'W1 installation 12.5 m²');assert.equal(calls.length,2);
});
test('valid translation can reorder numbers without changing codes or quantities',async t=>{
 const w=browser(t);
 w.Translator={availability:async()=> 'available',create:async()=>({translate:async()=> 'On 17.11.2026, install 150 anchors for W1.'})};
 const result=await w.CepheProLocalTranslation.translate(['W1 için 150 ankraj 17.11.2026 tarihinde monte edilsin.'],'en');
 assert.equal(result[0],'On 17.11.2026, install 150 anchors for W1.');
});
test('one unsafe sentence neither drops other translations nor stops later UI and report jobs',async t=>{
 const w=browser(t),calls=[];
 w.Translator={availability:async()=> 'available',create:async()=>({translate:async source=>{calls.push(source);return source.includes('bozuk')?'W9 damaged 999':source.replace('özgün','original');}})};
 const I=localize(w);await I.setLanguage('en');
 const source=['W1 bozuk açıklama 12.5','İkinci özgün açıklama'];
 const state=await I.ensureReport(source);assert.equal(state.complete,false);
 assert.equal(I.t(source[0]),source[0]);assert.equal(I.t(source[1]),'İkinci original açıklama');
 I.enqueue('Sonraki özgün açıklama');await new Promise(r=>setTimeout(r,180));
 assert.equal(I.t('Sonraki özgün açıklama'),'Sonraki original açıklama');
 assert.doesNotMatch(w.document.getElementById('cpLanguageStatus').textContent,/Translation could not be completed/);
 assert.match(w.document.getElementById('cpReportTranslationWarning').textContent,/original language/);
});
test('browser API failures are classified and a replacement model can recover',async t=>{
 const w=browser(t),I=w.CepheProLocalTranslation;
 w.Translator={availability:async()=>{throw new TypeError('availability failed');},create:async()=>({})};
 await assert.rejects(I.prepare('en'),/TRANSLATION_LOCAL_UNAVAILABLE/);
 let broken=true,creates=0;
 w.Translator={availability:async()=> 'available',create:async()=>{creates++;return {translate:async()=>{if(broken)throw new w.DOMException('session lost','InvalidStateError');return 'Recovered note';}};}};
 await assert.rejects(I.translate(['Özel not'],'en'),/TRANSLATION_LOCAL_UNAVAILABLE/);broken=false;
 assert.equal((await I.translate(['Özel not'],'en'))[0],'Recovered note');assert.equal(creates,2);
});

test('automatic model preparation uses a page gesture without a separate translation button',async t=>{
 const w=browser(t);let active=false,created=0;
 Object.defineProperty(w.navigator,'userActivation',{value:{get isActive(){return active;}}});
 w.Translator={availability:async()=> 'downloadable',create:async()=>{assert.equal(active,true);created++;return {translate:async s=>s.replace('özgün','original')};}};
 const I=localize(w);await I.setLanguage('en');await new Promise(r=>setTimeout(r,10));
 assert.equal(w.document.getElementById('cpLanguageRetry'),null);assert.equal(created,0);
 active=true;w.document.body.click();active=false;await new Promise(r=>setTimeout(r,30));assert.equal(created,1);
 const p=w.document.createElement('p');p.textContent='Sonradan açılan özgün açıklama';w.document.body.appendChild(p);
 await new Promise(r=>setTimeout(r,200));assert.equal(p.textContent,'Sonradan açılan original açıklama');
});
test('prose-only AI fallback translates explanations when a model changes both numbers and placeholders',async t=>{
 const w=browser(t);
 w.Translator={availability:async()=> 'available',create:async()=>({translate:async s=>/[0-9]|ZXQKEEP/.test(s)?'Broken 999':s.replace('ankraj montajı','anchor installation').replace('tamamlandı','completed')})};
 const result=await w.CepheProLocalTranslation.translate(['W1 ankraj montajı 150 tamamlandı'],'en');
 assert.equal(result[0],'W1 anchor installation 150 completed');
});
