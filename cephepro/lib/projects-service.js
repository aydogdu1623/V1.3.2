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
   const rows=await sql`SELECT p.* FROM cephepro_projects p WHERE ${founder(me)} OR p.owner_id=${String(me.id)} OR EXISTS(SELECT 1 FROM cephepro_project_members m WHERE m.project_key=p.project_key AND m.user_id=${String(me.id)}) ORDER BY p.created_at,p.name`;
   return res.status(200).json({projects:rows.map(p=>view(p,me,active)),activeProject:active?view({...active,password_hash:true},me,active):null,canCreate:me.role==='admin'});
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
   await sql.transaction([
    sql`INSERT INTO cephepro_projects(project_key,name,company_code,project_code,password_hash,password_salt,owner_id) VALUES(${id},${name},${companyCode},${projectCode},${hash},${salt},${String(me.id)})`,
    sql`INSERT INTO cephepro_project_members(project_key,user_id) VALUES(${id},${String(me.id)})`,
    sql`INSERT INTO cephepro_project_state(project_key,state) VALUES(${id},'{}'::jsonb)`,
    sql`INSERT INTO cephepro_financial_state(project_key,data) VALUES(${id},'{}'::jsonb)`
   ]);
   return res.status(201).json({ok:true,id});
  }
  const [p]=await sql`SELECT * FROM cephepro_projects WHERE project_key=${String(b.id||'')}`;
  if(!p||!manages(me,p))return res.status(403).json({error:'Bu projeyi yönetme yetkiniz yok.'});
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
  if(e.code==='23505')return res.status(409).json({error:'Bu firma ve proje kodu zaten kullanılıyor. Silinen projeleri de kontrol edin.'});
  console.error('[projects]',e.code||e.name);return res.status(503).json({error:'Proje işlemi tamamlanamadı. Lütfen tekrar deneyin.'});
 }
};}
