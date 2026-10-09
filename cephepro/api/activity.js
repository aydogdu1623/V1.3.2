import {requireProject} from '../lib/project-access.js';
import { getSql,noStore,bearer } from '../lib/db.js';
import { ensureSchema } from '../lib/schema.js';
import { sessionUser,MASTER_EMAIL,norm } from '../lib/authutil.js';

const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);

function cleanRecords(input,workDate){
  if(!Array.isArray(input)||input.length>500)return null;
  const seen=new Set(),out=[];
  for(const source of input){
    const block=text(source?.block,80),facade=text(source?.facade,100),item=text(source?.item,160);
    const amount=Number(source?.amount),workers=Math.max(0,Math.min(10000,Math.round(Number(source?.workers||0))));
    if(!block||!facade||!item||!Number.isFinite(amount)||amount<=0)continue;
    const entered=new Date(source?.enteredAt);
    if(!Number.isFinite(entered.getTime())||entered.getTime()>Date.now())continue;
    const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(entered);
    const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(entered);
    if(localDay!==workDate||localTime>'23:50')continue;
    const id=text(source?.id,240)||`${block}|${facade}|${item}|${source?.enteredAt||out.length}`;
    if(seen.has(id))continue;seen.add(id);
    out.push({id,block,facade,item,amount:Math.min(amount,1e12),unit:text(source?.unit,24)||'m²',workers,enteredAt:entered.toISOString(),before:source?.before!=null&&Number.isFinite(Number(source.before))?Number(source.before):null,after:source?.after!=null&&Number.isFinite(Number(source.after))?Number(source.after):null,workDate});
  }
  return out;
}

export function createActivityHandler({getSql,noStore,bearer,ensureSchema,sessionUser}){return async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const sql=getSql();await ensureSchema(sql);
    const me=await sessionUser(sql,bearer(req));
    if(!me)return res.status(401).json({error:'Bulut oturumu gerekli. Yeniden giriş yapın.'});
    if(!await requireProject(sql,req,me,res))return;
    await sql`DELETE FROM cephepro_daily_activity_snapshots WHERE project_key=${me.projectId} AND expires_at<=now()`;
    const founder=norm(me.email)===MASTER_EMAIL;
    const manager=founder||me.role==='admin';
    if(req.method==='GET'&&req.query?.view==='uploads'){
      const records=manager
        ?await sql`SELECT s.user_id,s.user_name,s.work_date,u.role AS owner_role,jsonb_array_length(s.records) AS count,COALESCE(lower(trim(u.email))=${MASTER_EMAIL},false) AS protected FROM cephepro_daily_activity_snapshots s LEFT JOIN cephepro_users u ON u.id=s.user_id WHERE s.project_key=${me.projectId} AND s.expires_at>now() ORDER BY s.work_date DESC,s.user_name`
        :await sql`SELECT user_id,user_name,work_date,jsonb_array_length(records) AS count FROM cephepro_daily_activity_snapshots WHERE project_key=${me.projectId} AND expires_at>now() AND user_id=${String(me.id)} ORDER BY work_date DESC`;
      const uploads=records.map(row=>({...row,work_date:dateOnly(row.work_date),canDelete:founder||String(row.user_id)===String(me.id)||manager&&!row.protected&&row.owner_role==='member'}));
      return res.status(200).json({uploads,canDeleteAll:founder,canManageUploads:manager,canDeleteMany:true,currentUserId:String(me.id)});
    }
    if(req.method==='DELETE'){
      const {scope='one',workDate,userId,uploads}=req.body||{};
      if(!['one','selected','mine','all'].includes(scope))return res.status(400).json({error:'Silme kapsamı geçersiz.'});
      if(scope==='all'){
        if(!founder)return res.status(403).json({error:'Tüm yüklemeleri yalnız kurucu admin silebilir.'});
        const deleted=await sql`DELETE FROM cephepro_daily_activity_snapshots WHERE project_key=${me.projectId} RETURNING user_id`;
        return res.status(200).json({ok:true,deleted:deleted.length});
      }
      if(scope==='mine'){
        const deleted=await sql`DELETE FROM cephepro_daily_activity_snapshots WHERE project_key=${me.projectId} AND user_id=${String(me.id)} RETURNING user_id`;
        return res.status(200).json({ok:true,deleted:deleted.length});
      }
      const input=scope==='one'?[{userId:userId??me.id,workDate}]:uploads;
      if(!Array.isArray(input)||!input.length||input.length>200)return res.status(400).json({error:'1 ile 200 arasında yükleme seçin.'});
      const targets=[],seen=new Set();
      for(const item of input){
        const target=String(item?.userId??''),day=String(item?.workDate??'');
        if(!target||target.length>120||!validDay(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)return res.status(400).json({error:'Yükleme seçimi veya tarihi geçersiz.'});
        if(!manager&&target!==String(me.id))return res.status(403).json({error:'Yalnız kendi yüklemelerinizi silebilirsiniz.'});
        const key=target+'|'+day;if(!seen.has(key)){seen.add(key);targets.push({user_id:target,work_date:day});}
      }
      // Validate the complete selection and delete in one statement: a protected
      // founder upload prevents the whole batch, including otherwise allowed rows.
      const [result]=await sql`WITH requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(targets)}::jsonb) AS r(user_id text,work_date date)
      ), forbidden AS (
        SELECT 1 FROM requested r LEFT JOIN cephepro_users u ON u.id=r.user_id
        WHERE (NOT ${manager} AND r.user_id<>${String(me.id)})
           OR (NOT ${founder} AND lower(trim(u.email))=${MASTER_EMAIL})
           OR (NOT ${founder} AND r.user_id<>${String(me.id)} AND COALESCE(u.role,'')<>'member')
      ), deleted AS (
        DELETE FROM cephepro_daily_activity_snapshots s USING requested r
        WHERE s.project_key=${me.projectId} AND s.user_id=r.user_id AND s.work_date=r.work_date
          AND NOT EXISTS(SELECT 1 FROM forbidden)
        RETURNING s.user_id
      ) SELECT EXISTS(SELECT 1 FROM forbidden) AS forbidden,(SELECT count(*)::int FROM deleted) AS deleted`;
      if(result?.forbidden)return res.status(403).json({error:'Yalnız kendi yüklemelerinizi ve yetkiniz varsa üyelerin yüklemelerini silebilirsiniz. Kurucu adminin yüklemesini sadece kendisi silebilir.'});
      return res.status(200).json({ok:true,deleted:Number(result?.deleted||0)});
    }
    if(req.method==='GET'){
      const userId=text(req.query?.userId,120);
      // Yetki yalnız arayüzde gizlenmez: Üyelerin sorguları veritabanında da
      // Admin kayıtlarından arındırılır. Adminler tüm kullanıcıları görebilir.
      let snapshots=[];
      if(me.role==='admin'){
        snapshots=userId
          ?await sql`SELECT DISTINCT ON (s.user_id) s.user_id,s.user_name,s.username,u.role,s.work_date,s.records,s.uploaded_at,s.expires_at FROM cephepro_daily_activity_snapshots s JOIN cephepro_users u ON u.id=s.user_id WHERE s.project_key=${me.projectId} AND s.expires_at>now() AND s.user_id=${userId} ORDER BY s.user_id,s.uploaded_at DESC LIMIT 100`
          :await sql`SELECT DISTINCT ON (s.user_id) s.user_id,s.user_name,s.username,u.role,s.work_date,s.records,s.uploaded_at,s.expires_at FROM cephepro_daily_activity_snapshots s JOIN cephepro_users u ON u.id=s.user_id WHERE s.project_key=${me.projectId} AND s.expires_at>now() ORDER BY s.user_id,s.uploaded_at DESC LIMIT 100`;
      }else{
        snapshots=userId
          ?await sql`SELECT DISTINCT ON (s.user_id) s.user_id,s.user_name,s.username,s.role,s.work_date,s.records,s.uploaded_at,s.expires_at FROM cephepro_daily_activity_snapshots s JOIN cephepro_users u ON u.id=s.user_id WHERE s.project_key=${me.projectId} AND s.expires_at>now() AND s.user_id=${userId} AND s.role<>'admin' AND u.role<>'admin' ORDER BY s.user_id,s.uploaded_at DESC LIMIT 100`
          :await sql`SELECT DISTINCT ON (s.user_id) s.user_id,s.user_name,s.username,s.role,s.work_date,s.records,s.uploaded_at,s.expires_at FROM cephepro_daily_activity_snapshots s JOIN cephepro_users u ON u.id=s.user_id WHERE s.project_key=${me.projectId} AND s.expires_at>now() AND s.role<>'admin' AND u.role<>'admin' ORDER BY s.user_id,s.uploaded_at DESC LIMIT 100`;
      }
      const activities=[];
      snapshots.forEach(snapshot=>(Array.isArray(snapshot.records)?snapshot.records:[]).forEach((record,index)=>activities.push({id:`${snapshot.user_id}:${dateOnly(snapshot.work_date)}:${record.id||index}`,user_id:snapshot.user_id,user_name:snapshot.user_name,username:snapshot.username,role:snapshot.role,action_type:'daily_production',summary:record.item,details:{...record,workDate:dateOnly(snapshot.work_date)},work_date:dateOnly(snapshot.work_date),created_at:snapshot.uploaded_at,expires_at:snapshot.expires_at})));
      const users=me.role==='admin'
        ?await sql`SELECT id,name,username,role FROM cephepro_users WHERE id IN(SELECT user_id FROM cephepro_project_members WHERE project_key=${me.projectId}) AND approved=true ORDER BY name`
        :await sql`SELECT id,name,username,role FROM cephepro_users WHERE id IN(SELECT user_id FROM cephepro_project_members WHERE project_key=${me.projectId}) AND approved=true AND role<>'admin' ORDER BY name`;
      return res.status(200).json({activities,users,serverTime:new Date().toISOString(),retentionHours:48,currentUserId:String(me.id),currentUserRole:me.role});
    }
    if(req.method==='POST'){
      const body=req.body||{};
      if(body.actionType!=='publish_daily_snapshot')return res.status(400).json({error:'Geçersiz bulut yükleme işlemi.'});
      const workDate=text(body.workDate,10),records=cleanRecords(body.records,workDate);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(workDate!==today)return res.status(400).json({error:'Yalnız bugünün imalat hareketleri yüklenebilir.'});
      if(!validDay(workDate))return res.status(400).json({error:'Çalışma tarihi geçersiz.'});
      if(!records?.length)return res.status(400).json({error:'Buluta yüklenecek geçerli günlük imalat kaydı yok.'});
      const rows=await sql`INSERT INTO cephepro_daily_activity_snapshots (project_key,user_id,work_date,user_name,username,role,records,uploaded_at,expires_at) VALUES(${me.projectId},${me.id},${workDate}::date,${me.name||me.username},${me.username},${me.role},${JSON.stringify(records)}::jsonb,now(),now()+interval '48 hours') ON CONFLICT(project_key,user_id,work_date) DO UPDATE SET user_name=excluded.user_name,username=excluded.username,role=excluded.role,records=excluded.records,uploaded_at=now(),expires_at=now()+interval '48 hours' RETURNING uploaded_at,expires_at`;
      return res.status(200).json({ok:true,count:records.length,workDate,uploadedAt:rows[0]?.uploaded_at,expiresAt:rows[0]?.expires_at});
    }
    return res.status(405).json({error:'Desteklenmeyen istek yöntemi.'});
  }catch(error){console.error('[api/activity]',{message:String(error?.message||error),method:req.method,userId:req.query?.userId||null});return res.status(500).json({error:'Admin/Üye hareket kayıtları işlenemedi.'});}
}
}
export default createActivityHandler({getSql,noStore,bearer,ensureSchema,sessionUser});
