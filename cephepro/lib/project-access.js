import {tokenHash} from './authutil.js';

export async function projectAccess(sql,req,me){
 const token=String(req.headers?.['x-project-token']||'');
 const auth=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!me||!token||!auth)return null;
 const [project]=await sql`SELECT p.project_key,p.name,p.company_code,p.project_code,p.owner_id,p.access_version
  FROM cephepro_project_sessions s JOIN cephepro_projects p ON p.project_key=s.project_key
  WHERE s.token_hash=${tokenHash(token)} AND s.auth_token_hash=${tokenHash(auth)}
   AND s.user_id=${String(me.id)} AND s.expires_at>now() AND s.access_version=p.access_version
   AND p.deleted_at IS NULL AND p.password_hash IS NOT NULL`;
 return project||null;
}
export async function requireProject(sql,req,me,res){
 const project=await projectAccess(sql,req,me);
 if(!project){res.status(403).json({error:'Firma kodu, proje kodu ve proje şifresi ile giriş yapın.',code:'PROJECT_LOCKED'});return false;}
 me.projectId=project.project_key;me.projectName=project.name;
 return true;
}
