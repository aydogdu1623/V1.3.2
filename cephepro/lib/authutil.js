import crypto from 'node:crypto';

export const MASTER_EMAIL = 'aydogdu1623@gmail.com';
export const SESSION_DAYS = 30;

export function norm(v){ return String(v||'').trim().toLocaleLowerCase('tr-TR'); }
export function passwordHash(password,salt){ return crypto.scryptSync(String(password),String(salt),64).toString('hex'); }
export function tokenHash(token){ return crypto.createHash('sha256').update(String(token)).digest('hex'); }
export function safeEqualHex(a,b){
  try{const aa=Buffer.from(String(a),'hex'),bb=Buffer.from(String(b),'hex');return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}catch{return false}
}
export function publicUser(r){
  const owner=norm(r?.email)===MASTER_EMAIL;
  return {isFounder:owner,id:r.id,name:r.name,username:r.username,email:r.email,role:owner?'admin':r.role,blocked:owner?false:!!r.blocked,approved:owner?true:r.approved!==false,accessUnlimited:owner?true:r.access_unlimited!==false,accessExpiresAt:owner?null:(r.access_expires_at||null),profileData:r.profile_data||r.profileData||{}};
}
export async function sessionUser(sql,token){
  if(!token)return null;
  const h=tokenHash(token);
  const rows=await sql`
    SELECT u.id,u.name,u.username,u.email,u.role,u.blocked,u.approved,u.profile_data,u.access_unlimited,u.access_expires_at
    FROM cephepro_sessions s JOIN cephepro_users u ON u.id=s.user_id
    WHERE s.token_hash=${h} AND s.expires_at>now() LIMIT 1`;
  const u=rows[0]||null;
  if(u&&norm(u.email)===MASTER_EMAIL){
    await sql`UPDATE cephepro_users SET role='admin',approved=true,blocked=false,access_unlimited=true,access_expires_at=null,approval_request_visible=false,updated_at=now() WHERE id=${String(u.id)}`;
    u.role='admin';u.approved=true;u.blocked=false;u.access_unlimited=true;u.access_expires_at=null;
  }
  if(!u||u.blocked||u.approved===false||(!u.access_unlimited&&u.access_expires_at&&new Date(u.access_expires_at).getTime()<=Date.now()))return null;
  return u;
}
export async function newSession(sql,userId){
  const token=crypto.randomBytes(32).toString('hex'),h=tokenHash(token);
  await sql`INSERT INTO cephepro_sessions(token_hash,user_id,expires_at)
            VALUES(${h},${userId},now()+(${SESSION_DAYS}::text||' days')::interval)`;
  return token;
}
export async function logActivity(sql,me,actionType,summary,details={}){
  if(!summary)return;
  await sql`INSERT INTO cephepro_activity_log(user_id,user_name,username,role,action_type,summary,details)
            VALUES(${String(me?.id||'')},${String(me?.name||me?.username||'Kullanıcı')},${String(me?.username||'')},${String(me?.role||'member')},${String(actionType||'update')},${String(summary)},${JSON.stringify(details)}::jsonb)`;
}
