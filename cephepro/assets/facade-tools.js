/* Project-persisted facade groups and complete facade copy/rename operations. */
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const admin=()=>typeof currentUser!=='undefined'&&currentUser?.role==='admin';
 const group=facade=>String(facade?.groupName||'');
 const context=()=>root.CepheProProjects?.project()?.id||'';
 const say=text=>typeof toast==='function'&&toast(root.CepheProI18n?.t(text)||text);
 const id=()=>root.crypto.randomUUID();
 let filter=null,busy=false;
 const expanded=new Map();
 const groups=b=>[...new Set(Object.values(DATA[b]||{}).map(group).filter(Boolean))];
 function visibleNames(b){return Object.keys(DATA[b]||{}).filter(f=>!filter||filter.block!==b||group(DATA[b][f])===filter.name);}
 function refresh(){
  if(typeof rebuildTree==='function')rebuildTree();
  if(typeof v32RenderTree==='function')v32RenderTree();
  if(typeof v32RenderFacades==='function')v32RenderFacades();
  if(typeof renderFacade==='function')renderFacade();
 }
 function assignGroup(b,names,name){
  if(!admin())return false;
  name=String(name||'').trim().slice(0,100);
  for(const f of names)if(DATA[b]?.[f]){if(name)DATA[b][f].groupName=name;else delete DATA[b][f].groupName;}
  if(filter?.block===b&&!groups(b).includes(filter.name))filter=null;
  saveStructureState();refresh();return true;
 }
 function keyed(map,from,to,move,newIds=false){
  for(const key of Object.keys(map||{}))if(key===from||key.startsWith(from+'__')){
   const target=to+key.slice(from.length),value=clone(map[key]);
   if(newIds&&Array.isArray(value))for(const entry of value)if(entry&&typeof entry==='object')entry.id=id();
   map[target]=value;if(move)delete map[key];
  }
 }
 function sidecars(b,from,to,move){
  const oldKey=b+'_'+from,newKey=b+'_'+to;
  keyed(dailyEntries,oldKey,newKey,move,!move);keyed(facadeOverrides,oldKey,newKey,move);
  keyed(facadePhotos,oldKey,newKey,move,!move);keyed(v34NoWorkNotes,oldKey,newKey,move,!move);
  for(const [key,value] of [['cp_daily_entries',dailyEntries],['cp_facade_overrides',facadeOverrides],['cp_photos',facadePhotos],['cp_no_work_notes',v34NoWorkNotes]])store.set(key,value);
  const defects=store.get('cp_deficiencies',[]),matches=defects.filter(x=>x.block===b&&x.facade===from);
  if(move)matches.forEach(x=>{x.facade=to;});
  else {
   const lists=new Map();
   defects.push(...matches.filter(x=>!x.deletedAt).map(x=>{
    const list=x.listId||x.id;if(!lists.has(list))lists.set(list,id());
    return {...clone(x),id:id(),listId:lists.get(list),facade:to,userId:String(currentUser.id),user:currentUser.name||currentUser.username||''};
   }));
  }
  store.set('cp_deficiencies',defects);
  if(typeof attendanceLogs!=='undefined'&&Array.isArray(attendanceLogs)){
   const records=attendanceLogs.filter(x=>x.block===b&&x.facade===from);
   if(move)records.forEach(x=>{x.facade=to;});else attendanceLogs.push(...records.map(x=>({...clone(x),id:id(),facade:to})));
   store.set('cp_attendance_logs',attendanceLogs);
  }
 }
 async function remapPrices(b,pairs,move){
  if(!root.__v169Financial?.remapFacades)throw Error('Birim fiyatlar henüz yüklenmedi. Kısa süre sonra tekrar deneyin.');
  await root.__v169Financial.remapFacades(b,pairs,move);
 }
 async function flush(){if(await root.__v89CloudSync?.flush?.()===false)throw Error('Buluta kayıt tamamlanamadı. Yeniden deneyin.');}
 async function copyFacades(b,names){
  if(!admin()||busy)return [];
  busy=true;const ctx=context();
  try{
   const used=new Set(Object.keys(DATA[b]||{})),pairs=[];
   for(const from of [...new Set(names)])if(DATA[b]?.[from]){
    const base=from+'_Kopya';let to=base,n=2;while(used.has(to))to=base+'_'+n++;used.add(to);pairs.push({from,to});
   }
   if(!pairs.length)return [];
   await flush();await remapPrices(b,pairs,false);
   if(ctx!==context())throw Error('Proje değişti. İşlemi yeniden deneyin.');
   for(const {from,to} of pairs){DATA[b][to]=clone(DATA[b][from]);DATA[b][to].facadeTransfer={from,mode:'copy'};sidecars(b,from,to,false);}
   selectedManageBlock=b;selectedManageFacade=pairs.at(-1).to;currentBlock=b;currentFacade=selectedManageFacade;
   v58ResetFacadeSelection(b,selectedManageFacade);v58FacadeSelection.selected=new Set(pairs.map(p=>p.to));
   saveStructureState();await flush();await root.__v240Photos?.flush?.();refresh();say('Cephe kopyalandı');return pairs.map(p=>p.to);
  }finally{busy=false;}
 }
 async function rename(b,from,typed){
  if(!admin()||busy)return from;
  const to=String(typed||'').trim();
  if(!to||to===from||!DATA[b]?.[from])return from;
  if(Object.hasOwn(DATA[b],to)||['__proto__','prototype','constructor'].includes(to)){say('Bu cephe adı mevcut');return from;}
  busy=true;const ctx=context();
  try{
   await flush();await remapPrices(b,[{from,to}],true);
   if(ctx!==context())throw Error('Proje değişti. İşlemi yeniden deneyin.');
   DATA[b]=Object.fromEntries(Object.entries(DATA[b]).map(([name,value])=>[name===from?to:name,value]));
   DATA[b][to].facadeTransfer={from,mode:'rename'};
   sidecars(b,from,to,true);
   if(currentBlock===b&&currentFacade===from)currentFacade=to;
   if(selectedManageBlock===b&&selectedManageFacade===from)selectedManageFacade=to;
   v58ResetFacadeSelection(b,to);saveStructureState();await flush();await root.__v240Photos?.flush?.();refresh();say('Cephe adı değiştirildi');return to;
  }finally{busy=false;}
 }
 const run=action=>Promise.resolve().then(action).catch(error=>{console.error(error);say(error.message||'İşlem kaydedilemedi. Yeniden deneyin.');});
 function button(text,action){const el=document.createElement('button');el.type='button';el.className='btn cp-facade-group-btn';el.textContent=text;el.onclick=action;return el;}
 function manager(){
  const host=document.getElementById('v32FacadeContent'),b=selectedManageBlock;if(!host||!DATA[b])return;
  // A newly added/ungrouped facade must not remain hidden behind an old group filter.
  if(filter?.block===b&&(!groups(b).includes(filter.name)||(selectedManageFacade&&group(DATA[b][selectedManageFacade])!==filter.name)))filter=null;
  if(!host.dataset.cpManagerSync){host.dataset.cpManagerSync='1';host.addEventListener('click',syncManagerSelection);}
  const tools=host.querySelector('.v58-facade-toolbar');
  host.querySelector('#v32ManageItemsBtn')?.remove();
  if(tools&&admin()&&!tools.querySelector('[data-cp-group-tools]')){
   const box=document.createElement('div');box.dataset.cpGroupTools='1';box.className='cp-facade-group-tools';
   box.append(button('Seçilenleri Grupla',()=>{
    v58EnsureFacadeSelection(b);const names=[...v58FacadeSelection.selected];
    if(!names.length)return;
    const value=root.prompt('Grup adı',group(DATA[b][names[0]]));if(value!==null&&value.trim())assignGroup(b,names,value);
   }),button('Gruptan Çıkar',()=>{v58EnsureFacadeSelection(b);assignGroup(b,[...v58FacadeSelection.selected],'');}));
   tools.after(box);
  }
  const active=filter?.block===b?filter.name:null;
  host.querySelectorAll('.v32-facade-row').forEach(row=>{
   row.hidden=!!active&&group(DATA[b][row.dataset.f])!==active;
   if(!row.querySelector('.cp-open-items')){
    const open=button('İş Kalemleri',()=>{selectedManageBlock=b;selectedManageFacade=row.dataset.f;currentBlock=b;currentFacade=row.dataset.f;v58ResetFacadeSelection(b,row.dataset.f);v32OpenWorkItems();});
    open.classList.add('cp-open-items');row.append(open);
   }
   const input=row.querySelector('.v32FacadeName');
   if(input&&!input.dataset.cpRename){input.dataset.cpRename='1';
    // Editing clicks must not reach the row's selection/mousedown handlers.
    for(const event of ['mousedown','click'])input.addEventListener(event,e=>{if(!input.readOnly)e.stopPropagation();});
    input.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();v45StartFacadeRename(input);});
   }
  });
  host.querySelectorAll('.cp-facade-group-filter').forEach(node=>node.remove());
  if(active){const chip=document.createElement('div');chip.className='cp-facade-group-filter';chip.append(document.createTextNode(active+' · '+visibleNames(b).length),button('Tüm Cepheler',()=>{filter=null;v32RenderFacades();}));tools?.before(chip);}
 }
 function syncManagerSelection(){
  document.querySelectorAll('#v32Tree .v32-block-card').forEach(card=>{
   const b=card.querySelector('[data-block]')?.dataset.block;
   card.classList.toggle('active',b===selectedManageBlock);
   card.querySelectorAll('.cp-manager-facade').forEach(node=>{
    const active=b===selectedManageBlock&&node.dataset.facade===selectedManageFacade;
    node.classList.toggle('active',active);
    if(active)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');
   });
   card.querySelectorAll('.cp-manager-group').forEach(node=>node.classList.toggle('active',filter?.block===b&&filter.name===node.dataset.group));
  });
 }
 function managerSelect(b,f){
  selectedManageBlock=b;selectedManageFacade=f;currentBlock=b;currentFacade=f||'';
  v58ResetFacadeSelection(b,f);v32RenderFacades();
  if(typeof renderFacade==='function')renderFacade();
  if(typeof rebuildTree==='function')rebuildTree();
  if(typeof v34UpdateHeader==='function')v34UpdateHeader();
 }
 function managerTree(){
  const tree=document.getElementById('v32Tree');if(!tree)return;
  const scrollTop=tree.scrollTop;
  document.querySelectorAll('#v32Tree .v32-block-card').forEach(card=>{
   const head=card.querySelector('[data-block]'),b=head?.dataset.block;if(!b||!DATA[b])return;
   // Keep the block header DOM intact so its existing double-click rename still works.
   if(!head.dataset.cpManagerAll){head.dataset.cpManagerAll='1';head.addEventListener('click',()=>{filter=null;},true);}
   card.querySelectorAll('.cp-manager-groups').forEach(node=>node.remove());
   const list=document.createElement('div');list.className='cp-manager-groups';
   const names=Object.keys(DATA[b]),members=new Map(),boxes=new Map();
   for(const f of names){const name=group(DATA[b][f]);if(name){if(!members.has(name))members.set(name,[]);members.get(name).push(f);}}
   const count=head.querySelector('.tree-count');if(count)count.textContent=names.length+' cephe';
   for(const f of names){
    const name=group(DATA[b][f]),key=JSON.stringify(['manager',context(),b,name]);
    let parent=list;
    if(name){
     if(!boxes.has(name)){
      const box=document.createElement('details');box.className='cp-facade-group cp-manager-group';box.dataset.group=name;
      box.open=expanded.get(key)??(b===selectedManageBlock&&group(DATA[b][selectedManageFacade])===name);
      const summary=document.createElement('summary');summary.setAttribute('translate','no');summary.textContent=name+' ('+members.get(name).length+')';
      summary.addEventListener('click',event=>{
       event.preventDefault();expanded.set(key,!box.open);filter={block:b,name};
       const chosen=b===selectedManageBlock&&members.get(name).includes(selectedManageFacade)?selectedManageFacade:members.get(name)[0];
       managerSelect(b,chosen);
       [...tree.querySelectorAll('.cp-manager-group')].find(node=>node.dataset.group===name&&node.closest('.v32-block-card')?.querySelector('[data-block]')?.dataset.block===b)?.querySelector('summary')?.focus({preventScroll:true});
      });
      box.append(summary);list.append(box);boxes.set(name,box);
     }
     parent=boxes.get(name);
    }
    const pick=button('',()=>{
     filter=name?{block:b,name}:null;if(name)expanded.set(key,true);
     managerSelect(b,f);
     [...tree.querySelectorAll('.cp-manager-facade')].find(node=>node.dataset.block===b&&node.dataset.facade===f)?.focus({preventScroll:true});
     const row=[...document.querySelectorAll('#v32FacadeContent .v32-facade-row')].find(node=>node.dataset.f===f);
     row?.scrollIntoView?.({block:'nearest'});
    });
    pick.classList.add('cp-manager-facade');pick.dataset.block=b;pick.dataset.facade=f;pick.setAttribute('translate','no');
    const label=document.createElement('span');label.className='cp-manager-facade-name';label.textContent=f;
    const progress=document.createElement('span');progress.className='cp-manager-facade-pct';progress.textContent='%'+calculatedFacadeProgress(b,f);
    pick.append(label,progress);parent.append(pick);
   }
   card.append(list);
  });
  syncManagerSelection();tree.scrollTop=scrollTop;
 }
 function mainTree(){
  document.querySelectorAll('.tree .tree-block').forEach(block=>{
   const b=block.querySelector('.tree-block-head')?.dataset.block,list=block.querySelector('.tree-facades');if(!b||!list)return;
   const nodes=[...list.children];const boxes=new Map();
   nodes.forEach(node=>{
    const f=node.querySelector('.tree-facade-name')?.textContent,name=group(DATA[b]?.[f]);if(!name)return;
    let box=boxes.get(name);
    if(!box){box=document.createElement('details');box.className='cp-facade-group';
     const key=JSON.stringify([context(),b,name]);box.open=expanded.get(key)??(b===currentBlock&&group(DATA[b]?.[currentFacade])===name);
     const summary=document.createElement('summary');summary.setAttribute('translate','no');summary.textContent=name+' ('+Object.values(DATA[b]).filter(d=>group(d)===name).length+')';box.append(summary);
     box.addEventListener('toggle',()=>expanded.set(key,box.open));list.insertBefore(box,node);boxes.set(name,box);
    }
    box.append(node);
   });
  });
 }
 if(typeof v32RenderFacades==='function'){const before=v32RenderFacades;v32RenderFacades=function(){const result=before.apply(this,arguments);manager();managerTree();return result;};}
 if(typeof v32RenderTree==='function'){const before=v32RenderTree;v32RenderTree=function(){const result=before.apply(this,arguments);managerTree();return result;};}
 if(typeof rebuildTree==='function'){const before=rebuildTree;rebuildTree=function(){const result=before.apply(this,arguments);mainTree();return result;};}
 if(typeof copyFacade==='function')copyFacade=f=>run(()=>copyFacades(selectedManageBlock,[f]));
 if(typeof v58CopyFacades==='function')v58CopyFacades=(b,names)=>run(()=>copyFacades(b,names));
 if(typeof v45FinishFacadeRename==='function')v45FinishFacadeRename=async function(input,save=true){
  if(!input||input.readOnly)return;
  const b=selectedManageBlock,old=input.dataset.old,typed=input.value;
  input.readOnly=true;input.classList.remove('v45-name-editing');input.classList.add('v45-name-readonly');
  if(!save||!admin()){input.value=old;return;}
  const final=await run(()=>rename(b,old,typed));input.value=final||old;input.dataset.old=final||old;
 };
 let workMeasure,workResize,workHost;
 function compactWork(){
  const host=document.getElementById('v32WorkBody');if(!host)return;
  // Measure the displayed translation in the field's actual font; never edit stored values.
  if(!workMeasure){workMeasure=document.createElement('span');workMeasure.setAttribute('aria-hidden','true');workMeasure.setAttribute('translate','no');workMeasure.style.cssText='position:fixed;visibility:hidden;white-space:pre;pointer-events:none;inset:auto';document.body.append(workMeasure);}
  const selectors=['.v209WiPoz','.v34WiName','.v34WiUnit','.v34WiWeight','.v34WiTotal','.v34WiDone','.v169-unit-price','.v169-money-cell'];
  const minimum=[30,84,46,48,54,54,54,76],maximum=[64,190,104,96,100,100,100,130];
  const count=document.body.classList.contains('v113-member')?6:8;
  const widths=selectors.slice(0,count).map((selector,i)=>{
   let width=minimum[i];
   for(const el of host.querySelectorAll(selector)){
    const raw=el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:(el.value??el.textContent);
    const label=String(root.CepheProI18n?.t(raw)||raw||'');
    workMeasure.style.font=getComputedStyle(el).font;workMeasure.textContent=label;
    const measured=workMeasure.getBoundingClientRect().width||Array.from(label).length*6;
    width=Math.max(width,Math.ceil(measured)+(i===2?25:12));
    el.title=label;
   }
   return Math.min(maximum[i],width);
  });
  // Natural compact width on large screens, proportional tracks inside smaller panels.
  host.style.setProperty('--cp-work-columns',widths.map(n=>`minmax(0,${n}fr)`).join(' '));
  host.style.setProperty('--cp-work-width',(widths.reduce((a,b)=>a+b,0)+3*(count-1)+30)+'px');
  host.style.setProperty('--cp-work-min',count===8?'610px':'440px');
  if(root.ResizeObserver&&workHost!==host){workResize?.disconnect();workResize=new ResizeObserver(()=>root.CepheProI18n?.refreshValues?.());workResize.observe(host);workHost=host;}
  root.CepheProI18n?.refreshValues?.();
 }
 if(typeof v32RenderWorkItems==='function'){const before=v32RenderWorkItems;v32RenderWorkItems=function(){const result=before.apply(this,arguments);queueMicrotask(compactWork);return result;};}
 document.addEventListener('input',e=>{if(e.target.matches?.('#v32WorkBody input'))compactWork();});
 document.addEventListener('change',e=>{if(e.target.matches?.('#v32WorkBody select'))compactWork();});
 document.addEventListener('cephepro:language-changed',compactWork);
 document.addEventListener('cephepro:translation-progress',compactWork);
 document.addEventListener('cephepro:translations-updated',compactWork);
 document.fonts?.ready.then(compactWork);
 document.addEventListener('cephepro:locked',()=>{filter=null;expanded.clear();});
 root.CepheProFacadeTools={assignGroup,groups,visibleNames,copyFacades,rename,manager,managerTree,mainTree};
})(window);
