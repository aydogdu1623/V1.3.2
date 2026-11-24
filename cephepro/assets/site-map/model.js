// Shared browser/server contract. Coordinates are local CAD XY, never implied GPS.
export const KINDS=['building','road','landscape','water','boundary'];
export const PARTS=['foundation','walls','roof','facade','pool','landscape'];
export const COLORS={not_started:'#8b9a9c',in_progress:'#e6aa36',completed:'#259677'};
export const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
export const status=p=>p>=100?'completed':p>0?'in_progress':'not_started';
export const keyOf=s=>JSON.stringify([s.block,s.facade,s.item]);
const fail=m=>{throw Object.assign(new Error(m),{status:400});};
const str=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=v=>/^[a-zA-Z0-9_-]{1,100}$/.test(v||'')?v:fail('Geçersiz harita kimliği.');
export function emptyMap(){return {schemaVersion:1,units:'m',features:[],source:{format:'manual',mode:'manual'}};}
export function validateMap(input){
 if(!input||input.schemaVersion!==1||!Array.isArray(input.features)||input.features.length>2000)fail('Harita biçimi veya blok sayısı geçersiz.');
 let points=0;const ids=new Set();
 const features=input.features.map(f=>{
  if(!f||typeof f!=='object')fail('Harita şekli geçersiz.');
  const fid=id(f.id);if(ids.has(fid))fail('Harita kimliği tekrarlanıyor.');ids.add(fid);
  if(!KINDS.includes(f.kind)||!['Polygon','LineString'].includes(f.geometry?.type))fail('Harita geometrisi geçersiz.');
  const rings=f.geometry.type==='Polygon'?f.geometry.coordinates:[f.geometry.coordinates];
  if(!Array.isArray(rings)||!rings.length||rings.length>30)fail('Koordinat listesi geçersiz.');
  const coords=rings.map(r=>{
   if(!Array.isArray(r)||r.length<(f.geometry.type==='Polygon'?4:2))fail('Dış hat en az üç köşe içermelidir.');
   points+=r.length;if(points>100000)fail('Çizim çok ayrıntılı. Önce sadeleştirin.');
   const p=r.map(x=>{if(!Array.isArray(x)||x.length<2||!x.slice(0,2).every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))fail('Koordinat değeri geçersiz.');return x.slice(0,2);});
   if(f.geometry.type==='Polygon'&&(p[0][0]!==p.at(-1)[0]||p[0][1]!==p.at(-1)[1]))fail('Blok dış hattı kapalı olmalıdır.');return p;
  });
  if(f.kind==='building'&&f.geometry.type!=='Polygon')fail('Blok dış hattı poligon olmalıdır.');
  const cids=new Set();if(!Array.isArray(f.components||[])||(f.components||[]).length>200)fail('İş kalemi sayısı geçersiz.');
  const components=(f.components||[]).map(c=>{
   if(!c||typeof c!=='object')fail('İş kalemi geçersiz.');
   const cid=id(c.id);if(cids.has(cid))fail('İş kalemi kimliği tekrarlanıyor.');cids.add(cid);
   const source=c.source?{block:str(c.source.block),facade:str(c.source.facade),item:str(c.source.item,300)}:null;
   if(source&&(!source.block||!source.facade||!source.item))fail('İş kalemi bağlantısı eksik.');
   if(!Number.isFinite(c.progress)||c.progress<0||c.progress>100)fail('İlerleme 0–100 arasında olmalıdır.');
   return {id:cid,label:str(c.label)||cid,part:PARTS.includes(c.part)?c.part:'facade',progress:c.progress,weight:Math.max(0,Math.min(1e9,Number(c.weight)||1)),source,meshNodes:Array.isArray(c.meshNodes)?c.meshNodes.slice(0,100).map(n=>str(n,500)):[]};
  });
  const binding=f.binding?{block:str(f.binding.block),facade:str(f.binding.facade)}:null;
  return {id:fid,kind:f.kind,name:str(f.name)||fid,blockType:str(f.blockType)||'',layer:str(f.layer)||'',confidence:clamp(Number(f.confidence??1)*100)/100,geometry:{type:f.geometry.type,coordinates:f.geometry.type==='Polygon'?coords:coords[0]},height:Math.max(1,Math.min(200,Number(f.height)||6)),binding,components,modelId:f.modelId?id(f.modelId):null};
 });
 return {schemaVersion:1,units:['m','mm','cm','ft','unitless'].includes(input.units)?input.units:'unitless',features,source:{format:str(input.source?.format,20),mode:str(input.source?.mode,40),name:str(input.source?.name),warnings:(Array.isArray(input.source?.warnings)?input.source.warnings:[]).slice(0,20).map(x=>str(x,300))}};
}
export function catalogFromState(state){
 const catalog=[];
 for(const [block,facades] of Object.entries(state.cp_dynamic_data||{}))for(const [facade,d] of Object.entries(facades||{})){
  const items=(d.items||[]).map(r=>{
   const item=String(r[0]),k=`${block}_${facade}__${item}`,ov=state.cp_facade_overrides?.[k]||{};
   const total=Math.max(0,Number(ov.total??r[1])||0),pending=(state.cp_daily_entries?.[k]||[]).reduce((s,e)=>s+(e.includedInBase?0:Number(e.value)||0),0);
   const done=Math.max(0,Math.min(total,(Number(r[2])||0)+pending));
   return {source:{block,facade,item},label:item,total,done,progress:total?clamp(done/total*100):0,weight:Math.max(0,Number(ov.weight??r[7])||0),unit:String(r[8]||'')};
  });catalog.push({block,facade,items});
 }return catalog;
}
export function resolveFeature(feature,catalog){
 const lookup=new Map(catalog.flatMap(f=>f.items).map(i=>[keyOf(i.source),i]));
 const components=feature.components.map(c=>{const i=c.source?lookup.get(keyOf(c.source)):null;return {...c,...(i?{progress:i.progress,total:i.total,done:i.done,unit:i.unit}:{}),missing:!!c.source&&!i};});
 const weights=components.reduce((n,c)=>n+c.weight,0);
 const progress=components.length?components.reduce((n,c)=>n+c.progress*(weights?c.weight:1),0)/(weights||components.length):0;
 return {...feature,components,progress:clamp(progress),status:status(progress)};
}
export function inferPart(label){
 const s=String(label).toLocaleLowerCase('tr');
 if(/temel|beton|concrete|foundation/.test(s))return 'foundation';if(/duvar|wall|masonry/.test(s))return 'walls';if(/çatı|roof|çelik|steel/.test(s))return 'roof';if(/havuz|pool/.test(s))return 'pool';if(/peyzaj|landscape/.test(s))return 'landscape';return 'facade';
}
export function bindFacade(feature,entry){return {...feature,binding:{block:entry.block,facade:entry.facade},components:entry.items.map((i,n)=>({id:'item-'+n,label:i.label,part:inferPart(i.label),progress:0,weight:i.weight||1,source:i.source,meshNodes:[]}))};}
export function bounds(features){
 const pts=features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates);
 if(!pts.length)return [0,0,100,80];let x=Infinity,y=Infinity,r=-Infinity,t=-Infinity;
 for(const p of pts){x=Math.min(x,p[0]);y=Math.min(y,p[1]);r=Math.max(r,p[0]);t=Math.max(t,p[1]);}return [x,y,Math.max(r-x,1),Math.max(t-y,1)];
}
export const partLabels={foundation:'Betonarme / Temel',walls:'Duvar',roof:'Çatı',facade:'Cephe',pool:'Havuz',landscape:'Peyzaj'};
export function defaultComponents(){return PARTS.map((p,i)=>({id:'part-'+i,label:partLabels[p],part:p,progress:0,weight:1,source:null,meshNodes:[]}));}
export function demoMap(){
 const poly=(x,y,w,h)=>({type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]});
 return validateMap({schemaVersion:1,units:'m',source:{format:'demo',mode:'demo',name:'Örnek saha — gerçek proje verisi değildir'},features:[
 {id:'road',name:'Ana yol',kind:'road',geometry:poly(-5,23,138,10)},
 {id:'garden',name:'Yeşil alan',kind:'landscape',geometry:poly(104,0,28,20)},
 {id:'water',name:'Su alanı',kind:'water',geometry:poly(104,37,28,18)},
 ...Array.from({length:6},(_,i)=>({id:'villa-'+(411+i),name:'Villa '+(411+i),blockType:i%2?'Tip 104':'Tip 103',kind:'building',height:6,geometry:poly((i%3)*34,i<3?0:39,22,17),components:defaultComponents().map((c,n)=>({...c,progress:i===0?100:i===1?(n<3?100:25):0}))}))]});
}
