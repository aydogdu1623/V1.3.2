/* Firma Hakediş: the supplied six-sheet, fifteen-period template.
 * Only input cells and their dependent formulas/caches change. Native layout,
 * styles, column widths, print settings and all other ZIP parts are retained.
 */
(function(root){
'use strict';
const sheetNames=['Özet','Hakediş Takip','Tutanak ve Ekler','Kesintiler','Tüm İmalatlar Master','Birim Fiyat Master'];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const unescape=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const column=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const columnNumber=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const number=v=>{if(v==null||String(v).trim()==='')return null;let s=String(v).trim();if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;};
const required=(v,label)=>{const n=number(v);if(n===null)throw Error(label+' eksik veya geçersiz.');return n;};
const snap=p=>p.snapshot||p.snapshot191||p.snapshot190;
const periodRows=p=>snap(p)?.firmaRows199||snap(p)?.rows||[];
function prepare({selectedPeriodId,periods=[],contractRows=[],info={},readOnly=false,rowOrder=[]}={}){
 const selected=periods.find(p=>p.id===selectedPeriodId);
 if(!selected)throw Error('Seçili firma hakedişi bulunamadı.');
 const end=required(selected.number,'Hakediş numarası');
 if(!Number.isInteger(end)||end<1||end>15)throw Error('Bu Excel şablonu 1–15. hakediş dönemlerini destekler.');
 const ordered=periods.filter(p=>number(p.number)<=end).sort((a,b)=>number(a.number)-number(b.number));
 if(ordered.length!==end||ordered.some((p,i)=>number(p.number)!==i+1||!snap(p)))throw Error('Önceki hakediş zinciri eksik veya dönem numaraları tekrarlı. 1–'+end+'. dönem kayıtlarını kontrol edin.');
 for(const p of ordered)if(snap(p).reportNotes?.length)throw Error(p.number+'. dönemin kayıtlı miktar/fiyat verileri eksik. Önce bu dönemi kontrol edin.');
 const contracts=new Map();
 // Contract prices come from the earliest historical snapshot, not today's rate.
 for(const p of ordered)for(const r of snap(p).contractRows199||[])if(!contracts.has(r.key))contracts.set(r.key,{...r});
 if(!readOnly)for(const r of contractRows)if(!contracts.has(r.key))contracts.set(r.key,{...r});
 const all=new Map(contracts);
 for(const p of ordered){const seen=new Set();for(const r of periodRows(p)){
  if(!r.key||seen.has(r.key))throw Error(p.number+'. dönemde boş veya tekrarlı iş kalemi anahtarı var.');seen.add(r.key);
  if(!all.has(r.key))all.set(r.key,{...r,contractQuantity:r.total,contractPrice:null});
 }}
 const order=new Map(rowOrder.map((k,i)=>[k,i]));
 const rows=[...all.values()].sort((a,b)=>(order.get(a.key)??Infinity)-(order.get(b.key)??Infinity));
 const caseKey=s=>String(s).normalize('NFC').toLocaleLowerCase('tr');
 const counts=new Map();for(const r of rows){const n=caseKey(r.item||r.key);counts.set(n,(counts.get(n)||0)+1);}
 const used=new Set();
 rows.forEach((r,i)=>{
  const item=String(r.item||r.key),block=String(r.block??r.b??''),facade=String(r.facade??r.f??'');
  let label=counts.get(caseKey(item))>1?`${item} [${block} / ${facade}]`:item;
  if(used.has(caseKey(label)))label+=' #'+(i+1);used.add(caseKey(label));
  const base=number(r.contractPrice),revisions=[],quantities=Array(15).fill(0),prices=[];
  let effective=base;
  for(const p of ordered){const n=number(p.number),saved=periodRows(p).find(x=>x.key===r.key);if(!saved)continue;
   const q=required(saved.quantity,`${n}. dönem / ${item}: miktar`),price=number(saved.price);
   if(price===null&&q!==0)throw Error(`${n}. dönem / ${item}: birim fiyat eksik.`);
   quantities[n-1]=q;
   if(price!==null&&price!==effective){revisions.push({start:n,price});effective=price;}
  }
  if(revisions.length>4)throw Error(item+': dört revizyondan fazla fiyat değişikliği var. Şablon dört revizyon desteklediği için veri eksilterek indirme yapılmadı.');
  for(let n=1;n<=15;n++){let p=base;for(const revision of revisions)if(n>=revision.start)p=revision.price;prices.push(p??0);}
  Object.assign(r,{label,block,facade,code:String(r.pozNo??(r.code&&r.code!==r.key?r.code:'')),unit:String(r.unit||''),contractQuantity:number(r.contractQuantity),base,revisions,quantities,prices});
 });
 const extra=[],cuts=[],attachments=[];
 for(const p of ordered){const s=snap(p),n=number(p.number),meta=s.info||{};
  for(const e of s.extraRows||[]){extra.push({...e,periodNumber:n,qty:required(e.qty,n+'. dönem ilave iş miktarı'),price:required(e.price,n+'. dönem ilave iş fiyatı')});for(const f of [...(e.file?[e.file]:[]),...(e.files||[])])attachments.push({periodNumber:n,file:{...f}});}
  for(const e of s.cutRows||[]){cuts.push({...e,periodNumber:n,qty:1,price:required(e.amount,n+'. dönem kesinti tutarı')});for(const f of [...(e.file?[e.file]:[]),...(e.files||[])])attachments.push({periodNumber:n,file:{...f}});}
  const difference=number(meta.priceDifference),advance=number(meta.advanceAmount);
  if(difference)extra.push({periodNumber:n,date:meta.claimDate||'',type:'FİYAT FARKI',desc:'Onaylı fiyat farkı',qty:1,price:difference});
  if(advance&&!(s.cutRows||[]).some(e=>['Avans','Avans Mahsubu'].includes(e.type)))cuts.push({periodNumber:n,date:meta.claimDate||'',type:'Avans Mahsubu',desc:'Firma bilgileri avans mahsubu',qty:1,price:advance});
 }
 return{rows,extra,cuts,attachments,end,info:readOnly?{...(snap(selected).info||{})}:{...info}};
}

// XML editing is confined to the known worksheet cells; text is always escaped
// and emitted as inlineStr, including text beginning with '='.
class Sheet {
 constructor(xml){this.xml=xml;this.rows=new Map();for(const m of xml.matchAll(/<row\b([^>]*\br="(\d+)"[^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*\br="(\d+)"[^>]*)\/>/g))this.rows.set(Number(m[2]||m[5]),{attrs:m[1]||m[4],body:m[3]||''});}
 cell(ref){if(!ref)return undefined;const row=this.rows.get(Number(ref.match(/\d+$/)[0]));return row?.body.match(new RegExp('<c\\b([^>]*\\br="'+ref+'"[^>]*)(?:>([\\s\\S]*?)<\\/c>|/>)'));}
 style(ref,fallback){return (this.cell(ref)?.[1]||this.cell(fallback)?.[1]||'').match(/\bs="(\d+)"/)?.[1];}
 put(ref,value,{formula,cache='',styleRef}={}){
  const n=Number(ref.match(/\d+$/)[0]),style=this.style(ref,styleRef),old=this.rows.get(n),sample=styleRef&&this.rows.get(Number(styleRef.match(/\d+$/)[0]));
  let attrs=` r="${ref}"${style===undefined?'':` s="${style}"`}`,body='';
  if(formula){if(typeof cache==='string')attrs+=' t="str"';body='<f>'+escape(formula)+'</f><v>'+escape(cache)+'</v>';}
  else if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Geçersiz Excel sayısı: '+ref);body='<v>'+value+'</v>';}
  else if(value!=null&&value!==''){attrs+=' t="inlineStr"';body='<is><t xml:space="preserve">'+escape(value)+'</t></is>';}
  const cell='<c'+attrs+'>'+body+'</c>',row=old||{attrs:(sample?.attrs||` r="${n}"`).replace(/\br="\d+"/,`r="${n}"`),body:''};
  const match=this.cell(ref);if(match)row.body=row.body.replace(match[0],cell);else {
   const c=columnNumber(ref.replace(/\d+/g,'')),next=[...row.body.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)].find(m=>columnNumber(m[1])>c);
   row.body=next?row.body.slice(0,next.index)+cell+row.body.slice(next.index):row.body+cell;
  }this.rows.set(n,row);
 }
 formula(ref,f,cache,styleRef){this.put(ref,null,{formula:f,cache,styleRef});}
 swapColumns(a,b,start){
  for(const [n,row]of this.rows){if(n<start)continue;const cells=[...row.body.matchAll(/<c\b[^>]*(?:>[\s\S]*?<\/c>|\/>)/g)].map(m=>m[0].replace(/\br="([A-Z]+)(\d+)"/,(_,c,r)=>`r="${c===a?b:c===b?a:c}${r}"`));cells.sort((x,y)=>columnNumber(x.match(/\br="([A-Z]+)/)[1])-columnNumber(y.match(/\br="([A-Z]+)/)[1]));row.body=cells.join('');}
  const ia=columnNumber(a),ib=columnNumber(b);
  this.xml=this.xml.replace(/<col\b[^>]*\/>/g,tag=>{const lo=Number(tag.match(/\bmin="(\d+)"/)?.[1]),hi=Number(tag.match(/\bmax="(\d+)"/)?.[1]);if(lo!==hi)return tag;const n=lo===ia?ib:lo===ib?ia:lo;return tag.replace(/\bmin="\d+"/,`min="${n}"`).replace(/\bmax="\d+"/,`max="${n}"`);});
  this.xml=this.xml.replace(/<cols>([\s\S]*?)<\/cols>/,(_,body)=>'<cols>'+[...body.matchAll(/<col\b[^>]*\/>/g)].map(m=>m[0]).sort((a,b)=>Number(a.match(/min="(\d+)"/)[1])-Number(b.match(/min="(\d+)"/)[1])).join('')+'</cols>');
  this.xml=this.output();
 }
 resize(last,col){this.xml=this.xml.replace(/<dimension ref="[^"]+"\s*\/>/,`<dimension ref="A1:${col}${last}"/>`);}
 output(){return this.xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData>'+[...this.rows].sort((a,b)=>a[0]-b[0]).map(([n,r])=>'<row'+r.attrs+'>'+r.body+'</row>').join('')+'</sheetData>');}
}

async function build(payload,{templateBytes}={}){
 const data=prepare(payload);if(!root.JSZip)throw Error('Excel bileşeni yüklenemedi. Sayfayı yenileyin.');
 const bytes=templateBytes||await fetch('/assets/firma-hakedis-template-v208.xlsx').then(r=>{if(!r.ok)throw Error('Firma hakediş şablonu yüklenemedi.');return r.arrayBuffer();});
 const zip=await root.JSZip.loadAsync(bytes),workbook=await zip.file('xl/workbook.xml').async('string');
 const names=[...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map(m=>unescape(m[1]));
 if(JSON.stringify(names)!==JSON.stringify(sheetNames))throw Error('Firma hakediş şablonunun sayfa yapısı değişmiş.');
 const sheets=await Promise.all(sheetNames.map(async(_,i)=>new Sheet(await zip.file(`xl/worksheets/sheet${i+1}.xml`).async('string'))));
 const [summary,track,extras,cuts,master,prices]=sheets;
 track.swapColumns('C','D',6);master.swapColumns('C','D',6);prices.swapColumns('A','B',5);
 const count=Math.max(24,data.rows.length),last=6+count,totalRow=last+1,priceLast=Math.max(30,5+data.rows.length);
 const firstPriceFormula=unescape(track.cell('K7')[2].match(/<f\b[^>]*>([\s\S]*?)<\/f>/)[1]).replace(/_xludf\.IFS/g,'_xlfn.IFS');
 const info=data.info;
 summary.put('A1','CEPHEPRO - 15 DÖNEMLİ FİRMA HAKEDİŞ VE FİNANSAL GENEL ÖZET');summary.put('D3','Firma:');
 summary.put('B3',info.site||info.projectName||'');summary.put('E3',info.company||'');summary.put('B4',info.projectName||'');summary.put('E4',info.contractDate||'');
 track.put('A1','15 DÖNEMLİ FİRMA HAKEDİŞ VE METRAJ TAKİP SİSTEMİ');
 prices.put('A3','Revize fiyatlar kayıtlı hakedişlerden alınır. Başlangıç no, fiyatın uygulanacağı ilk dönemdir. Kullanılmayan revizyonlarda 99, bu raporun 15 dönemi dışında demektir.');
 // Remove only the original input/data region, keeping header/column formatting.
 const trackPrototype=new Sheet(track.xml),masterPrototype=new Sheet(master.xml),pricePrototype=new Sheet(prices.xml);
 for(const [s,start]of [[track,7],[master,7],[prices,6]])for(const n of [...s.rows.keys()])if(n>=start)s.rows.delete(n);
 const cache=new Map(),remember=(sheet,ref,value)=>cache.set(sheet+'!'+ref,value);
 const write=(s,ref,value,prototype,styleRef)=>{if(!s.rows.has(Number(ref.match(/\d+$/)[0]))){const row=prototype.rows.get(Number(styleRef.match(/\d+$/)[0]));s.rows.set(Number(ref.match(/\d+$/)[0]),{attrs:row.attrs.replace(/\br="\d+"/,`r="${ref.match(/\d+$/)[0]}"`),body:''});}const style=prototype.style(styleRef);s.put(ref,value);if(style!==undefined)s.rows.get(Number(ref.match(/\d+$/)[0])).body=s.rows.get(Number(ref.match(/\d+$/)[0])).body.replace(new RegExp('(<c r="'+ref+'")'),`$1 s="${style}"`);};
 const formula=(s,ref,text,value,prototype,styleRef)=>{write(s,ref,null,prototype,styleRef);s.formula(ref,text,value);};
 for(let i=0;i<count;i++){
  const r=7+i,item=data.rows[i],pr=6+i;
  if(item){
   const values=[item.code,item.label,item.unit,item.base,1];for(let v=0;v<4;v++)values.push(item.revisions[v]?.price??null,item.revisions[v]?.start??99);
   values.forEach((v,c)=>write(prices,column(c+1)+pr,v,pricePrototype,column(c+1)+'6'));
   for(const [c,v]of Object.entries({A:item.block,B:item.facade,C:item.code,D:item.label,F:item.contractQuantity,H:0})) {write(track,c+r,v,trackPrototype,c+'7');remember('Hakediş Takip',c+r,v??0);}
   for(const [c,index,val]of [['E',2,item.unit]]){formula(track,c+r,`IFERROR(VLOOKUP(D${r}, 'Birim Fiyat Master'!B$6:M$${priceLast}, ${index}, FALSE), "")`,val,trackPrototype,c+'7');remember('Hakediş Takip',c+r,val);}
   // Retain the reference workbook's exact remaining-quantity rule (F - BM).
   const remaining=(item.contractQuantity??0)-item.quantities[14];formula(track,'G'+r,`F${r}-BM${r}`,remaining,trackPrototype,'G7');remember('Hakediş Takip','G'+r,remaining);
   let cumulative=0;
   for(let n=1;n<=15;n++){
    const c=9+(n-1)*4,q=column(c),cum=column(c+1),price=column(c+2),amount=column(c+3),quantity=item.quantities[n-1],p=item.prices[n-1];cumulative+=quantity;
    write(track,q+r,quantity,trackPrototype,q+'7');remember('Hakediş Takip',q+r,quantity);
    formula(track,cum+r,`${n===1?'H':column(c-3)}${r}+${q}${r}`,cumulative,trackPrototype,cum+'7');remember('Hakediş Takip',cum+r,cumulative);
    const f=firstPriceFormula.replace(/C7/g,'D'+r).replace(/!A\$6/g,'!B$6').replace(/, (\d+), FALSE/g,(_,index)=>', '+(Number(index)-1)+', FALSE').replace(/\b1>=/g,n+'>=').replace(/M\$30/g,'M$'+priceLast);
    formula(track,price+r,f,p,trackPrototype,price+'7');remember('Hakediş Takip',price+r,p);
    formula(track,amount+r,`${q}${r}*${price}${r}`,quantity*p,trackPrototype,amount+'7');remember('Hakediş Takip',amount+r,quantity*p);
   }
  }else for(let c=1;c<=68;c++)write(track,column(c)+r,null,trackPrototype,column(c)+'7');
  for(let c=1;c<=68;c++){const col=column(c),v=item?(cache.get('Hakediş Takip!'+col+r)??''):'';formula(master,col+r,`IF('Hakediş Takip'!D${r}<>"", 'Hakediş Takip'!${col}${r}, "")`,v,masterPrototype,col+'7');}
 }
 write(track,'A'+totalRow,'TOPLAM',trackPrototype,'A31');
 track.xml=track.xml.replace(/A31:E31/g,`A${totalRow}:E${totalRow}`);
 for(let c=6;c<=68;c++){
  const col=column(c);if(c>=11&&(c-11)%4===0)write(track,col+totalRow,'-',trackPrototype,col+'31');
  else{const sum=data.rows.reduce((v,_,i)=>v+(Number(cache.get('Hakediş Takip!'+col+(i+7)))||0),0);formula(track,col+totalRow,`SUM(${col}7:${col}${last})`,sum,trackPrototype,col+'31');}
 }
 track.resize(totalRow,'BQ');master.resize(last,'BQ');prices.resize(Math.max(10,5+data.rows.length),'M');
 const ledger=(sheet,rows,title)=>{
  const original=new Sheet(sheet.xml),n=Math.max(2,rows.length),end=5+n,total=end+1;
  for(const r of [...sheet.rows.keys()])if(r>=6)sheet.rows.delete(r);
  for(let i=0;i<n;i++){const e=rows[i],r=i+6,values=e?[String(e.date||''),e.periodNumber+'. Hakediş Dönemi',String(e.type||''),String(e.desc||''),e.qty,e.price]:['','','','',null,null];values.forEach((v,c)=>write(sheet,column(c+1)+r,v,original,column(c+1)+'6'));formula(sheet,'G'+r,`E${r}*F${r}`,e?e.qty*e.price:0,original,'G6');}
  write(sheet,'A'+total,title,original,'A8');for(const [c,get]of [['E',e=>e.qty],['G',e=>e.qty*e.price]])formula(sheet,c+total,`SUM(${c}6:${c}${end})`,rows.reduce((s,e)=>s+get(e),0),original,c+'8');
  sheet.xml=sheet.xml.replace(/A8:D8/g,`A${total}:D${total}`);sheet.resize(Math.max(10,total+2),'G');return Math.max(100,end);
 };
 const extraLast=ledger(extras,data.extra,'TOPLAM EK İŞLER'),cutLast=ledger(cuts,data.cuts,'TOPLAM KESİNTİLER'),sums=Array(6).fill(0);
 for(let n=1;n<=15;n++){
  const r=n+8,col=column(12+(n-1)*4),work=data.rows.reduce((s,x)=>s+x.quantities[n-1]*x.prices[n-1],0),ex=data.extra.filter(e=>e.periodNumber===n).reduce((s,e)=>s+e.qty*e.price,0),cut=data.cuts.filter(e=>e.periodNumber===n).reduce((s,e)=>s+e.qty*e.price,0),gross=work+ex-cut;
  const values=[work,ex,cut,gross,gross*.1,gross*.9],forms=[`SUM('Hakediş Takip'!${col}7:${col}${last})`,`SUMIF('Tutanak ve Ekler'!B6:B${extraLast}, A${r}, 'Tutanak ve Ekler'!G6:G${extraLast})`,`SUMIF(Kesintiler!B6:B${cutLast}, A${r}, Kesintiler!G6:G${cutLast})`,`B${r}+C${r}-D${r}`,`E${r}*0.1`,`E${r}-F${r}`];
  values.forEach((v,i)=>{summary.formula(column(i+2)+r,forms[i],v);sums[i]+=v;});
 }
 sums.forEach((v,i)=>summary.formula(column(i+2)+'24',`SUM(${column(i+2)}9:${column(i+2)}23)`,v));
 // All formulas now have current caches. Excel also recalculates edits on open.
 const calc='<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
 zip.file('xl/workbook.xml',/<calcPr\b/.test(workbook)?workbook.replace(/<calcPr\b[^>]*\/>/,calc):workbook.replace('</workbook>',calc+'</workbook>'));
 for(let i=0;i<sheets.length;i++)zip.file(`xl/worksheets/sheet${i+1}.xml`,sheets[i].output());
 zip.remove('xl/calcChain.xml');
 for(const p of ['xl/_rels/workbook.xml.rels','[Content_Types].xml']){const f=zip.file(p);if(f)zip.file(p,(await f.async('string')).replace(/<(?:Relationship|Override)\b[^>]*(?:calcChain)[^>]*\/>/g,''));}
 return{bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),extra:data.attachments,sheetNames:[...sheetNames],report:data,totals:sums};
}
root.CepheProFirmaTemplate208={prepare,build,sheetNames,version:211};
})(typeof window==='undefined'?globalThis:window);
