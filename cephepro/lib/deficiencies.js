// Append-only shared records: stale uploads cannot erase another user's entry.
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
