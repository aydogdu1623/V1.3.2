import { getSql,noStore,bearer } from '../lib/db.js';
import { ensureSchema } from '../lib/schema.js';
import { sessionUser,logActivity } from '../lib/authutil.js';

export default async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const sql=getSql();await ensureSchema(sql);
    const me=await sessionUser(sql,bearer(req));if(!me)return res.status(401).json({error:'Oturum geçersiz.'});
    if(req.method==='GET'){
      const rows=await sql`SELECT photo_id,facade_key,owner_user_id,owner_username,photo,created_at,updated_at FROM cephepro_photos ORDER BY created_at DESC`;
      return res.status(200).json({photos:rows.map(r=>({facadeKey:r.facade_key,photoId:r.photo_id,ownerUserId:r.owner_user_id,ownerUsername:r.owner_username,photo:r.photo,createdAt:r.created_at,updatedAt:r.updated_at}))});
    }
    if(req.method==='POST'){
      const body=req.body||{},action=String(body.action||'');
      const id=String(body.photoId||body.photo?.id||'').trim(),facadeKey=String(body.facadeKey||'').trim();
      if(action==='upsert'){
        if(!id||!facadeKey||!body.photo)return res.status(400).json({error:'Fotoğraf bilgisi eksik.'});
        const serialized=JSON.stringify(body.photo);
        if(Buffer.byteLength(serialized,'utf8')>3_000_000)return res.status(413).json({error:'Fotoğraf çok büyük.'});
        const old=await sql`SELECT owner_user_id FROM cephepro_photos WHERE photo_id=${id} LIMIT 1`;
        if(old[0]&&me.role!=='admin'&&String(old[0].owner_user_id)!==String(me.id))return res.status(403).json({error:'Yalnız kendi fotoğrafınızı değiştirebilirsiniz.'});
        await sql`INSERT INTO cephepro_photos(photo_id,facade_key,owner_user_id,owner_username,photo,created_at,updated_at)
          VALUES(${id},${facadeKey},${String(old[0]?.owner_user_id||me.id)},${String(body.photo.user||me.username)},${serialized}::jsonb,now(),now())
          ON CONFLICT(photo_id) DO UPDATE SET facade_key=excluded.facade_key,photo=excluded.photo,updated_at=now()`;
        await logActivity(sql,me,'photo',`${facadeKey} cephesine fotoğraf ${old[0]?'güncelledi':'ekledi'}.`,{facadeKey,photoId:id});
        return res.status(200).json({ok:true,ownerUserId:String(old[0]?.owner_user_id||me.id)});
      }
      if(action==='delete'){
        const old=await sql`SELECT owner_user_id,facade_key FROM cephepro_photos WHERE photo_id=${id} LIMIT 1`;
        if(!old[0])return res.status(200).json({ok:true});
        if(me.role!=='admin'&&String(old[0].owner_user_id)!==String(me.id))return res.status(403).json({error:'Yalnız kendi fotoğrafınızı silebilirsiniz.'});
        await sql`DELETE FROM cephepro_photos WHERE photo_id=${id}`;
        await logActivity(sql,me,'photo',`${old[0].facade_key} cephesindeki fotoğrafını sildi.`,{facadeKey:old[0].facade_key,photoId:id});
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:'Bilinmeyen fotoğraf işlemi.'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(err){console.error(err);return res.status(500).json({error:'Fotoğraf bulut işlemi tamamlanamadı.'});}
}
