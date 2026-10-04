import crypto from 'node:crypto';
import { getSql,noStore,bearer } from '../lib/db.js';
import { ensureSchema } from '../lib/schema.js';
import { MASTER_EMAIL,norm,passwordHash,tokenHash,safeEqualHex,publicUser,sessionUser,newSession,logActivity } from '../lib/authutil.js';

function isOwner(u){return norm(u?.email)===MASTER_EMAIL}

function clientIp(req){
  return String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||'unknown').split(',')[0].trim();
}
function failureKey(scope,value){
  return crypto.createHash('sha256').update(`${scope}:${String(value||'')}`).digest('hex');
}
async function recordFailure(sql,scope,value,limit){
  const key=failureKey(scope,value);
  const rows=await sql`INSERT INTO cephepro_auth_failures AS f(failure_key,attempts,window_started_at,updated_at)
    VALUES(${key},1,now(),now())
    ON CONFLICT(failure_key) DO UPDATE SET
      attempts=CASE WHEN f.window_started_at<now()-interval '15 minutes' THEN 1 ELSE f.attempts+1 END,
      window_started_at=CASE WHEN f.window_started_at<now()-interval '15 minutes' THEN now() ELSE f.window_started_at END,
      updated_at=now()
    RETURNING attempts`;
  return Number(rows[0]?.attempts||1)<=limit;
}
async function clearFailures(sql,scope,value){
  await sql`DELETE FROM cephepro_auth_failures WHERE failure_key=${failureKey(scope,value)}`;
}

export default async function handler(req,res){
  if(!noStore(req,res))return res.status(403).json({error:'Bu istek güvenlik nedeniyle reddedildi.',code:'ORIGIN_DENIED'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const sql=getSql();await ensureSchema(sql);
    const body=req.body||{},action=String(body.action||'');

    if(action==='register'){
      const name=String(body.name||'').trim(),username=String(body.username||'').trim();
      const email=norm(body.email),password=String(body.password||'');
      if(!await recordFailure(sql,'register-ip',clientIp(req),12))return res.status(429).json({error:'Çok fazla kayıt denemesi yapıldı. 15 dakika sonra yeniden deneyin.',code:'RATE_LIMITED'});
      if(!name||name.length>120||!username||username.length<3||username.length>40||!email||email.length>254||password.length<8)return res.status(400).json({error:'Bilgileri eksiksiz girin. Şifre en az 8 karakter olmalıdır.'});
      if(!/^[\p{L}\p{N}._-]+$/u.test(username))return res.status(400).json({error:'Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.'});
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Geçerli bir e-posta gir.'});
      const exists=await sql`SELECT id,approved,blocked FROM cephepro_users WHERE lower(username)=lower(${username}) OR lower(email)=lower(${email}) LIMIT 1`;
      if(exists.length){
        if(exists[0].blocked)return res.status(403).json({error:'Bu hesabın siteye giriş yetkisi kapatılmış.',code:'BLOCKED'});
        if(exists[0].approved===false){
          await sql`UPDATE cephepro_users SET approval_request_visible=true,requested_at=now(),updated_at=now() WHERE id=${String(exists[0].id)}`;
          return res.status(403).json({error:'Giriş talebiniz yönetici onayı bekliyor.',code:'PENDING'});
        }
        return res.status(409).json({error:'Kullanıcı adı veya e-posta zaten kayıtlı.'});
      }
      const c=await sql`SELECT count(*)::int AS n FROM cephepro_users`;
      const first=Number(c[0]?.n||0)===0;
      if(first&&email!==MASTER_EMAIL)return res.status(403).json({error:'Önce kurucu Admin hesabı giriş yapmalıdır.',code:'OWNER_FIRST'});
      const id=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(password,salt);
      const owner=email===MASTER_EMAIL,role=owner?'admin':'member',approved=owner;
      const rows=await sql`INSERT INTO cephepro_users(id,name,username,email,password_hash,password_salt,role,approved,blocked,requested_at)
        VALUES(${id},${name},${username},${email},${hash},${salt},${role},${approved},false,now())
        RETURNING id,name,username,email,role,approved,blocked,profile_data`;
      if(!approved)return res.status(202).json({pending:true,user:publicUser(rows[0]),message:'Kayıt yapıldı. Siteye giriş izni bekleniyor.'});
      const token=await newSession(sql,id);await logActivity(sql,rows[0],'account','Kurucu Admin hesabı oluşturuldu.');
      return res.status(200).json({user:publicUser(rows[0]),token});
    }

    if(action==='login'){
      const login=norm(body.login),password=String(body.password||'');
      const c=await sql`SELECT count(*)::int AS n FROM cephepro_users`;
      if(Number(c[0]?.n||0)===0)return res.status(404).json({error:'Henüz bulut hesabı yok.',code:'NO_USERS'});
      const rows=await sql`SELECT id,name,username,email,role,password_hash,password_salt,approved,blocked,profile_data,approval_notice_pending,unblock_notice_pending,access_unlimited,access_expires_at,approval_request_visible FROM cephepro_users
                           WHERE lower(username)=${login} OR lower(email)=${login} LIMIT 1`;
      const u=rows[0];
      if(!u||!safeEqualHex(passwordHash(password,u.password_salt),u.password_hash)){
        const ipOk=await recordFailure(sql,'login-ip',clientIp(req),40),accountOk=await recordFailure(sql,'login-account',login,12);
        if(!ipOk||!accountOk)return res.status(429).json({error:'Çok fazla hatalı giriş denemesi yapıldı. 15 dakika sonra yeniden deneyin.',code:'RATE_LIMITED'});
        return res.status(401).json({error:'E-posta/kullanıcı adı veya şifre hatalı.',code:'INVALID_LOGIN'});
      }
      await clearFailures(sql,'login-account',login);
      if(isOwner(u)){
        await sql`UPDATE cephepro_users SET role='admin',approved=true,blocked=false,access_unlimited=true,access_expires_at=null,approval_request_visible=false,updated_at=now() WHERE id=${String(u.id)}`;
        u.role='admin';u.approved=true;u.blocked=false;u.access_unlimited=true;u.access_expires_at=null;
      }
      if(u.blocked)return res.status(403).json({error:'Girişinize izin verilmedi. Yönetici hesabınıza izin verene kadar giriş yapamazsınız.',code:'BLOCKED'});
      if(!u.access_unlimited&&u.access_expires_at&&new Date(u.access_expires_at).getTime()<=Date.now()){
        await sql`UPDATE cephepro_users SET approved=false,approval_notice_pending=false,approval_request_visible=true,requested_at=now(),updated_at=now() WHERE id=${String(u.id)}`;
        await sql`DELETE FROM cephepro_sessions WHERE user_id=${String(u.id)}`;
        return res.status(403).json({error:'Giriş süreniz doldu. Siteye giriş izni bekleniyor.',code:'PENDING'});
      }
      if(u.approved===false){
        if(body.poll!==true)await sql`UPDATE cephepro_users SET approval_request_visible=true,requested_at=now(),updated_at=now() WHERE id=${String(u.id)}`;
        return res.status(403).json({error:'Siteye giriş izni bekleniyor.',code:'PENDING'});
      }
      const notice=(u.approval_notice_pending||u.unblock_notice_pending)?'Giriş izni verildi.':'';
      if(notice)await sql`UPDATE cephepro_users SET approval_notice_pending=false,unblock_notice_pending=false,updated_at=now() WHERE id=${String(u.id)}`;
      const token=await newSession(sql,u.id);return res.status(200).json({user:publicUser(u),token,notice});
    }

    const token=bearer(req),me=await sessionUser(sql,token);
    if(!me){
      if(token){
        const access=await sql`SELECT u.id,u.blocked,u.approved,u.access_unlimited,u.access_expires_at FROM cephepro_sessions s JOIN cephepro_users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} LIMIT 1`;
        if(access[0]?.blocked){
          await sql`DELETE FROM cephepro_sessions WHERE token_hash=${tokenHash(token)}`;
          return res.status(403).json({error:'Girişinize izin verilmedi. Yönetici hesabınıza izin verene kadar giriş yapamazsınız.',code:'BLOCKED'});
        }
        if(access[0]&&!access[0].access_unlimited&&access[0].access_expires_at&&new Date(access[0].access_expires_at).getTime()<=Date.now()){
          await sql`UPDATE cephepro_users SET approved=false,approval_notice_pending=false,approval_request_visible=true,requested_at=now(),updated_at=now() WHERE id=${String(access[0].id)}`;
          await sql`DELETE FROM cephepro_sessions WHERE user_id=${String(access[0].id)}`;
          return res.status(403).json({error:'Giriş süreniz doldu. Siteye giriş izni bekleniyor.',code:'PENDING'});
        }
        if(access[0]?.approved===false)return res.status(403).json({error:'Siteye giriş izni bekleniyor.',code:'PENDING'});
      }
      return res.status(401).json({error:'Oturum geçersiz. Yeniden giriş yapın.',code:'INVALID_SESSION'});
    }

    if(action==='me'){
      await sql`UPDATE cephepro_sessions SET expires_at=now()+(${30}::text||' days')::interval WHERE token_hash=${tokenHash(token)}`;
      return res.status(200).json({user:publicUser(me),sessionSlidingDays:30});
    }
    if(action==='logout'){await sql`DELETE FROM cephepro_sessions WHERE token_hash=${tokenHash(token)}`;return res.status(200).json({ok:true});}

    if(action==='profile'){
      const name=String(body.name||me.name).trim(),username=String(body.username||me.username).trim(),email=norm(body.email||me.email);
      const profileData=(body.profileData&&typeof body.profileData==='object'&&!Array.isArray(body.profileData))?body.profileData:{};
      if(!name||!username||!email)return res.status(400).json({error:'Profil bilgileri eksik.'});
      if(!isOwner(me)&&email===MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin e-posta adresi kullanılamaz.'});
      if(isOwner(me)&&email!==MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin e-posta adresi değiştirilemez.'});
      const dup=await sql`SELECT id FROM cephepro_users WHERE id<>${String(me.id)} AND (lower(username)=lower(${username}) OR lower(email)=lower(${email})) LIMIT 1`;
      if(dup.length)return res.status(409).json({error:'Kullanıcı adı veya e-posta başka bir hesapta kullanılıyor.'});
      const rows=await sql`UPDATE cephepro_users SET name=${name},username=${username},email=${email},profile_data=${JSON.stringify(profileData)}::jsonb,updated_at=now() WHERE id=${String(me.id)} RETURNING id,name,username,email,role,approved,blocked,profile_data`;
      await logActivity(sql,rows[0],'profile','Kişisel hesap bilgilerini güncelledi.');
      return res.status(200).json({user:publicUser(rows[0])});
    }

    if(action==='change_password'){
      const currentPassword=String(body.currentPassword||''),newPassword=String(body.newPassword||'');
      if(newPassword.length<8)return res.status(400).json({error:'Yeni şifre en az 8 karakter olmalıdır.'});
      const rows=await sql`SELECT password_hash,password_salt FROM cephepro_users WHERE id=${String(me.id)} LIMIT 1`;
      if(!rows[0]||!safeEqualHex(passwordHash(currentPassword,rows[0].password_salt),rows[0].password_hash))return res.status(403).json({error:'Mevcut şifre yanlış.',code:'INVALID_PASSWORD'});
      if(safeEqualHex(passwordHash(newPassword,rows[0].password_salt),rows[0].password_hash))return res.status(400).json({error:'Yeni şifre mevcut şifreden farklı olmalıdır.'});
      const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(newPassword,salt);
      await sql`UPDATE cephepro_users SET password_hash=${hash},password_salt=${salt},updated_at=now() WHERE id=${String(me.id)}`;
      await sql`DELETE FROM cephepro_sessions WHERE user_id=${String(me.id)} AND token_hash<>${tokenHash(token)}`;
      await logActivity(sql,me,'account','Hesap şifresini değiştirdi.');
      return res.status(200).json({ok:true});
    }

    // Expired access returns to the approval queue even without a login attempt.
    if((action==='list'||action==='list_pending')&&me.role==='admin'){
      await sql`UPDATE cephepro_users SET approved=false,approval_request_visible=true,approval_notice_pending=false,requested_at=access_expires_at,updated_at=now()
        WHERE approved=true AND blocked=false AND access_unlimited=false AND access_expires_at<=now() AND lower(email)<>${MASTER_EMAIL}`;
    }

    if(action==='list'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      // Engellenen hesap approved=false olur; yönetici listesinde tutulmazsa
      // ok menüsündeki “İzin Ver” işlemi bir daha kullanılamaz. Bu nedenle
      // onaylı ve engellenmiş hesaplar birlikte döndürülür.
      const rows=await sql`SELECT id,name,username,email,role,approved,blocked,profile_data,access_unlimited,access_expires_at,created_at FROM cephepro_users WHERE approved=true OR blocked=true ORDER BY blocked ASC,created_at ASC`;
      return res.status(200).json({users:rows.map(r=>{const u=publicUser(r);if(String(r.id)!==String(me.id))delete u.profileData;return u;})});
    }
    if(action==='list_pending'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const rows=await sql`SELECT id,name,username,email,role,approved,blocked,profile_data,access_unlimited,access_expires_at,requested_at FROM cephepro_users WHERE approved=false AND blocked=false AND approval_request_visible=true ORDER BY requested_at ASC`;
      return res.status(200).json({requests:rows.map(r=>({...publicUser(r),createdAt:r.requested_at}))});
    }
    if(action==='approve'||action==='reject'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const userId=String(body.userId||'');
      if(action==='approve'){
        const rows=await sql`UPDATE cephepro_users SET approved=true,blocked=false,access_unlimited=true,access_expires_at=null,approval_request_visible=false,approval_notice_pending=true,unblock_notice_pending=false,updated_at=now() WHERE id=${userId} AND approved=false RETURNING id,name,username,email,role,approved,blocked`;
        if(rows[0])await logActivity(sql,me,'user_admin',`${rows[0].name} kullanıcısının site giriş talebini onayladı.`,{targetUserId:userId});
      }else{
        const rows=await sql`UPDATE cephepro_users SET approved=false,approval_request_visible=false,updated_at=now() WHERE id=${userId} AND approved=false RETURNING name`;
        if(rows[0])await logActivity(sql,me,'user_admin',`${rows[0].name} kullanıcısının giriş talebini reddetti.`,{targetUserId:userId});
      }
      return res.status(200).json({ok:true});
    }
    if(action==='role'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const userId=String(body.userId||''),role=body.role==='admin'?'admin':'member';
      const target=await sql`SELECT email,name,role FROM cephepro_users WHERE id=${userId} LIMIT 1`;
      if(!target[0])return res.status(404).json({error:'Kullanıcı bulunamadı.'});
      if(norm(target[0].email)===MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin rolü değiştirilemez.'});
      if(!isOwner(me)&&target[0].role==='admin')return res.status(403).json({error:'Admin hesaplarını yalnızca Kurucu Admin Üye yapabilir.'});
      const changed=await sql`UPDATE cephepro_users SET role=${role},updated_at=now() WHERE id=${userId} RETURNING id,name,username,email,role,approved,blocked,profile_data,access_unlimited,access_expires_at`;
      await logActivity(sql,me,'user_admin',`${target[0].name} rolünü ${role==='admin'?'Admin':'Üye'} yaptı.`,{targetUserId:userId});
      return res.status(200).json({ok:true,user:publicUser(changed[0]),permissionsChanged:true});
    }
    if(action==='block'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const userId=String(body.userId||''),blocked=!!body.blocked;
      const target=await sql`SELECT email,name,role FROM cephepro_users WHERE id=${userId} LIMIT 1`;
      if(!target[0])return res.status(404).json({error:'Kullanıcı bulunamadı.'});
      if(norm(target[0].email)===MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin erişimi kapatılamaz.'});
      if(!isOwner(me)&&target[0].role==='admin')return res.status(403).json({error:'Admin hesaplarını yalnızca Kurucu Admin yönetebilir.'});
      if(blocked){
        await sql`UPDATE cephepro_users SET blocked=true,approved=false,approval_request_visible=false,unblock_notice_pending=false,updated_at=now() WHERE id=${userId}`;
      }else{
        await sql`UPDATE cephepro_users SET blocked=false,approved=true,approval_request_visible=false,unblock_notice_pending=true,access_unlimited=CASE WHEN access_expires_at IS NOT NULL AND access_expires_at<=now() THEN true ELSE access_unlimited END,access_expires_at=CASE WHEN access_expires_at IS NOT NULL AND access_expires_at<=now() THEN null ELSE access_expires_at END,updated_at=now() WHERE id=${userId}`;
      }
      if(blocked)await sql`DELETE FROM cephepro_sessions WHERE user_id=${userId}`;
      await logActivity(sql,me,'user_admin',`${target[0].name} için site erişimini ${blocked?'kapattı':'açtı'}.`,{targetUserId:userId});
      return res.status(200).json({ok:true,blocked,accessRevoked:blocked});
    }
    if(action==='duration'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const userId=String(body.userId||''),unlimited=body.unlimited===true;
      const days=Math.max(1,Math.min(3650,Math.floor(Number(body.days)||1)));
      const target=await sql`SELECT email,name,role FROM cephepro_users WHERE id=${userId} LIMIT 1`;
      if(!target[0])return res.status(404).json({error:'Kullanıcı bulunamadı.'});
      if(norm(target[0].email)===MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin erişimi süresizdir.'});
      if(!isOwner(me)&&target[0].role==='admin')return res.status(403).json({error:'Admin hesaplarını yalnızca Kurucu Admin yönetebilir.'});
      if(unlimited)await sql`UPDATE cephepro_users SET access_unlimited=true,access_expires_at=null,approved=true,blocked=false,approval_request_visible=false,unblock_notice_pending=true,updated_at=now() WHERE id=${userId}`;
      else await sql`UPDATE cephepro_users SET access_unlimited=false,access_expires_at=now()+(${days}::text||' days')::interval,approved=true,blocked=false,approval_request_visible=false,unblock_notice_pending=true,updated_at=now() WHERE id=${userId}`;
      await logActivity(sql,me,'user_admin',`${target[0].name} giriş süresini ${unlimited?'süresiz':days+' gün'} yaptı.`,{targetUserId:userId,days:unlimited?null:days});
      return res.status(200).json({ok:true});
    }
    if(action==='delete_user'){
      if(me.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli.'});
      const userId=String(body.userId||'');
      const target=await sql`SELECT email,name,role FROM cephepro_users WHERE id=${userId} LIMIT 1`;
      if(!target[0])return res.status(404).json({error:'Kullanıcı bulunamadı.'});
      if(norm(target[0].email)===MASTER_EMAIL)return res.status(403).json({error:'Kurucu Admin hesabı silinemez.'});
      if(!isOwner(me)&&target[0].role==='admin')return res.status(403).json({error:'Admin hesaplarını yalnızca Kurucu Admin silebilir.'});
      await logActivity(sql,me,'user_admin',`${target[0].name} hesabını sildi.`,{targetUserId:userId});
      await sql`DELETE FROM cephepro_sessions WHERE user_id=${userId}`;
      await sql`DELETE FROM cephepro_daily_activity_snapshots WHERE user_id=${userId}`;
      await sql`DELETE FROM cephepro_photos WHERE owner_user_id=${userId}`;
      await sql`DELETE FROM cephepro_users WHERE id=${userId}`;
      return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Bilinmeyen işlem.'});
  }catch(err){
    console.error(err);const msg=String(err?.message||'');
    if(msg.includes('DATABASE_URL is not configured'))return res.status(503).json({error:'Veritabanı bağlantısı yapılandırılmamış.',code:'DB_NOT_CONFIGURED'});
    return res.status(503).json({error:'Bulut veritabanına ulaşılamıyor.',code:'DB_UNAVAILABLE'});
  }
}
