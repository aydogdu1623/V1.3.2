import '../assets/puantaj-model.js';
const {validate}=globalThis.PuantajModel;
export function createPuantajHandler({getSql,noStore,bearer,sessionUser}){
 return async(req,res)=>{
  if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  try{
   const sql=getSql(),me=await sessionUser(sql,bearer(req));
   if(!me)return res.status(401).json({error:'Oturum gerekli.'});
   if(me.role!=='admin')return res.status(403).json({error:'Puantaj yalnızca yöneticiler tarafından kullanılabilir.'});
   const year=Number(req.method==='GET'?req.query?.year:req.body?.data?.year),own=String(me.id);
   if(!Number.isInteger(year)||year<2025||year>2100)return res.status(400).json({error:'Çalışma yılı geçersiz.'});
   // Isolated from shared project/claims data. No owner is accepted from the client.
   await sql`CREATE TABLE IF NOT EXISTS cephepro_puantaj (owner_id text NOT NULL, work_year integer NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,work_year))`;
   if(req.method==='GET'){
    const rows=await sql`SELECT data,revision,updated_at FROM cephepro_puantaj WHERE owner_id=${own} AND work_year=${year}`;
    return res.status(200).json({data:rows[0]?.data||null,revision:Number(rows[0]?.revision||0),updatedAt:rows[0]?.updated_at||null});
   }
   const {data,revision}=req.body||{};
   if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'Kayıt sürümü geçersiz.'});
   const encoded=JSON.stringify(data);if(!encoded)return res.status(400).json({error:'Puantaj verisi gerekli.'});if(Buffer.byteLength(encoded)>500000)return res.status(413).json({error:'Puantaj kaydı çok büyük.'});
   try{validate(data);}catch(e){return res.status(400).json({error:e.message});}
   const rows=revision===0
    ?await sql`INSERT INTO cephepro_puantaj(owner_id,work_year,data,revision) VALUES(${own},${year},${encoded}::jsonb,1) ON CONFLICT(owner_id,work_year) DO NOTHING RETURNING revision,updated_at`
    :await sql`UPDATE cephepro_puantaj SET data=${encoded}::jsonb,revision=revision+1,updated_at=now() WHERE owner_id=${own} AND work_year=${year} AND revision=${revision} RETURNING revision,updated_at`;
   if(!rows.length)return res.status(409).json({error:'Bu yılın puantajı başka bir oturumda değişti. Excel indirerek çalışmanızı yedekleyin, ardından Buluttan Yenile ile son kaydı alın.',code:'REVISION_CONFLICT'});
   return res.status(200).json({ok:true,revision:Number(rows[0].revision),updatedAt:rows[0].updated_at});
  }catch(e){console.error('[puantaj]',e.code||e.name);return res.status(503).json({error:'Bulut kaydı tamamlanamadı. Veritabanı bağlantısını kontrol edin; ekrandaki değişiklikler korunuyor.'});}
 };
}
