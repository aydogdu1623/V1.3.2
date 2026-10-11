/* Project-scoped site deficiencies, shared by all three report formats. */
(() => {
 'use strict';
 const KEY='cp_deficiencies',headers=['Tarih','Blok','Cephe','Poz No','İş Kalemi','Açıklama','Kaydeden'];
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const records=()=>{const data=store.get(KEY,[]);return Array.isArray(data)?data:[];};
 const allowed=()=>!!currentUser?.id&&!!window.CepheProProjects?.isReady();
 const today=()=>typeof v34Today==='function'?v34Today():new Date().toLocaleDateString('sv-SE');
 let context=null;
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
  if(!$('cpDefHistory')||!context)return;
  const rows=records().filter(r=>r.block===context.block&&r.facade===context.facade).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
  $('cpDefHistory').innerHTML=rows.length?rows.map(r=>`<article><strong>${esc(r.pozNo?r.pozNo+' · ':'')}${esc(r.item)}</strong><p>${esc(r.description)}</p><small>${esc(r.date.split('-').reverse().join('.'))} · ${esc(r.user)}</small></article>`).join(''):'<p class="cp-def-hint">Bu cephede kayıtlı eksik yok.</p>';
  $('cpDefCount').textContent=`Kayıtlı Eksikler (${rows.length})`;
 }
 function addRow(){
  const host=$('cpDefRows');if(host.children.length>=20){toast('Tek seferde en fazla 20 açıklama ekleyebilirsiniz.');return;}
  const group=document.createElement('fieldset');group.className='cp-def-entry';
  group.innerHTML=`<legend>Eksik kaydı</legend><div class="cp-def-entry-head"><span>İş kalemleri · birden fazla seçebilirsiniz</span><button type="button" data-remove aria-label="Bu eksik satırını kaldır">×</button></div><div class="cp-def-items">${(DATA[context.block]?.[context.facade]?.items||[]).filter(raw=>String(raw?.[0]||'').trim()).map(raw=>`<label><input type="checkbox" value="${esc(raw[0])}"><span>${esc(raw[10]?raw[10]+' · ':'')}${esc(raw[0])}</span></label>`).join('')}</div><label class="cp-def-description">Açıklama<textarea rows="2" maxlength="2000" placeholder="Eksik veya tamamlanması gereken işi açıklayın." aria-label="Eksik açıklaması"></textarea></label>`;
  group.querySelector('[data-remove]').onclick=()=>{if(host.children.length>1)group.remove();else{group.querySelectorAll('input').forEach(el=>el.checked=false);group.querySelector('textarea').value='';}};
  host.append(group);
 }
 function save(){
  if(!allowed()||!context||context.project!==window.CepheProProjects.project()?.id||context.userId!==String(currentUser.id)){toast('Proje erişiminizi yeniden doğrulayın.');return;}
  const date=$('cpDefDate').value,entries=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Geçerli bir tarih seçin.');return;}
  for(const group of $('cpDefRows').children){
   const items=[...group.querySelectorAll('input:checked')].map(el=>el.value),description=group.querySelector('textarea').value.trim();
   if(!items.length||!description){toast('Her eksik için iş kalemi seçin ve açıklama yazın.');return;}
   for(const item of items){
    const raw=DATA[context.block]?.[context.facade]?.items?.find(r=>r[0]===item);if(!raw){toast('İş kalemi değişmiş. Eksikler panelini yeniden açın.');return;}
    entries.push({id:crypto.randomUUID(),date,block:context.block,facade:context.facade,item,pozNo:String(raw[10]||''),description,userId:String(currentUser.id),user:currentUser.name||currentUser.username||'',savedAt:new Date().toISOString()});
   }
  }
  store.set(KEY,[...records(),...entries]);$('cpDefRows').replaceChildren();addRow();history();
  $('cpDefMessage').textContent=`${entries.length} eksik kaydedildi. Bulut durumu üst çubukta izlenebilir.`;
 }
 function open(){
  if(!allowed()){toast('Önce proje girişini tamamlayın.');return;}
  if(!DATA[currentBlock]?.[currentFacade]){toast('Önce bir cephe seçin.');return;}
  if(!$('cpDefDialog')){
   const dialog=document.createElement('dialog');dialog.id='cpDefDialog';dialog.className='cp-def-dialog';
   dialog.setAttribute('aria-labelledby','cpDefTitle');
   dialog.innerHTML='<div class="cp-def-head"><strong id="cpDefTitle">Eksikler</strong><button type="button" id="cpDefClose" aria-label="Eksikler panelini kapat">×</button></div><div class="cp-def-body"><label class="cp-def-date">Tarih<input type="date" id="cpDefDate"></label><div id="cpDefRows"></div><div class="cp-def-actions"><button type="button" id="cpDefAdd">＋ Eksik Ekle</button><button type="button" id="cpDefSave" class="primary">Kaydet</button></div><p id="cpDefMessage" role="status" class="cp-def-hint"></p><details><summary id="cpDefCount">Kayıtlı Eksikler</summary><div id="cpDefHistory"></div></details></div>';
   document.body.append(dialog);$('cpDefClose').onclick=()=>dialog.close();$('cpDefAdd').onclick=addRow;$('cpDefSave').onclick=save;
  }
  context={block:currentBlock,facade:currentFacade,project:window.CepheProProjects.project()?.id,userId:String(currentUser.id)};
  $('cpDefTitle').textContent=`${currentBlock} / ${currentFacade} — Eksikler`;$('cpDefDate').value=today();$('cpDefMessage').textContent='';$('cpDefRows').replaceChildren();addRow();history();$('cpDefDialog').showModal();
 }
 document.addEventListener('cephepro:locked',()=>{context=null;$('cpDefDialog')?.remove();});
 document.addEventListener('cephepro:state-updated',history);
 window.CepheProDeficiencies={mount,open,report,records};mount();
})();
