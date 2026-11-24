import {validateMap,emptyMap,catalogFromState,keyOf} from '../assets/site-map/model.js';
export {validateMap,emptyMap,catalogFromState};
export const error=(status,message)=>Object.assign(new Error(message),{status});
export function setSourceProgress(state,source,progress){
 const next=structuredClone(state),row=next.cp_dynamic_data?.[source.block]?.[source.facade]?.items?.find(r=>String(r[0])===source.item);
 if(!row)throw error(409,'Bağlı iş kalemi değişti. Cepheyi yeniden eşleştirin.');
 const k=`${source.block}_${source.facade}__${source.item}`,total=Number(next.cp_facade_overrides?.[k]?.total??row[1])||0;
 if(total<=0)throw error(400,'Önce bu iş kalemine toplam metraj girin.');
 row[2]=Math.round(total*progress/100*1e6)/1e6;row[3]=progress;
 for(const e of next.cp_daily_entries?.[k]||[])e.includedInBase=true;
 return next;
}
export function validateBindings(map,state){
 const keys=new Set(catalogFromState(state).flatMap(x=>x.items.map(i=>keyOf(i.source))));
 for(const f of map.features)for(const c of f.components)if(c.source&&!keys.has(keyOf(c.source)))throw error(400,'Eşleştirilen iş kalemi bu projede bulunamadı.');
}
export function validateGlb(base64){
 if(typeof base64!=='string'||base64.length>2_800_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw error(413,'GLB modeli en fazla 2 MB olabilir.');
 const data=Buffer.from(base64,'base64');
 if(data.length<20||data.length>2_000_000||data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw error(400,'Geçerli, gömülü kaynaklı bir GLB 2.0 dosyası seçin.');
 let doc;try{if(data.readUInt32LE(16)!==0x4e4f534a)throw Error();doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());}catch{throw error(400,'GLB model başlığı okunamadı.');}
 if([...doc.buffers||[],...doc.images||[]].some(x=>x.uri&&!/^data:/.test(x.uri)))throw error(400,'GLB dış dosyalara bağlanamaz. Kaynakları modele gömün.');
 if((doc.nodes||[]).length>10000||(doc.meshes||[]).length>5000||doc.extensionsRequired?.some(x=>/draco|meshopt|basisu/i.test(x)))throw error(400,'Modeli sıkıştırmasız, en fazla 5000 parçalı GLB olarak dışa aktarın.');
 return data;
}
