import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import vm from 'node:vm';
import {MASTER_EMAIL,sessionUser,newSession,logActivity,passwordHash,tokenHash} from '../../lib/authutil.js';
export async function database(t){
 const db=new PGlite();t.after(()=>db.close());
 const sql=(strings,...values)=>{const q=strings.reduce((out,part,i)=>out+part+(i<values.length?'$'+(i+1):''),'');return db.query(q,values).then(r=>r.rows);};
 sql.transaction=promises=>Promise.all(promises);
 // Execute the current additive schema against a fresh PostgreSQL engine.
 const source=fs.readFileSync(new URL('../../lib/schema.js',import.meta.url),'utf8');
 await vm.runInNewContext(source.slice(source.indexOf('async function initializeSchema'))+';initializeSchema(sql)',{sql});
 const people=[['founder','admin',MASTER_EMAIL],['admin-a','admin','admin-a@example.invalid'],['admin-b','admin','admin-b@example.invalid'],['member-a','member','member-a@example.invalid'],['member-b','member','member-b@example.invalid']];
 const sessions={};
 for(const[id,role,email]of people){await sql`INSERT INTO cephepro_users(id,name,username,email,role,password_hash,password_salt,profile_data) VALUES(${id},${'User '+id},${id},${email},${role},${passwordHash('SYNTHETIC-password','test-salt')},'test-salt',${JSON.stringify({phone:'PRIVATE-'+id})}::jsonb)`;sessions[id]=await newSession(sql,id);}
 await sql`UPDATE cephepro_projects SET company_code='TEST',project_code='MAIN',password_hash=${passwordHash('SYNTHETIC-project','test-project-salt')},password_salt='test-project-salt',owner_id='founder' WHERE project_key='main'`;
 const projectTokens={};
 for(const[id]of people){projectTokens[id]='project-'+sessions[id];await sql`INSERT INTO cephepro_project_members(project_key,user_id) VALUES('main',${id}) ON CONFLICT DO NOTHING`;await sql`INSERT INTO cephepro_project_sessions(token_hash,auth_token_hash,user_id,project_key,access_version,expires_at) VALUES(${tokenHash(projectTokens[id])},${tokenHash(sessions[id])},${id},'main',1,now()+interval '12 hours')`;}
 const deps={getSql:()=>sql,noStore:()=>true,bearer:req=>req.headers.authorization,ensureSchema:async()=>{},sessionUser,newSession,logActivity};
 async function call(handler,method,user,body,query={year:'2026'},headers={}){const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;},end(){return this;}};await handler({method,headers:{authorization:sessions[user]||'',host:'test.invalid','x-project-token':projectTokens[user]||'',...headers},body,query},res);return res;}
 return {db,sql,deps,call,sessions,projectTokens};
}
