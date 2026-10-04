import {getSql,noStore,bearer} from '../lib/db.js';
import {ensureSchema} from '../lib/schema.js';
import {sessionUser} from '../lib/authutil.js';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const conflict=res=>res.status(409).json({error:'Hakediş başka cihazda güncellendi. Yenile ile son kaydı alın.',code:'REVISION_CONFLICT'});

export default async function handler(req,res){
 if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  const sql=getSql();await ensureSchema(sql);const me=await sessionUser(sql,bearer(req));
  if(!me)return res.status(401).json({error:'Oturum gerekli.'});
  if(me.role!=='admin')return res.status(403).json({error:'Hakediş yalnız yöneticiler tarafından kullanılabilir.'});
  const ownId=String(me.id);
  if(req.method==='GET'&&String(req.query?.list||'')==='1'){
   const rows=await sql`SELECT c.owner_id,c.revision,c.published_at,u.name,u.username
    FROM cephepro_claims c LEFT JOIN cephepro_users u ON u.id=c.owner_id
    WHERE c.owner_id=${ownId} OR c.is_shared=true ORDER BY c.published_at DESC NULLS LAST,c.owner_id`;
   return res.status(200).json({records:rows.map(r=>({ownerId:r.owner_id,ownerName:r.name||r.username||'Arşiv sahibi',revision:Number(r.revision),publishedAt:r.published_at}))});
  }
  if(req.method==='GET'){
   const ownerId=String(req.query?.owner||ownId);
   const rows=await sql`SELECT data,revision,is_shared,published_at FROM cephepro_claims WHERE owner_id=${ownerId} AND (owner_id=${ownId} OR is_shared=true)`;
   if(!rows.length&&ownerId!==ownId)return res.status(404).json({error:'Paylaşılan hakediş bulunamadı.'});
   const row=rows[0];
   return res.status(200).json({data:row?.data||{},revision:Number(row?.revision||0),ownerId,readOnly:ownerId!==ownId,isShared:!!row?.is_shared,publishedAt:row?.published_at||null});
  }
  if(!['PUT','DELETE'].includes(req.method))return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  const body=req.body||{},ownerId=String(body.ownerId||ownId),revision=body.revision;
  if(ownerId!==ownId)return res.status(403).json({error:'Başka yöneticinin hakediş kaydı değiştirilemez.'});
  if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'Hakediş revizyonu geçersiz.'});
  if(req.method==='PUT'){
   if(!object(body.data))return res.status(400).json({error:'Hakediş verisi geçersiz.'});
   const json=JSON.stringify(body.data);
   if(Buffer.byteLength(json)>3000000)return res.status(413).json({error:'Hakediş ve ekleri en fazla 3 MB olabilir.'});
   // Keep the full report snapshot and attachments. Older clients cannot unshare it.
   const share=body.share===true;
   const rows=revision===0
    ?await sql`INSERT INTO cephepro_claims(owner_id,data,revision,is_shared,published_at)
      VALUES(${ownId},${json}::jsonb,1,${share},CASE WHEN ${share} THEN now() ELSE NULL END)
      ON CONFLICT(owner_id) DO UPDATE SET data=excluded.data,revision=1,
       is_shared=cephepro_claims.is_shared OR excluded.is_shared,
       published_at=CASE WHEN cephepro_claims.is_shared OR excluded.is_shared THEN now() ELSE NULL END
      WHERE cephepro_claims.revision=0 RETURNING revision`
    :await sql`UPDATE cephepro_claims SET data=${json}::jsonb,revision=revision+1,
      is_shared=is_shared OR ${share},published_at=CASE WHEN is_shared OR ${share} THEN now() ELSE NULL END
      WHERE owner_id=${ownId} AND revision=${revision} RETURNING revision`;
   if(!rows.length)return conflict(res);
   return res.status(200).json({ok:true,revision:Number(rows[0].revision),ownerId:ownId});
  }
  const {kind,periodId}=body;
  if(!['firma','taseron'].includes(kind)||typeof periodId!=='string'||!periodId||periodId.length>200)return res.status(400).json({error:'Hakediş dönemi geçersiz.'});
  const current=await sql`SELECT data,revision FROM cephepro_claims WHERE owner_id=${ownId}`;
  if(!current.length||Number(current[0].revision)!==revision)return conflict(res);
  const data=current[0].data,model=data?.[kind];
  if(!Array.isArray(model?.periods190)||!model.periods190.some(p=>p.id===periodId))return res.status(404).json({error:'Hakediş dönemi bulunamadı.'});
  if(model.activePeriod190===periodId)return res.status(409).json({error:'Önce başka bir hakedişi seçip kaydedin; açık dönem silinemez.'});
  model.periods190=model.periods190.filter(p=>p.id!==periodId);delete model.periods186;
  const rows=await sql`UPDATE cephepro_claims SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,
   published_at=CASE WHEN is_shared THEN now() ELSE published_at END
   WHERE owner_id=${ownId} AND revision=${revision} RETURNING revision`;
  if(!rows.length)return conflict(res);
  return res.status(200).json({ok:true,revision:Number(rows[0].revision),ownerId:ownId});
 }catch(e){console.error('[claims]',e.code||e.name);return res.status(500).json({error:'Hakediş işlemi tamamlanamadı.'});}
}
