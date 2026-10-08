import { getSql,noStore } from '../lib/db.js';
import { createHash } from 'node:crypto';

export default async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({ok:false,error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  try{
    const sql=getSql();
    // A cached schema promise is not proof that the database is still reachable.
    // This read-only query runs on every check and never creates/changes records.
    const [check]=await sql`SELECT NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY['cephepro_users','cephepro_sessions',
      'cephepro_auth_failures','cephepro_project_state','cephepro_financial_state',
      'cephepro_claims','cephepro_activity_log','cephepro_daily_activity_snapshots',
      'cephepro_photos']) AS required(name)
      WHERE to_regclass('public.' || required.name) IS NULL
    ) AS schema_ready`;
    if(!check?.schema_ready)return res.status(503).json({ok:false,error:'Veritabanında gerekli uygulama tabloları eksik.',code:'DB_SCHEMA_MISSING'});
    const host=new URL(process.env.DATABASE_URL).hostname.replace('-pooler','');
    const endpointFingerprint=createHash('sha256').update(host).digest('hex').slice(0,12);
    return res.status(200).json({ok:true,service:'CephePro Cloud',version:'211',build:'211.0',database:{connected:true,transport:'https',endpointFingerprint},schema:{ready:true}});
  }catch(err){
    console.error(err);
    const msg=String(err?.message||'');
    if(msg.includes('DATABASE_URL is not configured'))return res.status(503).json({ok:false,error:'Veritabanı bağlantısı yapılandırılmamış. Vercel ortam değişkenlerine DATABASE_URL ekleyin.',code:'DB_NOT_CONFIGURED'});
    return res.status(503).json({ok:false,error:'Bulut veritabanına ulaşılamıyor. DATABASE_URL bağlantısını kontrol edin.',code:'DB_UNAVAILABLE'});
  }
}
