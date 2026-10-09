import {requireProject} from '../lib/project-access.js';
import { getSql,noStore,bearer } from '../lib/db.js';
import { ensureSchema } from '../lib/schema.js';
import { sessionUser,logActivity } from '../lib/authutil.js';

function cleanData(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const entries=Object.entries(input);
  if(entries.length>10000)return null;
  const out={};
  for(const [rawKey,rawValue] of entries){
    const key=String(rawKey||'').trim().slice(0,500);
    const value=Number(rawValue);
    if(!key||!Number.isFinite(value)||value<0||value>1e15)continue;
    out[key]=Math.round(value*10000)/10000;
  }
  return out;
}

export function createFinanceHandler({getSql,noStore,bearer,ensureSchema,sessionUser,logActivity}){return async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const sql=getSql();await ensureSchema(sql);
    const me=await sessionUser(sql,bearer(req));
    if(!me)return res.status(401).json({error:'Bulut oturumu gerekli. Yeniden giriş yapın.'});
    if(!await requireProject(sql,req,me,res))return;
    if(req.method==='GET'&&req.query?.view==='weights'){
      const rows=await sql`SELECT data FROM cephepro_financial_state WHERE project_key=${me.projectId} LIMIT 1`;
      const values=cleanData(rows[0]?.data)||{},sum=Object.values(values).reduce((a,b)=>a+b,0);
      const weights=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,sum>0?v/sum:0]));
      return res.status(200).json({weights});
    }
    if(me.role!=='admin')return res.status(403).json({error:'Birim fiyat ve parasal ilerleme yalnız Admin tarafından görüntülenebilir.'});
    if(req.method==='GET'){
      const rows=await sql`SELECT data,revision,updated_at FROM cephepro_financial_state WHERE project_key=${me.projectId} LIMIT 1`;
      return res.status(200).json({data:cleanData(rows[0]?.data)||{},revision:Number(rows[0]?.revision||0),updatedAt:rows[0]?.updated_at||null});
    }
    if(req.method==='PUT'||req.method==='POST'){
      const data=cleanData(req.body?.data);
      if(!data)return res.status(400).json({error:'Birim fiyat verisi geçersiz.'});
      if(JSON.stringify(data).length>1500000)return res.status(413).json({error:'Birim fiyat verisi çok büyük.'});
      const rows=await sql`UPDATE cephepro_financial_state SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_at=now(),updated_by=${String(me.id)} WHERE project_key=${me.projectId} RETURNING revision,updated_at`;
      await logActivity(sql,me,'financial_update','Birim fiyat ve parasal ilerleme verilerini güncelledi.',{itemCount:Object.keys(data).length});
      return res.status(200).json({ok:true,revision:Number(rows[0]?.revision||0),updatedAt:rows[0]?.updated_at||null});
    }
    return res.status(405).json({error:'Desteklenmeyen istek yöntemi.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:'Birim fiyat verileri işlenemedi.'});
  }
}

}
export default createFinanceHandler({getSql,noStore,bearer,ensureSchema,sessionUser,logActivity});
