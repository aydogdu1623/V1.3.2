import {canDeleteUpload} from './upload-permissions.js';
// Immutable IDs and deletion markers prevent stale uploads from reviving deleted records.
export function mergeDeficiencies(latest,submitted,me,dynamic){
 const out=Array.isArray(latest)?structuredClone(latest):[];
 if(submitted===undefined)return out;
 const invalid=()=>{const error=Error('Eksik kaydının iş kalemi, tarihi veya açıklaması geçersiz.');error.status=400;throw error;};
 if(!Array.isArray(submitted)||submitted.length>10000)invalid();
 const known=new Set(out.map(r=>r.id));let added=0;
 for(const entry of submitted){
  if(!entry||typeof entry!=='object')invalid();
  if(known.has(entry.id))continue;
  if(String(entry.userId)!==String(me.id))continue;
  const {id,block,facade,item,date}=entry,description=String(entry.description||'').trim();
  const raw=Object.hasOwn(dynamic||{},block)&&Object.hasOwn(dynamic[block]||{},facade)?dynamic[block][facade]?.items?.find(r=>r[0]===item):null;
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(id)||!raw||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!description||description.length>2000||++added>500)invalid();
  const listId=entry.listId===undefined?id:entry.listId;
  if(typeof listId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(listId))invalid();
  out.push({id,listId,block,facade,item,date,pozNo:String(raw[10]||''),description,userId:String(me.id),user:me.name||me.username||'',savedAt:new Date().toISOString()});known.add(id);
 }
 if(out.length>10000)invalid();
 return out;
}

export function deleteDeficiencies(latest,ids,actor,owners){
 const fail=(status,message)=>{const error=Error(message);error.status=status;throw error;};
 if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(id)))fail(400,'Silinecek eksik kayıtlarını seçin.');
 const selected=new Set(ids),rows=Array.isArray(latest)?latest:[],byId=new Map(rows.map(r=>[r.id,r]));
 for(const id of selected){const row=byId.get(id);if(!row)fail(404,'Eksik kaydı bulunamadı. Listeyi yenileyin.');
  const owner=owners.find(u=>String(u.id)===String(row.userId))||{id:row.userId};
  if(!canDeleteUpload(actor,owner))fail(403,'Bu eksik kaydını silme yetkiniz yok.');
 }
 let deleted=0;const stamp=new Date().toISOString();
 const records=rows.map(r=>{if(!selected.has(r.id)||r.deletedAt)return r;deleted++;return {id:r.id,userId:r.userId,deletedAt:stamp,deletedBy:String(actor.id)};});
 return {records,deleted};
}
