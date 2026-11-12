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
  let availability;
  try{availability=await root.Translator.availability({sourceLanguage:'tr',targetLanguage:language});}
  catch{throw error('TRANSLATION_LOCAL_UNAVAILABLE');}
  if(sessions.has(language))return sessions.get(language);
  if(availability==='unavailable')throw error('TRANSLATION_LOCAL_UNAVAILABLE');
  if(availability!=='available')throw error('TRANSLATION_DOWNLOAD_REQUIRED');
  return create(language);
 }
 async function translate(texts,language,{signal}={}){
  const seq=generation,translator=await prepare(language),result=[];
  const check=()=>{if(seq!==generation||signal?.aborted)throw error('TRANSLATION_CONTEXT_CHANGED');};
  const numbers=s=>(s.match(/\d+(?:[.,:/-]\d+)*/g)||[]).sort();
  const codes=s=>(s.match(/(?<![\p{L}\d_])[\p{L}_]+[-_]?\d+[\p{L}\d_-]*/gu)||[]).sort();
  const safe=(source,value)=>typeof value==='string'&&!!value.trim()&&JSON.stringify(numbers(source))===JSON.stringify(numbers(value))&&JSON.stringify(codes(source))===JSON.stringify(codes(value));
  const call=async source=>{
   try{return await translator.translate(source,{signal});}
   catch(e){check();sessions.delete(language);emit(language,'unavailable');throw error(e?.name==='NotAllowedError'?'TRANSLATION_DOWNLOAD_REQUIRED':'TRANSLATION_LOCAL_UNAVAILABLE');}
  };
  for(const source of texts){
   check();let value=await call(source);check();
   if(!safe(source,value)){
    // Retry with exact placeholders before discarding an unsafe translation.
    // A bad sentence must not discard translations for the rest of the batch.
    let prefix='ZXQKEEP';while(source.includes(prefix))prefix+='X';
    const kept=[];
    const protectedText=source.replace(/(?<![\p{L}\d_])[\p{L}_]+[-_]?\d+[\p{L}\d_-]*|\d+(?:[.,:/-]\d+)*/gu,token=>{
     let n=kept.length,suffix='';do{suffix=String.fromCharCode(65+n%26)+suffix;n=Math.floor(n/26)-1;}while(n>=0);
     const marker=prefix+'_'+suffix+'_QXZ';kept.push([marker,token]);return marker;
    });
    if(kept.length){
     let retried=await call(protectedText);check();
     if(typeof retried==='string'&&kept.every(([marker])=>retried.split(marker).length===2)){
      for(const [marker,token] of kept)retried=retried.replace(marker,()=>token);
      value=retried;
     }
    }
   }
   result.push(safe(source,value)?value:null);
  }
  return result;
 }
 function reset(){generation++;for(const promise of sessions.values())promise.then(t=>t.destroy?.()).catch(()=>{});sessions.clear();states.clear();}
 root.CepheProLocalTranslation={prepare,translate,state:lang=>states.get(lang)||'idle',supported:()=>!!root.Translator?.create,reset};
 document.addEventListener('cephepro:locked',reset);
})(window);
