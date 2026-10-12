/* Project-scoped site deficiencies, shared by all three report formats. */
(() => {
 'use strict';
 const KEY='cp_deficiencies',headers=['Tarih','Blok','Cephe','Poz No','İş Kalemi','Açıklama','Kaydeden'];
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const records=()=>{const data=store.get(KEY,[]);return Array.isArray(data)?data.filter(r=>!r.deletedAt):[];};
 const allowed=()=>!!currentUser?.id&&!!window.CepheProProjects?.isReady();
 const today=()=>typeof v34Today==='function'?v34Today():new Date().toLocaleDateString('sv-SE');
 let context=null,savedList=false,historyLimit=25,permissionRequest=null,deleting=false,zOrder=1;
 const selectedIds=new Set(),permissions=new Map(),panels=new Map();
 function report(){
  const facades=typeof v52SelectedFacades==='function'?v52SelectedFacades():[],dates=typeof v52ReportDates==='function'?v52ReportDates():{};
  const selected=typeof v52ReportState==='object'?v52ReportState.items:null;
  const rows=records().filter(r=>facades.some(([b,f])=>b===r.block&&f===r.facade)&&(!dates.start||r.date>=dates.start)&&(!dates.end||r.date<=dates.end)&&(!selected||selected.has(v52ItemKey(r.block,r.facade,r.item))))
   .sort((a,b)=>a.date.localeCompare(b.date)||a.block.localeCompare(b.block,'tr')||a.facade.localeCompare(b.facade,'tr'))
   .map(r=>[r.date.split('-').reverse().join('.'),typeof v33BlockLabel==='function'?v33BlockLabel(r.block):r.block,r.facade,r.pozNo||'',r.item,r.description,r.user]);
  return {headers:[...headers],rows};
 }
 function mount(){
  const anchor=$('v34NoWorkBtn');if(!anchor)return;
  let button=$('cpDeficienciesBtn');if(!button){button=document.createElement('button');button.id='cpDeficienciesBtn';button.type='button';button.className='btn v105-no-work-btn';button.textContent='Eksikler';button.onclick=open;}
  if(anchor.previousElementSibling!==button)anchor.before(button);
 }
 const historyRows=()=>context?records().filter(r=>r.block===context.block&&r.facade===context.facade).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt))):[];
 function history(){
  if(!context||!$('cpDefHistory'))return;
  const rows=historyRows(),ids=new Set(rows.map(r=>r.id));for(const id of selectedIds)if(!ids.has(id))selectedIds.delete(id);
  $('cpDefCount').textContent=`Kayıtlı Eksikler (${rows.length})`;
  const batches=new Map();for(const r of rows.slice(0,historyLimit)){const key=r.userId+'|'+(r.listId||r.id);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(r);}
  $('cpDefHistory').innerHTML=rows.length?[...batches.entries()].map(([key,list])=>`<section class="cp-def-saved-list"><h3><input class="cp-def-check" type="checkbox" data-def-batch="${esc(key)}" aria-label="Bu eksik listesini seç"><span>Eksik listesi · ${esc(list[0].date.split('-').reverse().join('.'))} · ${esc(list[0].user)}</span></h3>${list.map(r=>`<div class="cp-def-record-row"><input class="cp-def-check" type="checkbox" data-def-select="${esc(r.id)}" aria-label="${esc(r.item)} eksiğini seç"><button type="button" class="cp-def-record" data-def-record="${esc(r.id)}"><strong>${esc(r.pozNo?r.pozNo+' · ':'')}${esc(r.item)}</strong><p>${esc(r.description)}</p></button></div>`).join('')}</section>`).join(''):'<p class="cp-def-hint">Bu cephede kayıtlı eksik yok.</p>';
  $('cpDefMore').hidden=rows.length<=historyLimit;selectionState();
 }
 function selectionState(){
  const rows=historyRows(),eligible=rows.filter(r=>permissions.get(r.id)===true);
  const setCheck=(el,ids)=>{el.disabled=deleting||!ids.length;el.checked=ids.length>0&&ids.every(id=>selectedIds.has(id));el.indeterminate=ids.some(id=>selectedIds.has(id))&&!el.checked;};
  $('cpDefHistory')?.querySelectorAll('[data-def-select]').forEach(el=>{setCheck(el,permissions.get(el.dataset.defSelect)?[el.dataset.defSelect]:[]);el.title=permissions.get(el.dataset.defSelect)===false?'Bu kaydı silme yetkiniz yok.':'';});
  $('cpDefHistory')?.querySelectorAll('[data-def-batch]').forEach(el=>setCheck(el,eligible.filter(r=>r.userId+'|'+(r.listId||r.id)===el.dataset.defBatch).map(r=>r.id)));
  if($('cpDefSelectAll'))setCheck($('cpDefSelectAll'),eligible.map(r=>r.id));
  const drafts=$('cpDefRows')?.querySelectorAll('[data-draft-select]:checked:not(:disabled)').length||0;
  if($('cpDefDeleteDraft'))$('cpDefDeleteDraft').disabled=deleting||!(drafts+selectedIds.size);
  if($('cpDefSelectionCount'))$('cpDefSelectionCount').textContent=selectedIds.size?`${selectedIds.size} kayıt seçili`:'';
 }
 async function loadPermissions(){
  if(permissionRequest)return permissionRequest;
  const c=context;
  const pending=(async()=>{try{
   const flushed=await window.__v89CloudSync?.flush?.();if(!validContext(c))return;
   if(flushed===false)throw Error('Bulut kaydı tamamlanamadı. Yeniden deneyin.');
   const data=await request('GET');if(!validContext(c))return;
   permissions.clear();for(const r of data.records)permissions.set(r.id,!!r.canDelete);
   for(const id of selectedIds)if(!permissions.get(id))selectedIds.delete(id);
   $('cpDefPermissionStatus').textContent='';selectionState();refreshPanels();
  }catch(error){if(validContext(c))$('cpDefPermissionStatus').textContent=error.message;}})();
  permissionRequest=pending;try{await pending;}finally{if(permissionRequest===pending)permissionRequest=null;}
 }
 function addRow(){
  if(savedList){newList();return;}
  const host=$('cpDefRows');if(host.children.length>=20){toast('Tek seferde en fazla 20 açıklama ekleyebilirsiniz.');return;}
  const group=document.createElement('fieldset');group.className='cp-def-entry';
  group.innerHTML=`<legend><label><input class="cp-def-check" type="checkbox" data-draft-select aria-label="Silmek için seç"> Eksik kaydı</label></legend><div class="cp-def-entry-head"><span>İş kalemleri · birden fazla seçebilirsiniz</span><button type="button" data-remove aria-label="Bu eksik satırını kaldır">×</button></div><div class="cp-def-items">${(DATA[context.block]?.[context.facade]?.items||[]).filter(raw=>String(raw?.[0]||'').trim()).map(raw=>`<label><input type="checkbox" value="${esc(raw[0])}"><span>${esc(raw[10]?raw[10]+' · ':'')}${esc(raw[0])}</span></label>`).join('')}</div><label class="cp-def-description">Açıklama<textarea rows="2" maxlength="2000" placeholder="Eksik veya tamamlanması gereken işi açıklayın." aria-label="Eksik açıklaması"></textarea></label>`;
  group.querySelector('[data-remove]').onclick=()=>{if(host.children.length>1)group.remove();else{group.querySelectorAll('input').forEach(el=>el.checked=false);group.querySelector('textarea').value='';}draftSelection();};
  host.append(group);group.addEventListener('change',draftSelection);draftSelection();
 }
 function save(){
  if(!allowed()||!context||context.project!==window.CepheProProjects.project()?.id||context.userId!==String(currentUser.id)){toast('Proje erişiminizi yeniden doğrulayın.');return;}
  if(savedList)return;
  const date=$('cpDefDate').value,entries=[],listId=crypto.randomUUID();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Geçerli bir tarih seçin.');return;}
  for(const group of $('cpDefRows').children){
   const items=[...group.querySelectorAll('.cp-def-items input:checked')].map(el=>el.value),description=group.querySelector('textarea').value.trim();
   if(!items.length||!description){toast('Her eksik için iş kalemi seçin ve açıklama yazın.');return;}
   for(const item of items){
    const raw=DATA[context.block]?.[context.facade]?.items?.find(r=>r[0]===item);if(!raw){toast('İş kalemi değişmiş. Eksikler panelini yeniden açın.');return;}
    entries.push({id:crypto.randomUUID(),listId,date,block:context.block,facade:context.facade,item,pozNo:String(raw[10]||''),description,userId:String(currentUser.id),user:currentUser.name||currentUser.username||'',savedAt:new Date().toISOString()});
   }
  }
  store.set(KEY,[...(store.get(KEY,[])||[]),...entries]);savedList=true;
  $('cpDefRows').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);$('cpDefDate').disabled=true;
  $('cpDefDeleteDraft').hidden=false;$('cpDefAdd').hidden=false;$('cpDefSave').hidden=true;$('cpDefNew').hidden=false;historyLimit=25;history();
  $('cpDefMessage').textContent=`${entries.length} eksik bu listeye kaydedildi. Devam etmek için Yeni Eksik Listesi düğmesine basın. Bulut durumu üst çubukta izlenebilir.`;
  loadPermissions();$('cpDefNew').focus();
 }
 function newList(){
  savedList=false;$('cpDefDate').disabled=false;$('cpDefDate').value=today();$('cpDefMessage').textContent='';
  $('cpDefDeleteDraft').hidden=false;$('cpDefAdd').hidden=false;$('cpDefSave').hidden=false;$('cpDefNew').hidden=true;$('cpDefRows').replaceChildren();addRow();
 }
 function draftSelection(){selectionState();}
 function validContext(c){return !!c&&c===context&&allowed()&&c.project===window.CepheProProjects.project()?.id&&c.userId===String(currentUser.id);}
 function closePanel(id){const panel=panels.get(id);if(panel){panel.el.remove();panels.delete(id);}}
 function refreshPanels(){
  const live=new Set(records().map(r=>r.id));for(const [id,panel] of panels){
   if(!live.has(id)){closePanel(id);continue;}
   panel.el.querySelector('[data-panel-delete]').disabled=deleting||!permissions.get(id);
   panel.el.querySelector('[data-panel-status]').textContent=permissions.has(id)?permissions.get(id)?'':'Bu kaydı silme yetkiniz yok.':'Bulut kaydı kontrol ediliyor…';
  }
 }
 async function deleteSelected(ids=[...selectedIds]){
  if(deleting||!validContext(context))return;
  const c=context,drafts=ids.length?[]:[...$('cpDefRows').querySelectorAll('[data-draft-select]:checked:not(:disabled)')];
  if(!ids.length){for(const box of drafts)box.closest('fieldset').remove();if(!$('cpDefRows').children.length&&!savedList)addRow();selectionState();return;}
  if(!confirm(`${ids.length} eksik kaydı silinsin mi?`))return;
  deleting=true;selectionState();refreshPanels();
  try{
   if(ids.length>500)throw Error('Tek seferde en fazla 500 kayıt silebilirsiniz.');
   const result=await request('DELETE',{ids});if(!validContext(c))return;
   window.__v89CloudSync.applyDeficiencies(result.deficiencies);for(const id of ids){selectedIds.delete(id);permissions.delete(id);closePanel(id);}history();toast(`${result.deleted} eksik kaydı silindi.`);
  }catch(error){if(validContext(c)){$('cpDefPermissionStatus').textContent=error.message;toast(error.message);}}
  finally{deleting=false;if(validContext(c)){selectionState();refreshPanels();}}
 }
 async function request(method,body){
  const token=localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
  const url=typeof window.v120ApiUrl==='function'?window.v120ApiUrl('/api/state'):'/api/state';
  const response=await fetch(url+(method==='GET'?'?view=deficiencies':''),{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Eksik kaydı işlenemedi.');return data;
 }
 function showRecord(id){
  const row=records().find(r=>r.id===id);if(!row||!validContext(context))return;
  if(panels.has(id)){panels.get(id).el.style.zIndex=++zOrder;panels.get(id).el.querySelector('[data-panel-pin]').focus();return;}
  for(const [other,panel] of panels)if(!panel.pinned)closePanel(other);
  const el=document.createElement('section');el.className='cp-def-dialog cp-def-floating';el.setAttribute('role','dialog');el.setAttribute('aria-label',`${row.item} — Kayıtlı Eksik`);el.dataset.recordId=id;
  el.innerHTML=`<div class="cp-def-head"><strong>Kayıtlı Eksik</strong><button type="button" data-panel-pin aria-pressed="false">Sabitle</button><button type="button" data-panel-close aria-label="Eksik panelini kapat">×</button></div><div class="cp-def-body"><strong>${esc(row.pozNo?row.pozNo+' · ':'')}${esc(row.item)}</strong><small>${esc(row.date)} · ${esc(row.user)}</small><p class="cp-def-record-description">${esc(row.description)}</p><div class="cp-def-actions"><button type="button" data-panel-delete disabled>Eksik Sil</button></div><p data-panel-status role="status" class="cp-def-hint"></p></div>`;
  const panel={el,pinned:false};panels.set(id,panel);$('cpDefPanelHost').append(el);el.style.zIndex=++zOrder;
  const width=Math.min(350,innerWidth-24),height=el.getBoundingClientRect().height||240,index=panels.size-1;
  el.style.left=Math.max(12,innerWidth-width-18-(index%2)*(width+12))+'px';el.style.top=Math.min(Math.max(12,innerHeight-height-12),24+Math.floor(index/2)*40+(innerWidth<760?index*65:0))+'px';
  el.querySelector('[data-panel-close]').onclick=()=>closePanel(id);
  el.querySelector('[data-panel-delete]').onclick=()=>deleteSelected([id]);
  el.querySelector('[data-panel-pin]').onclick=()=>{
   panel.pinned=!panel.pinned;el.dataset.pinned=String(panel.pinned);
   const button=el.querySelector('[data-panel-pin]');button.textContent=panel.pinned?'Sabitlemeyi Aç':'Sabitle';button.setAttribute('aria-pressed',String(panel.pinned));
  };
  let drag=null;const head=el.querySelector('.cp-def-head');
  head.addEventListener('pointerdown',e=>{if(panel.pinned||e.button!==0||e.target.closest('button'))return;const r=el.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};head.setPointerCapture(e.pointerId);e.preventDefault();});
  head.addEventListener('pointermove',e=>{if(!drag||panel.pinned)return;const r=el.getBoundingClientRect();el.style.left=Math.max(0,Math.min(innerWidth-r.width,e.clientX-drag.x))+'px';el.style.top=Math.max(0,Math.min(innerHeight-r.height,e.clientY-drag.y))+'px';});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])head.addEventListener(event,()=>{drag=null;});
  el.addEventListener('pointerdown',()=>el.style.zIndex=++zOrder);refreshPanels();loadPermissions();
 }
 function wirePanel(dialog){
  $('cpDefHistory').onclick=e=>{const button=e.target.closest('[data-def-record]');if(button)showRecord(button.dataset.defRecord);};
  $('cpDefHistory').onchange=e=>{
   const box=e.target;if(box.matches('[data-def-select]'))box.checked?selectedIds.add(box.dataset.defSelect):selectedIds.delete(box.dataset.defSelect);
   if(box.matches('[data-def-batch]'))for(const r of historyRows())if(permissions.get(r.id)&&r.userId+'|'+(r.listId||r.id)===box.dataset.defBatch)box.checked?selectedIds.add(r.id):selectedIds.delete(r.id);
   selectionState();
  };
  $('cpDefSelectAll').onchange=e=>{for(const r of historyRows())if(permissions.get(r.id))e.target.checked?selectedIds.add(r.id):selectedIds.delete(r.id);selectionState();};
  $('cpDefRefresh').onclick=loadPermissions;
  dialog.addEventListener('close',()=>{for(const id of panels.keys())closePanel(id);});
  dialog.addEventListener('cancel',e=>{const last=[...panels].reverse().find(([,p])=>!p.pinned);if(last){e.preventDefault();closePanel(last[0]);}});
 }
 function open(){
  if(!allowed()){toast('Önce proje girişini tamamlayın.');return;}
  if(!DATA[currentBlock]?.[currentFacade]){toast('Önce bir cephe seçin.');return;}
  if(!$('cpDefDialog')){
   const dialog=document.createElement('dialog');dialog.id='cpDefDialog';dialog.className='cp-def-dialog';
   dialog.setAttribute('aria-labelledby','cpDefTitle');
   dialog.innerHTML='<div class="cp-def-head"><strong id="cpDefTitle">Eksikler</strong><button type="button" id="cpDefClose" aria-label="Eksikler panelini kapat">×</button></div><div class="cp-def-body" id="cpDefListBody"><label class="cp-def-date">Tarih<input type="date" id="cpDefDate"></label><div id="cpDefRows"></div><div class="cp-def-actions"><button type="button" id="cpDefAdd">＋ Eksik Ekle</button><button type="button" id="cpDefDeleteDraft" disabled>Eksik Sil</button><button type="button" id="cpDefSave" class="primary">Kaydet</button><button type="button" id="cpDefNew" class="primary" hidden>＋ Yeni Eksik Listesi</button></div><p id="cpDefMessage" role="status" class="cp-def-hint"></p><details id="cpDefHistoryDetails"><summary id="cpDefCount">Kayıtlı Eksikler</summary><div class="cp-def-selectionbar"><label><input class="cp-def-check" id="cpDefSelectAll" type="checkbox"> Tüm kayıtları seç</label><span id="cpDefSelectionCount"></span><button type="button" id="cpDefRefresh">Yenile</button></div><p id="cpDefPermissionStatus" class="cp-def-hint" role="status"></p><div id="cpDefHistory"></div><button type="button" id="cpDefMore" hidden>Daha Fazla Göster</button></details></div><div id="cpDefPanelHost"></div>';
   document.body.append(dialog);$('cpDefClose').onclick=()=>dialog.close();$('cpDefAdd').onclick=addRow;$('cpDefSave').onclick=save;$('cpDefNew').onclick=newList;
   wirePanel(dialog);$('cpDefDeleteDraft').onclick=()=>deleteSelected();$('cpDefHistoryDetails').ontoggle=()=>{history();if($('cpDefHistoryDetails')?.open&&validContext(context))loadPermissions();};$('cpDefMore').onclick=()=>{historyLimit+=25;history();};
  }
  for(const id of panels.keys())closePanel(id);selectedIds.clear();permissions.clear();permissionRequest=null;
  context={block:currentBlock,facade:currentFacade,project:window.CepheProProjects.project()?.id,userId:String(currentUser.id)};
  $('cpDefTitle').textContent=`${currentBlock} / ${currentFacade} — Eksikler`;newList();historyLimit=25;$('cpDefHistory').replaceChildren();history();if(!$('cpDefDialog').open)$('cpDefDialog').showModal();loadPermissions();
 }
 document.addEventListener('cephepro:locked',()=>{context=null;permissionRequest=null;selectedIds.clear();permissions.clear();for(const id of panels.keys())closePanel(id);$('cpDefDialog')?.remove();});
 document.addEventListener('cephepro:state-updated',()=>{history();refreshPanels();});
 window.CepheProDeficiencies={mount,open,report,records};mount();
})();
