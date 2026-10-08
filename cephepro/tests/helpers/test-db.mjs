import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import vm from 'node:vm';
import {MASTER_EMAIL,sessionUser,newSession,logActivity,passwordHash} from '../../lib/authutil.js';
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
 const deps={getSql:()=>sql,noStore:()=>true,bearer:req=>req.headers.authorization,ensureSchema:async()=>{},sessionUser,newSession,logActivity};
 async function call(handler,method,user,body,query={year:'2026'}){const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;},end(){return this;}};await handler({method,headers:{authorization:sessions[user]||'',host:'test.invalid'},body,query},res);return res;}
 return {db,sql,deps,call,sessions};
}
