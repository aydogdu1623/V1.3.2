// Keep CAD/WebGL code off the critical path. Load only when Harita opens.
(()=>{
 let opening=false;
 const open=async()=>{
  if(opening||!window.CepheProProjects?.isReady())return;opening=true;
  try{const {openSiteMap}=await import('./app.js?v=251.0');await openSiteMap();}
  catch(e){console.error(e);window.toast?.('Harita açılamadı. Sayfayı yenileyin.');}finally{opening=false;}
 };
 function button(id){const b=document.createElement('button');b.id=id;b.type='button';b.className='btn cp-map-launch';b.title='Saha haritası';b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/></svg><span>Harita</span>';b.onclick=open;return b;}
 function mount(){
  const info=document.getElementById('v34ProjectInfoBtn');
  if(info&&!document.getElementById('cpMapByInfo')){const row=document.createElement('div');row.className='cp-map-info-row';info.before(row);row.append(button('cpMapByInfo'),info);}
  const target=document.getElementById('cpActiveProject')||document.getElementById('puantajBtn')||document.getElementById('settingsBtn');
  if(target&&!document.getElementById('cpMapHeader'))target.before(button('cpMapHeader'));
 }
 document.addEventListener('cephepro:user-ready',mount);
 document.addEventListener('click',e=>{if(e.target.closest('#structureNavBtn,#manageStructureBtn'))setTimeout(mount,0);});
 const observer=new MutationObserver(()=>{if(!document?.body){observer.disconnect();return;}if(!document.getElementById('cpMapHeader')||document.getElementById('v34ProjectInfoBtn')&&!document.getElementById('cpMapByInfo'))mount();});
 observer.observe(document.body,{childList:true,subtree:true});mount();
 window.CepheProMap={open};
})();
