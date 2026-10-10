import crypto from 'node:crypto';
import {MASTER_EMAIL,norm,passwordHash,safeEqualHex,tokenHash} from './authutil.js';
import {projectAccess} from './project-access.js';

const code=value=>String(value||'').trim().toLocaleUpperCase('tr-TR');
const validCode=value=>/^[\p{L}\p{N}._-]{2,40}$/u.test(value);
const founder=me=>norm(me.email)===MASTER_EMAIL;
const manages=(me,p)=>founder(me)||(me.role==='admin'&&p.owner_id===String(me.id));
const view=(p,me,active)=>({id:p.project_key,name:p.name,companyCode:p.company_code||'',projectCode:p.project_code||'',configured:!!p.password_hash,canManage:manages(me,p),deletedAt:p.deleted_at||null,unlocked:p.project_key===active?.project_key});

function founderPassword(me,password,secret){
 if(!founder(me)||typeof secret!=='string'||password.length>128)return false;
 const [salt,hash]=secret.split(':');
 return /^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{128}$/.test(hash||'')&&safeEqualHex(passwordHash(password,salt),hash);
}

export function createProjectsHandler({getSql,noStore,bearer,ensureSchema,sessionUser,recoverySecret=()=>process.env.CEPHEPRO_FOUNDER_PROJECT_ACCESS}){return async(req,res)=>{
 if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  const sql=getSql();await ensureSchema(sql);
  const accountToken=bearer(req),me=await sessionUser(sql,accountToken);
  if(!me)return res.status(401).json({error:'Önce hesabınıza giriş yapın.'});
  const active=await projectAccess(sql,req,me),accountHash=tokenHash(accountToken);
  if(req.method==='GET'){
   // Joining one project reveals that company's directory, never its project data.
   const known=await sql`SELECT DISTINCT p.company_code FROM cephepro_projects p
    WHERE p.company_code IS NOT NULL AND (${founder(me)} OR p.owner_id=${String(me.id)} OR
     (p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM cephepro_project_members m WHERE m.project_key=p.project_key AND m.user_id=${String(me.id)}))) ORDER BY p.company_code`;
   const companies=known.map(p=>p.company_code),requested=code(req.query?.companyCode);
   if(requested&&!companies.includes(requested))return res.status(403).json({error:'Bu firmanın projelerini görmek için önce firma kodu, proje kodu ve şifresiyle giriş yapın.',code:'COMPANY_ACCESS_REQUIRED'});
   const selectedCompany=requested||(companies.includes(active?.company_code)?active.company_code:companies[0])||'';
   const rows=await sql`SELECT p.* FROM cephepro_projects p WHERE
    (p.company_code=${selectedCompany} AND (p.deleted_at IS NULL OR ${founder(me)} OR p.owner_id=${String(me.id)}))
    OR (p.project_key='main' AND p.company_code IS NULL AND ${founder(me)}) ORDER BY p.created_at,p.name`;
   return res.status(200).json({projects:rows.map(p=>view(p,me,active)),companies,selectedCompany,activeProject:active?view({...active,password_hash:true},me,active):null,canCreate:me.role==='admin'});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Yöntem desteklenmiyor.'});
  const b=req.body||{},action=String(b.action||'');
  if(action==='lock'){
   await sql`DELETE FROM cephepro_project_sessions WHERE auth_token_hash=${accountHash}`;
   return res.status(200).json({ok:true});
  }
  if(action==='unlock'){
   const companyCode=code(b.companyCode),projectCode=code(b.projectCode),password=String(b.password||'');
   const key=tokenHash('project-unlock:'+me.id);
   const [attempt]=await sql`INSERT INTO cephepro_auth_failures AS f(failure_key,attempts,window_started_at,updated_at) VALUES(${key},1,now(),now()) ON CONFLICT(failure_key) DO UPDATE SET attempts=CASE WHEN f.window_started_at<now()-interval '15 minutes' THEN 1 ELSE f.attempts+1 END,window_started_at=CASE WHEN f.window_started_at<now()-interval '15 minutes' THEN now() ELSE f.window_started_at END,updated_at=now() RETURNING attempts`;
   if(Number(attempt.attempts)>10)return res.status(429).json({error:'Çok fazla hatalı proje girişi. 15 dakika sonra tekrar deneyin.'});
   const [p]=await sql`SELECT * FROM cephepro_projects WHERE company_code=${companyCode} AND project_code=${projectCode} AND deleted_at IS NULL`;
   const hash=passwordHash(password.slice(0,129),p?.password_salt||'unconfigured-project');
   if(!p?.password_hash||password.length>128||(!safeEqualHex(hash,p.password_hash)&&!founderPassword(me,password,recoverySecret())))return res.status(403).json({error:'Firma kodu, proje kodu veya proje şifresi hatalı.'});
   const token=crypto.randomBytes(32).toString('hex');
   // One active project per account session. The grant cannot be used with another login.
   await sql.transaction([
    sql`DELETE FROM cephepro_project_sessions WHERE auth_token_hash=${accountHash} OR expires_at<=now()`,
    sql`INSERT INTO cephepro_project_sessions(token_hash,auth_token_hash,user_id,project_key,access_version,expires_at) VALUES(${tokenHash(token)},${accountHash},${String(me.id)},${p.project_key},${p.access_version},now()+interval '12 hours')`,
    sql`INSERT INTO cephepro_project_members(project_key,user_id) VALUES(${p.project_key},${String(me.id)}) ON CONFLICT DO NOTHING`,
    sql`DELETE FROM cephepro_auth_failures WHERE failure_key=${key}`
   ]);
   return res.status(200).json({ok:true,token,project:view(p,me,p),userId:String(me.id)});
  }
  if(me.role!=='admin')return res.status(403).json({error:'Proje yönetimi için Admin yetkisi gerekli.'});
  if(action==='create'){
   const name=String(b.name||'').trim(),companyCode=code(b.companyCode),projectCode=code(b.projectCode),password=String(b.password||'');
   if(!name||name.length>120||!validCode(companyCode)||!validCode(projectCode)||password.length<8||password.length>128)return res.status(400).json({error:'Proje adı, 2–40 karakter firma/proje kodları ve en az 8 karakter şifre girin. Kodlarda boşluk kullanmayın.'});
   const id=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(password,salt);
   // Reserve a unique login code and all empty stores in one atomic statement.
   // A duplicate code must not block creation or overwrite an existing project.
   for(let attempt=1;attempt<=24;attempt++){
    const suffix=attempt===1?'':attempt<=20?'_'+attempt:'_'+crypto.randomBytes(4).toString('hex').toUpperCase();
    const assignedCode=projectCode.slice(0,40-suffix.length)+suffix;
    const created=await sql`WITH created AS (
     INSERT INTO cephepro_projects(project_key,name,company_code,project_code,password_hash,password_salt,owner_id)
     VALUES(${id},${name},${companyCode},${assignedCode},${hash},${salt},${String(me.id)}) ON CONFLICT(company_code,project_code) DO NOTHING RETURNING *
    ), member AS (
     INSERT INTO cephepro_project_members(project_key,user_id) SELECT project_key,${String(me.id)} FROM created
    ), state AS (
     INSERT INTO cephepro_project_state(project_key,state) SELECT project_key,'{}'::jsonb FROM created
    ), finance AS (
     INSERT INTO cephepro_financial_state(project_key,data) SELECT project_key,'{}'::jsonb FROM created
    ) SELECT * FROM created`;
    if(created.length)return res.status(201).json({ok:true,id,project:view(created[0],me,active),codeAdjusted:assignedCode!==projectCode});
   }
   return res.status(503).json({error:'Proje kodu şu anda ayrılamadı. Lütfen yeniden deneyin.'});
  }
  const [p]=await sql`SELECT * FROM cephepro_projects WHERE project_key=${String(b.id||'')}`;
  if(!p||!manages(me,p))return res.status(403).json({error:'Bu projeyi yönetme yetkiniz yok.'});
  if(action==='purge'){
   if(!p.deleted_at)return res.status(409).json({error:'Kalıcı silmeden önce projeyi Silinen Projeler bölümüne taşıyın.'});
   if(code(b.confirmProjectCode)!==code(p.project_code||p.name))return res.status(400).json({error:'Kalıcı silmeyi onaylamak için proje kodunu doğru yazın.'});
   const removed=await sql`WITH target AS (
    SELECT project_key FROM cephepro_projects WHERE project_key=${p.project_key} AND deleted_at IS NOT NULL FOR UPDATE
   ), marker AS (
    INSERT INTO cephepro_migrations(name) SELECT 'main_project_purged_v216' FROM target WHERE project_key='main' ON CONFLICT DO NOTHING
   ), sessions AS (DELETE FROM cephepro_project_sessions x USING target t WHERE x.project_key=t.project_key),
   members AS (DELETE FROM cephepro_project_members x USING target t WHERE x.project_key=t.project_key),
   payroll AS (DELETE FROM cephepro_puantaj x USING target t WHERE x.project_key=t.project_key),
   claims AS (DELETE FROM cephepro_claims x USING target t WHERE x.project_key=t.project_key),
   activity AS (DELETE FROM cephepro_activity_log x USING target t WHERE x.project_key=t.project_key),
   snapshots AS (DELETE FROM cephepro_daily_activity_snapshots x USING target t WHERE x.project_key=t.project_key),
   photos AS (DELETE FROM cephepro_photos x USING target t WHERE x.project_key=t.project_key),
   state AS (DELETE FROM cephepro_project_state x USING target t WHERE x.project_key=t.project_key),
   finance AS (DELETE FROM cephepro_financial_state x USING target t WHERE x.project_key=t.project_key)
   DELETE FROM cephepro_projects x USING target t WHERE x.project_key=t.project_key RETURNING x.project_key`;
   if(!removed.length)return res.status(409).json({error:'Projenin durumu değişti. Listeyi yenileyin.'});
   return res.status(200).json({ok:true,purgedId:p.project_key});
  }
  if(action==='restore'){
   await sql`UPDATE cephepro_projects SET deleted_at=null,access_version=access_version+1,updated_at=now() WHERE project_key=${p.project_key}`;
   return res.status(200).json({ok:true});
  }
  if(p.deleted_at)return res.status(404).json({error:'Proje silinmiş.'});
  // The authenticated founder/project owner may remove a project from the list
  // even when it is locked. This never grants access to the project's contents.
  if(action==='delete'){
   await sql`UPDATE cephepro_projects SET deleted_at=now(),access_version=access_version+1,updated_at=now() WHERE project_key=${p.project_key}`;
   return res.status(200).json({ok:true,deletedId:p.project_key});
  }
  const setup=p.project_key==='main'&&!p.password_hash&&founder(me);
  if(!setup&&active?.project_key!==p.project_key)return res.status(403).json({error:'Önce bu projeye kodları ve şifresiyle giriş yapın.',code:'PROJECT_REQUIRED'});
  if(!['edit','password','setup'].includes(action))return res.status(400).json({error:'Geçersiz proje işlemi.'});
  if(action==='setup'&&!setup)return res.status(403).json({error:'Bu projenin şifresi zaten oluşturulmuş.'});
  const name=String(b.name??p.name).trim(),companyCode=code(b.companyCode??p.company_code),projectCode=code(b.projectCode??p.project_code);
  if(!name||name.length>120||!validCode(companyCode)||!validCode(projectCode))return res.status(400).json({error:'Geçerli proje adı, firma kodu ve proje kodu girin.'});
  let hash=p.password_hash,salt=p.password_salt;
  if(action==='password'||setup){
   const password=String(b.password||'');
   if(password.length<8||password.length>128)return res.status(400).json({error:'Proje şifresi 8–128 karakter olmalıdır.'});
   if(!setup&&!safeEqualHex(passwordHash(String(b.currentPassword||'').slice(0,129),salt),hash)&&!founderPassword(me,String(b.currentPassword||''),recoverySecret()))return res.status(403).json({error:'Mevcut proje şifresi hatalı.'});
   salt=crypto.randomBytes(16).toString('hex');hash=passwordHash(password,salt);
  }
  await sql`UPDATE cephepro_projects SET name=${name},company_code=${companyCode},project_code=${projectCode},password_hash=${hash},password_salt=${salt},owner_id=COALESCE(owner_id,${String(me.id)}),access_version=access_version+1,updated_at=now() WHERE project_key=${p.project_key}`;
  return res.status(200).json({ok:true,requiresUnlock:true});
 }catch(e){
  console.error('[projects]',e.code||e.name,e.constraint||'');
  if(e.code==='23505'&&e.constraint==='cephepro_project_codes_uq')return res.status(409).json({error:'Bu kod başka bir projeye ait. Düzenlerken farklı bir proje kodu kullanın.'});
  return res.status(503).json({error:'Proje işlemi tamamlanamadı. Lütfen tekrar deneyin.'});
 }
};}
