import {randomUUID} from 'node:crypto';

// A new facade carries a one-shot, admin-only transfer request. Merge daily
// records from the authoritative state so other authors' entries survive too.
export function applyFacadeTransfers(previous,next,actor){
 if(actor.role!=='admin')return false;
 let changed=false;
 for(const [block,facades] of Object.entries(next.cp_dynamic_data||{}))for(const [target,facade] of Object.entries(facades||{})){
  const transfer=facade?.facadeTransfer;
  if(!transfer||previous.cp_dynamic_data?.[block]?.[target])continue;
  const source=String(transfer.from||''),move=transfer.mode==='rename';
  if(!['copy','rename'].includes(transfer.mode)||!previous.cp_dynamic_data?.[block]?.[source]||(move&&facades[source]))continue;
  const before=block+'_'+source,after=block+'_'+target;
  next.cp_daily_entries||={};
  for(const [key,entries] of Object.entries(previous.cp_daily_entries||{}))if(key.startsWith(before+'__')){
   next.cp_daily_entries[after+key.slice(before.length)]=(entries||[]).map(entry=>({...structuredClone(entry),...(move?{}:{id:randomUUID()}),...(entry.block!==undefined?{block}:{}),...(entry.facade!==undefined?{facade:target}:{})}));
   if(move)delete next.cp_daily_entries[key];
  }
  if(move)for(const record of next.cp_deficiencies||[])if(record.block===block&&record.facade===source)record.facade=target;
  delete facade.facadeTransfer;changed=true;
 }
 return changed;
}
