import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.CEPHEPRO_TEST_DATABASE_FILE)throw Error('An isolated test database file is required.');
process.env.DATABASE_URL=fs.readFileSync(process.env.CEPHEPRO_TEST_DATABASE_FILE,'utf8').trim();
// Tests must never run on the production endpoint.
const {getSql}=await import('../lib/db.js');
const {ensureSchema}=await import('../lib/schema.js');
const {newSession}=await import('../lib/authutil.js');
const {default:handler}=await import('../api/claims.js');
const sql=getSql();await ensureSchema(sql);
const tag='v201-test-'+crypto.randomUUID(),ids=[tag+'-a',tag+'-b',tag+'-m'],tokens=[];
let checks=0;
async function call(token,method='GET',query={},body,extraHeaders={}){
 const req={method,query,body,headers:{authorization:token?'Bearer '+token:'',host:'cephepro.test','x-forwarded-proto':'https',...extraHeaders}};
 const res={code:0,data:null,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this},end(){return this}};
 await handler(req,res);return res;
}
const expect=(actual,wanted)=>{assert.equal(actual,wanted);checks++};
try{
 for(let i=0;i<ids.length;i++){
  await sql`INSERT INTO cephepro_users(id,name,username,email,password_hash,password_salt,role,approved,blocked)
   VALUES(${ids[i]},${'Test '+i},${ids[i]},${ids[i]+'@example.invalid'},'unused','unused',${i===2?'member':'admin'},true,false)`;
  tokens.push(await newSession(sql,ids[i]));
 }
 expect((await call('')).code,401);expect((await call(tokens[2])).code,403);
 expect((await call(tokens[2],'GET',{list:'1'})).code,403);
 expect((await call(tokens[0],'GET',{},undefined,{origin:'https://untrusted.example'})).code,403);
 const p1={id:'p1',number:1,snapshot191:{rows:[{key:'A_GC2_Kopya__Glass',quantity:5,price:100}],info:{company:'Owner company'}},firmaReport199:{contract:[{key:'glass',contractPrice:100}]},info191:{advanceAmount:12}};
 const p2={id:'p2',number:2,extras:[{id:'extra-2',files:[{name:'note.txt',data:'data:text/plain;base64,dGVzdA=='}]}]};
 const data={firma:{periods190:[p1,p2],activePeriod190:'p2'},taseron:{periods190:[{id:'s1'}]}};
 const put=(token,revision,share=true,ownerId=ids[0])=>call(token,'PUT',{}, {data,revision,share,ownerId});
 expect((await put(tokens[0],0,false)).code,200);
 expect((await call(tokens[1],'GET',{owner:ids[0]})).code,404);
 expect((await call(tokens[1],'GET',{list:'1'})).data.records.some(x=>x.ownerId===ids[0]),false);
 expect((await put(tokens[0],1)).code,200);
 const shared=await call(tokens[1],'GET',{owner:ids[0]});expect(shared.code,200);expect(shared.data.readOnly,true);assert.deepEqual(shared.data.data,data);checks++;
 expect((await call(tokens[1],'GET',{list:'1'})).data.records.some(x=>x.ownerId===ids[0]),true);
 expect((await put(tokens[1],2)).code,403);expect((await put(tokens[2],2)).code,403);
 expect((await put(tokens[0],0)).code,409);expect((await put(tokens[0],1)).code,409);
 const results=await Promise.all([put(tokens[0],2),put(tokens[0],2)]);assert.deepEqual(results.map(x=>x.code).sort(),[200,409]);checks++;
 expect((await call(tokens[1],'DELETE',{}, {ownerId:ids[0],kind:'firma',periodId:'p1',revision:3})).code,403);
 expect((await call(tokens[0],'DELETE',{}, {kind:'firma',periodId:'p1',revision:2})).code,409);
 expect((await call(tokens[0],'DELETE',{}, {kind:'firma',periodId:'p1',revision:3})).code,200);
 const deleted=(await call(tokens[1],'GET',{owner:ids[0]})).data;
 expect(deleted.revision,4);assert.deepEqual(deleted.data.firma.periods190,[p2]);checks++;
 assert.deepEqual(deleted.data.taseron,data.taseron);checks++;
 expect((await call(tokens[0],'DELETE',{}, {kind:'firma',periodId:'p2',revision:4})).code,409);
 console.log(JSON.stringify({passed:checks,transport:'actual Neon HTTP queries',scope:'isolated test database, synthetic users',productionWrites:0},null,2));
}finally{
 // Only the synthetic rows created by this run are cleaned up.
 for(const id of ids){await sql`DELETE FROM cephepro_claims WHERE owner_id=${id}`;await sql`DELETE FROM cephepro_sessions WHERE user_id=${id}`;await sql`DELETE FROM cephepro_users WHERE id=${id}`;}
}
