import {getSql,noStore,bearer} from '../lib/db.js';
import {ensureSchema} from '../lib/schema.js';
import {sessionUser} from '../lib/authutil.js';
import {requireProject} from '../lib/project-access.js';
import {validateTranslation,translateForProject} from '../lib/translation.js';
export function createTranslationHandler(deps={getSql,noStore,bearer,ensureSchema,sessionUser,requireProject,translateForProject,translationEnabled:()=>process.env.CEPHEPRO_TRANSLATION_ENABLED==='true'}){return async(req,res)=>{
 if(!deps.noStore(req,res))return res.status(403).json({code:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).json({code:'METHOD_NOT_ALLOWED'});
 try{
  let body;try{body=validateTranslation(typeof req.body==='string'?JSON.parse(req.body):req.body);}catch{return res.status(400).json({code:'INVALID_TRANSLATION'});}
  const sql=deps.getSql();await deps.ensureSchema(sql);
  const me=await deps.sessionUser(sql,deps.bearer(req));if(!me)return res.status(401).json({code:'SESSION_EXPIRED'});
  if(!await deps.requireProject(sql,req,me,res))return;
  if(!deps.translationEnabled?.())return res.status(503).json({code:'TRANSLATION_SETUP_REQUIRED',error:'Otomatik çeviri bağlantısı henüz etkin değil.'});
  const translations=await deps.translateForProject(sql,me,body.texts,body.language);
  return res.status(200).json({language:body.language,translations});
 }catch(e){const code=String(e?.message||'').startsWith('TRANSLATION_')?e.message:'TRANSLATION_UNAVAILABLE';return res.status(code==='TRANSLATION_RATE_LIMIT'?429:503).json({code,error:'Otomatik çeviri tamamlanamadı. Tekrar deneyin; asıl kayıtlarınız korunuyor.'});}
};}
export default createTranslationHandler();
