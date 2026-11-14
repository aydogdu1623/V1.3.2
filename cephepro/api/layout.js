import {getSql,noStore,bearer} from '../lib/db.js';
import {ensureSchema} from '../lib/schema.js';
import {sessionUser} from '../lib/authutil.js';

export function cleanLayout(value){
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID');
 const snapshot={};
 for(const id of ['overview','chartPanel','facadePanel','timelinePanel']){
  const panel=value.snapshot?.[id];if(!panel||typeof panel!=='object')throw Error('INVALID');
  const out={};
  for(const [key,v] of Object.entries(panel)){
   if(!['display','position','left','top','width','height','zIndex'].includes(key))throw Error('INVALID');
   if(typeof v!=='string')throw Error('INVALID');
   const valid=key==='display'?['','none','block','flex','grid'].includes(v):key==='position'?['','absolute','relative'].includes(v):key==='zIndex'?/^(?:|\d{1,3})$/.test(v):/^(?:|\d{1,5}(?:\.\d{1,6})?px|\d{1,3}(?:\.\d{1,6})?%)$/.test(v);
   if(!valid)throw Error('INVALID');out[key]=v;
  }
  snapshot[id]=out;
 }
 const width=Number(value.width);
 if(!Number.isFinite(width)||width<200||width>20000)throw Error('INVALID');
 return {snapshot,width,mode:['balanced','wide','focused'].includes(value.mode)?value.mode:'balanced'};
}
export function createLayoutHandler({getSql,noStore,bearer,ensureSchema,sessionUser}){return async(req,res)=>{
 if(!noStore(req,res))return res.status(403).json({error:'İstek reddedildi.'});
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  const sql=getSql();await ensureSchema(sql);const me=await sessionUser(sql,bearer(req));
  if(!me)return res.status(401).json({error:'Yeniden giriş yapın.'});
  if(req.method==='GET'){
   const rows=await sql`SELECT layout,revision FROM cephepro_user_layouts WHERE user_id=${String(me.id)}`;
   return res.status(200).json({layout:rows[0]?.layout??null,revision:Number(rows[0]?.revision||0)});
  }
  if(req.method!=='PUT')return res.status(405).json({error:'Desteklenmeyen istek.'});
  let layout;try{layout=cleanLayout(req.body?.layout);}catch{return res.status(400).json({error:'Panel düzeni geçersiz.'});}
  const revision=Number(req.body?.baseRevision);
  if(!Number.isInteger(revision)||revision<0)return res.status(400).json({error:'Düzen sürümü geçersiz.'});
  const rows=await sql`INSERT INTO cephepro_user_layouts(user_id,layout,revision) SELECT ${String(me.id)},${JSON.stringify(layout)}::jsonb,1 WHERE ${revision}=0
   ON CONFLICT(user_id) DO UPDATE SET layout=EXCLUDED.layout,revision=cephepro_user_layouts.revision+1,updated_at=now()
   WHERE cephepro_user_layouts.revision=${revision} RETURNING revision`;
  // Existing rows with a nonzero revision use a separate optimistic update.
  const updated=rows.length?rows:revision>0?await sql`UPDATE cephepro_user_layouts SET layout=${JSON.stringify(layout)}::jsonb,revision=revision+1,updated_at=now() WHERE user_id=${String(me.id)} AND revision=${revision} RETURNING revision`:[];
  if(!updated.length)return res.status(409).json({error:'Düzen başka cihazda değişti. Kişisel Düzenim ile yükleyip yeniden kaydedin.'});
  return res.status(200).json({ok:true,revision:Number(updated[0].revision)});
 }catch(error){console.error('[layout]',error);return res.status(500).json({error:'Kişisel düzen buluta kaydedilemedi.'});}
};}
export default createLayoutHandler({getSql,noStore,bearer,ensureSchema,sessionUser});
