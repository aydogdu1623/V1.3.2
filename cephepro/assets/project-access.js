(function(){
 'use strict';
 const root=document.documentElement,CONTEXT='cp_project_access';
 root.dataset.cpProject='locked';
 const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
 const read=(storage,key)=>nativeGet.call(storage,key),write=(storage,key,value)=>nativeSet.call(storage,key,value);
 const globalKeys=new Set(['cp_cloud_token','cp_remembered_cloud_token','cp_session','cp_private_owner','cp_remembered_account','cp_last_login_id','cp_v113_login_reload','cp_v116_access_notice']);
 const scoped=key=>String(key).startsWith('cp_')&&!globalKeys.has(String(key))&&!String(key).startsWith('cp_project_access')&&!String(key).startsWith('cp_scope:');
 let context=null;try{context=JSON.parse(read(sessionStorage,CONTEXT)||'null');}catch{}
 const namespace=()=>context?.project?.id&&context?.userId?'cp_scope:'+context.project.id+':'+context.userId+':':'cp_scope:locked:';
 Storage.prototype.getItem=function(key){return nativeGet.call(this,scoped(key)?namespace()+key:key);};
 Storage.prototype.setItem=function(key,value){return nativeSet.call(this,scoped(key)?namespace()+key:key,value);};
 Storage.prototype.removeItem=function(key){return nativeRemove.call(this,scoped(key)?namespace()+key:key);};
 const nativeFetch=window.fetch.bind(window),$=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const accountToken=()=>read(localStorage,'cp_cloud_token')||read(localStorage,'cp_remembered_cloud_token')||'';
 let user=null,verified=false,hydrated=false,projects=[],canCreate=false,checking=null,editMode=null;
 const lockedReply=()=>new Response(JSON.stringify({error:'Önce proje girişini tamamlayın.',code:'PROJECT_LOCKED'}),{status:403,headers:{'Content-Type':'application/json'}});
 window.fetch=async function(input,init={}){
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href);
  const protectedApi=url.origin===location.origin&&/^\/api\/(state|finance|claims|photos|activity|puantaj|auth)\/?$/.test(url.pathname);
  if(!protectedApi)return nativeFetch(input,init);
  const isAuth=/\/auth\/?$/.test(url.pathname),captured=context?.token;
  if(!isAuth&&(!verified||!captured))return lockedReply();
  const headers=new Headers(init.headers||(typeof input==='object'?input.headers:undefined));
  if(verified&&captured)headers.set('X-Project-Token',captured);
  const response=await nativeFetch(input,{...init,headers});
  if(!isAuth&&captured!==context?.token)throw new Error('Proje değişti. Eski projenin yanıtı iptal edildi.');
  if(response.status===403){const data=await response.clone().json().catch(()=>({}));if(data.code==='PROJECT_LOCKED'&&verified)lock(false);}
  return response;
 };
 async function api(body){
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+accountToken()};
  if(context?.token)headers['X-Project-Token']=context.token;
  const response=await nativeFetch('/api/projects',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json();if(!response.ok){const error=Error(data.error||'Proje işlemi tamamlanamadı.');error.code=data.code;throw error;}return data;
 }
 function accept(account){
  if(!account?.id)return;user=account;root.dataset.cpAccount='verified';
  if(context&&String(context.userId)!==String(account.id)){context=null;nativeRemove.call(sessionStorage,CONTEXT);location.reload();}
 }
 function migrateLegacy(){
  if(context?.project?.id!=='main'||read(localStorage,'cp_private_owner')!==String(user?.id))return;
  const id=String(user.id);
  for(const storage of [localStorage,sessionStorage]){
   const mark=namespace()+'legacy213';if(read(storage,mark))continue;
   // Only this account's personal drafts migrate. Shared data comes from the protected API.
   const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
   for(const key of keys)if(key&&(key.startsWith('cp_puantaj_draft:'+id+':')||key.startsWith('cp_puantaj_saved:'+id+':')||key==='cp_claims_draft_v191_'+id||key==='cp_member_edits_'+id)){
    const value=read(storage,key);if(value!==null&&!read(storage,namespace()+key))write(storage,namespace()+key,value);
   }
   write(storage,mark,'1');
  }
 }
 async function ensure(account){
  accept(account);if(verified)return true;if(checking)return checking;
  checking=(async()=>{
   mount();showGate();status('Proje erişimi kontrol ediliyor…');
   try{
    const data=await api();projects=data.projects||[];canCreate=!!data.canCreate;
    if(context&&data.activeProject?.id===context.project.id&&String(context.userId)===String(user.id)){
     context.project=data.activeProject;verified=true;write(sessionStorage,CONTEXT,JSON.stringify(context));migrateLegacy();
     status('Proje verileri yükleniyor…');render();return true;
    }
    context=null;nativeRemove.call(sessionStorage,CONTEXT);status('Devam etmek için firma kodu, proje kodu ve proje şifrenizi girin.');render();return false;
   }catch(e){status(e.message,true);return false;}finally{checking=null;}
  })();return checking;
 }
 function status(message,error=false){const el=$('cpProjectStatus');if(el){el.textContent=message;el.dataset.error=String(error);}}
 function showGate(){if($('cpProjectGate'))$('cpProjectGate').hidden=false;root.dataset.cpProject='locked';}
 function lock(logout=false){
  verified=false;hydrated=false;context=null;nativeRemove.call(sessionStorage,CONTEXT);root.dataset.cpProject='locked';
  document.querySelectorAll('dialog[open]').forEach(el=>{try{el.close();}catch{}});
  if(logout){user=null;delete root.dataset.cpAccount;if($('cpProjectGate'))$('cpProjectGate').hidden=true;}
  else{showGate();status('Proje erişimi sona erdi. Kodları ve şifreyi yeniden girin.');render();}
 }
 function ready(){
  if(!verified||!context)return;const first=!hydrated;hydrated=true;root.dataset.cpProject='ready';if($('cpProjectGate'))$('cpProjectGate').hidden=true;
  window.CepheProPrivacy?.ready(user);header();
  if(first)document.dispatchEvent(new CustomEvent('cephepro:user-ready',{detail:{user,projectId:context.project.id}}));
 }
 function header(){
  if(!hydrated)return;const host=$('settingsBtn')?.parentElement||document.querySelector('header .actions');if(!host)return;
  let button=$('cpActiveProject');if(!button){button=document.createElement('button');button.id='cpActiveProject';button.className='btn';button.onclick=()=>{try{openSettings('settingsSave');}catch{}refresh();};host.prepend(button);}
  button.textContent=context.project.name+' ▾';button.title='Projeleri görüntüle ve proje değiştir';
 }
 async function refresh(){try{const data=await api();projects=data.projects||[];canCreate=!!data.canCreate;render();}catch(e){if($('cpProjectsMessage'))$('cpProjectsMessage').textContent=e.message;}}
 function progress(){try{return Number(v63OverviewProgress()).toLocaleString('tr-TR',{maximumFractionDigits:1});}catch{return '0';}}
 function rows(deleted=false){return projects.filter(p=>!!p.deletedAt===deleted).map(p=>{
  const active=verified&&context?.project.id===p.id;
  return `<article class="cp-project-row${active?' active':''}"><div><strong>${esc(p.name)}</strong><small>${esc(p.companyCode||'Firma kodu bekleniyor')} / ${esc(p.projectCode||'Proje kodu bekleniyor')}</small><span class="cp-project-state">${deleted?'Silinen proje':active&&hydrated?'Açık proje · İlerleme %'+progress():p.configured?'Kilitli · İlerleme için projeye giriş yapın':'İlk güvenlik kurulumu gerekli'}</span></div><div class="cp-project-actions">${deleted?`<button type="button" data-project-action="restore" data-id="${esc(p.id)}">Geri Al</button>`:`<button type="button" data-project-action="switch" data-id="${esc(p.id)}" ${active?'disabled':''}>${active?'Açık':'Projeye Geç'}</button>${p.canManage?`<details><summary aria-label="${esc(p.name)} proje işlemleri">İşlemler ▾</summary><div><button type="button" data-project-action="edit" data-id="${esc(p.id)}">Düzenle</button><button type="button" data-project-action="${p.configured?'password':'setup'}" data-id="${esc(p.id)}">${p.configured?'Şifre Değiştir':'Şifre Oluştur'}</button><button type="button" data-project-action="delete" data-id="${esc(p.id)}">Sil</button></div></details>`:''}`}</div></article>`;
 }).join('')||'<p class="cp-project-hint">Henüz proje yok. Size verilen kodlarla projeye giriş yapabilirsiniz.</p>';}
 function render(){
  if($('cpKnownProjects'))$('cpKnownProjects').innerHTML=rows();
  if($('cpGateCreate'))$('cpGateCreate').hidden=!canCreate;
  if($('cpProjectsList'))$('cpProjectsList').innerHTML=rows()+ (projects.some(p=>p.deletedAt&&p.canManage)?`<details class="cp-deleted"><summary>Silinen Projeler</summary>${rows(true)}</details>`:'');
  if($('cpProjectCreate'))$('cpProjectCreate').hidden=!canCreate;
 }
 function select(p){$('cpCompanyCode').value=p?.companyCode||'';$('cpProjectCode').value=p?.projectCode||'';$('cpProjectPassword').value='';$('cpProjectPassword').focus();}
 async function switchProject(p){
  if(hydrated){await window.__v89CloudSync?.flush();await api({action:'lock'});}
  lock(false);select(p);status('Seçtiğiniz projenin şifresini girin.');
 }
 function form(mode,p){
  editMode={mode,p};const isPassword=mode==='password',needsPassword=['create','setup','password'].includes(mode);
  const title={create:'Yeni Proje Ekle',setup:'Mevcut Projeye Şifre Oluştur',edit:'Projeyi Düzenle',password:'Proje Şifresini Değiştir'}[mode];
  const host=$('cpProjectEditor');host.innerHTML=`<form id="cpProjectEditForm"><h2>${title}</h2><p class="cp-project-hint">${mode==='setup'?'Mevcut kayıtlarınız korunur. Bu bilgiler projeye girişte sorulur.':'Proje kodlarını ve şifresini yalnız erişim vermek istediğiniz kişilerle paylaşın.'}</p>${!isPassword?`<label>Proje adı<input name="name" required maxlength="120" value="${esc(p?.name||'')}"></label><div class="cp-code-grid"><label>Firma kodu<input name="companyCode" required minlength="2" maxlength="40" value="${esc(p?.companyCode||'')}" autocomplete="off"></label><label>Proje kodu<input name="projectCode" required minlength="2" maxlength="40" value="${esc(p?.projectCode||'')}" autocomplete="off"></label></div>`:''}${isPassword?'<label>Mevcut proje şifresi<input name="currentPassword" type="password" required maxlength="128" autocomplete="current-password"></label>':''}${needsPassword?'<label>Proje şifresi<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>Şifre tekrar<input name="repeatPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>':''}<p id="cpProjectEditStatus" role="status" aria-live="polite"></p><div class="cp-project-toolbar"><button type="submit" class="primary">${mode==='create'?'Proje Ekle':'Kaydet'}</button><button type="button" id="cpProjectEditCancel">Vazgeç</button></div></form>`;
  host.hidden=false;$('cpProjectEditCancel').onclick=()=>{host.hidden=true;host.replaceChildren();};
  $('cpProjectEditForm').onsubmit=async event=>{
   event.preventDefault();const fields=Object.fromEntries(new FormData(event.currentTarget));
   if(needsPassword&&fields.password!==fields.repeatPassword){$('cpProjectEditStatus').textContent='Şifreler aynı olmalıdır.';return;}
   const submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;
   try{const result=await api({action:mode,id:p?.id,...fields});const target={...p,...fields,id:result.id||p?.id};host.hidden=true;host.replaceChildren();await refresh();
    if(mode==='create'&&!hydrated){select(target);status('Proje oluşturuldu. Şifrenizle giriş yapabilirsiniz.');}
    else if(mode==='create'){if($('cpProjectsMessage'))$('cpProjectsMessage').textContent='Proje eklendi. Projeye Geç ile açabilirsiniz.';}
    else{lock(false);select(target);status('Kaydedildi. Yeni bilgilerle projeye giriş yapın.');}
   }catch(e){$('cpProjectEditStatus').textContent=e.message;submit.disabled=false;}
  };host.querySelector('input')?.focus();
 }
 async function action(name,id){
  const p=projects.find(p=>p.id===id);
  try{
   if(name==='create'){form('create');return;}
   if(!p)return;
   if(name==='switch'){if(!p.configured&&p.canManage){form('setup',p);return;}await switchProject(p);return;}
   if(name==='restore'){await api({action:'restore',id});await refresh();return;}
   if(!p.canManage)throw Error('Bu projeyi yönetme yetkiniz yok.');
   if(p.configured&&context?.project?.id!==p.id){await switchProject(p);status('İşlem yapmak için önce bu projeye giriş yapın.');return;}
   if(name==='delete'){
    if(!confirm('“'+p.name+'” projesi listeden silinsin mi? Kayıtları korunur; Silinen Projeler bölümünden geri alabilirsiniz.'))return;
    await window.__v89CloudSync?.flush();await api({action:'delete',id});lock(false);await refresh();return;
   }
   form(p.configured?name:'setup',p);
  }catch(e){if(root.dataset.cpProject==='locked')status(e.message,true);else if($('cpProjectsMessage'))$('cpProjectsMessage').textContent=e.message;}
 }
 function mount(){
  if(!document.body||$('cpProjectGate'))return;
  const gate=document.createElement('section');gate.id='cpProjectGate';gate.hidden=true;gate.setAttribute('aria-label','Proje güvenlik kontrolü');
  gate.innerHTML=`<div class="cp-gate-card"><div class="cp-gate-brand">CE P H E P R O <span>PROJE GİRİŞİ</span></div><h1>Projenize güvenle erişin</h1><p class="cp-project-hint">Hesap girişiniz tamamlandı. Proje verilerini açmak için erişim bilgilerinizi girin.</p><form id="cpProjectLogin"><div class="cp-code-grid"><label>Firma kodu<input id="cpCompanyCode" required maxlength="40" autocomplete="off" spellcheck="false"></label><label>Proje kodu<input id="cpProjectCode" required maxlength="40" autocomplete="off" spellcheck="false"></label></div><label>Proje şifresi<input id="cpProjectPassword" type="password" required maxlength="128" autocomplete="current-password"></label><button type="submit" class="primary">Projeye Gir</button></form><p id="cpProjectStatus" role="status" aria-live="polite"></p><div class="cp-project-toolbar"><h2>Projelerim</h2><button type="button" id="cpGateCreate" hidden>+ Proje Ekle</button></div><div id="cpKnownProjects"></div><div class="cp-project-toolbar"><button type="button" id="cpProjectRetry">Yeniden Dene</button><button type="button" id="cpProjectLogout">Hesaptan Çık</button></div></div>`;
  document.body.append(gate);
  const editor=document.createElement('div');editor.id='cpProjectEditor';editor.hidden=true;editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.setAttribute('aria-label','Proje düzenleme');document.body.append(editor);
  $('cpProjectLogin').onsubmit=async event=>{
   event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;status('Proje açılıyor…');
   try{const data=await api({action:'unlock',companyCode:$('cpCompanyCode').value,projectCode:$('cpProjectCode').value,password:$('cpProjectPassword').value});context={token:data.token,project:data.project,userId:data.userId};write(sessionStorage,CONTEXT,JSON.stringify(context));$('cpProjectPassword').value='';location.reload();}
   catch(e){status(e.message,true);button.disabled=false;}
  };
  $('cpGateCreate').onclick=()=>form('create');$('cpProjectCreate')?.addEventListener('click',()=>form('create'));
  $('cpProjectRetry').onclick=()=>location.reload();
  $('cpProjectLogout').onclick=async()=>{try{await nativeFetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accountToken()},body:JSON.stringify({action:'logout'})});}catch{}for(const key of ['cp_cloud_token','cp_remembered_cloud_token','cp_session'])nativeRemove.call(localStorage,key);lock(true);location.reload();};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-project-action]');if(button){event.preventDefault();action(button.dataset.projectAction,button.dataset.id);}if(event.target.closest('[data-pane="settingsSave"]'))refresh();});
  render();
 }
 document.addEventListener('DOMContentLoaded',mount);
 document.addEventListener('cephepro:locked',()=>lock(true));
 window.addEventListener('storage',event=>{if(['cp_cloud_token','cp_remembered_cloud_token'].includes(event.key)){lock(true);location.reload();}});
 window.CepheProProjects={ensure,accept,ready,lock,refresh,isReady:()=>verified&&hydrated,isVerified:()=>verified,loadFailed:message=>{showGate();status(message||'Proje verileri yüklenemedi. Yeniden Dene ile tekrar bağlanın.',true);},project:()=>verified?context?.project:null};
})();
