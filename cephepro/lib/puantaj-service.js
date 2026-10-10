import {requireProject} from './project-access.js';
import '../assets/puantaj-model.js';
import {MASTER_EMAIL} from './authutil.js';
import {isFounder,canDeleteUpload,turkeyDay,validWorkDate} from './upload-permissions.js';
const M=globalThis.PuantajModel;
const versionsOf=row=>[row?.revision?{revision:Number(row.revision),updatedAt:row.updated_at,isCurrent:true}:null,row?.previous_revision?{revision:Number(row.previous_revision),updatedAt:row.previous_updated_at,isCurrent:false}:null].filter(Boolean);
export function createPuantajHandler({getSql,noStore,bearer,sessionUser,ensureSchema=async()=>{}}){
 return async(req,res)=>{
  if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','PUT','DELETE'].includes(req.method))return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  try{
   const sql=getSql(),me=await sessionUser(sql,bearer(req));
   if(!me)return res.status(401).json({error:'Oturum gerekli.'});
   if(!['admin','member'].includes(me.role))return res.status(403).json({error:'Puantaj yetkisi gerekli.'});
   await ensureSchema(sql);
   if(!await requireProject(sql,req,me,res))return;
   const own=String(me.id),founder=isFounder(me),manager=founder||me.role==='admin';
   // Only publication metadata is shared. Payroll, identity and bank data stay owner scoped.
   const publicUpload=row=>({id:String(row.id),user_id:row.user_id,user_name:row.user_name,username:row.username,role:row.owner_role||row.role,details:row.details,created_at:row.created_at,canOpen:row.user_id===own&&!!row.can_open,canDelete:canDeleteUpload(me,{id:row.user_id,role:row.owner_role||row.role,email:row.owner_email}),isFounder:row.owner_email?.toLowerCase()===MASTER_EMAIL});
   if(req.method==='GET'&&!manager&&['dashboard','salary','bank','receipt'].includes(req.query?.view))return res.status(403).json({error:'Yetkiniz yetersiz. Sadece adminler geçiş yapabilir.'});
   if(req.method==='DELETE'){
    const ids=req.body?.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>!/^\d{1,18}$/.test(String(id))))return res.status(400).json({error:'1 ile 200 arasında yükleme seçin.'});
    // Validate and remove the whole selection atomically. A forged role or owner is ignored.
    const [result]=await sql`WITH requested AS (
     SELECT DISTINCT value::bigint AS id FROM jsonb_array_elements_text(${JSON.stringify(ids.map(String))}::jsonb)
    ), targets AS (
     SELECT l.id,l.user_id,COALESCE(u.role,l.role) AS owner_role,lower(trim(u.email)) AS owner_email
     FROM cephepro_activity_log l JOIN requested r ON r.id=l.id LEFT JOIN cephepro_users u ON u.id=l.user_id
     WHERE l.project_key=${me.projectId} AND l.action_type='puantaj_upload' AND l.deleted_at IS NULL
    ), forbidden AS (
     SELECT 1 FROM targets WHERE NOT (${founder} OR user_id=${own} OR (${manager} AND COALESCE(owner_email,'')<>${MASTER_EMAIL} AND owner_role='member'))
    ), removed AS (
     UPDATE cephepro_activity_log l SET deleted_at=now(),deleted_by=${own}
     FROM targets t WHERE l.id=t.id AND NOT EXISTS(SELECT 1 FROM forbidden) RETURNING l.id
    ) SELECT EXISTS(SELECT 1 FROM forbidden) AS forbidden,(SELECT count(*)::int FROM removed) AS deleted`;
    if(result?.forbidden)return res.status(403).json({error:'Üyeler kendi, adminler kendi ve üyelerin, kurucu admin tüm yükleme kayıtlarını silebilir.'});
    return res.status(200).json({ok:true,deleted:Number(result?.deleted||0)});
   }
   const year=Number(req.method==='GET'?req.query?.year:req.body?.data?.year);
   if(!Number.isInteger(year)||year<2025||year>2100)return res.status(400).json({error:'Çalışma yılı geçersiz.'});
   if(req.method==='GET'){
    if(req.query?.view==='version'){
     const requested=Number(req.query.revision);
     if(!Number.isSafeInteger(requested)||requested<1||requested>2147483647)return res.status(400).json({error:'Sürüm numarası geçersiz.'});
     // Session owner is authoritative even if a caller supplies another owner ID.
     const [row]=await sql`SELECT revision AS current_revision,
      CASE WHEN revision=${requested} THEN data ELSE previous_data END AS data,
      CASE WHEN revision=${requested} THEN updated_at ELSE previous_updated_at END AS updated_at
      FROM cephepro_puantaj WHERE project_key=${me.projectId} AND owner_id=${own} AND work_year=${year}
       AND (revision=${requested} OR (previous_revision=${requested} AND previous_data IS NOT NULL))`;
     if(!row)return res.status(404).json({error:'Bu sürümün puantaj verisi bulunamadı. Yalnız güncel ve bir önceki sürüm saklanır.'});
     return res.status(200).json({data:manager?row.data:M.protectFinance(row.data),revision:requested,updatedAt:row.updated_at,currentRevision:Number(row.current_revision),isCurrent:requested===Number(row.current_revision)});
    }
    if(req.query?.view==='activity'){
     const workDate=String(req.query?.date||turkeyDay());
     if(!validWorkDate(workDate))return res.status(400).json({error:'Çalışma tarihi geçersiz.'});
     const rows=await sql`SELECT DISTINCT ON (l.user_id) l.id,l.user_id,l.user_name,l.username,l.role,l.details,l.created_at,u.role AS owner_role,u.email AS owner_email
      FROM cephepro_activity_log l LEFT JOIN cephepro_users u ON u.id=l.user_id
      WHERE l.project_key=${me.projectId} AND l.action_type='puantaj_upload' AND l.deleted_at IS NULL AND l.details->>'workDate'=${workDate}
       AND (${manager} OR l.user_id=${own}) ORDER BY l.user_id,l.id DESC`;
     return res.status(200).json({activities:rows.map(publicUpload),workDate,currentUserId:own,canManage:manager});
    }
    const before=req.query?.before===undefined?'9223372036854775807':String(req.query.before);
    if(!/^\d{1,19}$/.test(before)||BigInt(before)<1n||BigInt(before)>9223372036854775807n)return res.status(400).json({error:'Yükleme sayfası geçersiz.'});
    const uploads=await sql`SELECT l.id,l.user_id,l.user_name,l.username,l.role,l.details,l.created_at,u.role AS owner_role,u.email AS owner_email,
      (l.user_id=${own} AND (l.details->>'revision'=p.revision::text OR (p.previous_data IS NOT NULL AND l.details->>'revision'=p.previous_revision::text))) AS can_open
     FROM cephepro_activity_log l LEFT JOIN cephepro_users u ON u.id=l.user_id
     LEFT JOIN cephepro_puantaj p ON p.project_key=l.project_key AND p.owner_id=l.user_id AND p.work_year::text=l.details->>'year'
     WHERE l.project_key=${me.projectId} AND l.action_type='puantaj_upload' AND l.deleted_at IS NULL AND (l.details->>'year')::integer=${year} AND l.id<${before}::bigint
      AND (${manager} OR l.user_id=${own}) ORDER BY l.id DESC LIMIT 51`;
    const history={uploads:uploads.slice(0,50).map(publicUpload),nextBefore:uploads.length>50?String(uploads[49].id):null,currentUserId:own,canManage:manager};
    if(req.query?.view==='uploads')return res.status(200).json(history);
    const rows=await sql`SELECT data,revision,updated_at,previous_revision,previous_updated_at FROM cephepro_puantaj WHERE project_key=${me.projectId} AND owner_id=${own} AND work_year=${year}`;
    return res.status(200).json({data:manager?rows[0]?.data||null:M.protectFinance(rows[0]?.data||null),revision:Number(rows[0]?.revision||0),updatedAt:rows[0]?.updated_at||null,versions:versionsOf(rows[0]),...history});
   }
   let {data}=req.body||{};const {revision}=req.body||{},workDate=String(req.body?.workDate||turkeyDay());
   if(!validWorkDate(workDate)||Number(workDate.slice(0,4))!==year||workDate>turkeyDay())return res.status(400).json({error:'Çalışma tarihi seçili yıl içinde, bugün veya geçmiş bir gün olmalıdır.'});
   if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'Kayıt sürümü geçersiz.'});
   let encoded=JSON.stringify(data);if(!encoded)return res.status(400).json({error:'Puantaj verisi gerekli.'});if(Buffer.byteLength(encoded)>500000)return res.status(413).json({error:'Puantaj kaydı çok büyük.'});
   try{M.validate(data);}catch(e){return res.status(400).json({error:e.message});}
   if(!manager){const [previous]=await sql`SELECT data FROM cephepro_puantaj WHERE project_key=${me.projectId} AND owner_id=${own} AND work_year=${year}`;data=M.protectFinance(data,previous?.data);encoded=JSON.stringify(data);}
   const mm=Number(workDate.slice(5,7)),dd=Number(workDate.slice(8,10));
   const workingCount=data.employees.filter(p=>M.active(p,year,mm,dd)&&['X','PM','BM'].includes(M.dayCode(data,p,mm,dd))).length;
   const rows=await sql`WITH input(project_key,owner_id,work_year,data,expected_revision,user_name,username,role,work_date,working_count) AS (
    VALUES(${me.projectId}::text,${own}::text,${year}::integer,${encoded}::jsonb,${revision}::integer,${String(me.name||me.username||'Kullanıcı')}::text,${String(me.username||'')}::text,${me.role}::text,${workDate}::text,${workingCount}::integer)
   ), saved AS (
    INSERT INTO cephepro_puantaj(project_key,owner_id,work_year,data,revision)
    SELECT project_key,owner_id,work_year,data,1 FROM input i
    WHERE expected_revision=0 OR EXISTS(SELECT 1 FROM cephepro_puantaj p WHERE p.project_key=i.project_key AND p.owner_id=i.owner_id AND p.work_year=i.work_year AND p.revision=i.expected_revision)
    ON CONFLICT(project_key,owner_id,work_year) DO UPDATE SET
     previous_data=cephepro_puantaj.data,previous_revision=cephepro_puantaj.revision,previous_updated_at=cephepro_puantaj.updated_at,
     data=excluded.data,revision=cephepro_puantaj.revision+1,updated_at=now()
    WHERE cephepro_puantaj.revision=(SELECT expected_revision FROM input) AND (SELECT expected_revision FROM input)>0
    RETURNING revision,updated_at,previous_revision,previous_updated_at
   ), logged AS (
    INSERT INTO cephepro_activity_log(project_key,user_id,user_name,username,role,action_type,summary,details,created_at)
    SELECT i.project_key,i.owner_id,i.user_name,i.username,i.role,'puantaj_upload',i.work_year::text||' puantajı buluta yüklendi',jsonb_build_object('year',i.work_year,'revision',s.revision,'employeeCount',jsonb_array_length(i.data->'employees'),'workDate',i.work_date,'workingCount',i.working_count),s.updated_at
    FROM input i CROSS JOIN saved s RETURNING id,user_id,user_name,username,role,details,created_at
   ), pruned AS (
    DELETE FROM cephepro_activity_log l USING saved s,input i
    WHERE l.project_key=${me.projectId} AND l.action_type='puantaj_upload' AND l.user_id=i.owner_id AND l.details->>'year'=i.work_year::text
     AND CASE WHEN l.details->>'revision' ~ '^[0-9]{1,10}$'
      THEN (l.details->>'revision')::bigint < s.revision::bigint-1 ELSE false END RETURNING l.id
   ) SELECT s.revision,s.updated_at,s.previous_revision,s.previous_updated_at,row_to_json(l) AS upload,
    (SELECT count(*)::int FROM pruned) AS pruned FROM saved s CROSS JOIN logged l`;
   if(!rows.length)return res.status(409).json({error:'Bu yılın puantajı başka bir oturumda değişti. Excel indirerek çalışmanızı yedekleyin, ardından Buluttan Yenile ile son kaydı alın.',code:'REVISION_CONFLICT'});
   return res.status(200).json({ok:true,revision:Number(rows[0].revision),updatedAt:rows[0].updated_at,versions:versionsOf(rows[0]),pruned:Number(rows[0].pruned),upload:publicUpload({...rows[0].upload,owner_email:me.email,can_open:true})});
  }catch(e){console.error('[puantaj]',e.code||e.name);return res.status(503).json({error:'Bulut işlemi tamamlanamadı. Veritabanı bağlantısını kontrol edin; ekrandaki değişiklikler korunuyor.'});}
 };
}
