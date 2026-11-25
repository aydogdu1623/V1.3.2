// Large ASCII DXF files often carry images, thumbnail data, hatches and layout records.
// Keep only model/block geometry for the existing parser. Never split an entity across parser calls.
import {fromDXF,fromGeoJSON} from './importer.js?v=252';
import {drawingLimit} from './cad-limits.js';
const step=1024*1024;
const supported=new Set(['BLOCK','ENDBLK','LINE','LWPOLYLINE','POLYLINE','VERTEX','SEQEND','INSERT','CIRCLE','ARC','ELLIPSE','SPLINE','3DFACE','SOLID']);
async function smallText(file){
 const bytes=await file.arrayBuffer();
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{const header=new TextDecoder('latin1').decode(bytes.slice(0,32768));return new TextDecoder('windows-'+(/ANSI_(125[0-8])/.exec(header)?.[1]||'1252')).decode(bytes);}
}
async function largeText(file,onProgress){
 const head=new TextDecoder('latin1').decode(await file.slice(0,65536).arrayBuffer());
 const version=Number(/AC(10\d\d)/.exec(head)?.[1]||0),cp=/ANSI_(125[0-8])/.exec(head)?.[1];
 const decoder=new TextDecoder(version<1021&&cp?'windows-'+cp:'utf-8');
 let carry='',code=null,section='',expectSection=false,keep=false,seenEnd=false,unit=false,count=0,lastPercent=-1,discarded=0,chars=0;
 const pages=[];let out=[];
 function append(c,v){
  chars+=v.length+8;
  if(++count>1_500_000||chars>48_000_000)throw Error('Vaziyet geometrisi çok ayrıntılı. Kullanılacak bina ve yol katmanlarını ayrı DXF olarak dışa aktarın.');
  out.push(c+'\n'+v+'\n');if(out.length===4096){pages.push(out.join(''));out=[];}
 }
 function line(v){
  if(code===null){const n=v.trim();if(!n)return;if(!/^\d{1,4}$/.test(n))throw Error('DXF grup kodu okunamadı.');code=Number(n);return;}
  const c=code;code=null;if(seenEnd||c===999)return;
  if(expectSection){expectSection=false;if(c!==2)throw Error('Geçersiz DXF bölümü.');section=v.trim();keep=false;unit=false;
   if(['HEADER','BLOCKS','ENTITIES'].includes(section)){append(0,'SECTION');append(2,section);}return;}
  if(c===0){const type=v.trim();if(type==='SECTION'){expectSection=true;return;}
   if(type==='ENDSEC'){if(['HEADER','BLOCKS','ENTITIES'].includes(section))append(0,'ENDSEC');section='';keep=false;return;}
   if(type==='EOF'){append(0,'EOF');seenEnd=true;return;}
   keep=(section==='BLOCKS'||section==='ENTITIES')&&supported.has(type);
   if(!keep&&(section==='BLOCKS'||section==='ENTITIES'))discarded++;
  }
  if(section==='HEADER'){if(c===9)unit=v.trim()==='$INSUNITS';if(unit)append(c,v);}
  else if(keep&&c<1000&&!(c>=310&&c<=319))append(c,v);
 }
 for(let off=0;off<file.size;off+=step){
  const end=Math.min(off+step,file.size),buf=await file.slice(off,end).arrayBuffer();
  const data=carry+decoder.decode(buf,{stream:end<file.size});
  // Leave a trailing CR in carry so a CRLF crossing a read boundary is one terminator.
  const trailing=end<file.size&&data.endsWith('\r'),part=trailing?data.slice(0,-1):data;
  const rows=part.split(/\r\n|\n|\r/);carry=rows.pop()+(trailing?'\r':'');
  if(carry.length>4_000_000)throw Error('DXF satırı okunamadı. ASCII DXF olarak yeniden kaydedin.');
  for(const v of rows)line(v);const pct=Math.floor(end*100/file.size);if(pct!==lastPercent){onProgress(pct);lastPercent=pct;}
 }
 if(carry)line(carry);if(!seenEnd)throw Error('DXF dosyası eksik: EOF bulunamadı.');
 pages.push(out.join(''));return {text:pages.join(''),discarded};
}
export async function readDrawing(file,onProgress=()=>{},maxBytes=drawingLimit(file.name)){
 if(!file.size||file.size>maxBytes)throw Error('Dosya boyutu geçersiz.');
 if(!/\.dxf$/i.test(file.name))return fromGeoJSON(JSON.parse(await smallText(file)),file.name);
 if(file.size<=16_000_000)return fromDXF(await smallText(file),file.name);
 const {text,discarded}=await largeText(file,onProgress),map=fromDXF(text,file.name);
 if(discarded)map.source.warnings.push('Ön okumada '+discarded+' teknik veya desteklenmeyen öğe dışarıda bırakıldı.');
 return map;
}
