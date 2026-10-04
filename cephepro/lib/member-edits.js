const clone=value=>JSON.parse(JSON.stringify(value));
const invalid=message=>Object.assign(new Error(message),{status:400});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const scheduleKeys=['plannedStart','plannedDuration','plannedEnd','actualStart','actualEnd'];
function cleanSchedule(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Tarih planı geçersiz.');
 const out={};
 for(const key of scheduleKeys){
  if(!Object.hasOwn(value,key))continue;
  const item=value[key];
  if(key==='plannedDuration'){
   if(!Number.isFinite(Number(item))||Number(item)<0||Number(item)>36500)throw invalid('Plan süresi geçersiz.');
   out[key]=item;
  }else{
   if(typeof item!=='string'||item!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(item)||!Number.isFinite(Date.parse(item))))throw invalid('Plan tarihi geçersiz.');
   out[key]=item;
  }
 }
 return out;
}

// Rebase a member's explicit edit on the latest shared state; receipts prevent retries
// from applying the same delta twice. Only quantities and facade schedules can change.
export function applyMemberEdits(state,edits,userId){
 if(edits==null)return state;
 if(!Array.isArray(edits)||edits.length>500)throw invalid('Üye değişiklik listesi geçersiz.');
 const out=clone(state),done=Array.isArray(out.cp_member_edit_receipts)?out.cp_member_edit_receipts:[];
 const seen=new Set(done.map(x=>x.userId+'|'+x.id));
 for(const edit of edits){
  if(!edit||typeof edit.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(edit.id))throw invalid('Değişiklik kimliği geçersiz.');
  const receipt=String(userId)+'|'+edit.id;if(seen.has(receipt))continue;
  if(edit.type==='amount'){
   let row;
   for(const [b,facades] of Object.entries(out.cp_dynamic_data||{}))for(const [f,d] of Object.entries(facades||{}))
    for(const r of d.items||[])if(`${b}_${f}__${r[0]}`===edit.key)row=r;
   if(!row)throw invalid('Değiştirilen iş kalemi artık bulunamıyor.');
   if(!Number.isFinite(edit.from)||!Number.isFinite(edit.to)||edit.from<0||edit.to<0||edit.to>Number(row[1]))throw invalid('İmalat miktarı geçersiz.');
   const total=Number(row[1])||0,next=Math.max(0,Math.min(total,(Number(row[2])||0)+edit.to-edit.from));
   row[2]=next;row[3]=total?next/total*100:0;
  }else if(edit.type==='schedule'){
   if(!Object.hasOwn(out.cp_dynamic_data||{},edit.block)||!Object.hasOwn(out.cp_dynamic_data[edit.block]||{},edit.facade))throw invalid('Cephe bulunamadı.');
   const facade=out.cp_dynamic_data[edit.block][edit.facade],from=cleanSchedule(edit.from),to=cleanSchedule(edit.to),current=cleanSchedule(facade.schedule||{});
   if(!equal(current,from)&&!equal(current,to))throw Object.assign(new Error('Cephe tarih planı başka cihazda değişti. Yenileyip yeniden kaydedin.'),{status:409});
   facade.schedule=to;
  }else throw invalid('Üye değişiklik türü geçersiz.');
  seen.add(receipt);done.push({userId:String(userId),id:edit.id});
 }
 out.cp_member_edit_receipts=done.slice(-5000);
 return out;
}
