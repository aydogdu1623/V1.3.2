import crypto from 'node:crypto';
import {getSql,noStore,bearer} from '../lib/db.js';
import {ensureSchema} from '../lib/schema.js';
import {sessionUser,logActivity} from '../lib/authutil.js';
import {requireProject} from '../lib/project-access.js';
import {validateMap,emptyMap,catalogFromState,validateBindings,setSourceProgress,validateGlb,error} from '../lib/site-map.js';
export function createSiteMapHandler(deps){
 const {getSql,noStore,bearer,ensureSchema,sessionUser,logActivity}=deps;
 const config=deps.config||(()=>({url:process.env.CAD_SERVICE_URL,key:process.env.CAD_SERVICE_KEY}));
 const request=deps.fetch||fetch;
 return async(req,res)=>{
  if(!noStore(req,res))return res.status(403).json({error:'İstek kaynağı reddedildi.'});
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
   const sql=getSql();await ensureSchema(sql);const me=await sessionUser(sql,bearer(req));
   if(!me)return res.status(401).json({error:'Oturum açın.'});if(!await requireProject(sql,req,me,res))return;
   const b=req.body||{},conf=config(),cadReady=!!conf.url&&!!conf.key;
   const proxy=async(path,body)=>{
    if(!cadReady)throw error(503,'DWG işleme servisi henüz bağlı değil. DXF veya GeoJSON yükleyebilirsiniz.');
    const url=new URL(conf.url);if(url.protocol!=='https:'&&process.env.NODE_ENV==='production')throw error(503,'CAD servisinde HTTPS gerekli.');
    const response=await request(new URL(path,url),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+conf.key,'Content-Type':'application/json','X-Project-Id':me.projectId},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(22000),redirect:'error'});
    const data=await response.json();if(!response.ok)throw error(response.status,data.error||data.detail||'CAD işlemi tamamlanamadı.');return data;
   };
   if(req.method==='GET'&&req.query?.job){if(me.role!=='admin')throw error(403,'Yönetici yetkisi gerekli.');if(!/^[a-f0-9]{32}$/.test(req.query.job))throw error(400,'İş kimliği geçersiz.');return res.status(200).json(await proxy('/jobs/'+req.query.job));}
   if(req.method==='GET'&&req.query?.model){
    if(!/^[a-f0-9-]{36}$/.test(req.query.model))throw error(400,'Model kimliği geçersiz.');
    const [row]=await sql`SELECT data FROM cephepro_site_models WHERE project_key=${me.projectId} AND id=${req.query.model}`;
    if(!row)throw error(404,'Model bulunamadı.');res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Cache-Control','no-store');return res.status(200).send(Buffer.from(row.data,'base64'));
   }
   if(req.method==='POST'&&String(b.action).startsWith('upload-')){
    if(me.role!=='admin')throw error(403,'Çizim yüklemek için yönetici yetkisi gerekli.');
    const paths={'upload-start':'/uploads','upload-chunk':'/uploads/chunk','upload-finish':'/uploads/finish'};
    if(!paths[b.action])throw error(400,'Yükleme işlemi geçersiz.');
    if(b.action==='upload-start'&&(!/\.(dwg|dxf)$/i.test(b.name||'')||!Number.isInteger(b.size)||b.size<1||b.size>40_000_000))throw error(400,'DWG/DXF dosyası en fazla 40 MB olabilir.');
    if(b.action!=='upload-start'&&!/^[a-f0-9]{32}$/.test(b.id||''))throw error(400,'Yükleme kimliği geçersiz.');
    if(b.action==='upload-chunk'&&(typeof b.data!=='string'||b.data.length>1_400_000))throw error(413,'Yükleme parçası çok büyük.');
    return res.status(200).json(await proxy(paths[b.action],b));
   }
   if(req.method==='POST'&&b.action==='model'){
    if(me.role!=='admin')throw error(403,'Model yüklemek için yönetici yetkisi gerekli.');
    const buffer=validateGlb(b.data),id=crypto.randomUUID();
    // Compact GLB files live in this project only. Large BIM models use object storage in the documented extension.
    const [count]=await sql`SELECT count(*)::int AS n FROM cephepro_site_models WHERE project_key=${me.projectId}`;
    if(count.n>=100)throw error(413,'Proje model sınırına ulaşıldı (100).');
    await sql`INSERT INTO cephepro_site_models(project_key,id,data) VALUES(${me.projectId},${id},${buffer.toString('base64')})`;
    return res.status(201).json({id});
   }
   const [saved]=await sql`SELECT data,revision FROM cephepro_site_maps WHERE project_key=${me.projectId}`;
   const [project]=await sql`SELECT state,revision FROM cephepro_project_state WHERE project_key=${me.projectId}`;
   const state=project?.state||{},revision=Number(saved?.revision||0),projectRevision=Number(project?.revision||0),map=saved?.data||emptyMap();
   if(req.method==='GET')return res.status(200).json({map,revision,projectRevision,catalog:catalogFromState(state),canManage:me.role==='admin',cadReady});
   if(!['PUT','PATCH'].includes(req.method))return res.status(405).json({error:'Yöntem desteklenmiyor.'});
   if(b.revision!==revision)throw error(409,'Harita başka cihazda değişti. Yenileyip tekrar deneyin.');
   if(req.method==='PUT'){
    if(me.role!=='admin')throw error(403,'Harita düzenlemek için yönetici yetkisi gerekli.');
    const next=validateMap(b.map);validateBindings(next,state);
    for(const f of next.features)if(f.modelId){const [model]=await sql`SELECT id FROM cephepro_site_models WHERE project_key=${me.projectId} AND id=${f.modelId}`;if(!model)throw error(400,'Model bu projeye ait değil.');}
    if(Buffer.byteLength(JSON.stringify(next))>3_000_000)throw error(413,'Haritayı sadeleştirin (en fazla 3 MB).');
    const rows=await sql`INSERT INTO cephepro_site_maps(project_key,data,revision) VALUES(${me.projectId},${JSON.stringify(next)}::jsonb,1) ON CONFLICT(project_key) DO UPDATE SET data=EXCLUDED.data,revision=cephepro_site_maps.revision+1,updated_at=now() WHERE cephepro_site_maps.revision=${revision} RETURNING revision`;
    if(!rows.length)throw error(409,'Harita başka cihazda değişti. Yenileyin.');
    await logActivity(sql,me,'site_map','Saha haritasını güncelledi.',{features:next.features.length});return res.status(200).json({ok:true,revision:Number(rows[0].revision)});
   }
   if(!Number.isFinite(b.progress)||b.progress<0||b.progress>100)throw error(400,'İlerleme 0–100 arasında olmalıdır.');
   const feature=map.features.find(f=>f.id===b.featureId),component=feature?.components.find(c=>c.id===b.componentId);
   if(!component)throw error(404,'İş kalemi eşleştirmesi bulunamadı.');
   if(component.source){
    if(b.projectRevision!==projectRevision)throw error(409,'İmalat başka cihazda değişti. Güncel veriyi kontrol edip tekrar deneyin.');
    const next=setSourceProgress(state,component.source,b.progress);
    const rows=await sql`UPDATE cephepro_project_state SET state=${JSON.stringify(next)}::jsonb,revision=revision+1,updated_at=now(),updated_by=${String(me.id)} WHERE project_key=${me.projectId} AND revision=${projectRevision} AND EXISTS(SELECT 1 FROM cephepro_site_maps WHERE project_key=${me.projectId} AND revision=${revision}) RETURNING revision`;
    if(!rows.length)throw error(409,'İmalat değişti. Yenileyin.');
   }else{
    if(me.role!=='admin')throw error(403,'Bağımsız harita iş kalemini yalnız yönetici düzenleyebilir.');
    component.progress=b.progress;
    const rows=await sql`UPDATE cephepro_site_maps SET data=${JSON.stringify(map)}::jsonb,revision=revision+1,updated_at=now() WHERE project_key=${me.projectId} AND revision=${revision} RETURNING revision`;
    if(!rows.length)throw error(409,'Harita değişti. Yenileyin.');
   }
   await logActivity(sql,me,'site_progress',`${feature.name} / ${component.label}: %${b.progress}`,{featureId:feature.id,componentId:component.id,progress:b.progress});
   return res.status(200).json({ok:true});
  }catch(e){if([400,401,403,404,409,413,429,503].includes(e.status))return res.status(e.status).json({error:e.message});console.error('[site-map]',e);return res.status(500).json({error:'Harita işlemi tamamlanamadı. Tekrar deneyin.'});}
 };
}
export default createSiteMapHandler({getSql,noStore,bearer,ensureSchema,sessionUser,logActivity});
