/* Free, on-device translation. No text, credentials or requests go to a translation server. */
(function(root){
 'use strict';
 const sessions=new Map(),states=new Map();let generation=0;
 const emit=(language,state,progress)=>{states.set(language,state);document.dispatchEvent(new CustomEvent('cephepro:local-translation',{detail:{language,state,progress}}));};
 const error=code=>Error(code);
 function create(language){
  const seq=generation;emit(language,'loading');
  let created;try{created=root.Translator.create({sourceLanguage:'tr',targetLanguage:language,monitor(m){m.addEventListener('downloadprogress',e=>{if(seq===generation)emit(language,'loading',Math.round(e.loaded*100));});}});}catch(e){emit(language,'unavailable');throw error(e?.name==='NotAllowedError'?'TRANSLATION_DOWNLOAD_REQUIRED':'TRANSLATION_LOCAL_UNAVAILABLE');}
  const promise=Promise.resolve(created).then(translator=>{
   if(seq!==generation){translator.destroy?.();throw error('TRANSLATION_CONTEXT_CHANGED');}
   emit(language,'ready');return translator;
  }).catch(e=>{if(seq===generation){sessions.delete(language);emit(language,'unavailable');}throw e?.message?.startsWith('TRANSLATION_')?e:error(e?.name==='NotAllowedError'?'TRANSLATION_DOWNLOAD_REQUIRED':'TRANSLATION_LOCAL_UNAVAILABLE');});
  sessions.set(language,promise);return promise;
 }
 async function prepare(language,{interactive=false}={}){
  if(!['en','de'].includes(language))return null;
  if(!root.Translator?.create||!root.Translator?.availability)throw error('TRANSLATION_BROWSER_UNSUPPORTED');
  if(sessions.has(language))return sessions.get(language);
  // Start inside the language/button gesture, before any asynchronous availability check.
  if(interactive&&root.navigator.userActivation?.isActive)return create(language);
  const availability=await root.Translator.availability({sourceLanguage:'tr',targetLanguage:language});
  if(sessions.has(language))return sessions.get(language);
  if(availability==='unavailable')throw error('TRANSLATION_LOCAL_UNAVAILABLE');
  if(availability!=='available')throw error('TRANSLATION_DOWNLOAD_REQUIRED');
  return create(language);
 }
 async function translate(texts,language,{signal}={}){
  const seq=generation,translator=await prepare(language),result=[];
  for(const source of texts){
   if(seq!==generation||signal?.aborted)throw error('TRANSLATION_CONTEXT_CHANGED');
   const value=await translator.translate(source);
   if(seq!==generation||signal?.aborted)throw error('TRANSLATION_CONTEXT_CHANGED');
   if(typeof value!=='string'||!value.trim())throw error('TRANSLATION_INVALID_RESPONSE');
   // Never accept a model changing a position code, quantity or date in a report.
   const numbers=s=>s.match(/\d+(?:[.,:/-]\d+)*/g)||[];
   const codes=source.match(/(?<![\p{L}\d_])[\p{L}_]+[-_]?\d+[\p{L}\d_-]*/gu)||[];
   if(JSON.stringify(numbers(source))!==JSON.stringify(numbers(value))||codes.some(code=>!value.includes(code)))throw error('TRANSLATION_INVALID_RESPONSE');
   result.push(value);
  }
  return result;
 }
 function reset(){generation++;for(const promise of sessions.values())promise.then(t=>t.destroy?.()).catch(()=>{});sessions.clear();states.clear();}
 root.CepheProLocalTranslation={prepare,translate,state:lang=>states.get(lang)||'idle',supported:()=>!!root.Translator?.create,reset};
 document.addEventListener('cephepro:locked',reset);
})(window);
