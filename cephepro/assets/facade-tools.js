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
  if(active){const chip=document.createElement('div');chip.className='cp-facade-group-filter';chip.append(document.createTextNode(active+' · '+visibleNames(b).length),button('Tüm Cepheler',()=>{filter=null;v32RenderFacades();}));tools?.before(chip);}
 }
 function managerTree(){
  document.querySelectorAll('#v32Tree .v32-block-card').forEach(card=>{
   const b=card.querySelector('[data-block]')?.dataset.block;if(!b)return;
   const list=document.createElement('div');list.className='cp-manager-groups';
   for(const name of groups(b)){
    const count=Object.values(DATA[b]).filter(f=>group(f)===name).length;
    const pick=button(name+' ('+count+')',()=>{
     filter={block:b,name};selectedManageBlock=b;const names=visibleNames(b);
     selectedManageFacade=names[0]||null;currentBlock=b;currentFacade=selectedManageFacade;v58ResetFacadeSelection(b,selectedManageFacade);v32RenderFacades();
    });pick.setAttribute('translate','no');list.append(pick);
   }
   card.append(list);
  });
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
 if(typeof v32RenderFacades==='function'){const before=v32RenderFacades;v32RenderFacades=function(){const result=before.apply(this,arguments);manager();return result;};}
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
 function compactWork(){
  const host=document.getElementById('v32WorkBody');if(!host)return;
  const lengths=[...host.querySelectorAll('.v34WiName')].map(el=>String(root.CepheProI18n?.t(el.value)||el.value).length*6+18);
  host.style.setProperty('--cp-item-width',Math.min(240,Math.max(76,...lengths))+'px');
 }
 if(typeof v32RenderWorkItems==='function'){const before=v32RenderWorkItems;v32RenderWorkItems=function(){const result=before.apply(this,arguments);queueMicrotask(compactWork);return result;};}
 document.addEventListener('input',e=>{if(e.target.matches?.('#v32WorkBody .v34WiName'))compactWork();});
 document.addEventListener('cephepro:language-changed',compactWork);
 document.addEventListener('cephepro:locked',()=>{filter=null;expanded.clear();});
 root.CepheProFacadeTools={assignGroup,groups,visibleNames,copyFacades,rename,manager,managerTree,mainTree};
})(window);
