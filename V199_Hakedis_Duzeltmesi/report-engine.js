/* CephePro: dynamic company payment report. No project data or credentials in source. */
(function(root){
'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function numeric(value){
 if(value==null||String(value).trim()==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 let s=String(value).trim().replace(/\s+/g,'').replace(/₺|TL/gi,'');
 if(s.includes(',')){if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(s))return null;s=s.replace(/\./g,'').replace(',','.');}
 else if(!/^-?\d+(?:\.\d+)?$/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
function rate(value){
 const s=String(value??'').trim();
 if(/^\d+\s*\/\s*\d+$/.test(s)){const[a,b]=s.split('/').map(Number);return b>0&&a>=0&&a<=b?a/b*100:null;}
 const n=numeric(s.replace(/%/g,''));return n!==null&&n>=0&&n<=100?n:null;
}
const round=n=>n===null?null:Math.round((n+Number.EPSILON)*100)/100;
const amount=(q,p)=>q===null?null:q===0?0:p===null?null:round(q*p);
const total=values=>values.some(n=>n===null)?null:round(values.reduce((s,n)=>s+n,0));
const rateKeys=new Set(['vatRate','vatWithholdingRate','withholdingRate','retentionRate']);
const numericKeys=new Set(['contractAmount','advanceAmount','priceDifference','vatBase','withholdingBase','retentionBase']);
const fields=[
 ['projectName','İşin adı'],['employer','İşveren firma / unvan'],['company','Yüklenici firma / unvan'],
 ['tax','Vergi dairesi / vergi no'],['address','Adres'],['contract','Sözleşme no'],
 ['contractType','Sözleşme türü'],['contractDate','Sözleşme başlangıcı'],['contractEnd','Sözleşme bitişi'],
 ['claimNo','Hakediş no'],['claimDate','Hakediş tarihi'],['periodStart','Dönem başlangıcı'],['periodEnd','Dönem bitişi'],
 ['contractAmount','Sözleşme bedeli (KDV hariç, TL)'],['vatRate','KDV oranı (%)'],
 ['vatWithholdingRate','KDV tevkifat oranı (% veya 4/10 gibi)'],['withholdingRate','Stopaj oranı (%)'],
 ['retentionRate','Teminat kesintisi oranı (%)'],['advanceAmount','Avans mahsubu (TL)'],
 ['priceDifference','Bu dönem fiyat farkı (TL)'],['vatBase','KDV matrahı (boşsa dönem brütü)'],
 ['withholdingBase','Stopaj matrahı (boşsa dönem brütü)'],['retentionBase','Teminat matrahı (boşsa dönem brütü)']
];
function resolveInfo({overrides={},snapshot={},model={},project={},readOnly=false}){
 const result={};
 for(const[key]of fields){
  const values=readOnly?[snapshot[key]]:[overrides[key],snapshot[key],model[key],project[key]];
  result[key]=values.find(v=>v!=null&&String(v).trim()!=='')??'';
 }
 return result;
}
function prepare(payload){
 const info={...payload.info},history=payload.previousPeriods||[],notes=[],previous=new Map();
 const numbers=history.map(p=>numeric(p.number)).sort((a,b)=>a-b),claimNo=numeric(info.claimNo);
 const complete=claimNo!==null&&Number.isInteger(claimNo)&&claimNo>=1&&numbers.length===claimNo-1&&numbers.every((n,i)=>n===i+1)&&history.every(p=>p.complete!==false);
 if(!complete)notes.push('Önceki hakediş zinciri eksik; önceki ve kümülatif tutarlar boş bırakıldı.');
 for(const p of history)for(const r of p.rows||[]){
  const old=previous.get(r.key)||{quantity:0,amount:0},q=numeric(r.quantity),a=amount(q,numeric(r.price));
  previous.set(r.key,{quantity:old.quantity===null||q===null?null:old.quantity+q,amount:old.amount===null||a===null?null:round(old.amount+a)});
 }
 const rows=(payload.rows||[]).map(r=>{
  const q=numeric(r.currentQuantity),cp=numeric(r.contractPrice),cq=numeric(r.contractQuantity),p=numeric(r.currentPrice);
  const prev=complete?(previous.get(r.key)||{quantity:0,amount:0}):{quantity:null,amount:null};
  const currentAmount=amount(q,p),cumulativeQuantity=prev.quantity===null||q===null?null:prev.quantity+q;
  const rowNotes=[];
  if(cq===null)rowNotes.push('Sözleşme miktarı eksik');
  if(cp===null)rowNotes.push('Sözleşme fiyatı eksik');
  if(q===null)rowNotes.push('Dönem miktarı eksik');
  if(q!==0&&p===null)rowNotes.push('Dönem fiyatı eksik');
  if(cp!==null&&p!==null&&cp!==p)rowNotes.push('Dönem fiyatı sözleşmeden farklı');
  if(cq!==null&&cumulativeQuantity!==null&&cumulativeQuantity>cq)rowNotes.push('Sözleşme miktarı aşıldı');
  if(rowNotes.length)notes.push(String(r.facade||'')+' / '+String(r.item||r.key)+': '+rowNotes.join('; '));
  return {...r,contractQuantity:cq,contractPrice:cp,contractAmount:cq===null||cp===null?null:round(cq*cp),previousQuantity:prev.quantity,previousAmount:prev.amount,currentQuantity:q,currentPrice:p,currentAmount,cumulativeQuantity,cumulativeAmount:prev.amount===null||currentAmount===null?null:round(prev.amount+currentAmount),completion:cq>0&&cumulativeQuantity!==null?cumulativeQuantity/cq:null,note:rowNotes.join('; ')};
 });
 if(!rows.length)notes.push('İş kalemi bulunmuyor.');
 for(const key of ['vatRate','vatWithholdingRate','withholdingRate','retentionRate'])if(rate(info[key])===null)notes.push(fields.find(f=>f[0]===key)[1]+': eksik veya geçersiz; uygulanmıyorsa 0 girin.');
 for(const key of ['advanceAmount','priceDifference'])if(numeric(info[key])===null)notes.push(fields.find(f=>f[0]===key)[1]+': eksik veya geçersiz; yoksa 0 girin.');
 for(const key of ['projectName','employer','company','claimDate','periodStart','periodEnd'])if(!String(info[key]??'').trim())notes.push(fields.find(f=>f[0]===key)[1]+': eksik.');
 if(info.periodStart&&info.periodEnd&&String(info.periodStart)>String(info.periodEnd))notes.push('Dönem başlangıcı bitişinden sonra olamaz.');
 return {info,rows,notes,previousComplete:complete,history,currentExtras:payload.currentExtras||[],currentCuts:payload.currentCuts||[]};
}
function makeWorkbook(ExcelJS,payload){
 const report=prepare(payload),wb=new ExcelJS.Workbook(),cover=wb.addWorksheet('Hakediş Kapağı & İcmal'),detail=wb.addWorksheet('Detaylı Hakediş Cetveli'),info=wb.addWorksheet('Sözleşme & Firma Bilgileri');
 wb.creator='CephePro';wb.calcProperties={fullCalcOnLoad:true,forceFullCalc:true};
 const money='[$₺-41F] #,##0.00;[Red]-[$₺-41F] #,##0.00',qty='#,##0.0000',blue='FF16324F',gray='FFD5DDE5';
 const ref=row=>"'Sözleşme & Firma Bilgileri'!B"+row;
 const f=(sheet,cell,formula,result)=>sheet.getCell(cell).value={formula,...(typeof result==='number'?{result}:{})};
 function title(sheet,text,end){sheet.mergeCells(1,1,1,end);sheet.getCell('A1').value=text;sheet.getRow(1).height=30;}
 title(cover,'FİRMA HAKEDİŞ RAPORU',4);title(detail,'DETAYLI HAKEDİŞ CETVELİ',17);title(info,'SÖZLEŞME VE FİRMA BİLGİLERİ',8);
 info.getCell('A2').value='Oranlar ve matrahlar sözleşme / işlem türüne göre girilir. Uygulanmayan kesintilere 0 yazın.';
 const at={};fields.forEach(([key,label],i)=>{
  const row=i+4;at[key]=row;info.getCell('A'+row).value=label;
  info.getCell('B'+row).value=rateKeys.has(key)?rate(report.info[key]):numericKeys.has(key)?numeric(report.info[key]):String(report.info[key]??'');
  if(numericKeys.has(key))info.getCell('B'+row).numFmt=money;
 });
 const ir=key=>ref(at[key]);
 cover.addRow(['Kaynak','Sitedeki seçili firma hakedişi']);cover.getCell('A3').value='TASLAK — eksik fiyat, miktar veya kesintiler tamamlanınca tutarlar hesaplanır.';
 const coverKeys=['projectName','employer','company','contract','contractDate','contractEnd','claimNo','claimDate','periodStart','periodEnd'];
 coverKeys.forEach((key,i)=>{cover.getCell('A'+(i+5)).value=fields.find(x=>x[0]===key)[1];f(cover,'B'+(i+5),'IF('+ir(key)+'="","",'+ir(key)+')');});
 const headers=['Poz / Kod','Blok','Cephe','İş kalemi açıklaması','Birim','Sözleşme miktarı','Sözleşme birim fiyatı','Sözleşme tutarı','Önceki miktar','Önceki tutar','Bu dönem miktarı','Dönem birim fiyatı','Bu dönem tutarı','Kümülatif miktar','Kümülatif tutar','Tamamlanma %','Kontrol notu'];
 detail.getRow(4).values=headers;
 const first=5,last=Math.max(first,first+report.rows.length-1);
 report.rows.forEach((r,i)=>{
  const n=first+i;detail.getRow(n).values=[String(r.code||''),String(r.block||''),String(r.facade||''),String(r.item||''),String(r.unit||''),r.contractQuantity,r.contractPrice,null,r.previousQuantity,r.previousAmount,r.currentQuantity,r.currentPrice,null,null,null,null,r.note];
  f(detail,'H'+n,'IF(COUNT(F'+n+':G'+n+')=2,ROUND(PRODUCT(F'+n+':G'+n+'),2),"")',r.contractAmount);
  f(detail,'M'+n,'IF(K'+n+'="","",IF(K'+n+'=0,0,IF(COUNT(K'+n+':L'+n+')=2,ROUND(PRODUCT(K'+n+':L'+n+'),2),"")))',r.currentAmount);
  f(detail,'N'+n,'IF(COUNT(I'+n+',K'+n+')=2,SUM(I'+n+',K'+n+'),"")',r.cumulativeQuantity);
  f(detail,'O'+n,'IF(COUNT(J'+n+',M'+n+')=2,SUM(J'+n+',M'+n+'),"")',r.cumulativeAmount);
  f(detail,'P'+n,'IF(AND(ISNUMBER(N'+n+'),ISNUMBER(F'+n+'),F'+n+'>0),N'+n+'/F'+n+',"")',r.completion);
 });
 detail.autoFilter={from:{row:4,column:1},to:{row:last,column:17}};
 detail.views=[{state:'frozen',xSplit:5,ySplit:4}];detail.getColumn(16).numFmt='0.00%';
 for(const c of [6,9,11,14])detail.getColumn(c).numFmt=qty;
 for(const c of [7,8,10,12,13,15])detail.getColumn(c).numFmt=money;
 const dr=c=>"'Detaylı Hakediş Cetveli'!"+c+first+':'+c+last;
 const safeSum=c=>'IF(COUNT('+dr(c)+')='+report.rows.length+',SUM('+dr(c)+'),"")';
 let ledgerRow=32;info.getRow(ledgerRow).values=['Dönem','Tür','Tarih','Açıklama','Miktar','Birim fiyat','Tutar','Ek / Referans'];
 const ledger=[];
 const append=(label,type,items)=>items.forEach(e=>ledger.push({label,type,e}));
 report.history.forEach(p=>{append('Önceki dönem','İlave iş',p.extraRows||[]);append('Önceki dönem','Kesinti',p.cutRows||[]);});
 append('Bu dönem','İlave iş',report.currentExtras);append('Bu dönem','Kesinti',report.currentCuts);
 const ls=ledgerRow+1,le=Math.max(ls,ls+ledger.length-1);
 ledger.forEach(({label,type,e},i)=>{const n=ls+i;info.getRow(n).values=[label,type,String(e.date||''),String(e.desc||''),type==='İlave iş'?numeric(e.qty):null,type==='İlave iş'?numeric(e.price):null,type==='Kesinti'?numeric(e.amount):null,String(e.file?.name||'')];if(type==='İlave iş')f(info,'G'+n,'IF(COUNT(E'+n+':F'+n+')=2,ROUND(PRODUCT(E'+n+':F'+n+'),2),"")',amount(numeric(e.qty),numeric(e.price)));});
 const lr=c=>"'Sözleşme & Firma Bilgileri'!"+c+ls+':'+c+le;
 const ledgerSum=(period,type)=>'IF(COUNTIFS('+lr('A')+',"'+period+'",'+lr('B')+',"'+type+'",'+lr('G')+',"")>0,"",SUMIFS('+lr('G')+','+lr('A')+',"'+period+'",'+lr('B')+',"'+type+'"))';
 cover.getRow(16).values=['Yapılan iş tutarları','Önceki dönem','Bu dönem','Kümülatif'];
 cover.getCell('A17').value='İmalat tutarı (KDV hariç)';
 for(const[cell,col]of [['B17','J'],['C17','M'],['D17','O']])f(cover,cell,report.rows.length?safeSum(col):'""');
 cover.getCell('A18').value='Tutanak ve ilave işler';f(cover,'B18',report.previousComplete?ledgerSum('Önceki dönem','İlave iş'):'""');f(cover,'C18',ledgerSum('Bu dönem','İlave iş'));f(cover,'D18','IF(COUNT(B18:C18)=2,SUM(B18:C18),"")');
 cover.getCell('A19').value='Toplam yapılan iş';for(const c of ['B','C','D'])f(cover,c+'19','IF(COUNT('+c+'17:'+c+'18)=2,SUM('+c+'17:'+c+'18),"")');
 const labels={21:'Sözleşme bedeli (KDV hariç)',23:'Bu dönem fiyat farkı',24:'Bu dönem brüt hakediş',25:'Hesaplanan KDV (+)',26:'KDV tevkifatı (−)',27:'Stopaj (−)',28:'Avans mahsubu (−)',29:'Teminat kesintisi (−)',30:'Diğer kesintiler (−)',32:'ÖDENECEK NET HAKEDİŞ'};
 Object.entries(labels).forEach(([row,label])=>cover.getCell('A'+row).value=label);
 const inferredContract=report.rows.length?safeSum('H'):'""';
 f(cover,'C21','IF(ISNUMBER('+ir('contractAmount')+'),'+ir('contractAmount')+',IF('+ir('contractType')+'="Birim fiyat",'+inferredContract+',""))');
 f(cover,'C23','IF(ISNUMBER('+ir('priceDifference')+'),'+ir('priceDifference')+',"")');
 f(cover,'C24','IF(COUNT(C19,C23)=2,SUM(C19,C23),"")');
 function taxFormula(rateKey,baseKey){const base='IF(ISNUMBER('+ir(baseKey)+'),'+ir(baseKey)+',C24)';return 'IF(AND(ISNUMBER('+ir(rateKey)+'),'+ir(rateKey)+'>=0,'+ir(rateKey)+'<=100,ISNUMBER('+base+')),ROUND('+base+'*'+ir(rateKey)+'/100,2),"")';}
 f(cover,'C25',taxFormula('vatRate','vatBase'));
 f(cover,'C26','IF(AND(ISNUMBER(C25),ISNUMBER('+ir('vatWithholdingRate')+')) ,ROUND(C25*'+ir('vatWithholdingRate')+'/100,2),"")');
 f(cover,'C27',taxFormula('withholdingRate','withholdingBase'));
 f(cover,'C28','IF(ISNUMBER('+ir('advanceAmount')+'),'+ir('advanceAmount')+',"")');
 f(cover,'C29',taxFormula('retentionRate','retentionBase'));f(cover,'C30',ledgerSum('Bu dönem','Kesinti'));
 const metadata=['projectName','employer','company','claimDate','periodStart','periodEnd'].map(k=>ir(k)+'<>""').join(',');
 f(cover,'C32','IF(AND(COUNT(C24:C30)=7,'+metadata+','+ir('periodStart')+'<='+ir('periodEnd')+'),ROUND(SUM(C24:C25)-SUM(C26:C30),2),"")');
 cover.getCell('A34').value='Kontrol notları';(report.notes.length?report.notes:['Kaynak bilgileri aktarıldı. Sözleşme ve imalat onayı ayrıca kontrol edilir.']).forEach((note,i)=>{cover.mergeCells(35+i,1,35+i,4);cover.getCell('A'+(35+i)).value=note;});
 const signature=37+Math.max(1,report.notes.length);cover.getRow(signature).values=['Hazırlayan','Yüklenici','Kontrol','İşveren / Onay'];
 cover.getRow(signature+1).values=['Ad / İmza / Tarih','Ad / İmza / Tarih','Ad / İmza / Tarih','Ad / İmza / Tarih'];
 wb.eachSheet(sheet=>{
  sheet.properties.defaultRowHeight=21;
  if(sheet!==detail)sheet.views=[{state:'frozen',ySplit:4}];
  sheet.eachRow(row=>{row.eachCell({includeEmpty:true},cell=>{
   cell.font={name:'Calibri',size:10};cell.alignment={vertical:'middle',wrapText:true};
   cell.border={top:{style:'thin',color:{argb:gray}},bottom:{style:'thin',color:{argb:gray}},left:{style:'thin',color:{argb:gray}},right:{style:'thin',color:{argb:gray}}};
  });});
  sheet.columns.forEach(col=>{let width=12;col.eachCell({includeEmpty:false},cell=>{if(typeof cell.value==='string')width=Math.max(width,Math.min(48,cell.value.length+2));});col.width=width;});
  const headerRows=sheet===detail?[1,4]:sheet===cover?[1,16,32,signature]:[1,32];
  for(const n of headerRows)sheet.getRow(n).eachCell({includeEmpty:true},cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};cell.font={name:'Calibri',size:n===1?14:10,bold:true,color:{argb:'FFFFFFFF'}};});
  sheet.pageSetup={paperSize:sheet===detail?8:9,orientation:sheet===detail?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:sheet===detail?'1:4':'1:3',margins:{left:.25,right:.25,top:.4,bottom:.4,header:.2,footer:.2}};
  sheet.headerFooter={oddFooter:'CephePro | Sayfa &P / &N'};
 });
 for(const c of [2,3,4])cover.getColumn(c).numFmt=money;
 cover.getColumn(1).width=41;for(const c of [2,3,4])cover.getColumn(c).width=23;
 detail.getColumn(4).width=40;detail.getColumn(17).width=46;
 info.getColumn(1).width=43;info.getColumn(2).width=35;
 for(const c of [6,7])info.getColumn(c).numFmt=money;
 for(const key of rateKeys)info.getCell('B'+at[key]).dataValidation={type:'decimal',operator:'between',allowBlank:true,formulae:[0,100],showErrorMessage:true,errorTitle:'Geçersiz oran',error:'0 ile 100 arasında oran girin.'};
 return {wb,extra:report.currentExtras,report};
}
root.CepheProFirma199={numeric,rate,resolveInfo,prepare,makeWorkbook,fields};
})(typeof window==='undefined'?globalThis:window);
