import {MASTER_EMAIL,norm} from './authutil.js';

export const isFounder=user=>norm(user?.email)===MASTER_EMAIL;
export const canDeleteUpload=(actor,owner)=>!!actor&&!!owner&&(isFounder(actor)||String(actor.id)===String(owner.id)||actor.role==='admin'&&!isFounder(owner)&&owner.role==='member');
export const turkeyDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function validWorkDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
 const stamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
