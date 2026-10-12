/* Display-only localization: identifiers, editable source values and stored records stay intact. */
(function(root){
 'use strict';
 const normalize=s=>String(s).normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
 const dictionaries={en:new Map(),de:new Map()};
 for(const [source,values] of Object.entries(root.CepheProDictionary||{}))for(const lang of ['en','de'])dictionaries[lang].set(normalize(source),values[lang]);
 const templates=Object.entries(root.CepheProDictionary||{}).filter(([key])=>/\{\w+\}/.test(key)).map(([key,values])=>{const names=[];const parts=key.split(/(\{\w+\})/g);const pattern=parts.map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part);return '(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');return {pattern:new RegExp('^'+pattern+'$','u'),names,values};});
 const PREF='cephepro_language',SKIP='script,style,textarea,input,[contenteditable="true"],[translate="no"],[data-cp-no-translate],#cpLanguageStatus';
 let language='tr';try{const saved=localStorage.getItem(PREF);if(['tr','en','de'].includes(saved))language=saved;}catch{}
 let generation=0,controller=null,running=null,timer=null,paused=false;
 const cache=new Map(),pending=new Set(),failed=new Set(),tracked=new Set(),sources=new WeakMap(),attributeSources=new WeakMap();
 const languageNames={tr:'Türkçe',en:'English',de:'Deutsch'};
 const token=()=>localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
 const context=()=>String(root.CepheProProjects?.project()?.id||'')+'|'+token();
 const ready=()=>!!root.CepheProProjects?.isReady();
 function translatable(s){return typeof s==='string'&&s.trim().length>1&&/[\p{L}]/u.test(s)&&!/^([\d\s.,%+−×/*():₺€$-]+|[\p{L}0-9_-]*\d[\p{L}0-9_.-]*|https?:\/\/\S+|\S+@\S+|data:.*)$/u.test(s.trim())&&!/^(?:m²|m³|kg|mm|cm|TL|TRY|EUR|USD|IBAN|TC|X|PM|BM|HT|RT)$/i.test(s.trim());}
 function local(s,lang=language){
  if(lang==='tr'||!translatable(s))return s;
  for(const template of templates){const match=s.trim().match(template.pattern);if(match){let text=template.values[lang];template.names.forEach((name,i)=>text=text.split(name).join(match[i+1]));return text;}}
  const found=dictionaries[lang].get(normalize(s));
  if(found){const core=s.trim(),upper=core===core.toLocaleUpperCase('tr-TR');return s.slice(0,s.indexOf(core))+(upper?found.toLocaleUpperCase(lang):found)+s.slice(s.indexOf(core)+core.length);}
  // Keep button icons outside the translation unit.
  const m=s.match(/^([^\p{L}\p{N}]*)([\s\S]+?)([\s:]*$)/u);
  if(m&&m[2]!==s){const word=dictionaries[lang].get(normalize(m[2]));if(word)return m[1]+word+m[3];}
  return cache.get(lang+'|'+s);
 }
 function t(s,lang=language){if(typeof s!=='string')return s;return local(s,lang)??s;}
 function status(text,error=false){const el=document.getElementById('cpLanguageStatus');if(el){el.textContent=t(text);el.dataset.error=String(error);}const retry=document.getElementById('cpLanguageRetry');if(retry)retry.hidden=!error;}
 function enqueue(s){if(language==='tr'||!translatable(s)||local(s)!==undefined||failed.has(language+'|'+s)||!ready()||paused)return;pending.add(s);if(!timer&&!running)timer=setTimeout(()=>{timer=null;drain().catch(()=>{});},100);}
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
 }
 function scan(node){
  if(node.nodeType===3){renderText(node);return;}
  if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;
  renderAttributes(node);const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode())){if(n.nodeType===3)renderText(n);else renderAttributes(n);}
 }
 function refreshTracked(){for(const n of tracked){if(!n.isConnected){tracked.delete(n);continue;}n.nodeType===3?renderText(n):renderAttributes(n);}}
 async function request(texts,lang,seq,ctx){
  const response=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({language:lang,texts}),signal:controller?.signal,cache:'no-store'});
  const data=await response.json();
  if(seq!==generation||ctx!==context())throw Error('TRANSLATION_CONTEXT_CHANGED');
  if(!response.ok||!Array.isArray(data.translations)||data.translations.length!==texts.length)throw Error(data.code||'TRANSLATION_UNAVAILABLE');
  texts.forEach((s,i)=>{if(typeof data.translations[i]!=='string')throw Error('TRANSLATION_INVALID_RESPONSE');cache.set(lang+'|'+s,data.translations[i]);});
 }
 async function drain(){
  if(running)return running;if(!pending.size||language==='tr'||!ready()||paused)return;
  const seq=generation,lang=language,ctx=context();controller=new AbortController();status('Çeviriler hazırlanıyor…');
  const work=(async()=>{try{
   while(pending.size&&seq===generation){const batch=[];let count=0;for(const s of pending){if(batch.length>=40||count+s.length>9000&&batch.length)break;pending.delete(s);batch.push(s);count+=s.length;}
    await request(batch,lang,seq,ctx);refreshTracked();await new Promise(r=>setTimeout(r,0));
   }if(seq===generation)status('Çeviriler hazır.');
  }catch(e){if(seq===generation){for(const s of pending)failed.add(lang+'|'+s);pending.clear();paused=true;status(e.message==='TRANSLATION_SETUP_REQUIRED'?'Otomatik çeviri bağlantısı hazır değil. Yöneticinize başvurun.':'Çeviri tamamlanamadı. Tekrar deneyin.',true);}throw e;}
  finally{if(seq===generation)running=null;}})();running=work;return work;
 }
 async function ensure(texts,{strict=true}={}){
  if(language==='tr')return;
  const lang=language,seq=generation;
  const list=[...new Set(texts.filter(s=>typeof s==='string'&&translatable(s)))];
  if(paused){paused=false;failed.clear();}
  for(const s of list)enqueue(s);
  await drain();
  if(seq!==generation||lang!==language)throw Error('Dil veya proje değişti. Raporu yeniden oluşturun.');
  if(strict&&list.some(s=>local(s)===undefined))throw Error(t('Çeviri tamamlanamadı. Tekrar deneyin.'));
 }
 async function translateElement(el){
  if(language==='tr')return el;const texts=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode()))if(eligible(n))texts.push(sources.get(n)?.source??n.nodeValue);
  await ensure(texts);scan(el);return el;
 }
 function reset(){generation++;controller?.abort();running=null;clearTimeout(timer);timer=null;pending.clear();failed.clear();paused=false;cache.clear();}
 async function setLanguage(value){
  if(!['tr','en','de'].includes(value))return;reset();language=value;try{localStorage.setItem(PREF,value);}catch{}
  document.documentElement.lang=value;document.documentElement.dataset.cpLanguage=value;
  const select=document.getElementById('cpLanguageSelect');if(select)select.value=value;
  refreshTracked();scan(document.body);status(value==='tr'?'Türkçe özgün metinler gösteriliyor.':'Çeviriler hazırlanıyor…');
  document.dispatchEvent(new CustomEvent('cephepro:language-changed',{detail:{language:value}}));
  try{await drain();}catch{}return value;
 }
 function mount(){
  const general=document.getElementById('settingsGeneral');if(general&&!document.getElementById('cpLanguageSelect')){
   const box=document.createElement('div');box.className='report-preview cp-language-settings';
   box.innerHTML='<label for="cpLanguageSelect">Site ve rapor dili</label><select id="cpLanguageSelect" translate="no"><option value="tr">Türkçe</option><option value="en">English</option><option value="de">Deutsch</option></select><p id="cpLanguageStatus" role="status" aria-live="polite"></p><button id="cpLanguageRetry" type="button" hidden>Tekrar Dene</button>';
   general.prepend(box);box.querySelector('select').value=language;box.querySelector('select').onchange=e=>setLanguage(e.target.value);
   box.querySelector('button').onclick=()=>{paused=false;failed.clear();refreshTracked();drain().catch(()=>{});};
  }
 }
 const roots=new Set();let scheduled=false;
 function schedule(node){roots.add(node);if(scheduled)return;scheduled=true;(root.CepheProPerformance?.background||((key,fn)=>setTimeout(fn,16)))('i18n',()=>{
  scheduled=false;const start=performance.now();for(const n of roots){roots.delete(n);if(n.isConnected)scan(n);if(performance.now()-start>6)break;}if(roots.size)schedule(roots.values().next().value);
 });}
 const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'){const s=sources.get(record.target);if(!s||record.target.nodeValue!==s.output)schedule(record.target);}else if(record.type==='attributes'){const s=attributeSources.get(record.target)?.[record.attributeName];if(!s||record.target.getAttribute(record.attributeName)!==s.output)schedule(record.target);}else for(const n of record.addedNodes)schedule(n);}});
 root.CepheProI18n={t,ensure,translateElement,setLanguage,language:()=>language,locale:()=>({tr:'tr-TR',en:'en-GB',de:'de-DE'}[language]),context,scan,local,translatable};
 document.addEventListener('cephepro:locked',()=>{reset();tracked.clear();});
 document.addEventListener('cephepro:state-updated',()=>{mount();schedule(document.body);});
 document.addEventListener('cephepro:user-ready',()=>{mount();schedule(document.body);});
 root.addEventListener('storage',e=>{if(e.key===PREF)setLanguage(e.newValue||'tr');});
 // Native alerts are synchronous; built-in messages are localized without changing their return values.
 for(const name of ['alert','confirm','prompt'])if(typeof root[name]==='function'){const native=root[name].bind(root);root[name]=(message,...args)=>native(t(message),...args);}
 mount();document.documentElement.lang=language;document.documentElement.dataset.cpLanguage=language;
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label','alt']});schedule(document.body);
})(window);
