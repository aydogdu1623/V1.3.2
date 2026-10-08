import '../assets/puantaj-model.js';
const {validate}=globalThis.PuantajModel;
export function createPuantajHandler({getSql,noStore,bearer,sessionUser,ensureSchema=async()=>{}}){
 return async(req,res)=>{
  if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  try{
   const sql=getSql(),me=await sessionUser(sql,bearer(req));
   if(!me)return res.status(401).json({error:'Oturum gerekli.'});
   if(me.role!=='admin')return res.status(403).json({error:'Puantaj yalnızca yöneticiler tarafından kullanılabilir.'});
   await ensureSchema(sql);
   const year=Number(req.method==='GET'?req.query?.year:req.body?.data?.year),own=String(me.id);
   if(!Number.isInteger(year)||year<2025||year>2100)return res.status(400).json({error:'Çalışma yılı geçersiz.'});
   // Isolated from shared project/claims data. No owner is accepted from the client.
   await sql`CREATE TABLE IF NOT EXISTS cephepro_puantaj (owner_id text NOT NULL, work_year integer NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,work_year))`;
   if(req.method==='GET'){
    const before=req.query?.before===undefined?2147483647:Number(req.query.before);
    if(!Number.isSafeInteger(before)||before<1||before>2147483647)return res.status(400).json({error:'Yükleme sayfası geçersiz.'});
    const uploads=await sql`SELECT id,user_name,username,role,details,created_at FROM cephepro_activity_log WHERE user_id=${own} AND action_type='puantaj_upload' AND (details->>'year')::integer=${year} AND (details->>'revision')::integer<${before} ORDER BY (details->>'revision')::integer DESC LIMIT 51`;
    const history={uploads:uploads.slice(0,50),nextBefore:uploads.length>50?Number(uploads[49].details.revision):null};
    if(req.query?.view==='uploads')return res.status(200).json(history);
    const rows=await sql`SELECT data,revision,updated_at FROM cephepro_puantaj WHERE owner_id=${own} AND work_year=${year}`;
    return res.status(200).json({data:rows[0]?.data||null,revision:Number(rows[0]?.revision||0),updatedAt:rows[0]?.updated_at||null,...history});
   }
   const {data,revision}=req.body||{};
   if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'Kayıt sürümü geçersiz.'});
   const encoded=JSON.stringify(data);if(!encoded)return res.status(400).json({error:'Puantaj verisi gerekli.'});if(Buffer.byteLength(encoded)>500000)return res.status(413).json({error:'Puantaj kaydı çok büyük.'});
   try{validate(data);}catch(e){return res.status(400).json({error:e.message});}
   // One atomic statement: only a successful revision writes an upload event.
   // Actor and owner are always taken from the authenticated session.
   const rows=await sql`WITH input(owner_id,work_year,data,expected_revision,user_name,username,role) AS (
    VALUES(${own}::text,${year}::integer,${encoded}::jsonb,${revision}::integer,${String(me.name||me.username||'Kullanıcı')}::text,${String(me.username||'')}::text,${me.role}::text)
   ), saved AS (
    INSERT INTO cephepro_puantaj(owner_id,work_year,data,revision)
    SELECT owner_id,work_year,data,1 FROM input i
    WHERE expected_revision=0 OR EXISTS(SELECT 1 FROM cephepro_puantaj p WHERE p.owner_id=i.owner_id AND p.work_year=i.work_year AND p.revision=i.expected_revision)
    ON CONFLICT(owner_id,work_year) DO UPDATE SET data=excluded.data,revision=cephepro_puantaj.revision+1,updated_at=now()
    WHERE cephepro_puantaj.revision=(SELECT expected_revision FROM input) AND (SELECT expected_revision FROM input)>0
    RETURNING revision,updated_at
   ), logged AS (
    INSERT INTO cephepro_activity_log(user_id,user_name,username,role,action_type,summary,details,created_at)
    SELECT i.owner_id,i.user_name,i.username,i.role,'puantaj_upload',i.work_year::text||' puantajı buluta yüklendi',jsonb_build_object('year',i.work_year,'revision',s.revision,'employeeCount',jsonb_array_length(i.data->'employees')),s.updated_at
    FROM input i CROSS JOIN saved s RETURNING id,user_name,username,role,details,created_at
   ) SELECT s.revision,s.updated_at,row_to_json(l) AS upload FROM saved s CROSS JOIN logged l`;
   if(!rows.length)return res.status(409).json({error:'Bu yılın puantajı başka bir oturumda değişti. Excel indirerek çalışmanızı yedekleyin, ardından Buluttan Yenile ile son kaydı alın.',code:'REVISION_CONFLICT'});
   return res.status(200).json({ok:true,revision:Number(rows[0].revision),updatedAt:rows[0].updated_at,upload:rows[0].upload});
  }catch(e){console.error('[puantaj]',e.code||e.name);return res.status(503).json({error:'Bulut kaydı tamamlanamadı. Veritabanı bağlantısını kontrol edin; ekrandaki değişiklikler korunuyor.'});}
 };
}
