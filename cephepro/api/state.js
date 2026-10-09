import {requireProject} from '../lib/project-access.js';
import { getSql,noStore,bearer } from '../lib/db.js';
import { ensureSchema } from '../lib/schema.js';
import { sessionUser,logActivity,norm } from '../lib/authutil.js';
import { applyMemberEdits } from '../lib/member-edits.js';

const clone=v=>JSON.parse(JSON.stringify(v??{}));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const num=v=>Number(v)||0;
function owned(e,me){
  if(!e||typeof e!=='object')return false;
  if(e.userId!=null)return String(e.userId)===String(me.id);
  const who=norm(e.user||e.username||e.userName||'');
  return !!who&&[norm(me.username),norm(me.email),norm(me.name)].includes(who);
}
function tagOwned(e,me){
  const x=clone(e);x.userId=String(me.id);if(!x.user)x.user=me.username;return x;
}
function sumOwned(arr,me){return (Array.isArray(arr)?arr:[]).filter(e=>owned(e,me)).reduce((s,e)=>s+num(e.value),0)}
function mergeOwnMap(latestMap,submittedMap,me){
  const out={};
  const keys=new Set([...Object.keys(latestMap||{}),...Object.keys(submittedMap||{})]);
  for(const k of keys){
    const latest=Array.isArray(latestMap?.[k])?latestMap[k]:[];
    const submitted=Array.isArray(submittedMap?.[k])?submittedMap[k]:[];
    const other=latest.filter(e=>!owned(e,me));
    const mine=submitted.filter(e=>owned(e,me)).map(e=>tagOwned(e,me));
    out[k]=[...other,...mine];
  }
  return out;
}
function mergeOwnArray(latest,submitted,me){
  const other=(Array.isArray(latest)?latest:[]).filter(e=>!owned(e,me));
  const mine=(Array.isArray(submitted)?submitted:[]).filter(e=>owned(e,me)).map(e=>tagOwned(e,me));
  return [...other,...mine];
}
function noteFingerprint(n){return JSON.stringify([n?.date||'',n?.reason||'',n?.savedAt||'',n?.user||'',n?.userId||''])}
function mergeNoWork(latestMap,submittedMap,me){
  const out=clone(latestMap||{});
  for(const k of Object.keys(submittedMap||{})){
    const old=Array.isArray(out[k])?out[k]:[];
    const known=new Set(old.map(noteFingerprint));
    const incoming=Array.isArray(submittedMap[k])?submittedMap[k]:[];
    const additions=[];
    for(const n of incoming){
      if(known.has(noteFingerprint(n)))continue;
      if(!owned(n,me))continue;
      const x=tagOwned(n,me);additions.push(x);known.add(noteFingerprint(x));
    }
    if(additions.length)out[k]=[...additions,...old].slice(0,500);
  }
  return out;
}
function itemMap(dynamic){
  const map=new Map();
  for(const [b,facades] of Object.entries(dynamic||{}))for(const [f,d] of Object.entries(facades||{})){
    const items=Array.isArray(d?.items)?d.items:[];
    items.forEach((raw,i)=>{
      const name=String(raw?.[0]||'');
      map.set(`${b}_${f}__${name}`,{b,f,d,raw,i,name,unit:String(raw?.[8]||'m²')});
    });
  }
  return map;
}
function applyDailyDeltasToDynamic(latestDynamic,latestDaily,mergedDaily,me,submittedDynamic=null){
  const out=clone(submittedDynamic||latestDynamic||{}),map=itemMap(out),latestItems=itemMap(latestDynamic||{});
  for(const [key,meta] of map){
    const before=sumOwned(latestDaily?.[key],me),after=sumOwned(mergedDaily?.[key],me),delta=after-before;
    const pending=(Array.isArray(latestDaily?.[key])?latestDaily[key]:[]).reduce((sum,e)=>sum+(e?.includedInBase?0:num(e?.value)),0);
    if(Math.abs(delta)<1e-9 && Math.abs(pending)<1e-9)continue;
    const raw=meta.raw,previous=latestItems.get(key)?.raw,total=Math.max(0,num(raw[1]));
    // New rows already contain the local daily increment. Existing rows use
    // the latest server cumulative so another user's work is preserved.
    if(!previous)continue;
    const done=Math.max(0,Math.min(total,num(previous[2])+pending+delta));
    raw[2]=done;raw[3]=total>0?Math.max(0,Math.min(100,done/total*100)):0;
    for(const entry of mergedDaily[key]||[])if(entry&&typeof entry==='object')entry.includedInBase=true;
  }
  return out;
}
function dailySummaries(oldDaily,newDaily,dynamic,meOnly=null){
  const out=[],keys=new Set([...Object.keys(oldDaily||{}),...Object.keys(newDaily||{})]),map=itemMap(dynamic||{});
  for(const k of keys){
    const a=Array.isArray(oldDaily?.[k])?oldDaily[k]:[],b=Array.isArray(newDaily?.[k])?newDaily[k]:[];
    const oldVal=meOnly?sumOwned(a,meOnly):a.reduce((s,e)=>s+num(e?.value),0);
    const newVal=meOnly?sumOwned(b,meOnly):b.reduce((s,e)=>s+num(e?.value),0);
    const delta=newVal-oldVal;if(Math.abs(delta)<1e-9)continue;
    const m=map.get(k),label=m?`${m.b} / ${m.f} / ${m.name}`:k,unit=m?.unit||'m²';
    out.push({summary:`${label} ${delta>0?'+':''}${Number(delta.toFixed(2))} ${unit} ${delta>=0?'eklendi':'azaltıldı'}`,details:{key:k,delta,unit,block:m?.b,facade:m?.f,item:m?.name}});
  }
  return out;
}
function adminExtraSummaries(oldState,newState){
  const out=[];
  const om=itemMap(oldState?.cp_dynamic_data||{}),nm=itemMap(newState?.cp_dynamic_data||{});
  for(const [k,n] of nm){
    const o=om.get(k);if(!o){out.push({summary:`${n.b} / ${n.f} cephesine ${n.name} iş kalemi eklendi.`,details:{key:k}});continue}
    const changes=[];
    if(num(o.raw[1])!==num(n.raw[1]))changes.push(`Toplam Metraj ${num(o.raw[1])} → ${num(n.raw[1])} ${n.unit}`);
    if(num(o.raw[7])!==num(n.raw[7]))changes.push(`Pursantaj %${num(o.raw[7])} → %${num(n.raw[7])}`);
    if(String(o.raw[0])!==String(n.raw[0]))changes.push(`İş kalemi adı değişti`);
    if(changes.length)out.push({summary:`${n.b} / ${n.f} / ${n.name}: ${changes.join(' · ')}`,details:{key:k}});
  }
  for(const [k,o] of om)if(!nm.has(k))out.push({summary:`${o.b} / ${o.f} / ${o.name} iş kalemi silindi.`,details:{key:k}});
  const oldBlocks=Object.keys(oldState?.cp_dynamic_data||{}),newBlocks=Object.keys(newState?.cp_dynamic_data||{});
  newBlocks.filter(b=>!oldBlocks.includes(b)).forEach(b=>out.push({summary:`${b} bloğu eklendi.`,details:{block:b}}));
  oldBlocks.filter(b=>!newBlocks.includes(b)).forEach(b=>out.push({summary:`${b} bloğu silindi.`,details:{block:b}}));
  if(!eq(oldState?.cp_project_info,newState?.cp_project_info))out.push({summary:'Proje / firma bilgilerini güncelledi.',details:{}});
  return out;
}

function ownDailyChanged(oldMap,newMap,me){
  const pick=map=>{
    const out={};
    for(const [key,entries] of Object.entries(map||{})){
      const mine=(Array.isArray(entries)?entries:[]).filter(entry=>owned(entry,me));
      if(mine.length)out[key]=mine;
    }
    return out;
  };
  return !eq(pick(oldMap),pick(newMap));
}

function memberVisibleState(state,adminRows){
  const view=clone(state||{}),adminIds=new Set(),adminNames=new Set();
  for(const admin of adminRows||[]){
    if(admin?.id!=null)adminIds.add(String(admin.id));
    [admin?.username,admin?.email,admin?.name].map(norm).filter(Boolean).forEach(value=>adminNames.add(value));
  }
  const visible=entry=>{
    if(!entry||typeof entry!=='object')return true;
    if(entry.userId!=null&&adminIds.has(String(entry.userId)))return false;
    const who=norm(entry.user||entry.username||entry.userName||'');
    return !who||!adminNames.has(who);
  };
  const daily={};
  for(const [key,entries] of Object.entries(view.cp_daily_entries||{}))daily[key]=(Array.isArray(entries)?entries:[]).filter(visible);
  view.cp_daily_entries=daily;
  view.cp_attendance_logs=(Array.isArray(view.cp_attendance_logs)?view.cp_attendance_logs:[]).filter(visible);
  return view;
}

export function publicProjectState(state={}){
 const allowed=['cp_dynamic_data','cp_block_order','cp_facade_overrides','cp_daily_entries','cp_attendance_logs','cp_project_info','cp_no_work_notes'];
 return clone(Object.fromEntries(allowed.filter(k=>Object.hasOwn(state,k)).map(k=>[k,state[k]])));
}

export function createStateHandler({getSql,noStore,bearer,ensureSchema,sessionUser,logActivity}){return async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const sql=getSql();await ensureSchema(sql);
    const me=await sessionUser(sql,bearer(req));if(!me)return res.status(401).json({error:'Oturum geçersiz.'});
    if(!await requireProject(sql,req,me,res))return;
    if(req.method==='GET'){
      const rows=await sql`SELECT state,revision,updated_at,updated_by FROM cephepro_project_state WHERE project_key=${me.projectId} LIMIT 1`;
      const r=rows[0]||{state:{},revision:0};
      let visibleState=publicProjectState(r.state);
      if(me.role!=='admin'){
        const adminRows=await sql`SELECT id,name,username,email FROM cephepro_users WHERE role='admin'`;
        visibleState=memberVisibleState(visibleState,adminRows);
      }
      return res.status(200).json({state:visibleState,revision:Number(r.revision||0),updatedAt:r.updated_at||null,updatedBy:r.updated_by||null});
    }
    if(req.method!=='PUT')return res.status(405).json({error:'Method not allowed'});
    const input=req.body?.state;
    const allowed=['cp_dynamic_data','cp_block_order','cp_facade_overrides','cp_daily_entries','cp_attendance_logs','cp_project_info','cp_no_work_notes'];
    const submitted=input&&typeof input==='object'&&!Array.isArray(input)?Object.fromEntries(allowed.filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]])):null;
    if(!submitted||typeof submitted!=='object'||Array.isArray(submitted))return res.status(400).json({error:'Geçersiz proje durumu.'});
    const curRows=await sql`SELECT state,revision FROM cephepro_project_state WHERE project_key=${me.projectId} LIMIT 1`;
    const oldState=clone(curRows[0]?.state||{}),oldRevision=Number(curRows[0]?.revision||0);
    let nextState,corrected=false,logs=[];
    if(me.role==='admin'){
      const dailyChanged=ownDailyChanged(oldState.cp_daily_entries,submitted.cp_daily_entries,me);
      nextState={...oldState,...clone(submitted)};
      nextState.cp_daily_entries=mergeOwnMap(oldState.cp_daily_entries||{},submitted.cp_daily_entries||{},me);
      if(dailyChanged){
        corrected=true;
        nextState.cp_daily_entries=mergeOwnMap(oldState.cp_daily_entries||{},submitted.cp_daily_entries||{},me);
        // Admin günlük imalatı gönderirken başka cihazların son kümülatifini
        // ezmez; yalnız bu Adminin yeni imalat farkı güncel bulut değerine eklenir.
        nextState.cp_dynamic_data=applyDailyDeltasToDynamic(oldState.cp_dynamic_data||{},oldState.cp_daily_entries||{},nextState.cp_daily_entries||{},me,submitted.cp_dynamic_data);
      }
      logs=[...dailySummaries(oldState.cp_daily_entries,nextState.cp_daily_entries,nextState.cp_dynamic_data,null),...adminExtraSummaries(oldState,nextState)];
    }else{
      corrected=true;nextState=clone(oldState);
      nextState.cp_daily_entries=mergeOwnMap(oldState.cp_daily_entries||{},submitted.cp_daily_entries||{},me);
      nextState.cp_attendance_logs=mergeOwnArray(oldState.cp_attendance_logs||[],submitted.cp_attendance_logs||[],me);
      nextState.cp_no_work_notes=mergeNoWork(oldState.cp_no_work_notes||{},submitted.cp_no_work_notes||{},me);
      nextState.cp_dynamic_data=applyDailyDeltasToDynamic(oldState.cp_dynamic_data||{},oldState.cp_daily_entries||{},nextState.cp_daily_entries||{},me);
      nextState=applyMemberEdits(nextState,req.body?.memberEdits,String(me.id));
      logs=dailySummaries(oldState.cp_daily_entries,nextState.cp_daily_entries,nextState.cp_dynamic_data,me);
      const oldNotes=Object.values(oldState.cp_no_work_notes||{}).flat().length,newNotes=Object.values(nextState.cp_no_work_notes||{}).flat().length;
      if(newNotes>oldNotes)logs.push({summary:`${newNotes-oldNotes} adet “Çalışma Olmadı” kaydı ekledi.`,details:{count:newNotes-oldNotes}});
    }
    const serialized=JSON.stringify(nextState);
    if(Buffer.byteLength(serialized,'utf8')>6_000_000)return res.status(413).json({error:'Proje verisi çok büyük. Fotoğraflar ayrı bulut alanında tutulur.'});
    const rows=await sql`UPDATE cephepro_project_state SET state=${serialized}::jsonb,revision=revision+1,updated_at=now(),updated_by=${String(me.id)} WHERE project_key=${me.projectId} AND revision=${oldRevision} RETURNING revision,updated_at`;
    if(!rows.length){
      req.cepheproRetry=(req.cepheproRetry||0)+1;
      if(req.cepheproRetry<4)return handler(req,res);
      return res.status(409).json({error:'Eşzamanlı kayıt var. Günlük imalatı yeniden buluta kaydedin.',code:'REVISION_CONFLICT'});
    }
    let responseState=corrected?nextState:undefined;
    if(responseState&&me.role!=='admin'){
      const admins=await sql`SELECT id,name,username,email FROM cephepro_users WHERE role='admin'`;
      responseState=memberVisibleState(responseState,admins);
    }
    if(responseState){responseState=clone(responseState);delete responseState.cp_member_edit_receipts;}
    for(const l of logs.slice(0,40))await logActivity(sql,me,'project_change',l.summary,l.details);
    return res.status(200).json({ok:true,revision:Number(rows[0]?.revision||oldRevision+1),updatedAt:rows[0]?.updated_at||null,corrected,state:responseState});
  }catch(err){if(err.status===400||err.status===409)return res.status(err.status).json({error:err.message});console.error(err);return res.status(500).json({error:'Sunucu hatası.'});}
}

}
export default createStateHandler({getSql,noStore,bearer,ensureSchema,sessionUser,logActivity});
