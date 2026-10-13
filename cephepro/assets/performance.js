(function(root){
 'use strict';
 const tasks=new Map();let scheduled=false,worker=null,sequence=0;const jobs=new Map();
 function background(key,callback){tasks.set(key,callback);if(!scheduled){scheduled=true;if(root.scheduler?.postTask)root.scheduler.postTask(drain,{priority:'background'}).catch(console.error);else if(root.requestIdleCallback)root.requestIdleCallback(drain,{timeout:250});else setTimeout(drain,16);}}
 function drain(){scheduled=false;const start=performance.now();for(const [key,callback] of tasks){tasks.delete(key);try{callback()}catch(error){console.error('[CephePro background]',error)}if(performance.now()-start>=6)break;}if(tasks.size)background('__continue',()=>{});}
 // Cosmetic repairs run once per newly created element, in short background batches.
 // Text changes must never trigger another full-document computed-style pass.
 function observeElements(selector,repair,key){
  const seen=new WeakSet(),pending=new Set();let walker=null,node=null;
  const flush=()=>{
   const start=performance.now();let count=0;
   while(pending.size||walker){
    if(!walker){const first=pending.values().next().value;pending.delete(first);if(!first.isConnected)continue;walker=document.createTreeWalker(first,1);node=first;}
    if(node?.nodeType===1&&node.isConnected&&!seen.has(node)){seen.add(node);if(node.matches(selector))repair(node);}
    node=walker.nextNode();if(!node)walker=null;
    if(++count>=120||performance.now()-start>=6)break;
   }
   if(pending.size||walker)background(key,flush);
  };
  const enqueue=node=>{if(node.nodeType===1||node.nodeType===9)pending.add(node);};
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)enqueue(node);if(pending.size)background(key,flush);});
  observer.observe(document.body,{childList:true,subtree:true});enqueue(document.body);background(key,flush);return observer;
 }
 function cancel(){if(worker)worker.terminate();worker=null;for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error('İşlem iptal edildi; proje veya oturum değişti.'));}jobs.clear();}
 function run(task,payload,fallback){
  if(typeof root.Worker!=='function')return Promise.resolve().then(fallback);
  if(!worker){try{worker=new Worker('/assets/background-worker.js?v=228.0');}catch(_){return Promise.resolve().then(fallback);}
   worker.onmessage=event=>{const {id,result,error}=event.data||{},job=jobs.get(id);if(!job)return;jobs.delete(id);clearTimeout(job.timer);error?job.reject(Error(error)):job.resolve(result);};
   worker.onerror=()=>{worker?.terminate();worker=null;const failed=[...jobs.values()];jobs.clear();for(const job of failed){clearTimeout(job.timer);Promise.resolve().then(job.fallback).then(job.resolve,job.reject);}};
  }
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(Error('Arka plan işlemi zaman aşımına uğradı. Yeniden deneyin.'));if(!jobs.size){worker?.terminate();worker=null;}},90000);jobs.set(id,{resolve,reject,timer,fallback});try{worker.postMessage({id,task,payload});}catch(error){clearTimeout(timer);jobs.delete(id);reject(error);}});
 }
 const afterPaint=()=>new Promise(resolve=>{if(document.hidden)return setTimeout(resolve,0);requestAnimationFrame(()=>setTimeout(resolve,0));});
 document.addEventListener('cephepro:locked',cancel);document.addEventListener('cephepro:user-ready',event=>{if(event.detail?.previousRole&&event.detail.previousRole!==event.detail.user?.role)cancel();});root.addEventListener('pagehide',cancel);
 root.CepheProPerformance={background,observeElements,run,afterPaint,cancel};
})(window);
