(()=>{
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)),norm=v=>String(v||'').trim().toLocaleLowerCase('tr-TR');
const user=()=>typeof currentUser==='undefined'?null:currentUser;
function owned(record){const me=user();if(!me||!record)return false;if(record.userId!=null)return String(record.userId)===String(me.id);return [me.username,me.email].map(norm).filter(Boolean).includes(norm(record.user||record.username));}
const canDelete=record=>user()?.role==='admin'||owned(record);
const editKey=()=>`cp_member_edits_${user()?.id||'guest'}`;
const pendingEdits=()=>user()?.role==='member'?store.get(editKey(),[]):[];
function queue(edit){const current=pendingEdits(),prior=current.find(e=>e.type===edit.type&&e.key===edit.key);const next={...edit,from:prior?(edit.type==='amount'?prior.from+Number(edit.dailyAtEdit||0)-Number(prior.dailyAtEdit||0):prior.from):edit.from,id:crypto.randomUUID()};store.set(editKey(),[...current.filter(e=>e!==prior),next]);}
function ackEdits(sent){const ids=new Set(sent.map(e=>e.id));store.set(editKey(),pendingEdits().filter(e=>!ids.has(e.id)));}
function saveCumulative(){
 const draft=v53WorkDraft;if(!draft||!DATA[draft.b]?.[draft.f])return;
 const d=DATA[draft.b][draft.f];
 for(const row of d.items||[]){const x=draft.items.find(x=>x.oldName===row[0]);if(!x||Math.abs(Number(x.done)-Number(x.originalDone))<1e-7)continue;
  const key=v34ItemKey(draft.b,draft.f,row[0]),to=Math.max(0,Math.min(Number(x.total)||0,Number(x.done)||0));
  const dailyAtEdit=(dailyEntries[key]||[]).filter(owned).reduce((sum,e)=>sum+(Number(e.value)||0),0);
  queue({type:'amount',key,from:Number(x.originalDone)||0,to,dailyAtEdit});row[2]=to;row[3]=Number(x.total)>0?to/Number(x.total)*100:0;
  for(const entry of dailyEntries[key]||[])entry.includedInBase=true;
 }
 store.set('cp_daily_entries',dailyEntries);saveStructureState();v53WorkDraft=v53NewDraft(draft.b,draft.f);v32RenderWorkItems();renderFacade();rebuildTree();v53Saved();
}
function queueSchedule(block,facade,from,to){queue({type:'schedule',key:JSON.stringify([block,facade]),block,facade,from:clone(from),to:clone(to)});}
let layoutOwner='',restoring=false;
function restoreLayout(force=false){
 const me=user();if(!me)return;const id=String(me.id);if(!force&&layoutOwner===id)return;layoutOwner=id;restoring=true;
 requestAnimationFrame(()=>{
  if(String(user()?.id)!==id)return;
  const named=`cp_named_panel_layout_${id}`,personal=`cp_personal_snapshot_${id}`;
  for(const [fresh,prefix] of [[named,'cp_named_panel_layout_'],[personal,'cp_personal_snapshot_']]){
   if(store.get(fresh,null)==null){const legacy=store.get(prefix+(me.email||me.username),null);if(legacy!=null)store.set(fresh,legacy);}
  }
  const mode=store.get(named,'balanced'),snapshot=store.get(personal,null);
  v39ApplyLayout(['balanced','wide','focused'].includes(mode)?mode:'balanced');
  if(snapshot)v34ApplySnapshot(snapshot);else restoreUserPanelLayout();
  restoring=false;
 });
}
window.__member190={owned,canDelete,pendingEdits,ackEdits,queueSchedule,saveCumulative,restoreLayout,get layoutRestoring(){return restoring}};
document.addEventListener('cephepro:user-ready',()=>restoreLayout());
restoreLayout();
})();
