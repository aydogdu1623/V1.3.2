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
 await assert.rejects(I.translate(['W1 montajı 12.5 m²'],'en'),/INVALID_RESPONSE/);value=null;
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
