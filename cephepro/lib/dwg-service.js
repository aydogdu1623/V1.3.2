// Built-in private DWG backend. Indexed parts survive separate serverless invocations.
import {spawn} from 'node:child_process';
import {mkdtemp,open,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {CAD_CHUNK_BYTES as CHUNK,CAD_MAX_BYTES} from '../assets/site-map/cad-limits.js';
import {validateMap,error} from './site-map.js';
const dir=()=>process.cwd();
const bad=(s,m)=>{throw error(s,m);};
export async function decodePath(input,output,timeout=155000){
 const child=spawn(process.execPath,['--max-old-space-size=700',path.join(dir(),'lib/dwg-decode.mjs'),input,output],{cwd:dir(),env:{LANG:'C',TZ:'UTC'},stdio:'ignore'});
 let timer,timed=false;
 try{const code=await new Promise((resolve,reject)=>{timer=setTimeout(()=>{timed=true;child.kill('SIGKILL');},timeout);child.once('error',reject);child.once('close',resolve);});
  if(timed)bad(400,'DWG işleme süresi doldu. Daha az katman içeren bir çizim deneyin.');
  const data=await readFile(output,'utf8').then(JSON.parse).catch(()=>null);
  if(code!==0||!data||data.error)bad(400,data?.error||'DWG çözümlenemedi; dosya biçimini ve çizim karmaşıklığını kontrol edin.');
  return validateMap(data);
 }finally{clearTimeout(timer);}
}
let demoPromise;
export function dwgExample(){
 if(!demoPromise)demoPromise=(async()=>{const tmp=await mkdtemp(path.join(os.tmpdir(),'cp-example-'));
  try{return await decodePath(path.join(dir(),'examples/verification-polygon.dwg'),path.join(tmp,'map.json'),20000);}
  finally{await rm(tmp,{force:true,recursive:true});}
 })().catch(e=>{demoPromise=null;throw e;});
 return demoPromise;
}
async function sweep(sql){await sql`DELETE FROM cephepro_cad_jobs WHERE expires_at < now()`;}
let sweptAt=0;
export async function pruneExpiredCad(sql){
 if(Date.now()-sweptAt<300000)return;await sweep(sql);sweptAt=Date.now();
}
export async function runCad(sql,me,action,b,decode=decodePath){
 const project=me.projectId,owner=String(me.id);
 if(me.role!=='admin')bad(403,'Çizim yüklemek için yönetici yetkisi gerekli.');
 if(action==='upload-start'){
  if(!/\.dwg$/i.test(b.name||'')||typeof b.name!=='string'||b.name.length>200)bad(400,'DWG dosyası seçin.');
  if(!Number.isInteger(b.size)||b.size<6||b.size>CAD_MAX_BYTES)bad(413,'DWG en fazla 250 MB olabilir.');
  await sweep(sql);
  const [n]=await sql`SELECT count(*)::int AS n FROM cephepro_cad_jobs WHERE owner_id=${owner} AND created_at>now()-interval '1 hour'`;
  if(n.n>=20)bad(429,'Saatlik çizim yükleme sınırına ulaşıldı.');
  const id=randomBytes(16).toString('hex'),large=b.size>8_000_000;
  // Separate fixed slots bound total reserved input bytes even under concurrent starts.
  for(let slot=large?0:1;slot<(large?1:5);slot++){
   const rows=await sql`INSERT INTO cephepro_cad_jobs(id,project_key,owner_id,name,size,slot,expires_at) VALUES(${id},${project},${owner},${b.name},${b.size},${slot},now()+interval '15 minutes') ON CONFLICT DO NOTHING RETURNING id`;
   if(rows.length)return {id,status:'uploading',engine:'libredwg'};
  }
  bad(429,'Dönüştürücü meşgul. Devam eden yüklemenin bitmesini bekleyin.');
 }
 if(!/^[a-f0-9]{32}$/.test(b.id||''))bad(400,'İş kimliği geçersiz.');
 const [job]=await sql`SELECT id,size,name,status,reason FROM cephepro_cad_jobs WHERE id=${b.id} AND project_key=${project} AND owner_id=${owner} AND expires_at>now()`;
 if(!job)bad(404,'Yükleme bulunamadı veya süresi doldu.');
 if(action==='status'){if(job.status==='ready'){const [done]=await sql`SELECT result FROM cephepro_cad_jobs WHERE id=${job.id}`;return {id:job.id,status:'ready',map:done.result};}return {id:job.id,status:job.status,error:job.reason};}
 if(action==='upload-cancel'){
  await sql`WITH cancelled AS (UPDATE cephepro_cad_jobs SET status='cancelled',slot=NULL,expires_at=now()+interval '1 hour' WHERE id=${job.id} AND status='uploading' RETURNING id) DELETE FROM cephepro_cad_parts WHERE job_id IN (SELECT id FROM cancelled)`;return {ok:true};
 }
 if(action==='upload-chunk'){
  const expected=Math.min(CHUNK,Number(job.size)-CHUNK*b.index);
  if(job.status!=='uploading')bad(409,'Yükleme açık değil.');
  if(!Number.isInteger(b.index)||b.index<0||expected<=0||typeof b.data!=='string'||b.data.length!==4*Math.ceil(expected/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.data))bad(400,'DWG parçası geçersiz.');
  const raw=Buffer.from(b.data,'base64');if(raw.length!==expected)bad(400,'DWG parça boyutu hatalı.');
  if(b.index===0&&!/^AC\d{4}$/.test(raw.toString('ascii',0,6)))bad(400,'Seçilen dosyanın DWG başlığı geçersiz.');
  const [part]=await sql`WITH active AS (UPDATE cephepro_cad_jobs SET expires_at=now()+interval '15 minutes' WHERE id=${job.id} AND status='uploading' RETURNING id) INSERT INTO cephepro_cad_parts(job_id,idx,data)
    SELECT id,${b.index},decode(${b.data},'base64') FROM active
    ON CONFLICT(job_id,idx) DO UPDATE SET idx=EXCLUDED.idx WHERE cephepro_cad_parts.data=EXCLUDED.data RETURNING idx`;
  if(!part)bad(409,'Parça değişti veya yükleme tamamlandı.');return {ok:true};
 }
 if(action!=='upload-finish')bad(400,'Geçersiz DWG işlemi.');
 if(job.status!=='uploading')return runCad(sql,me,'status',b,decode);
 const claimed=await sql`UPDATE cephepro_cad_jobs SET status='processing',expires_at=now()+interval '10 minutes'
  WHERE id=${job.id} AND status='uploading' AND (SELECT coalesce(sum(octet_length(data)),0) FROM cephepro_cad_parts WHERE job_id=${job.id})=size RETURNING id`;
 if(!claimed.length)bad(409,'Çizim parçaları eksik veya işlem zaten başlatılmış.');
 let tmp;const endAt=Date.now()+245000;
 try{
  tmp=await mkdtemp(path.join(os.tmpdir(),'cp-dwg-'));const input=path.join(tmp,'input.dwg'),out=path.join(tmp,'plan.json'),file=await open(input,'wx',0o600);
  let total=0,expected=0;try{for(let idx=0;idx<Math.ceil(job.size/CHUNK);idx+=3){
   if(Date.now()>endAt-15000)bad(400,'DWG işleme süresi doldu. Tekrar deneyin.');
   const rows=await sql`SELECT idx,encode(data,'base64') AS bytes FROM cephepro_cad_parts WHERE job_id=${job.id} AND idx>=${idx} AND idx<${idx+3} ORDER BY idx`;
   for(const row of rows){if(row.idx!==expected++)bad(409,'Çizim parçaları eksik.');const data=Buffer.from(row.bytes,'base64');await file.writeFile(data);total+=data.length;}
  }}finally{await file.close();}
  if(total!==job.size)bad(409,'Çizim boyutu eşleşmedi.');
  const map=await decode(input,out,Math.min(155000,Math.max(1000,endAt-Date.now())));map.source.name=job.name;
  await sql.transaction([sql`DELETE FROM cephepro_cad_parts WHERE job_id=${job.id}`,sql`UPDATE cephepro_cad_jobs SET status='ready',slot=NULL,result=${JSON.stringify(map)}::jsonb,expires_at=now()+interval '1 hour' WHERE id=${job.id}`]);
  return {id:job.id,status:'ready',map};
 }catch(e){
  const reason=e.status?e.message:'DWG dönüşümü tamamlanamadı. Lütfen tekrar deneyin.';
  await sql.transaction([sql`DELETE FROM cephepro_cad_parts WHERE job_id=${job.id}`,sql`UPDATE cephepro_cad_jobs SET status='failed',slot=NULL,reason=${reason},expires_at=now()+interval '1 hour' WHERE id=${job.id}`]);
  throw error(e.status||503,reason);
 }finally{if(tmp)await rm(tmp,{force:true,recursive:true});}
}
