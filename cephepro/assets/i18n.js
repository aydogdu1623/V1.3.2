/* Display-only localization: identifiers, editable source values and stored records stay intact. */
(function(root){
 'use strict';
 const normalize=s=>String(s).normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
 const dictionaries={en:new Map(),de:new Map()};
 for(const [source,values] of Object.entries(root.CepheProDictionary||{}))for(const lang of ['en','de'])dictionaries[lang].set(normalize(source),values[lang]);
 const templates=Object.entries(root.CepheProDictionary||{}).filter(([key])=>/\{\w+\}/.test(key)).map(([key,values])=>{const names=[];const parts=key.split(/(\{\w+\})/g);const pattern=parts.map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part);return part==='{n}'?'([\\d.,%+/-]+)':'(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');return {pattern:new RegExp('^'+pattern+'$','u'),names,values};});
 const PREF='cephepro_language',SKIP='script,style,textarea,input,[contenteditable="true"],[translate="no"],[data-cp-no-translate],#cpLanguageStatus,#cpLanguageRetry,.cp-i18n-value';
 let language='tr';try{const saved=localStorage.getItem(PREF);if(['tr','en','de'].includes(saved))language=saved;}catch{}
 let generation=0,running=null,timer=null,paused=false,reports=0;
 const controllers=new Set(),inflight=new Map();
 const cache=new Map(),pending=new Set(),failed=new Set(),tracked=new Set(),sources=new WeakMap(),attributeSources=new WeakMap();
 const languageNames={tr:'Türkçe',en:'English',de:'Deutsch'};
 const token=()=>localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
 const context=()=>String(root.CepheProProjects?.project()?.id||'')+'|'+token();
 const ready=()=>!!root.CepheProProjects?.isReady();
 function fragments(s){const parts=[];while(s.length>2400){let at=s.lastIndexOf(' ',2400);if(at<1200)at=2400;else at++;parts.push(s.slice(0,at));s=s.slice(at);}if(s)parts.push(s);return parts;}
 function translatable(s){return typeof s==='string'&&s.trim().length>1&&/[\p{L}]/u.test(s)&&!/^([\d\s.,%+−×/*():₺€$-]+|[\p{L}0-9_-]*\d[\p{L}0-9_.-]*|https?:\/\/\S+|\S+@\S+|data:.*)$/u.test(s.trim())&&!/^(?:m²|m³|kg|mm|cm|TL|TRY|EUR|USD|IBAN|TC|X|PM|BM|HT|RT)$/i.test(s.trim());}
 function local(s,lang=language,depth=0){
  if(lang==='tr'||!translatable(s))return s;
  const found=dictionaries[lang].get(normalize(s));
  if(found){const core=s.trim(),upper=core===core.toLocaleUpperCase('tr-TR');return s.slice(0,s.indexOf(core))+(upper?found.toLocaleUpperCase(lang):found)+s.slice(s.indexOf(core)+core.length);}
  const saved=cache.get(lang+'|'+s);if(saved!==undefined)return saved;
  if(s.length>2400){const parts=fragments(s).map(part=>local(part,lang,depth+1));return parts.every(p=>p!==undefined)?parts.join(''):undefined;}
  for(const template of templates){const match=s.trim().match(template.pattern);if(match){let text=template.values[lang],complete=true;template.names.forEach((name,i)=>{const source=match[i+1],value=/\{(?:text|item|label|month|reason|action|facade|unit)\}/.test(name)?(depth<5?local(source,lang,depth+1):undefined):source;if(value===undefined)complete=false;text=text.split(name).join(value??source);});if(complete)return s.match(/^\s*/)[0]+text+s.match(/\s*$/)[0];}}
  // Keep button icons outside the translation unit.
  const m=s.match(/^([^\p{L}\p{N}]*)([\s\S]+?)([\s:▾▼⌄…]*$)/u);
  if(m&&m[2]!==s){const word=dictionaries[lang].get(normalize(m[2]));if(word)return m[1]+word+m[3];}
  if(depth<3){
   // Composite labels keep their numbers, item codes, units and separators intact.
   const coded=s.match(/^([\p{L}\d_]+\d[\p{L}\d_]*\s*[-–—·]\s*)(.+)$/u);
   if(coded){const tail=local(coded[2],lang,depth+1);if(tail!==undefined)return coded[1]+tail;}
   const suffix=s.match(/^(.+?)(\s*\((?:[₺€$%]|TL|m²|m³|\d+)\)|\s*[%₺€$])$/u);
   if(suffix){const head=local(suffix[1],lang,depth+1);if(head!==undefined)return head+suffix[2];}
   const numbered=s.match(/^(\d+[.]\s*)(.+)$/u);if(numbered){const tail=local(numbered[2],lang,depth+1);if(tail!==undefined)return numbered[1]+tail;}
   const parts=s.split(/(\s+[·/—–]\s+|\s*:\s*|\n)/u);
   if(parts.length>1){let changed=false,complete=true;const translated=parts.map((p,i)=>{if(i%2)return p;const v=local(p,lang,depth+1);if(v===undefined){complete=false;return p;}changed||=v!==p;return v;});if(complete&&changed)return translated.join('');}
  }
  if(depth<5){const sentences=s.split(/(?<=[.!?])(?=\s+[\p{Lu}“])/u);if(sentences.length>1){const translated=sentences.map(sentence=>local(sentence,lang,depth+1));if(translated.every(value=>value!==undefined))return translated.join('');}}
  return undefined;
 }
 function t(s,lang=language){if(typeof s!=='string')return s;return local(s,lang)??s;}
 function status(text,error=false){const el=document.getElementById('cpLanguageStatus');if(el){el.textContent=t(text);el.dataset.error=String(error);}const retry=document.getElementById('cpLanguageRetry');if(retry){retry.hidden=language==='tr';retry.textContent=t(error?'Ücretsiz çeviriyi başlat':'Çeviriyi yenile');}}
 function enqueue(s){if(language==='tr'||!translatable(s)||local(s)!==undefined||failed.has(language+'|'+s)||!ready()||paused)return;for(const part of fragments(s))if(local(part)===undefined)pending.add(part);if(!timer&&!running)timer=setTimeout(()=>{timer=null;drain().catch(()=>{});},100);}
 function eligible(node){return node.nodeType===3&&node.parentElement&&!node.parentElement.closest(SKIP);}
 function renderText(node){
  if(!eligible(node))return;
  let state=sources.get(node);if(!state||node.nodeValue!==state.output){state={source:node.nodeValue,output:node.nodeValue};sources.set(node,state);}
  // An option without value would otherwise change its submitted identifier when translated.
  if(node.parentElement.tagName==='OPTION'&&!node.parentElement.hasAttribute('value'))node.parentElement.setAttribute('value',node.parentElement.value);
  const value=t(state.source);if(node.nodeValue!==value)node.nodeValue=value;state.output=value;tracked.add(node);enqueue(state.source);
 }
 function renderAttributes(el){
  if(el.nodeType!==1||el.closest(SKIP)&&!el.matches('input,textarea'))return;
  if(el.matches('[translate="no"],[data-cp-no-translate]')||el.closest('[data-cp-no-translate]'))return;
  let states=attributeSources.get(el);if(!states){states={};attributeSources.set(el,states);}
  for(const attr of ['placeholder','title','aria-label','alt'])if(el.hasAttribute(attr)){
   let state=states[attr];const value=el.getAttribute(attr);if(!state||value!==state.output)state=states[attr]={source:value,output:value};
   const translated=t(state.source);if(value!==translated)el.setAttribute(attr,translated);state.output=translated;enqueue(state.source);
  }
  if(Object.keys(states).length)tracked.add(el);
  root.CepheProI18n?.renderValue?.(el);
 }
 function scan(node){
  if(node.nodeType===3){renderText(node);return;}
  if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;
  renderAttributes(node);const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode())){if(n.nodeType===3)renderText(n);else renderAttributes(n);}
 }
 function refreshTracked(){for(const n of tracked){if(!n.isConnected){tracked.delete(n);continue;}n.nodeType===3?renderText(n):renderAttributes(n);}root.CepheProI18n?.refreshValues?.();}
 async function fetchBatch(texts,lang,seq,ctx){
  const controller=new AbortController();controllers.add(controller);let timeout,translations;
  try{
   if(!root.CepheProLocalTranslation)throw Error('TRANSLATION_BROWSER_UNSUPPORTED');
   translations=await Promise.race([
    root.CepheProLocalTranslation.translate(texts,lang,{signal:controller.signal}),
    new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('TRANSLATION_TIMEOUT'));},30000);})
   ]);
  }finally{clearTimeout(timeout);controllers.delete(controller);}
  if(seq!==generation||ctx!==context())throw Error('TRANSLATION_CONTEXT_CHANGED');
  if(!Array.isArray(translations)||translations.length!==texts.length||translations.some(s=>typeof s!=='string'||!s.trim()))throw Error('TRANSLATION_INVALID_RESPONSE');
  texts.forEach((s,i)=>{const start=s.match(/^\s*/)[0],end=s.match(/\s*$/)[0];cache.set(lang+'|'+s,start+translations[i].trim()+end);pending.delete(s);});
 }
 async function request(texts,lang,seq,ctx){
  const missing=texts.filter(s=>local(s,lang)===undefined),fresh=missing.filter(s=>!inflight.has(lang+'|'+s));
  let work;
  if(fresh.length){work=fetchBatch(fresh,lang,seq,ctx);for(const s of fresh)inflight.set(lang+'|'+s,work);}
  try{await Promise.all([...new Set(missing.map(s=>inflight.get(lang+'|'+s)))]);}
  finally{if(work)for(const s of fresh)if(inflight.get(lang+'|'+s)===work)inflight.delete(lang+'|'+s);}
  if(seq!==generation||ctx!==context())throw Error('TRANSLATION_CONTEXT_CHANGED');
 }
 async function drain(){
  if(running)return running;if(!pending.size||language==='tr'||!ready()||paused||reports)return;
  const seq=generation,lang=language,ctx=context();status('Çeviriler hazırlanıyor…');
  const work=(async()=>{try{
   while(pending.size&&seq===generation&&!reports){const batch=[];let count=0;for(const s of pending){if(batch.length>=40||count+s.length>9000&&batch.length)break;pending.delete(s);if(local(s,lang)!==undefined)continue;batch.push(s);count+=s.length;}
    await request(batch,lang,seq,ctx);refreshTracked();await new Promise(r=>setTimeout(r,0));
   }if(seq===generation&&!pending.size)status('Çeviriler hazır.');
  }catch(e){if(seq===generation){for(const s of pending)failed.add(lang+'|'+s);pending.clear();paused=true;status(errorMessage(e.message),true);}throw e;}
  finally{if(seq===generation)running=null;}})();running=work;return work;
 }
 async function ensure(texts,{strict=true,timeoutMs=120000}={}){
  if(language==='tr')return;
  const lang=language,seq=generation,ctx=context(),deadline=Date.now()+timeoutMs;
  const list=[...new Set(texts.filter(s=>typeof s==='string'&&translatable(s)))];
  const missing=[...new Set(list.filter(s=>local(s,lang)===undefined).flatMap(fragments))].filter(s=>local(s,lang)===undefined);
  if(!missing.length)return;
  if(!ready())throw Error('TRANSLATION_PROJECT_REQUIRED');
  reports++;let completed=0;
  const progress=()=>document.dispatchEvent(new CustomEvent('cephepro:translation-progress',{detail:{completed,total:missing.length,language:lang}}));
  try{
   progress();
   // Report strings have their own queue: unrelated screens must never delay a download.
   while(completed<missing.length){
    if(seq!==generation||ctx!==context())throw Error('TRANSLATION_CONTEXT_CHANGED');
    const batch=[];let count=0;
    for(const s of missing.slice(completed)){if(batch.length>=40||count+s.length>9000&&batch.length)break;batch.push(s);count+=s.length;}
    let timeout;
    try{await Promise.race([request(batch,lang,seq,ctx),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('TRANSLATION_TIMEOUT')),Math.max(0,deadline-Date.now()));})]);}finally{clearTimeout(timeout);}
    completed+=batch.length;progress();
   }
   if(seq!==generation||lang!==language||ctx!==context())throw Error('TRANSLATION_CONTEXT_CHANGED');
   if(strict&&list.some(s=>local(s,lang)===undefined))throw Error('TRANSLATION_INVALID_RESPONSE');
   paused=false;failed.clear();refreshTracked();
  }catch(error){if(seq===generation){paused=true;status(errorMessage(error.message),true);}throw error;}
  finally{reports--;if(!reports&&!paused)drain().catch(()=>{});}
 }
 function reportWarning(){
  let box=document.getElementById('cpReportTranslationWarning');
  if(!box){box=document.createElement('div');box.id='cpReportTranslationWarning';box.setAttribute('role','status');box.setAttribute('translate','no');}
  const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;if(box.parentElement!==host)host.appendChild(box);
  box.replaceChildren();const text=document.createElement('span');text.textContent=t('Dosya indirilebilir. Bazı özel açıklamalar özgün dilinde kaldı. Tam çeviri için Ayarlar > Genel bölümünden ücretsiz çeviriyi başlatın.');
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',t('Kapat'));close.onclick=()=>box.remove();box.append(text,close);
 }
 async function ensureReport(texts){
  const lang=language,ctx=context();let failure;
  try{await ensure(texts,{timeoutMs:15000});}catch(e){failure=e;}
  if(language!==lang||context()!==ctx||failure?.message==='TRANSLATION_CONTEXT_CHANGED'||failure?.message==='TRANSLATION_PROJECT_REQUIRED')throw Error('TRANSLATION_CONTEXT_CHANGED');
  const complete=texts.every(s=>typeof s!=='string'||local(s,lang)!==undefined);
  if(!complete)reportWarning();return {complete};
 }
 async function translateElement(el){
  if(language==='tr')return el;const texts=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode()))if(eligible(n))texts.push(sources.get(n)?.source??n.nodeValue);
  await ensureReport(texts);scan(el);return el;
 }
 function reset(){generation++;for(const controller of controllers)controller.abort();controllers.clear();inflight.clear();running=null;clearTimeout(timer);timer=null;pending.clear();failed.clear();paused=false;cache.clear();}
 async function setLanguage(value){
  if(!['tr','en','de'].includes(value))return;reset();language=value;try{localStorage.setItem(PREF,value);}catch{}
  document.documentElement.lang=value;document.documentElement.dataset.cpLanguage=value;
  const select=document.getElementById('cpLanguageSelect');if(select)select.value=value;
  if(value!=='tr')root.CepheProLocalTranslation?.prepare(value,{interactive:true}).catch(()=>{});
  refreshTracked();scan(document.body);status(value==='tr'?'Türkçe özgün metinler gösteriliyor.':'Çeviriler hazırlanıyor…');
  document.dispatchEvent(new CustomEvent('cephepro:language-changed',{detail:{language:value}}));
  try{await drain();if(!paused&&value!=='tr')status('Hazır metinler çevrildi. Özel açıklamalar için ücretsiz çeviriyi başlatabilirsiniz.');}catch{}return value;
 }
 function mount(){
  const general=document.getElementById('settingsGeneral');if(general&&!document.getElementById('cpLanguageSelect')){
   const box=document.createElement('div');box.className='report-preview cp-language-settings';
   box.innerHTML='<label for="cpLanguageSelect">Site ve rapor dili</label><select id="cpLanguageSelect" translate="no"><option value="tr">Türkçe</option><option value="en">English</option><option value="de">Deutsch</option></select><p id="cpLanguageStatus" role="status" aria-live="polite"></p><button id="cpLanguageRetry" type="button" hidden>Tekrar Dene</button>';
   general.prepend(box);box.querySelector('select').value=language;box.querySelector('select').onchange=e=>setLanguage(e.target.value);
   box.querySelector('button').onclick=async()=>{try{await root.CepheProLocalTranslation?.prepare(language,{interactive:true});paused=false;failed.clear();refreshTracked();scan(document.body);await drain();}catch(e){status(errorMessage(e.message),true);}};
  }
 }
 const roots=new Set();let scheduled=false;
 function schedule(node){roots.add(node);if(scheduled)return;scheduled=true;(root.CepheProPerformance?.background||((key,fn)=>setTimeout(fn,16)))('i18n',()=>{
  scheduled=false;const start=performance.now();for(const n of roots){roots.delete(n);if(n.isConnected)scan(n);if(performance.now()-start>6)break;}if(roots.size)schedule(roots.values().next().value);
 });}
 const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'){const s=sources.get(record.target);if(!s||record.target.nodeValue!==s.output)schedule(record.target);}else if(record.type==='attributes'){const s=attributeSources.get(record.target)?.[record.attributeName];if(!s||record.target.getAttribute(record.attributeName)!==s.output)schedule(record.target);}else for(const n of record.addedNodes)schedule(n);}});
 function errorMessage(code){return ({TRANSLATION_BROWSER_UNSUPPORTED:'Bu tarayıcı ücretsiz otomatik çeviriyi desteklemiyor. Masaüstü Chrome kullanın. Raporları yine indirebilirsiniz.',TRANSLATION_DOWNLOAD_REQUIRED:'Özel açıklamaları çevirmek için Ücretsiz çeviriyi başlat düğmesine basın. İlk kullanımda dil paketi indirilir.',TRANSLATION_LOCAL_UNAVAILABLE:'Ücretsiz dil paketi kullanılamıyor. Raporları hazır çevirilerle indirebilirsiniz.',TRANSLATION_TIMEOUT:'Çeviri zaman aşımına uğradı. İndirme düğmesine yeniden basın.',TRANSLATION_CONTEXT_CHANGED:'Dil veya proje değişti. Raporu yeniden oluşturun.',TRANSLATION_PROJECT_REQUIRED:'Raporu indirmek için projeye yeniden giriş yapın.',SESSION_EXPIRED:'Oturum süresi doldu. Yeniden giriş yapın.',TRANSLATION_SETUP_REQUIRED:'Otomatik çeviri için Vercel AI Gateway kurulumu tamamlanmalı.',TRANSLATION_VERIFICATION_REQUIRED:'Vercel, ücretsiz otomatik çeviriyi açmak için hesap sahibinden kart doğrulaması istiyor.',TRANSLATION_CREDITS_REQUIRED:'Otomatik çeviri kredisi tükendi. Kayıtlarınız korunuyor.',TRANSLATION_AUTH_REQUIRED:'Çeviri servisi kimlik doğrulaması başarısız. Bağlantı ayarları kontrol edilmeli.',TRANSLATION_RATE_LIMIT:'Çeviri servisi yoğun. Kısa süre sonra tekrar deneyin.'})[code]||'Çeviri tamamlanamadı. Tekrar deneyin.';}
 function downloadError(error){const code=String(error?.message||error||'');if(code.startsWith('TRANSLATION_')||code==='SESSION_EXPIRED'){const message=t(errorMessage(code));root.alert(message);return message;}return code;}
 root.CepheProI18n={prepareDownload:()=>{if(language!=='tr')root.CepheProLocalTranslation?.prepare(language,{interactive:true}).catch(()=>{});},downloadError,t,ensure,ensureReport,translateElement,setLanguage,language:()=>language,locale:()=>({tr:'tr-TR',en:'en-GB',de:'de-DE'}[language]),context,scan,local,translatable,enqueue,errorMessage};
 document.addEventListener('cephepro:local-translation',e=>{if(e.detail.language!==language)return;if(e.detail.state==='loading')status(t('Ücretsiz dil paketi hazırlanıyor…')+(e.detail.progress===undefined?'':' '+e.detail.progress+'%'));if(e.detail.state==='ready'){paused=false;failed.clear();refreshTracked();drain().catch(()=>{});}});
 document.addEventListener('click',e=>{if(language!=='tr'&&e.target?.closest?.('#settingsExcelBtn,#settingsWordBtn,#settingsPdfBtn,#cl-excel,#v40DetailBtn'))root.CepheProLocalTranslation?.prepare(language,{interactive:true}).catch(()=>{});},true);
 document.addEventListener('cephepro:locked',()=>{reset();tracked.clear();});
 document.addEventListener('cephepro:state-updated',()=>{mount();schedule(document.body);});
 document.addEventListener('cephepro:user-ready',()=>{mount();schedule(document.body);});
 root.addEventListener('storage',e=>{if(e.key===PREF)setLanguage(e.newValue||'tr');});
 // Native alerts are synchronous; built-in messages are localized without changing their return values.
 for(const name of ['alert','confirm','prompt'])if(typeof root[name]==='function'){const native=root[name].bind(root);root[name]=(message,...args)=>native(t(message),...args);}
 mount();document.documentElement.lang=language;document.documentElement.dataset.cpLanguage=language;
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label','alt']});schedule(document.body);
})(window);
