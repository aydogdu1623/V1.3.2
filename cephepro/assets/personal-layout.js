/* Personal layouts belong to the authenticated account, never shared project state. */
(function(root){
 'use strict';
 const user=()=>typeof currentUser==='undefined'?null:currentUser;
 const token=()=>localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token')||'';
 const identity=()=>user()?.id&&token()?String(user().id)+'|'+token():'';
 const key=()=>`cp_personal_snapshot_${user()?.id}`;
 let loaded='',revision=0,loading=null,edits=0,busy=false;
 const tell=message=>{if(typeof toast==='function')toast(message);};
 async function request(method,body,ctx){
  const response=await fetch(typeof root.v120ApiUrl==='function'?root.v120ApiUrl('/api/layout'):'/api/layout',{
   method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)
  });
  const result=await response.json();if(ctx!==identity())throw Error('LAYOUT_CONTEXT_CHANGED');
  if(!response.ok)throw Error(result.error||'Kişisel düzen yüklenemedi.');return result;
 }
 function capture(){
  return {snapshot:v34CapturePanelLayout(),width:Math.max(200,document.getElementById('workspace')?.clientWidth||root.innerWidth||1200),mode:store.get(`cp_named_panel_layout_${user().id}`,'balanced')};
 }
 function apply(layout){
  if(!layout)return;
  store.set(key(),layout.snapshot);store.set(`cp_named_panel_layout_${user().id}`,layout.mode);
  v39ApplyLayout(layout.mode);
  const snapshot=JSON.parse(JSON.stringify(layout.snapshot)),workspace=document.getElementById('workspace');
  const scale=Math.max(.5,Math.min(2,(workspace?.clientWidth||root.innerWidth||layout.width)/layout.width));
  let right=0,bottom=0;
  for(const panel of Object.values(snapshot)){
   for(const field of ['left','width'])if(/px$/.test(panel[field]||''))panel[field]=Number((parseFloat(panel[field])*scale).toFixed(2))+'px';
   if(panel.display!=='none'){right=Math.max(right,(parseFloat(panel.left)||0)+(parseFloat(panel.width)||0));bottom=Math.max(bottom,(parseFloat(panel.top)||0)+(parseFloat(panel.height)||0));}
  }
  v34ApplySnapshot(snapshot);
  if(workspace){workspace.style.minWidth=Math.ceil(right+12)+'px';workspace.style.minHeight=Math.ceil(bottom+12)+'px';}
 }
 async function load({force=false,applyLayout=true}={}){
  const ctx=identity();if(!ctx)return;
  if(loaded===ctx&&!force)return;
  if(loading?.ctx===ctx)return loading.promise;
  const version=edits;
  const promise=(async()=>{
   const data=await request('GET',undefined,ctx);revision=data.revision;loaded=ctx;
   if(version!==edits)return;
   if(data.layout){if(applyLayout)apply(data.layout);return true;}
   if(revision>0){store.remove(key());return false;}
   const legacy=store.get(key(),null);
   if(legacy){
    const layout={...capture(),snapshot:legacy};
    const result=await request('PUT',{layout,baseRevision:0},ctx);revision=result.revision;
    if(version===edits&&applyLayout)apply(layout);
    return true;
   }
   return false;
  })();
  loading={ctx,promise};try{return await promise;}finally{if(loading?.promise===promise)loading=null;}
 }
 async function save(remove=false){
  if(busy||!identity())return;busy=true;edits++;
  const ctx=identity(),layout=remove?null:capture();
  if(layout)store.set(key(),layout.snapshot);
  try{
   await load({applyLayout:false});
   if(ctx!==identity())return;
   const result=await request('PUT',{layout,baseRevision:revision},ctx);revision=result.revision;
   if(remove)store.remove(key());
   tell(remove?'Kişisel düzen buluttan silindi.':'Kişisel düzenin buluta kaydedildi. Diğer cihazlarda da kullanılacak.');
  }catch(error){if(ctx===identity())tell(error.message==='LAYOUT_CONTEXT_CHANGED'?'Kullanıcı değişti.':error.message);}
  finally{busy=false;}
 }
 document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#v34SavePersonalLayout,#v39SavePersonalLayout,#v34LoadPersonalLayout,#v39LoadPersonalLayout,#restoreUserLayoutBtn,#resetUserLayoutBtn');
  if(!button)return;event.preventDefault();event.stopImmediatePropagation();
  if(!identity())return tell('Kişisel düzeni eşitlemek için giriş yapın.');
  if(button.id.includes('Save'))void save();
  else if(button.id==='resetUserLayoutBtn')void save(true);
  else void load({force:true}).then(applied=>tell(applied?'Kişisel düzenin uygulandı':'Henüz kayıtlı kişisel düzen yok')).catch(error=>tell(error.message));
 },true);
 const restore=()=>{void load().catch(error=>{if(error.message!=='LAYOUT_CONTEXT_CHANGED')tell(error.message);});};
 document.addEventListener('cephepro:user-ready',restore);
 document.addEventListener('cephepro:locked',()=>{loaded='';revision=0;edits++;});
 root.CepheProPersonalLayout={load,save};restore();
})(window);
