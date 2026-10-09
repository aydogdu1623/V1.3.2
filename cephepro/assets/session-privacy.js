(function(){
 'use strict';
 const root=document.documentElement;
 root.dataset.cpAuth='locked';
 const privateKeys=['cp_users','cp_user_profiles','cp_session','cp_remembered_account','cp_last_login_id'];
 const token=()=>localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token');
 let verifiedId='';
 function clearPrivate(){
  for(const key of privateKeys)localStorage.removeItem(key);
  try{if(typeof store!=='undefined')for(const key of privateKeys)store.remove(key);}catch{}
  try{users=[];v34UserProfiles={};rememberedAccount=null;lastLoginId='';currentUser=null;}catch{}
  for(const id of ['rememberedUsername','rememberedEmail','rememberedAvatar','loginSuggestions']){const el=document.getElementById(id);if(el)el.textContent='';}
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  document.querySelectorAll('.modalback').forEach(panel=>panel.style.display='none');
  document.querySelectorAll('.v178-activity-panel').forEach(panel=>panel.remove());
 }
 function lock(){verifiedId='';root.dataset.cpAuth='locked';clearPrivate();document.dispatchEvent(new CustomEvent('cephepro:locked'));}
 function accept(user){
  if(!user?.id)return;
  window.CepheProProjects?.accept(user);
  const previous=localStorage.getItem('cp_private_owner');
  if(previous!==String(user.id)){
   clearPrivate();
   for(const key of ['cp_daily_entries','cp_attendance_logs','cp_no_work_notes','cp_photos','cp_cloud_revision'])localStorage.removeItem(key);
   try{dailyEntries={};attendanceLogs=[];facadePhotos={};v34UserProfiles={};}catch{}
  }
  localStorage.setItem('cp_private_owner',String(user.id));verifiedId=String(user.id);
 }
 function ready(user){if(window.CepheProProjects&&!window.CepheProProjects.isReady())return;if(verifiedId&&verifiedId===String(user?.id)&&token())root.dataset.cpAuth='ready';}
 if(!token())clearPrivate();
 document.addEventListener('click',event=>{if(event.target.closest?.('#v35AccountLogout')){root.dataset.cpAuth='locked';setTimeout(lock,0);}},true);
 window.addEventListener('storage',event=>{if(['cp_cloud_token','cp_remembered_cloud_token','cp_session'].includes(event.key)&&!token())lock();});
 window.CepheProPrivacy={accept,ready,lock,isReady:()=>root.dataset.cpAuth==='ready'};
})();
