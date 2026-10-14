import {noStore} from '../lib/db.js';
// Retired paid endpoint. Even a stale environment flag cannot start a billable request.
export function createTranslationHandler(deps={noStore}){return async(req,res)=>{
 if(!deps.noStore(req,res))return res.status(403).json({code:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).json({code:'METHOD_NOT_ALLOWED'});
 return res.status(410).json({code:'TRANSLATION_BROWSER_ONLY',error:'Ücretsiz çeviri tarayıcıda çalışır. Sayfayı yenileyin.'});
};}
export default createTranslationHandler();
