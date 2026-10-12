/* Project-scoped site deficiencies, shared by all three report formats. */
(() => {
 'use strict';
 const KEY='cp_deficiencies',headers=['Tarih','Blok','Cephe','Poz No','İş Kalemi','Açıklama','Kaydeden'];
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const records=()=>{const data=store.get(KEY,[]);return Array.isArray(data)?data.filter(r=>!r.deletedAt):[];};
 const allowed=()=>!!currentUser?.id&&!!window.CepheProProjects?.isReady();
 const today=()=>typeof v34Today==='function'?v34Today():new Date().toLocaleDateString('sv-SE');
 let context=null,savedList=false,historyLimit=25,detailId=null,pinned=false,requestVersion=0;
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
 function history(){
  if(!context||!$('cpDefHistory'))return;
  const rows=records().filter(r=>r.block===context.block&&r.facade===context.facade).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
  $('cpDefCount').textContent=`Kayıtlı Eksikler (${rows.length})`;
  if(!$('cpDefHistoryDetails').open)return;
  const batches=new Map();for(const r of rows.slice(0,historyLimit)){const key=r.userId+'|'+(r.listId||r.id);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(r);}
  $('cpDefHistory').innerHTML=rows.length?[...batches.values()].map(list=>`<section class="cp-def-saved-list"><h3>Eksik listesi · ${esc(list[0].date.split('-').reverse().join('.'))} · ${esc(list[0].user)}</h3>${list.map(r=>`<button type="button" class="cp-def-record" data-def-record="${esc(r.id)}"><strong>${esc(r.pozNo?r.pozNo+' · ':'')}${esc(r.item)}</strong><p>${esc(r.description)}</p></button>`).join('')}</section>`).join(''):'<p class="cp-def-hint">Bu cephede kayıtlı eksik yok.</p>';
  $('cpDefMore').hidden=rows.length<=historyLimit;
 }
 function addRow(){
  if(savedList)return;
  const host=$('cpDefRows');if(host.children.length>=20){toast('Tek seferde en fazla 20 açıklama ekleyebilirsiniz.');return;}
  const group=document.createElement('fieldset');group.className='cp-def-entry';
  group.innerHTML=`<legend><label><input type="checkbox" data-draft-select aria-label="Silmek için seç"> Eksik kaydı</label></legend><div class="cp-def-entry-head"><span>İş kalemleri · birden fazla seçebilirsiniz</span><button type="button" data-remove aria-label="Bu eksik satırını kaldır">×</button></div><div class="cp-def-items">${(DATA[context.block]?.[context.facade]?.items||[]).filter(raw=>String(raw?.[0]||'').trim()).map(raw=>`<label><input type="checkbox" value="${esc(raw[0])}"><span>${esc(raw[10]?raw[10]+' · ':'')}${esc(raw[0])}</span></label>`).join('')}</div><label class="cp-def-description">Açıklama<textarea rows="2" maxlength="2000" placeholder="Eksik veya tamamlanması gereken işi açıklayın." aria-label="Eksik açıklaması"></textarea></label>`;
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
  $('cpDefDeleteDraft').hidden=true;$('cpDefAdd').hidden=true;$('cpDefSave').hidden=true;$('cpDefNew').hidden=false;historyLimit=25;history();
  $('cpDefMessage').textContent=`${entries.length} eksik bu listeye kaydedildi. Devam etmek için Yeni Eksik Listesi düğmesine basın. Bulut durumu üst çubukta izlenebilir.`;
  $('cpDefNew').focus();
 }
 function newList(){
  savedList=false;$('cpDefDate').disabled=false;$('cpDefDate').value=today();$('cpDefMessage').textContent='';
  $('cpDefDeleteDraft').hidden=false;$('cpDefAdd').hidden=false;$('cpDefSave').hidden=false;$('cpDefNew').hidden=true;$('cpDefRows').replaceChildren();addRow();
 }
 function draftSelection(){if($('cpDefDeleteDraft'))$('cpDefDeleteDraft').disabled=!$('cpDefRows').querySelector('[data-draft-select]:checked');}
 function validContext(c){return c===context&&allowed()&&c.project===window.CepheProProjects.project()?.id&&c.userId===String(currentUser.id);}
 function listView(){
  detailId=null;requestVersion++;const d=$('cpDefDialog');if(!d)return;
  d.classList.remove('cp-def-detail');d.style.left='';d.style.top='';d.style.margin='';
  $('cpDefListBody').hidden=false;$('cpDefDetail').hidden=true;$('cpDefPin').hidden=true;
  if(context)$('cpDefTitle').textContent=`${context.block} / ${context.facade} — Eksikler`;
 }
 async function request(method,body){
  const token=localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
  const url=typeof window.v120ApiUrl==='function'?window.v120ApiUrl('/api/state'):'/api/state';
  const response=await fetch(url+(method==='GET'?'?view=deficiencies':''),{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Eksik kaydı işlenemedi.');return data;
 }
 async function showRecord(id){
  const row=records().find(r=>r.id===id);if(!row||!validContext(context))return;
  detailId=id;const version=++requestVersion,c=context,d=$('cpDefDialog');
  d.classList.add('cp-def-detail');d.style.left='';d.style.top='';d.style.margin='';pinned=false;
  $('cpDefPin').hidden=false;$('cpDefPin').textContent='Sabitle';$('cpDefPin').setAttribute('aria-pressed','false');
  $('cpDefTitle').textContent='Kayıtlı Eksik';$('cpDefListBody').hidden=true;$('cpDefDetail').hidden=false;
  $('cpDefDetail').innerHTML=`<strong>${esc(row.pozNo?row.pozNo+' · ':'')}${esc(row.item)}</strong><small>${esc(row.date)} · ${esc(row.user)}</small><p class="cp-def-record-description">${esc(row.description)}</p><div class="cp-def-actions"><button type="button" id="cpDefBack">Liste</button><button type="button" id="cpDefDeleteSaved" disabled>Eksik Sil</button></div><p id="cpDefDeleteStatus" role="status" class="cp-def-hint">Bulut kaydı kontrol ediliyor…</p>`;
  $('cpDefBack').onclick=listView;
  const fresh=()=>validContext(c)&&detailId===id&&requestVersion===version;
  try{
   const flushed=await window.__v89CloudSync?.flush?.();if(!fresh())return;
   if(flushed===false)throw Error('Bulut kaydı tamamlanamadı. Yeniden deneyin.');
   const data=await request('GET');if(!fresh())return;
   const saved=data.records.find(r=>r.id===id);if(!saved)throw Error('Bu kayıt henüz bulutta yok veya silinmiş. Listeyi yenileyin.');
   $('cpDefDeleteStatus').textContent=saved.canDelete?'':'Bu eksik kaydını silme yetkiniz yok.';
   $('cpDefDeleteSaved').disabled=!saved.canDelete;
   $('cpDefDeleteSaved').onclick=async()=>{
    if(!fresh()||!confirm('Bu eksik kaydı silinsin mi?'))return;
    $('cpDefDeleteSaved').disabled=true;
    try{const result=await request('DELETE',{ids:[id]});if(!fresh())return;
     window.__v89CloudSync.applyDeficiencies(result.deficiencies);listView();history();toast('Eksik kaydı silindi.');
    }catch(error){if(fresh()){$('cpDefDeleteStatus').textContent=error.message;$('cpDefDeleteSaved').disabled=false;}}
   };
  }catch(error){if(fresh())$('cpDefDeleteStatus').textContent=error.message;}
 }
 function wirePanel(dialog){
  $('cpDefHistory').onclick=e=>{const button=e.target.closest('[data-def-record]');if(button)showRecord(button.dataset.defRecord);};
  $('cpDefPin').onclick=()=>{pinned=!pinned;$('cpDefPin').textContent=pinned?'Sabitlemeyi Aç':'Sabitle';$('cpDefPin').setAttribute('aria-pressed',String(pinned));};
  let drag=null;const head=dialog.querySelector('.cp-def-head');
  head.addEventListener('pointerdown',e=>{if(!detailId||pinned||e.button!==0||e.target.closest('button'))return;const r=dialog.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};head.setPointerCapture(e.pointerId);e.preventDefault();});
  head.addEventListener('pointermove',e=>{if(!drag||pinned)return;const r=dialog.getBoundingClientRect();dialog.style.margin='0';dialog.style.left=Math.max(0,Math.min(innerWidth-r.width,e.clientX-drag.x))+'px';dialog.style.top=Math.max(0,Math.min(innerHeight-r.height,e.clientY-drag.y))+'px';});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])head.addEventListener(event,()=>{drag=null;});
  dialog.addEventListener('close',()=>{detailId=null;requestVersion++;});
 }
 function open(){
  if(!allowed()){toast('Önce proje girişini tamamlayın.');return;}
  if(!DATA[currentBlock]?.[currentFacade]){toast('Önce bir cephe seçin.');return;}
  if(!$('cpDefDialog')){
   const dialog=document.createElement('dialog');dialog.id='cpDefDialog';dialog.className='cp-def-dialog';
   dialog.setAttribute('aria-labelledby','cpDefTitle');
   dialog.innerHTML='<div class="cp-def-head"><strong id="cpDefTitle">Eksikler</strong><button type="button" id="cpDefPin" aria-pressed="false" hidden>Sabitle</button><button type="button" id="cpDefClose" aria-label="Eksikler panelini kapat">×</button></div><div class="cp-def-body" id="cpDefListBody"><label class="cp-def-date">Tarih<input type="date" id="cpDefDate"></label><div id="cpDefRows"></div><div class="cp-def-actions"><button type="button" id="cpDefAdd">＋ Eksik Ekle</button><button type="button" id="cpDefDeleteDraft" disabled>Eksik Sil</button><button type="button" id="cpDefSave" class="primary">Kaydet</button><button type="button" id="cpDefNew" class="primary" hidden>＋ Yeni Eksik Listesi</button></div><p id="cpDefMessage" role="status" class="cp-def-hint"></p><details id="cpDefHistoryDetails"><summary id="cpDefCount">Kayıtlı Eksikler</summary><div id="cpDefHistory"></div><button type="button" id="cpDefMore" hidden>Daha Fazla Göster</button></details></div><div id="cpDefDetail" class="cp-def-body" hidden></div>';
   document.body.append(dialog);$('cpDefClose').onclick=()=>dialog.close();$('cpDefAdd').onclick=addRow;$('cpDefSave').onclick=save;$('cpDefNew').onclick=newList;
   wirePanel(dialog);$('cpDefDeleteDraft').onclick=()=>{for(const box of $('cpDefRows').querySelectorAll('[data-draft-select]:checked'))box.closest('fieldset').remove();if(!$('cpDefRows').children.length)addRow();draftSelection();};$('cpDefHistoryDetails').ontoggle=history;$('cpDefMore').onclick=()=>{historyLimit+=25;history();};
  }
  context={block:currentBlock,facade:currentFacade,project:window.CepheProProjects.project()?.id,userId:String(currentUser.id)};
  listView();$('cpDefTitle').textContent=`${currentBlock} / ${currentFacade} — Eksikler`;newList();historyLimit=25;$('cpDefHistory').replaceChildren();history();$('cpDefDialog').showModal();
 }
 document.addEventListener('cephepro:locked',()=>{context=null;detailId=null;requestVersion++;$('cpDefDialog')?.remove();});
 document.addEventListener('cephepro:state-updated',()=>{history();if(detailId&&!records().some(r=>r.id===detailId))listView();});
 window.CepheProDeficiencies={mount,open,report,records};mount();
})();
