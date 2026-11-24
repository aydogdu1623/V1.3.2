import {emptyMap,demoMap,validateMap,resolveFeature,bindFacade,bounds,COLORS,KINDS,PARTS,status,clamp,defaultComponents} from './model.js';
import {t,language} from './i18n.js';
const NS='http://www.w3.org/2000/svg';let active;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const wait=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);function cancel(){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}signal?.addEventListener('abort',cancel,{once:true});});
function svgEl(tag,attrs={}){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
export async function openSiteMap(options={}){
 if(active?.dialog.open){active.dialog.focus();return active;}
 const demoOnly=!!options.demo,controller=new AbortController();let demo=demoOnly,snapshot={map:emptyMap(),catalog:[],revision:0,projectRevision:0,canManage:demoOnly,cadReady:false},selected=null,view='2d',viewer=null,viewerVersion=0,busy=false,closed=false,draft=null,worker=null;
 let readSequence=0;
 let viewport={x:0,y:0,w:100,h:80},initial,search='',filter='all',lastFocus=document.activeElement;
 const dialog=document.createElement('dialog');dialog.id='cpSiteMap';dialog.setAttribute('translate','no');dialog.setAttribute('aria-label',t('map'));dialog.dir=language()==='ar'?'rtl':'ltr';
 dialog.innerHTML=`<header class="sm-header"><div class="sm-brand">⌖</div><div><h1>${t('map')}</h1><p class="sm-sub" id="smProject"></p></div><div class="sm-header-actions"><button id="smBack" hidden>${t('back')}</button><button id="smUpload" class="sm-primary">＋ ${t('upload')}</button><button id="smRefresh" aria-label="${t('refresh')}" title="${t('refresh')}">↻</button><button id="smClose" aria-label="${t('close')}">✕</button></div></header><div class="sm-shell sm-no-selection"><main class="sm-stage"><div class="sm-toolbar"><input id="smSearch" placeholder="${t('search')}" aria-label="${t('search')}"><select id="smFilter" aria-label="${t('progress')}">${['all','not_started','in_progress','completed'].map(x=>`<option value="${x}">${t(x)}</option>`).join('')}</select></div><svg class="sm-canvas" aria-label="${t('map')}" tabindex="0"></svg><div class="sm-viewer" hidden></div><div class="sm-model-note" hidden></div><div class="sm-zoom"><button id="smPlus" aria-label="Zoom in">+</button><button id="smMinus" aria-label="Zoom out">−</button><button id="smFit" title="${t('fit')}" aria-label="${t('fit')}">⌗</button></div><div class="sm-legend">${Object.entries(COLORS).map(([s,c])=>`<span><i class="sm-dot" style="background:${c}"></i>${t(s)}</span>`).join('')}</div><div class="sm-empty" hidden></div></main><aside class="sm-card"></aside></div><footer class="sm-footer"><span id="smSource"></span><span class="sm-status" role="status" aria-live="polite"></span></footer>`;
 document.body.append(dialog);dialog.showModal();const $=s=>dialog.querySelector(s),canvas=$('.sm-canvas'),stage=$('.sm-stage'),card=$('.sm-card'),empty=$('.sm-empty');
 const projectId=()=>globalThis.CepheProProjects?.project()?.id;const openedProject=projectId();
 const message=(s,error=false)=>{$('.sm-status').textContent=s;$('.sm-status').dataset.error=String(error);};
 const fail=e=>{if(e.name==='AbortError'||closed)return;console.error('[map]',e);message(globalThis.CepheProI18n?.t(e.message)||e.message,true);};
 async function api(method='GET',body,suffix=''){
  if(!demoOnly&&(!globalThis.CepheProProjects?.isReady()||projectId()!==openedProject))throw Error('Proje erişimi sona erdi.');
  const token=localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
  const response=await fetch('/api/site-map'+suffix,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
  if(!demoOnly&&projectId()!==openedProject)throw new DOMException('Project changed','AbortError');
  if(suffix.startsWith('?model=')&&response.ok)return response.arrayBuffer();
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Harita yüklenemedi.'),{status:response.status});return data;
 }
 const feature=()=>snapshot.map.features.find(f=>f.id===selected);
 const resolved=f=>resolveFeature(f,snapshot.catalog);
 const managed=()=>demo||snapshot.canManage;
 function setBusy(value){busy=value;$('#smUpload').disabled=value;$('#smRefresh').disabled=value;card.querySelectorAll('input,select,button').forEach(el=>{el.disabled=value||!!draft||el.dataset.locked==='true';});}
 async function reload({fit=false,silent=false}={}){
  if(closed)return;
  try{
   if(!demo){const request=++readSequence;if(!silent)message(t('loading'));const next=await api();if(closed||demo||request!==readSequence)return;const changed=next.revision!==snapshot.revision; snapshot=next;if(changed&&view==='3d')await show2d();}
   $('#smProject').textContent=demo?t('demoNote'):(globalThis.CepheProProjects?.project()?.name||'CephePro');$('#smUpload').hidden=!managed();
   if(selected&&!feature())selected=null;if(fit)fitPlan();draw();if(document.activeElement?.closest('.sm-card')===null||!silent)renderCard();
   if(viewer&&feature())viewer.update(resolved(feature()));if(!silent)message(demo?t('demoNote'):t('linked'));
  }catch(e){fail(e);}
 }
 function filtered(){return (draft||snapshot.map).features.filter(f=>f.kind!=='building'||(!search||f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&(filter==='all'||resolved(f).status===filter));}
 function fitPlan(){const list=filtered(),[x,y,w,h]=bounds(list),pad=Math.max(w,h)*.1+1;viewport={x:x-pad,y:-y-h-pad,w:w+pad*2,h:h+pad*2};initial={...viewport};applyView();}
 function applyView(){canvas.setAttribute('viewBox',`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`);const px=viewport.w/Math.max(canvas.clientWidth,300);canvas.querySelectorAll('.sm-map-label').forEach(el=>el.setAttribute('font-size',String(px*12)));}
 function draw(){
  canvas.replaceChildren();const list=filtered();let count=0;
  for(const f of list){
   const ring=f.geometry.type==='Polygon'?f.geometry.coordinates:[f.geometry.coordinates],d=ring.map(r=>r.map((p,i)=>`${i?'L':'M'}${p[0]},${-p[1]}`).join(' ')+(f.geometry.type==='Polygon'?' Z':'')).join(' ');
   const r=f.kind==='building'?resolved(f):null,color=r?COLORS[r.status]:({road:'#c3c9bf',landscape:'#b5cfab',water:'#9ecace',boundary:'#ced8ce'}[f.kind]);
   const g=svgEl('g'),path=svgEl('path',{d,fill:f.geometry.type==='Polygon'?color:'none',stroke:f.id===selected?'#153e3a':r?'#ffffff':'#9aafa6','stroke-width':f.id===selected?3:r?2:1.4,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd'});g.append(path);
   if(r){count++;g.dataset.id=f.id;g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`${f.name} · ${Math.round(r.progress)}% · ${t(r.status)}`);g.setAttribute('aria-pressed',String(f.id===selected));
    const title=svgEl('title');title.textContent=`${f.name} · ${f.blockType} · ${Math.round(r.progress)}%`;g.append(title);
    const [x,y,w,h]=bounds([f]),text=svgEl('text',{x:x+w/2,y:-y-h/2,'text-anchor':'middle','dominant-baseline':'middle',fill:'#173c3b','font-weight':'650','paint-order':'stroke',stroke:'#ffffffe8','stroke-width':3,'vector-effect':'non-scaling-stroke',class:'sm-map-label','pointer-events':'none'});text.textContent=f.name+' · '+Math.round(r.progress)+'%';g.append(text);
   }canvas.append(g);
  }
  applyView();$('.sm-shell').classList.toggle('sm-no-selection',!selected);
  $('#smSource').textContent=demo?t('demoNote'):`${count} ${t('building')} · ${snapshot.map.units} · ${snapshot.map.source?.mode==='ai'?t('ai'):t('rules')}`;
  empty.hidden=(draft||snapshot.map).features.length>0;
  if(!empty.hidden){empty.innerHTML=`<span style="font-size:50px;color:#46766b">⌖</span><h2>${t('empty')}</h2><p>${t('emptyHint')}</p><button class="sm-primary" id="smTryDemo">${t('demo')}</button>`;$('#smTryDemo').onclick=()=>startDemo();}
 }
 async function choose(id){if(busy||draft)return;if(view==='3d'&&id!==selected)await show2d();selected=id;draw();renderCard();}
 function renderCard(){
  const f=feature();if(!f){card.innerHTML=`<div class="sm-kicker">CE P H E P R O</div><h2>${t('select')}</h2><p class="sm-note">${t('emptyHint')}</p>`;return;}
  const r=resolved(f),can=managed();
  const bindings=[...new Set(snapshot.catalog.map(c=>c.block))].flatMap(block=>[{block,facade:'',items:snapshot.catalog.filter(c=>c.block===block).flatMap(c=>c.items.map(i=>({...i,label:c.facade+' / '+i.label})))},...snapshot.catalog.filter(c=>c.block===block)]);
  card.innerHTML=`<div class="sm-kicker">${t('name')}</div><h2>${esc(f.name)}</h2><p class="sm-sub">${t('type')} · ${esc(f.blockType||'—')}</p><span class="sm-chip">${f.binding?esc(f.binding.block+' / '+f.binding.facade):t('unbound')}</span><div class="sm-score"><span>${t('progress')}</span><strong>${Math.round(r.progress)}<small style="font-size:16px">%</small></strong></div><div class="sm-progress-line"><i style="width:${r.progress}%;background:${COLORS[r.status]}"></i></div><button class="sm-primary sm-wide" id="sm3D">${view==='3d'?t('back'):t('view3d')} ↗</button><h3>${t('items')} <span class="sm-sub">(${r.components.length})</span></h3><div class="sm-items"></div>${can?`<details id="smDetails"><summary>${t('details')}</summary><label>${t('name')}<input id="smName" value="${esc(f.name)}" maxlength="160"></label><div class="sm-fields"><label>${t('type')}<input id="smType" value="${esc(f.blockType)}" maxlength="160"></label><label>${t('height')}<input id="smHeight" type="number" min="1" max="200" value="${f.height}"></label></div><label>${t('bind')}<select id="smBind"><option value="">${t('unbound')}</option>${bindings.map((v,i)=>`<option value="${i}" ${f.binding?.block===v.block&&f.binding?.facade===v.facade?'selected':''}>${esc(v.block+' / '+(v.facade||t('all')))}</option>`).join('')}</select></label><button id="smSaveDetails" class="sm-primary">${t('save')}</button></details><details id="smMapping"><summary>${t('mapping')}</summary><p class="sm-note">${t(f.modelId?'model':'schematic')}</p><button id="smModelUpload">${t('glb')}</button><div id="smMappingRows"></div></details>`:''}`;
  for(const c of r.components){
   const locked=c.missing||(!can&&!c.source)||(c.source&&!(c.total>0));
   const row=document.createElement('div');row.className='sm-item';row.dataset.component=c.id;
   row.innerHTML=`<div><b>${esc(c.label)}</b><small>${c.missing?t('missing'):c.source?`${Number(c.done).toLocaleString(undefined,{maximumFractionDigits:2})} / ${Number(c.total).toLocaleString(undefined,{maximumFractionDigits:2})} ${esc(c.unit)}`:t(status(c.progress))}</small></div><input class="sm-number" type="number" min="0" max="100" step="1" value="${Math.round(c.progress)}" aria-label="${esc(c.label)} %" ${locked?'disabled data-locked="true"':''}><input type="range" min="0" max="100" step="1" value="${Math.round(c.progress)}" aria-label="${esc(c.label)} %" ${locked?'disabled data-locked="true"':''}><select aria-label="${esc(c.label)} ${t('progress')}" ${locked?'disabled data-locked="true"':''}>${['not_started','in_progress','completed'].map(s=>`<option value="${s}" ${status(c.progress)===s?'selected':''}>${t(s)}</option>`).join('')}</select>`;
   const preview=value=>{const p=clamp(value),next=resolved(f);next.components.find(x=>x.id===c.id).progress=p;viewer?.update(next);row.querySelector('.sm-number').value=p;row.querySelector('[type=range]').value=p;row.querySelector('select').value=status(p);};
   row.querySelectorAll('input').forEach(input=>{input.addEventListener('input',()=>preview(input.value));input.addEventListener('change',()=>commit(c.id,Number(input.value)));});
   row.querySelector('select').onchange=e=>{const p={not_started:0,in_progress:Math.max(1,Math.min(99,Math.round(c.progress)||1)),completed:100}[e.target.value];preview(p);commit(c.id,p);};
   $('.sm-items').append(row);
  }
  $('#sm3D').onclick=()=>view==='3d'?show2d():show3d();
  if(can){
   $('#smSaveDetails').onclick=async()=>{
    const next=structuredClone(snapshot.map),index=next.features.findIndex(x=>x.id===f.id);let item=next.features[index];item.name=$('#smName').value;item.blockType=$('#smType').value;item.height=Number($('#smHeight').value);
    const value=$('#smBind').value,entry=value!==''?bindings[Number(value)]:null;
    if(entry&&(entry.block!==f.binding?.block||entry.facade!==f.binding?.facade))item=bindFacade(item,entry);
    else if(!entry&&f.binding)item={...item,binding:null,components:item.components.map(c=>({...c,progress:r.components.find(x=>x.id===c.id)?.progress||0,source:null}))};
    next.features[index]=item;await saveMap(next);
   };
   $('#smModelUpload').onclick=uploadModel;renderMapping(f);
  }
  setBusy(busy);
 }
 function renderMapping(f){
  const box=$('#smMappingRows');if(!box)return;
  for(const c of f.components){
   const wrap=document.createElement('div');wrap.innerHTML=`<label>${esc(c.label)}<select>${PARTS.map(p=>`<option value="${p}" ${p===c.part?'selected':''}>${t(p)}</option>`).join('')}</select></label>`;
   wrap.querySelector('select').onchange=async e=>{const next=structuredClone(snapshot.map);next.features.find(x=>x.id===f.id).components.find(x=>x.id===c.id).part=e.target.value;await saveMap(next);};
   if(f.modelId&&viewer){const meshes=document.createElement('details');meshes.innerHTML=`<summary>${t('mesh')} (${c.meshNodes.length})</summary><div class="sm-model-meshes"></div>`;
    for(const node of viewer.nodes){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=c.meshNodes.includes(node.key);input.onchange=async()=>{const next=structuredClone(snapshot.map),component=next.features.find(x=>x.id===f.id).components.find(x=>x.id===c.id);component.meshNodes=input.checked?[...new Set([...component.meshNodes,node.key])]:component.meshNodes.filter(k=>k!==node.key);await saveMap(next,{keepViewer:true});};label.append(input,document.createTextNode(node.name));meshes.querySelector('div').append(label);}wrap.append(meshes);
   }box.append(wrap);
  }
 }
 async function commit(componentId,progress){
  if(busy||!Number.isFinite(progress)||progress<0||progress>100){renderCard();return;}
  readSequence++;setBusy(true);message(t('saving'));const f=feature();
  try{
   if(demo)f.components.find(c=>c.id===componentId).progress=progress;
   else{
    if(await globalThis.__v89CloudSync?.flush?.()===false)throw Error('Önce mevcut değişiklikleri buluta kaydedin.');
    await api('PATCH',{featureId:f.id,componentId,progress,revision:snapshot.revision,projectRevision:snapshot.projectRevision});
    await globalThis.__v89CloudSync?.pull?.({bootstrap:false});
   }
   await reload();message(demo?t('demoNote'):t('saved'));
  }catch(e){await reload({silent:true});fail(e);}
  finally{setBusy(false);renderCard();if(viewer&&feature())viewer.update(resolved(feature()));}
 }
 async function saveMap(map,{keepViewer=false}={}){
  if(busy)return;readSequence++;setBusy(true);message(t('saving'));
  try{
   const clean=validateMap(map);if(demo)snapshot.map=clean;else await api('PUT',{map:clean,revision:snapshot.revision});
   if(view==='3d'&&!keepViewer)await show2d();
   if(keepViewer&&!demo){const next=await api();snapshot=next;draw();viewer?.update(resolved(feature()));renderCard();}
   else await reload();message(demo?t('demoNote'):t('saved'));return true;
  }catch(e){if(e.status===409)await reload({silent:true});fail(e);return false;}finally{setBusy(false);}
 }
 async function show2d(){viewerVersion++;viewer?.dispose();viewer=null;view='2d';canvas.hidden=false;$('.sm-viewer').hidden=true;$('.sm-toolbar').hidden=false;$('.sm-zoom').hidden=false;$('.sm-model-note').hidden=true;$('#smBack').hidden=true;renderCard();}
 async function show3d(){
  const f=feature();if(!f)return;view='3d';const version=++viewerVersion;canvas.hidden=true;$('.sm-viewer').hidden=false;$('.sm-toolbar').hidden=true;$('.sm-zoom').hidden=true;$('#smBack').hidden=false;$('.sm-model-note').hidden=false;$('.sm-model-note').textContent=t(f.modelId?'model':'schematic');renderCard();message(t('loading'));
  try{const {createViewer}=await import('./viewer.js');const instance=await createViewer($('.sm-viewer'),resolved(f),{units:snapshot.map.units,loadModel:id=>api('GET',null,'?model='+encodeURIComponent(id)),onPick:id=>{const row=[...card.querySelectorAll('[data-component]')].find(n=>n.dataset.component===id);row?.scrollIntoView({block:'nearest',behavior:'smooth'});row?.querySelector('input')?.focus();}});
   if(closed||version!==viewerVersion){instance.dispose();return;}viewer=instance;renderCard();message(demo?t('demoNote'):t('linked'));
  }catch(e){if(!closed&&version===viewerVersion){await show2d();message('3B görünüm açılamadı. WebGL desteğini ve model dosyasını kontrol edin.',true);console.error(e);}}
 }
 function filePicker(accept){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;dialog.append(input);input.onchange=()=>{resolve(input.files?.[0]);input.remove();};input.oncancel=()=>{resolve(null);input.remove();};input.click();});}
 const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
 async function uploadModel(){
  if(demo){message('GLB kaydı gerçek proje içinde kullanılabilir; örnekte şematik modeli deneyebilirsiniz.');return;}
  const file=await filePicker('.glb');if(!file||closed)return;if(file.size>2_000_000){message('GLB modeli en fazla 2 MB olabilir.',true);return;}
  try{message(t('loading'));const model=await api('POST',{action:'model',data:base64(new Uint8Array(await file.arrayBuffer()))});const next=structuredClone(snapshot.map);next.features.find(f=>f.id===selected).modelId=model.id;await saveMap(next);await show3d();}
  catch(e){fail(e);}
 }
 async function loadDrawing(){
  if(view==='3d')await show2d();
  const file=await filePicker('.dwg,.dxf,.geojson,.json');if(!file||closed)return;
  if(file.size>40_000_000){message('Çizim en fazla 40 MB olabilir.',true);return;}
  setBusy(true);message(t('loading'));
  try{
   let map;
   if(/\.dwg$/i.test(file.name)){
    if(demo)throw Error('DWG dönüşümü proje oturumu ve CAD servisi gerektirir. Örnekte DXF / GeoJSON kullanın.');
    const job=await api('POST',{action:'upload-start',name:file.name,size:file.size});
    for(let offset=0;offset<file.size;offset+=900000){const data=base64(new Uint8Array(await file.slice(offset,offset+900000).arrayBuffer()));await api('POST',{action:'upload-chunk',id:job.id,index:Math.floor(offset/900000),data});message(`${t('upload')} · ${Math.round(Math.min(file.size,offset+900000)/file.size*100)}%`);}
    await api('POST',{action:'upload-finish',id:job.id});
    for(let i=0;i<160;i++){const result=await api('GET',null,'?job='+job.id);if(result.status==='ready'){map=validateMap(result.map);break;}if(result.status==='failed')throw Error(result.error||'CAD dönüşümü başarısız.');message(result.message||t('loading'));await wait(2000,controller.signal);}
    if(!map)throw Error('CAD işleme zaman aşımı. DXF olarak tekrar deneyin.');
   }else{
    const text=await file.text();map=await new Promise((resolve,reject)=>{worker=new Worker(new URL('./import-worker.js',import.meta.url),{type:'module'});worker.onmessage=e=>{worker.terminate();worker=null;e.data.error?reject(Error(e.data.error)):resolve(e.data.map);};worker.onerror=()=>{worker?.terminate();worker=null;reject(Error('Çizim okunamadı.'));};worker.postMessage({name:file.name,text});});
   }
   if(!closed){if(!map.features.length)throw Error('Görünür dış hat bulunamadı. Kapalı poligonları ve katmanları kontrol edin.');review(map);}
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 function review(map){
  draft=map;fitPlan();draw();$('.sm-review')?.remove();const panel=document.createElement('section');panel.className='sm-review';panel.setAttribute('aria-label',t('review'));
  panel.innerHTML=`<div class="sm-kicker">${t('draft')}</div><h2>${t('review')}</h2><p class="sm-note">${map.source.mode==='ai'?t('ai'):t('rules')} · ${map.features.length} ${t('building')}<br>${map.source.warnings.map(esc).join('<br>')}</p><label>${t('units')}<select id="smUnits">${['m','mm','cm','ft','unitless'].map(u=>`<option ${u===map.units?'selected':''}>${u}</option>`).join('')}</select></label><div id="smLayers"></div><div class="sm-review-actions"><button id="smCancelImport">${t('cancel')}</button><button id="smPublish" class="sm-primary">${t('publish')}</button></div>`;
  stage.append(panel);const layers=[...new Set(map.features.map(f=>f.layer||'Default'))],choices=new Map();
  layers.forEach((name,i)=>{const items=map.features.filter(f=>(f.layer||'Default')===name),kind=items[0].kind,row=document.createElement('div');row.className='sm-layer';row.innerHTML=`<input type="checkbox" checked id="smLayer${i}"><label for="smLayer${i}">${esc(name)} <small>(${items.length}) · ${Math.round(Math.min(...items.map(f=>f.confidence))*100)}%</small></label><select aria-label="${esc(name)}">${KINDS.map(k=>`<option value="${k}" ${k===kind?'selected':''}>${t(k)}</option>`).join('')}</select>`;$('#smLayers').append(row);choices.set(name,row);});
  $('#smCancelImport').onclick=()=>{draft=null;panel.remove();fitPlan();draw();setBusy(false);};
  $('#smPublish').onclick=async()=>{
   const next=structuredClone(draft);next.units=$('#smUnits').value;next.features=next.features.filter(f=>choices.get(f.layer||'Default').querySelector('input').checked).map(f=>{const kind=choices.get(f.layer||'Default').querySelector('select').value;return {...f,kind,components:kind==='building'?(f.components.length?f.components:defaultComponents()):[]};});
   if(!next.features.length){message('En az bir katman seçin.',true);return;}
   if(snapshot.map.features.length&&!demo&&!confirm('Mevcut saha planı bu planla değiştirilsin mi? İş kalemi metrajları korunur.'))return;
   try{validateMap(next);}catch(e){fail(e);return;}selected=null;const saved=await saveMap(next);if(saved){draft=null;panel.remove();fitPlan();draw();}
  };
 }
 async function startDemo(){await show2d();demo=true;snapshot={map:demoMap(),catalog:[],revision:0,projectRevision:0,canManage:true,cadReady:false};selected='villa-412';await reload({fit:true});}
 function zoom(scale,cx=canvas.clientWidth/2,cy=canvas.clientHeight/2){const rect=canvas.getBoundingClientRect(),p=screenPoint(cx+rect.left,cy+rect.top),w=viewport.w/scale;if(initial&&(w<initial.w/100||w>initial.w*5))return;viewport={x:p.x-(p.x-viewport.x)/scale,y:p.y-(p.y-viewport.y)/scale,w,h:viewport.h/scale};applyView();}
 function screenPoint(x,y){const m=canvas.getScreenCTM();if(m)return new DOMPoint(x,y).matrixTransform(m.inverse());const r=canvas.getBoundingClientRect();return {x:viewport.x+(x-r.left)/r.width*viewport.w,y:viewport.y+(y-r.top)/r.height*viewport.h};}
 const pointers=new Map();let drag=null,pinch=null,moved=false;
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);drag={x:e.clientX,y:e.clientY,view:{...viewport}};moved=false;if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);}});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const p=[...pointers.values()],dist=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),r=canvas.getBoundingClientRect();if(pinch>0)zoom(dist/pinch,(p[0][0]+p[1][0])/2-r.left,(p[0][1]+p[1][1])/2-r.top);pinch=dist;moved=true;return;}if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)moved=true;const scale=canvas.getScreenCTM()?.a||canvas.clientWidth/viewport.w;viewport={...drag.view,x:drag.view.x-dx/scale,y:drag.view.y-dy/scale};applyView();});
 const end=e=>{pointers.delete(e.pointerId);drag=null;pinch=null;};canvas.addEventListener('pointerup',e=>{if(!moved&&pointers.size===1){const node=document.elementFromPoint(e.clientX,e.clientY);const id=node?.closest('[data-id]')?.dataset.id;if(id&&canvas.contains(node))choose(id);}end(e);});canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
 canvas.addEventListener('keydown',e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id&&['Enter',' '].includes(e.key)){e.preventDefault();choose(id);}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();e.key==='Home'?fitPlan():zoom(e.key==='-'?.8:1.25);}});
 $('#smSearch').oninput=e=>{search=e.target.value;draw();};$('#smFilter').onchange=e=>{filter=e.target.value;draw();fitPlan();};$('#smPlus').onclick=()=>zoom(1.3);$('#smMinus').onclick=()=>zoom(1/1.3);$('#smFit').onclick=fitPlan;$('#smBack').onclick=show2d;$('#smUpload').onclick=loadDrawing;
 $('#smRefresh').onclick=async()=>{if(demo&&!demoOnly){demo=false;selected=null;await show2d();}await reload({fit:true});};$('#smClose').onclick=()=>dialog.close();
 function cleanup(){if(closed)return;closed=true;controller.abort();worker?.terminate();viewerVersion++;viewer?.dispose();clearInterval(timer);document.removeEventListener('cephepro:locked',lock);document.removeEventListener('cephepro:state-updated',stateUpdated);dialog.remove();active=null;lastFocus?.focus?.();}
 const lock=()=>dialog.close();const stateUpdated=()=>{if(!busy&&!demo&&!draft)reload({silent:true});};
 document.addEventListener('cephepro:locked',lock);document.addEventListener('cephepro:state-updated',stateUpdated);dialog.addEventListener('close',cleanup,{once:true});
 const timer=setInterval(()=>{if(!busy&&!demo&&!draft&&!document.hidden&&!card.contains(document.activeElement))reload({silent:true});},4000);
 active={dialog,close:()=>dialog.close(),getSnapshot:()=>structuredClone(snapshot)};
 if(demoOnly)await startDemo();else{await globalThis.__v89CloudSync?.flush?.();await reload({fit:true});}
 return active;
}
