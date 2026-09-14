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
 const info={...payload.info};if(!payload.readOnly){if(info.vatRate==null||String(info.vatRate).trim()==='')info.vatRate=20;if(info.retentionRate==null||String(info.retentionRate).trim()==='')info.retentionRate=5;}const history=payload.previousPeriods||[],notes=[],previous=new Map();
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

function makeWorkbook(ExcelJS,payload={}){
 const r=prepare(payload),wb=new ExcelJS.Workbook(),names=['Hakediş İcmali (Kapak)','Sözleşme Metrajı','Hakediş Cetveli','Saha Tutanakları','Kesintiler ve Cezalar'];
 const [cap,con,claim,site,cut]=names.map(n=>wb.addWorksheet(n));
 wb.creator='CephePro';wb.calcProperties={fullCalcOnLoad:true,forceFullCalc:true};
 const NAVY='FF1B365D',BLUE='FF2C4D75',ZEBRA='FFF8FAFC',GRAY='FFD8E0E8',MONEY='"₺"#,##0.00',QTY='#,##0.00',PCT='0.0%';
 const q=(sheet,cell)=>"'"+sheet.replace(/'/g,"''")+"'!"+cell,cr=c=>q(names[0],c);
 const set=(s,c,v,fmt)=>{const cell=s.getCell(c);cell.value=v??null;if(fmt)cell.numFmt=fmt;return cell;};
 const form=(s,c,formula,result)=>set(s,c,{formula,result:typeof result==='number'?result:''});
 function band(s,row,a,b,text,color=NAVY){s.mergeCells(row,a,row,b);const c=s.getRow(row).getCell(a);c.value=text;c.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};c.font={name:'Calibri',bold:true,color:{argb:'FFFFFFFF'},size:row===1?16:11};s.getRow(row).height=row===1?34:25;}
 function table(s,headers){band(s,1,1,headers.length,s.name);s.getRow(4).values=headers;s.views=[{state:'frozen',xSplit:s===claim?5:0,ySplit:4}];s.getRow(4).height=38;}
 band(cap,1,1,12,'FİRMA HAKEDİŞ RAPORU');
 set(cap,'A2','Sözleşme, dönem imalatı, saha tutanakları ve kesintiler');
 for(const[a,b,label,cell]of [[1,3,'SÖZLEŞME BEDELİ','A5'],[4,6,'BU DÖNEM İMALAT','D5'],[7,9,'KESİNTİLER TOPLAMI','G5'],[10,12,'ÖDENECEK GENEL TOPLAM','J5']]){
  band(cap,4,a,b,label,BLUE);cap.mergeCells(5,a,6,b);set(cap,cell,null,MONEY);
 }
 const meta=[
 [9,'Proje adı','projectName','C9',12],[10,'İşveren firma','employer','C10',12],[11,'Yüklenici / Taşeron','company','C11',12],
 [12,'Sözleşme no','contract','C12',6],[13,'Hakediş tarihi','claimDate','C13',6],
 [14,'Dönem başlangıcı','periodStart','C14',6],[15,'Sözleşme başlangıcı','contractDate','C15',6],
 [16,'Vergi dairesi / no','tax','C16',12],[17,'Adres / Şantiye','address','C17',12],[18,'Sözleşme türü','contractType','C18',6]
 ];
 for(const[row,label,key,cell,lastCol]of meta){cap.mergeCells(row,1,row,2);set(cap,'A'+row,label);cap.mergeCells(row,3,row,lastCol);set(cap,cell,String(r.info[key]??''));}
 for(const[row,label,key]of [[12,'Hakediş no','claimNo'],[14,'Dönem bitişi','periodEnd'],[15,'Sözleşme bitişi','contractEnd']]){cap.mergeCells(row,8,row,9);set(cap,'H'+row,label);cap.mergeCells(row,10,row,12);set(cap,'J'+row,String(r.info[key]??''));}
 band(cap,20,1,12,'HESAP PARAMETRELERİ');
 const rates={vatRate:rate(r.info.vatRate),retentionRate:rate(r.info.retentionRate),withholdingRate:rate(r.info.withholdingRate),vatWithholdingRate:rate(r.info.vatWithholdingRate)};
 const params=[
 [21,'KDV oranı','E21',rates.vatRate===null?null:rates.vatRate/100,'Teminat oranı','L21',rates.retentionRate===null?null:rates.retentionRate/100,PCT],
 [22,'Sözleşme bedeli (varsa)','E22',numeric(r.info.contractAmount),'Avans mahsubu','L22',numeric(r.info.advanceAmount),MONEY],
 [23,'KDV matrahı (isteğe bağlı)','E23',numeric(r.info.vatBase),'Teminat matrahı (isteğe bağlı)','L23',numeric(r.info.retentionBase),MONEY],
 [24,'Stopaj oranı (varsa)','E24',rates.withholdingRate===null?null:rates.withholdingRate/100,'KDV tevkifatı (varsa)','L24',rates.vatWithholdingRate===null?null:rates.vatWithholdingRate/100,PCT],
 [25,'Stopaj matrahı (isteğe bağlı)','E25',numeric(r.info.withholdingBase),'Fiyat farkı (varsa)','L25',numeric(r.info.priceDifference),MONEY]
 ];
 for(const[n,l1,c1,v1,l2,c2,v2,fmt]of params){cap.mergeCells(n,1,n,4);set(cap,'A'+n,l1);cap.mergeCells(n,5,n,6);set(cap,c1,v1,fmt);cap.mergeCells(n,7,n,11);set(cap,'G'+n,l2);set(cap,c2,v2,fmt);}
 for(const cell of ['E21','L21','E24','L24'])cap.getCell(cell).dataValidation={type:'decimal',operator:'between',allowBlank:true,formulae:[0,1],showErrorMessage:true,error:'0% ile 100% arasında oran girin.'};
 table(con,['Poz No','Blok','Cephe Kodu','İş Kalemi Açıklaması','Birim','Sözleşme Birim Fiyatı','Sözleşme Miktarı','Toplam Sözleşme Tutarı']);
 table(claim,['Poz No','Blok','Cephe','İş Kalemi Açıklaması','Birim','Birim Fiyat','Önceki Miktar','Bu Dönem Miktar','Toplam Yapılan Miktar','Bu Dönem Tutarı','Tamamlanma Oranı']);
 const count=Math.max(r.rows.length,payload.templateRows||20),last=4+count,totalRow=last+2;
 for(let i=0;i<count;i++){
  const n=i+5,row=r.rows[i],active=row!==undefined;
  con.getRow(n).values=active?[String(row.code||row.key||''),String(row.block||''),String(row.facade||''),String(row.item||''),String(row.unit||''),row.contractPrice,row.contractQuantity]:['','','','','',null,null];
  const contractAmount=active&&row.contractPrice!==null&&row.contractQuantity!==null?round(row.contractPrice*row.contractQuantity):null;
  form(con,'H'+n,'IF(D'+n+'="","",IF(COUNT(F'+n+':G'+n+')=2,ROUND(PRODUCT(F'+n+':G'+n+'),2),""))',contractAmount);
  for(const c of ['A','B','C','D','E'])form(claim,c+n,'IF('+q(names[1],c+n)+'="","",'+q(names[1],c+n)+')');
  form(claim,'F'+n,'IF(AND(D'+n+'<>"",ISNUMBER('+q(names[1],'F'+n)+')),'+q(names[1],'F'+n)+',"")',active?row.contractPrice:null);
  set(claim,'G'+n,active?row.previousQuantity:null);set(claim,'H'+n,active?row.currentQuantity:null);
  form(claim,'I'+n,'IF(D'+n+'="","",IF(COUNT(G'+n+':H'+n+')=2,SUM(G'+n+':H'+n+'),""))',active?row.cumulativeQuantity:null);
  const pay=active?amount(row.currentQuantity,row.contractPrice):null;
  form(claim,'J'+n,'IF(D'+n+'="","",IF(H'+n+'="","",IF(H'+n+'=0,0,IF(COUNT(F'+n+',H'+n+')=2,ROUND(F'+n+'*H'+n+',2),""))))',pay);
  form(claim,'K'+n,'IF(AND(ISNUMBER(I'+n+'),ISNUMBER('+q(names[1],'G'+n)+'),'+q(names[1],'G'+n)+'>0),I'+n+'/'+q(names[1],'G'+n)+',"")',active?row.completion:null);
 }
 const linkedCount='COUNTIF('+q(names[1],'D5:D'+last)+',"<>")';
 const guardedSum=(sheet,col,expected)=>'IF('+expected+'=0,"",IF(COUNT('+q(sheet,col+'5:'+col+last)+')='+expected+',SUM('+q(sheet,col+'5:'+col+last)+'),""))';
 band(con,totalRow,1,7,'TOPLAM SÖZLEŞME TUTARI');form(con,'H'+totalRow,guardedSum(names[1],'H',linkedCount));
 band(claim,totalRow,1,9,'BU DÖNEM İMALAT TOPLAMI');form(claim,'J'+totalRow,guardedSum(names[2],'J',linkedCount));
 con.autoFilter={from:{row:4,column:1},to:{row:last,column:8}};claim.autoFilter={from:{row:4,column:1},to:{row:last,column:11}};
 table(site,['Tutanak No','Tarih','İş Açıklaması / Ekstra İş','Miktar','Birim','Birim Fiyat','Toplam Tutar']);
 const extra=[...r.currentExtras];extra.push({priceDifference:true});
 const extraLast=4+Math.max(extra.length,10),extraTotal=extraLast+2;
 for(let n=5;n<=extraLast;n++){
  const e=extra[n-5];site.getRow(n).values=e?[String(e.reportNo||e.number||e.id||''),String(e.date||''),String(e.desc||''),numeric(e.qty),String(e.unit||''),numeric(e.price)]:['','','',null,'',null];
  if(e?.priceDifference){const active='AND(ISNUMBER('+cr('L25')+'),'+cr('L25')+'<>0)';for(const[c,formula]of [['A','IF('+active+',"FİYAT-FARKI","")'],['B','IF('+active+',IF('+cr('C13')+'="","",'+cr('C13')+'),"")'],['C','IF('+active+',"Onaylı fiyat farkı","")'],['D','IF('+active+',1,"")'],['E','IF('+active+',"adet","")'],['F','IF('+active+','+cr('L25')+',"")']])form(site,c+n,formula);}
  form(site,'G'+n,'IF(C'+n+'="","",IF(COUNT(D'+n+',F'+n+')=2,ROUND(D'+n+'*F'+n+',2),""))',e&&numeric(e.qty)!==null&&numeric(e.price)!==null?round(numeric(e.qty)*numeric(e.price)):null);
 }
 band(site,extraTotal,1,6,'SAHA TUTANAKLARI TOPLAMI');
 form(site,'G'+extraTotal,'IF(COUNT(G5:G'+extraLast+')=COUNTIF(C5:C'+extraLast+',"<>"),SUM(G5:G'+extraLast+'),"")');
 site.autoFilter={from:{row:4,column:1},to:{row:extraLast,column:7}};
 table(cut,['Tarih','Kesinti Türü','Oran / Açıklama','Kesinti Tutarı']);
 const manualRetention=r.currentCuts.filter(e=>['Nakit Teminat','Nakit Teminat %5','Teminat'].includes(String(e.type||'')));
 const manualAdvance=r.currentCuts.filter(e=>['Avans','Avans Mahsubu'].includes(String(e.type||'')));
 const feeRows=[];
 feeRows.push({date:r.info.claimDate,type:'Nakit Teminat',rateCell:'L21',formula:manualRetention.length?'0':'IF(AND(ISNUMBER('+cr('L21')+'),ISNUMBER(IF(ISNUMBER('+cr('L23')+'),'+cr('L23')+','+cr('J32')+'))),ROUND(IF(ISNUMBER('+cr('L23')+'),'+cr('L23')+','+cr('J32')+')*'+cr('L21')+',2),"")',note:manualRetention.length?'Tutar aşağıdaki kayıtlı teminat satırlarından alınır.':null});
 feeRows.push({date:r.info.claimDate,type:'Avans Mahsubu',formula:manualAdvance.length?'0':'IF(ISNUMBER('+cr('L22')+'),'+cr('L22')+',"")',note:manualAdvance.length?'Tutar aşağıdaki kayıtlı avans satırlarından alınır.':'Uygulanmıyorsa kapakta 0 girin.'});
 feeRows.push({date:r.info.claimDate,type:'Stopaj',rateCell:'E24',formula:'IF('+cr('E24')+'="",0,IF(AND(ISNUMBER('+cr('E24')+'),ISNUMBER('+cr('J32')+')),ROUND(IF(ISNUMBER('+cr('E25')+'),'+cr('E25')+','+cr('J32')+')*'+cr('E24')+',2),""))'});
 feeRows.push({date:r.info.claimDate,type:'KDV Tevkifatı',rateCell:'L24',formula:'IF('+cr('L24')+'="",0,IF(AND(ISNUMBER('+cr('L24')+'),ISNUMBER('+cr('J36')+')),ROUND('+cr('J36')+'*'+cr('L24')+',2),""))'});
 for(const e of r.currentCuts)feeRows.push({date:e.date,type:e.type||'Diğer',note:e.desc,value:numeric(e.amount)});
 if(!payload.rows?.length)for(const type of ['İSG Uyarı Cezası','Yemek/Konaklama','Şantiye Gider Katılımı'])feeRows.push({date:'',type,note:'Varsa tutarı girin; uygulanmıyorsa 0 girin.',value:null});
 const feeLast=4+feeRows.length,feeTotal=feeLast+2;
 feeRows.forEach((e,i)=>{
  const n=i+5;cut.getRow(n).values=[String(e.date||''),e.type,e.note||'',e.value??null];
  if(e.rateCell&&!e.note)form(cut,'C'+n,'IF(ISNUMBER('+cr(e.rateCell)+'),'+cr(e.rateCell)+',"")');
  if(e.rateCell&&!e.note)cut.getCell('C'+n).numFmt=PCT;
  if(e.formula)form(cut,'D'+n,e.formula);
 });
 band(cut,feeTotal,1,3,'KESİNTİLER TOPLAMI');form(cut,'D'+feeTotal,'IF(COUNT(D5:D'+feeLast+')=COUNTIF(B5:B'+feeLast+',"<>"),SUM(D5:D'+feeLast+'),"")');
 cut.autoFilter={from:{row:4,column:1},to:{row:feeLast,column:4}};
 band(cap,28,1,12,'HAKEDİŞ HESAP CETVELİ');
 for(const[n,label]of [[30,'1. Sözleşme İmalatları'],[31,'2. Saha Tutanakları'],[32,'3. Brüt Hakediş'],[34,'4. Kesintiler Toplamı'],[35,'5. Net Hakediş (KDV Hariç)'],[36,'6. KDV'],[38,'7. ÖDENECEK GENEL TOPLAM']]){cap.mergeCells(n,1,n,9);set(cap,'A'+n,label);cap.mergeCells(n,10,n,12);set(cap,'J'+n,null,MONEY);}
 const link=(sheet,cell)=>'IF(ISNUMBER('+q(sheet,cell)+'),'+q(sheet,cell)+',"")';
 form(cap,'J30',link(names[2],'J'+totalRow));form(cap,'J31',link(names[3],'G'+extraTotal));
 form(cap,'J32','IF(COUNT(J30:J31)=2,SUM(J30:J31),"")');form(cap,'J34',link(names[4],'D'+feeTotal));
 form(cap,'J35','IF(COUNT(J32,J34)=2,J32-J34,"")');
 form(cap,'J36','IF(AND(ISNUMBER(E21),ISNUMBER(IF(ISNUMBER(E23),E23,J32))),ROUND(IF(ISNUMBER(E23),E23,J32)*E21,2),"")');
 form(cap,'J38','IF(COUNT(J35:J36)=2,SUM(J35:J36),"")');
 form(cap,'A5','IF(ISNUMBER(E22),E22,'+link(names[1],'H'+totalRow)+')');
 form(cap,'D5','IF(ISNUMBER(J30),J30,"")');form(cap,'G5','IF(ISNUMBER(J34),J34,"")');form(cap,'J5','IF(ISNUMBER(J38),J38,"")');
 band(cap,40,1,12,'KONTROL VE ONAY');
 cap.mergeCells(41,1,42,12);set(cap,'A41','Taslak: firma, dönem ve sözleşme bilgileri ile metraj onayı tamamlanmalıdır. KDV ve kesinti matrahları hesap parametrelerinden ayarlanır.');
 for(const[a,b,label]of [[1,4,'Hazırlayan (Taşeron)'],[5,8,'Kontrol Eden (Şantiye Şefi)'],[9,12,'Onaylayan (İşveren)']]){band(cap,44,a,b,label,BLUE);cap.mergeCells(45,a,48,b);set(cap,String.fromCharCode(64+a)+'45','Ad Soyad / İmza / Kaşe / Tarih');}
 const noteStart=totalRow+3;if(r.notes.length){band(claim,noteStart,1,11,'KAYNAK KONTROL NOTLARI');r.notes.forEach((note,i)=>{claim.mergeCells(noteStart+i+1,1,noteStart+i+1,11);set(claim,'A'+(noteStart+i+1),note);claim.getRow(noteStart+i+1).height=30;});}
 for(const sheet of wb.worksheets){
  sheet.properties.defaultRowHeight=22;if(sheet===cap)sheet.views=[{state:'frozen',ySplit:8}];
  sheet.eachRow((row,number)=>row.eachCell({includeEmpty:true},cell=>{
   if(!cell.font||!Object.keys(cell.font).length)cell.font={name:'Calibri',size:11,color:{argb:NAVY}};
   cell.alignment={vertical:'middle',wrapText:true};
   cell.border={top:{style:'thin',color:{argb:GRAY}},bottom:{style:'thin',color:{argb:GRAY}},left:{style:'thin',color:{argb:GRAY}},right:{style:'thin',color:{argb:GRAY}}};
   if(sheet!==cap&&number>4&&number%2===0&&!cell.fill?.type)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZEBRA}};
  }));
  if(sheet!==cap)sheet.getRow(4).eachCell({includeEmpty:true},cell=>{cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:BLUE}};});
  sheet.columns.forEach(col=>{let width=12;col.eachCell({includeEmpty:false},cell=>{if(typeof cell.value==='string')width=Math.max(width,Math.min(48,cell.value.length+2));});col.width=width;});
  sheet.pageSetup={paperSize:9,orientation:sheet===cap?'portrait':'landscape',fitToPage:true,fitToWidth:1,fitToHeight:sheet===cap?1:0,printTitlesRow:sheet===cap?'1:2':'1:4',margins:{left:.25,right:.25,top:.35,bottom:.35,header:.15,footer:.15}};
  sheet.headerFooter={oddFooter:'CephePro | Sayfa &P / &N'};
 }
 for(let c=1;c<=12;c++)cap.getColumn(c).width=10;
 for(const c of ['A5','D5','G5','J5']){cap.getCell(c).font={name:'Calibri',size:19,bold:true,color:{argb:NAVY}};cap.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:ZEBRA}};cap.getCell(c).numFmt=MONEY;}
 cap.getRow(5).height=24;cap.getRow(6).height=24;cap.getRow(17).height=34;
 for(const c of ['A38','J38']){cap.getCell(c).font={name:'Calibri',size:16,bold:true,color:{argb:'FFFFFFFF'}};cap.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};}cap.getRow(38).height=32;
 con.getColumn(4).width=43;claim.getColumn(4).width=43;site.getColumn(3).width=52;cut.getColumn(2).width=29;cut.getColumn(3).width=52;cut.getColumn(4).width=24;
 for(const[s,columns,format]of [[con,[6,8],MONEY],[con,[7],QTY],[claim,[6,10],MONEY],[claim,[7,8,9],QTY],[claim,[11],PCT],[site,[4],QTY],[site,[6,7],MONEY],[cut,[4],MONEY]])for(const c of columns)s.getColumn(c).numFmt=format;
 return {wb,extra:r.currentExtras,report:r};
}
root.CepheProFirma199={numeric,rate,resolveInfo,prepare,makeWorkbook,fields,version:200};
})(typeof window==='undefined'?globalThis:window);

(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=v=>{const d=new Date(v||Date.now());return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';};
const number=v=>Number.isFinite(Number(v))?Number(v):0,money=v=>number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
let data={},revision=0,kind='firma',owner='',loaded=false,dirty=false,saving=false,panelMode=null;
let recordOwner='',catalog=[],cloudPending=false,changeVersion=0,loadGeneration=0,deleting=false;
const readOnly=()=>!!recordOwner&&recordOwner!==owner;
const draftKey=()=> 'cp_claims_draft_v191_'+owner;
const admin=()=>typeof currentUser!=='undefined'&&currentUser?.role==='admin';
const copy=v=>JSON.parse(JSON.stringify(v));
function model(){
 const m=data[kind]||(data[kind]={});m.month||=day().slice(0,7);m.prices||={};m.selected||={};m.extras||=[];m.deductions||=[];m.facades||=m.facade?[m.facade]:[];m.items||=[];
 if(!Array.isArray(m.periods190)){
  const legacy=m.periods186||{},months=[...new Set([...Object.keys(legacy),m.month,...m.extras.map(e=>String(e.date).slice(0,7)),...m.deductions.map(e=>String(e.date).slice(0,7))])].filter(x=>/^\d{4}-\d{2}$/.test(x));
  m.periods190=months.sort().map((month,i)=>({id:'legacy-'+month,month,number:legacy[month]?.number||i+1,entries:copy(legacy[month]?.entries||{}),prices:copy(m.prices),selected:copy(m.selected),extras:copy(m.extras.filter(e=>String(e.date).slice(0,7)===month)),deductions:copy(m.deductions.filter(e=>String(e.date).slice(0,7)===month))}));
  m.activePeriod190=m.periods190.find(p=>p.month===m.month)?.id||m.periods190[0]?.id;
 }
 if(!m.periods190.length)m.periods190.push({id:'claim-'+crypto.randomUUID(),month:m.month,number:1,entries:{},prices:{},selected:{},extras:[],deductions:[]});
 const p=m.periods190.find(p=>p.id===m.activePeriod190)||m.periods190[0];m.activePeriod190=p.id;m.month=p.month;
 for(const k of ['prices','selected'])m[k]=p[k]||=( {} );for(const k of ['extras','deductions'])m[k]=p[k]||=[];
 return m;
}
async function api(path,method='GET',body){
 const t=localStorage.getItem('cp_cloud_token')||localStorage.getItem('cp_remembered_cloud_token'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(t||'')},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'İşlem tamamlanamadı.');return d;}
 catch(e){if(controller.signal.aborted)throw Error('Sunucu yanıtı gecikti. Kaydın durumunu Yenile ile kontrol edin; cihazdaki taslağınız korunur.');throw e;}
 finally{clearTimeout(timer);}
}
function allRows(){const m=model(),per=period(),out=[];
 if(per.snapshot191?.editorRows)return per.snapshot191.editorRows.map(base=>{const override=m.prices[base.key],price=override?.mode==='manual'||override?.value!=null?number(override.value):base.price;const row={...base,price,mode:override?.mode||base.mode};return {...row,...certified(row,per.entries?.[row.key])};});
 Object.entries(DATA||{}).forEach(([b,fs])=>Object.entries(fs).forEach(([f,d])=>(d.items||[]).forEach(raw=>{
 const item=String(raw[0]),key=v34ItemKey(b,f,item),quantity=(dailyEntries?.[key]||[]).filter(e=>day(e.date).slice(0,7)===m.month).reduce((s,e)=>s+number(e.value),0),override=m.prices[key];
 const price=override?.mode==='manual'?number(override.value):number(window.__v169Financial?.unitWeight(b,f,item));
 const effective=typeof v25EffectiveItem==='function'?v25EffectiveItem(b,f,raw):raw;const row={b,f,item,key,quantity,price,total:number(effective[1]),done:number(effective[2]),weight:number(effective[7]),unit:raw[8]||'m²',mode:override?.mode||'contract'};out.push({...row,...certified(row,period().entries?.[key])});
})));
 if(per.snapshot190&&!per.snapshot191)for(const saved of per.snapshot190.rows||[]){let row=out.find(r=>r.key===saved.key);if(!row){row={key:saved.key,b:saved.block,f:saved.facade,item:saved.item,unit:saved.unit,total:null,done:null,weight:0,mode:'manual'};out.push(row);}Object.assign(row,{quantity:number(saved.quantity),price:per.dirty190&&m.prices[row.key]?.value!=null?number(m.prices[row.key].value):number(saved.price),payQuantity:number(saved.quantity),payPercent:number(row.total)>0?number(saved.quantity)/number(row.total)*100:0});if(per.dirty190)Object.assign(row,certified(row,per.entries?.[row.key]));}
 return out;}
function rows(){if(readOnly())return allRows().filter(r=>model().selected[r.key]);const s=scope();return allRows().filter(r=>accepts(s.block,r.b)&&accepts(s.facade,facadeKey(r))&&accepts(s.item,r.item));}
const extras=()=>model().extras.filter(e=>String(e.date||'').slice(0,7)===model().month);
const deductions=()=>model().deductions.filter(e=>String(e.date||'').slice(0,7)===model().month);
const kindLabel=()=>kind==='firma'?'Firma Hakediş':'Taşeron Hakediş';
function changed(){if(readOnly())return;changeVersion++;dirty=true;cloudPending=true;period().dirty190=true;if($('cl-status'))$('cl-status').textContent='Kaydedilmemiş değişiklikler';}
const norm=v=>String(v||'').trim().toLocaleLowerCase('tr-TR');
const facadeKey=r=>JSON.stringify([r.b,r.f]);
const groupKey=r=>JSON.stringify([norm(r.item),r.unit]);
const pickerTitles={block:'Blok',facade:'Cephe',item:'İş Kalemi','price-facade':'Cephe'};
const pickerQueries={},pickerAnchors={};
let activePicker='',priceDraft=null;
function scope(){
 const m=model();
 if(!m.scope185){
  const facades=[];Object.entries(DATA||{}).forEach(([b,fs])=>Object.keys(fs||{}).forEach(f=>{if(m.facades.includes(f)&&(!m.block||m.block===b))facades.push(JSON.stringify([b,f]));}));
  m.scope185={block:m.block?[m.block]:null,facade:m.facades.length?facades:null,item:m.items.length?[...m.items]:null};
 }
 return m.scope185;
}
const accepts=(values,key)=>values==null||values.includes(key);
function filterOptions(type){
 const all=allRows(),s=scope(),map=new Map();
 if(type==='block')Object.keys(DATA||{}).forEach(b=>map.set(b,{key:b,label:typeof v33BlockLabel==='function'?v33BlockLabel(b):b,sub:''}));
 else for(const r of all){
  if(type!=='price-facade'&&!accepts(s.block,r.b))continue;
  if(type==='item'&&!accepts(s.facade,facadeKey(r)))continue;
  const key=type==='item'?r.item:facadeKey(r);
  if(!map.has(key))map.set(key,{key,label:type==='item'?r.item:r.f,sub:type==='item'?'':(typeof v33BlockLabel==='function'?v33BlockLabel(r.b):r.b)});
 }
 return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'tr')||a.sub.localeCompare(b.sub,'tr'));
}
function pickerSelection(type){return type==='price-facade'?[...(priceDraft?.facades||[])]:scope()[type];}
function optionSelected(type,key){return accepts(pickerSelection(type),key);}
function pickerFiltered(type){const q=norm(pickerQueries[type]);return filterOptions(type).filter(r=>norm(`${r.label} ${r.sub}`).includes(q));}
function pickerMarkup(type){
 const options=filterOptions(type),picked=options.filter(r=>optionSelected(type,r.key));
 const text=picked.length===options.length&&picked.length?'Tümü':picked.length?picked.map(r=>r.label).slice(0,2).join(', ')+(picked.length>2?' +'+(picked.length-2):''):'Seçim yok';
 return `<div class="v55-picker-cell ${type==='item'?'items':type}"><span class="v55-picker-label">${pickerTitles[type]}</span><button type="button" id="cl-filter-${type}" class="v55-picker-trigger" data-cl-picker="${type}" aria-label="${pickerTitles[type]} filtrele ve çoklu seç" aria-controls="cl-pop-${type}" aria-expanded="false"><span class="v55-picker-value">${esc(text)}</span><span class="v55-picker-count">${picked.length}</span><span class="v55-picker-arrow">▾</span></button><div id="cl-pop-${type}" class="v55-picker-pop"></div></div>`;
}
function closePickers(focus=false){const old=activePicker;activePicker='';document.querySelectorAll('#cl-pane .v55-picker-pop.open').forEach(p=>p.classList.remove('open'));document.querySelectorAll('#cl-pane [data-cl-picker]').forEach(b=>{b.classList.remove('open');b.setAttribute('aria-expanded','false');});if(focus)$('cl-filter-'+old)?.focus();}
function updatePickerSelection(type,entries,checked){
 const focusKey=document.activeElement?.dataset?.clOption,scroll=$('cl-pop-'+type)?.querySelector('.v184-report-options')?.scrollTop||0;
 const values=new Set(pickerSelection(type)===null?filterOptions(type).map(r=>r.key):pickerSelection(type));
 entries.forEach(r=>checked?values.add(r.key):values.delete(r.key));
 if(type==='price-facade')priceDraft.facades=values;
 else{scope()[type]=[...values];model().search='';changed();}
 if(type==='price-facade')renderPricePanel();else render();
 const list=$('cl-pop-'+type)?.querySelector('.v184-report-options');if(list){list.querySelectorAll('input').forEach(input=>{if(input.dataset.clOption===focusKey)input.focus({preventScroll:true});});list.scrollTop=scroll;}
}
function pickerList(type){
 const pop=$('cl-pop-'+type),list=pop?.querySelector('.v184-report-options');if(!list)return;
 const scroll=list.scrollTop,focusKey=document.activeElement?.dataset?.clOption;
 const options=pickerFiltered(type);
 list.innerHTML=options.map(r=>`<label class="v184-report-option ${optionSelected(type,r.key)?'selected':''}"><input type="checkbox" data-cl-option="${esc(r.key)}" ${optionSelected(type,r.key)?'checked':''}><span>${esc(r.label)}${r.sub?`<small>${esc(r.sub)}</small>`:''}</span></label>`).join('')||'<p class="v184-report-empty">Eşleşen kayıt yok.</p>';
 list.querySelectorAll('input').forEach(input=>{if(input.dataset.clOption===focusKey)input.focus({preventScroll:true});});list.scrollTop=scroll;
 const all=filterOptions(type);pop.querySelector('[data-cl-status]').textContent=`${all.filter(r=>optionSelected(type,r.key)).length} / ${all.length} seçili · ${options.length} sonuç`;
 pop.querySelectorAll('[data-cl-action="all"],[data-cl-action="clear"]').forEach(b=>b.disabled=!options.length);
}
function openPicker(type,focus=false){
 closePickers();activePicker=type;const pop=$('cl-pop-'+type),trigger=$('cl-filter-'+type);if(!pop||!trigger)return;
 pop.innerHTML=`<div class="v184-report-tools"><input type="search" class="v55-pop-search" aria-label="${pickerTitles[type]} ara" placeholder="Ara..." value="${esc(pickerQueries[type]||'')}"><div><button type="button" data-cl-action="all">Sonuçları seç</button><button type="button" data-cl-action="clear">Sonuçları temizle</button><button type="button" data-cl-action="done">Bitti</button></div></div><div class="v184-report-options" role="group" aria-label="${pickerTitles[type]} çoklu seçim"></div><p class="v184-report-status" data-cl-status role="status" aria-live="polite"></p>`;
 pop.classList.add('open');trigger.classList.add('open');trigger.setAttribute('aria-expanded','true');
 let shift=false;
 pop.onclick=e=>{e.stopPropagation();if(e.target.matches('[data-cl-option]'))shift=e.shiftKey;const action=e.target.closest('[data-cl-action]')?.dataset.clAction;if(!action)return;if(action==='done')return closePickers(true);updatePickerSelection(type,pickerFiltered(type),action==='all');};
 pop.onchange=e=>{const key=e.target.dataset.clOption;if(!key)return;const entries=pickerFiltered(type),end=entries.findIndex(r=>r.key===key),start=shift?entries.findIndex(r=>r.key===pickerAnchors[type]):-1;if(end<0)return;if(start<0)pickerAnchors[type]=key;updatePickerSelection(type,start<0?[entries[end]]:entries.slice(Math.min(start,end),Math.max(start,end)+1),e.target.checked);shift=false;};
 pop.oninput=e=>{if(!e.target.matches('input[type=search]'))return;pickerQueries[type]=e.target.value;pickerList(type);};
 pop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePickers(true);}};
 pickerList(type);if(focus)pop.querySelector('input[type=search]').focus();
}
function bindPickers(root){
 root.querySelectorAll('[data-cl-picker]').forEach(button=>button.onclick=e=>{e.stopPropagation();const type=button.dataset.clPicker;if(activePicker===type)closePickers();else openPicker(type,true);});
 if(activePicker&&root.querySelector('#cl-pop-'+activePicker))openPicker(activePicker);
}
function revisionTargets(draft=priceDraft){if(!draft)return[];return allRows().filter(r=>draft.scope==='all'||draft.facades.has(facadeKey(r)));}
function revisionGroups(draft=priceDraft){
 const map=new Map();for(const r of revisionTargets(draft)){const key=groupKey(r);if(!map.has(key))map.set(key,{key,item:r.item,unit:r.unit,rows:[]});map.get(key).rows.push(r);}
 return [...map.values()].sort((a,b)=>a.item.localeCompare(b.item,'tr')||a.unit.localeCompare(b.unit,'tr'));
}
function newPrice(value){const s=String(value??'').trim();if(!/^\d+(?:[.,]\d{1,4})?$/.test(s))return null;const n=Number(s.replace(',','.'));return Number.isFinite(n)&&n>=0?n:null;}
function applyRevision(draft=priceDraft){
 if(readOnly())return{error:'Paylaşılan hakediş yalnız görüntülenebilir.'};
 if(!draft)return{error:'Önce revizyon panelini açın.'};
 const groups=revisionGroups(draft).filter(g=>draft.selected.has(g.key));
 if(!groups.length)return{error:'Cephe ve en az bir iş kalemi seçin.'};
 const pending=[];
 for(const group of groups){const value=newPrice(draft.values[group.key]);if(value===null)return{error:`${group.item} için geçerli yeni birim fiyat girin.`};group.rows.forEach(r=>pending.push({key:r.key,value}));}
 const m=model();pending.forEach(p=>m.prices[p.key]={mode:'manual',value:p.value});changed();return{count:pending.length};
}
function startPriceRevision(){
 if(readOnly())return;
 closePickers();const visible=rows(),picked=visible.filter(r=>model().selected[r.key]);
 priceDraft={scope:'selected',facades:new Set((picked.length?picked:visible).map(facadeKey)),selected:new Set(picked.map(groupKey)),values:{},search:'',message:''};
 panelMode='prices';renderPricePanel();$('cl-price-dialog').showModal();
}
function priceRows(){
 const groups=revisionGroups().filter(g=>norm(g.item).includes(norm(priceDraft.search)));
 const root=$('cl-price-rows');if(!root)return;
 root.innerHTML=groups.map((g,i)=>{const prices=[...new Set(g.rows.map(r=>r.price))];return `<tr><td><input type="checkbox" data-price-select="${esc(g.key)}" aria-label="${esc(g.item)} seç" ${priceDraft.selected.has(g.key)?'checked':''}></td><td>${esc(g.item)}</td><td>${esc(g.unit)}</td><td>${g.rows.length}</td><td>${prices.length===1?money(prices[0]):'Farklı fiyatlar'}</td><td><input type="text" inputmode="decimal" data-new-price="${esc(g.key)}" aria-label="${esc(g.item)} yeni birim fiyat" placeholder="Yeni birim fiyat" value="${esc(priceDraft.values[g.key]??'')}"></td></tr>`;}).join('')||'<tr><td colspan="6">Bu kapsamda iş kalemi yok.</td></tr>';
 root.querySelectorAll('[data-price-select]').forEach(input=>input.onchange=()=>{input.checked?priceDraft.selected.add(input.dataset.priceSelect):priceDraft.selected.delete(input.dataset.priceSelect);});
 root.querySelectorAll('[data-new-price]').forEach(input=>input.oninput=()=>{priceDraft.values[input.dataset.newPrice]=input.value;priceDraft.selected.add(input.dataset.newPrice);input.closest('tr').querySelector('[data-price-select]').checked=true;});
 $('cl-price-scope-note').textContent=`${new Set(revisionTargets().map(facadeKey)).size} cephe · ${revisionGroups().length} iş kalemi`;
}
function renderPricePanel(){
 if(!priceDraft)return;const dialog=$('cl-price-dialog');if(!dialog)return;
 dialog.innerHTML=`<div class="cl-dialog-head"><h3 id="cl-price-title">İş Kalemi Fiyatlarını Revize Et</h3><button type="button" id="cl-price-close" aria-label="Fiyat revizyon panelini kapat">Kapat</button></div>
 <div class="cl-price-top"><div class="cl-price-scopes" role="group" aria-label="Revizyon kapsamı"><button type="button" data-price-scope="selected" aria-pressed="${priceDraft.scope==='selected'}">Seçili cephelere revize et</button><button type="button" data-price-scope="all" aria-pressed="${priceDraft.scope==='all'}">Tüm cephelere revize et</button></div><button type="button" id="cl-price-apply">Revizyonu uygula</button></div>
 ${priceDraft.scope==='selected'?`<div class="v55-pickerbar cl-price-facades">${pickerMarkup('price-facade')}</div>`:''}
 <div class="cl-price-search"><input type="search" id="cl-price-search" aria-label="Revize edilecek iş kalemi ara" placeholder="İş kalemi ara..." value="${esc(priceDraft.search)}"><button type="button" id="cl-price-select-all">Sonuçları seç</button><button type="button" id="cl-price-clear">Sonuçları temizle</button></div>
 <p id="cl-price-scope-note" class="cl-note"></p><div class="cl-scroll"><table><thead><tr><th>Seç</th><th>İş Kalemi</th><th>Birim</th><th>Cephe</th><th>Mevcut Fiyat</th><th>Yeni Birim Fiyat</th></tr></thead><tbody id="cl-price-rows"></tbody></table></div><p id="cl-price-result" role="status">${esc(priceDraft.message)}</p>`;
 dialog.setAttribute('aria-labelledby','cl-price-title');dialog.oncancel=e=>e.preventDefault();
 $('cl-price-close').onclick=closePanel;
 dialog.querySelectorAll('[data-price-scope]').forEach(b=>b.onclick=()=>{closePickers();priceDraft.scope=b.dataset.priceScope;priceDraft.message='';renderPricePanel();});
 $('cl-price-search').oninput=e=>{priceDraft.search=e.target.value;priceRows();};
 const select=checked=>{revisionGroups().filter(g=>norm(g.item).includes(norm(priceDraft.search))).forEach(g=>checked?priceDraft.selected.add(g.key):priceDraft.selected.delete(g.key));priceRows();};
 $('cl-price-select-all').onclick=()=>select(true);$('cl-price-clear').onclick=()=>select(false);
 $('cl-price-apply').onclick=()=>{const result=applyRevision();if(result.error){$('cl-price-result').textContent=result.error;return;}priceDraft.message=`${result.count} kalemin fiyatı güncellendi. Buluta Kaydet ile kaydedebilirsiniz.`;render();renderPricePanel();};
 bindPickers(dialog);priceRows();
}
function contractPrices(){if(readOnly())return;const selected=rows().filter(r=>model().selected[r.key]);if(!selected.length)return toast('Önce iş kalemlerini seçin.');selected.forEach(r=>model().prices[r.key]={mode:'contract',value:number(window.__v169Financial?.unitWeight(r.b,r.f,r.item))});changed();render();toast(selected.length+' iş kaleminde sözleşme fiyatı kullanılacak.');}
document.addEventListener?.('click',e=>{if(!e.target.closest?.('#cl-pane .v55-picker-cell'))closePickers();});

function period(){const m=model();return m.periods190.find(p=>p.id===m.activePeriod190);}
function parseCertified(input){
 const text=String(input??'').trim();if(!text)return{mode:'auto',value:0};
 const match=text.match(/^(%)?\s*(\d+(?:[.,]\d{1,4})?)\s*(%)?$/);if(!match||match[1]&&match[3])return null;
 const value=Number(match[2].replace(',','.')),mode=match[1]||match[3]?'percent':'quantity';
 return Number.isFinite(value)&&value>=0&&(mode!=='percent'||value<=100)?{mode,value}:null;
}
function certified(row,entry){
 const quantity=entry?.mode==='percent'?number(row.total)*number(entry.value)/100:entry?.mode==='quantity'?number(entry.value):row.quantity;
 return{payQuantity:Math.round(quantity*10000)/10000,payPercent:row.total>0?quantity/row.total*100:0,expression:entry?.mode==='percent'?'%'+entry.value:entry?.mode==='quantity'?String(entry.value):''};
}
function setCertified(key,input){
 if(readOnly())return{error:'Paylaşılan hakediş yalnız görüntülenebilir.'};
 const parsed=parseCertified(input);if(!parsed)return{error:'%15 veya 45 gibi pozitif bir yüzde/metraj girin.'};
 const row=allRows().find(r=>r.key===key);if(!row)return{error:'İş kalemi bulunamadı.'};
 if(parsed.mode==='percent'&&row.total<=0)return{error:'Yüzde hesabı için iş kaleminin toplam metrajını girin.'};
 period().entries||={};if(parsed.mode==='auto')delete period().entries[key];else period().entries[key]=parsed;
 changed();return certified(row,parsed);
}
function companyFields(){
 const m=model(),p=typeof v34ProjectInfo==='object'?v34ProjectInfo:{},snapshot=period().snapshot191?.info||{};
 const project={...p,company:kind==='taseron'?p.subcontractor:p.company,contract:p.contractNo||p.projectCode,contractDate:p.contractStart,contractEnd:p.contractEnd,tax:p.tax||p.taxNumber,site:p.site||p.location||p.address};
 const base=[['projectName','Proje'],['employer','İşveren / Ana Firma'],['company',kind==='taseron'?'Taşeron Firma':'Firma'],['contract','Sözleşme No'],['contractDate','Sözleşme Başlangıcı'],['contractEnd','Sözleşme Bitişi'],['tax','Vergi Dairesi / No'],['address','Adres'],['site','Şantiye Bilgileri']];
 const extra=kind==='firma'?window.CepheProFirma199.fields.filter(([k])=>!base.some(([b])=>b===k)&&k!=='claimNo'):[];
 const resolve=key=>(readOnly()?[snapshot[key]]:[period().info191?.[key],snapshot[key],m[key],project[key]]).find(v=>v!=null&&String(v).trim()!=='')??'';
 return [...base,...extra].map(([key,label])=>{let value=resolve(key);if(value===''&&!readOnly()&&kind==='firma'){if(key==='vatRate')value='20';if(key==='retentionRate')value='5';}return {key,label,value};});
}
function roundMoney(value){return Math.round((number(value)+Number.EPSILON)*100)/100;}
function totals(){const m=model(),work=allRows().filter(r=>m.selected[r.key]).reduce((sum,r)=>sum+roundMoney(r.payQuantity*r.price),0),extra=extras().reduce((sum,r)=>sum+roundMoney(number(r.qty)*number(r.price)),0),cuts=deductions().reduce((sum,r)=>sum+roundMoney(r.amount),0),gross=roundMoney(work+extra),retention=kind==='taseron'?roundMoney(gross*0.1):0;return{work:roundMoney(work),extras:roundMoney(extra),deductions:roundMoney(cuts),gross,retentionRate:kind==='taseron'?0.1:0,retention,net:roundMoney(gross-cuts-retention)};}

// V192: history is read from the selected owner's saved periods, never recalculated
// using the current period's prices or added to the current period's payment.
function pastClaims(){
 const current=period(),m=model(),labels=new Map();
 for(const p of m.periods190){const snap=p.snapshot191||p.snapshot190;for(const r of [...(snap?.editorRows||[]),...(snap?.rows||[])])labels.set(r.key,{block:r.block??r.b,facade:r.facade??r.f,item:r.item,unit:r.unit});}
 return m.periods190.filter(p=>number(p.number)<number(current.number)).sort((a,b)=>number(a.number)-number(b.number)).map(p=>{
  const snapshot=reportSnapshot193(p,m,labels);return{period:p,snapshot,rows:new Map(snapshot.rows.map(r=>[r.key,r]))};
 });
}
function snapshotTotals(snapshot){
 const sum=(rows,amount)=>{let total=0;for(const r of rows||[]){const value=amount(r);if(value===null)return null;total+=value;}return roundMoney(total);};
 const product=(a,b)=>reportNumber(a)===null||reportNumber(b)===null?null:roundMoney(Number(a)*Number(b));
 const work=sum(snapshot.rows,r=>product(r.quantity,r.price)),extra=sum(snapshot.extraRows,r=>product(r.qty,r.price)),cuts=sum(snapshot.cutRows,r=>reportNumber(r.amount)),gross=work===null||extra===null?null:roundMoney(work+extra),retention=gross===null?null:kind==='taseron'?roundMoney(gross*.1):0,net=gross===null||cuts===null?null:roundMoney(gross-cuts-retention);
 return{work,extras:extra,deductions:cuts,gross,retention,net};
}
function cumulativeState(history=pastClaims()){
 const m=model(),byKey=new Map(),aggregate={...totals()};
 const add=(key,quantity,amount)=>{const v=byKey.get(key)||{quantity:0,amount:0};v.quantity=v.quantity===null||quantity===null?null:Math.round((v.quantity+quantity)*10000)/10000;v.amount=v.amount===null||amount===null?null:roundMoney(v.amount+amount);byKey.set(key,v);};
 for(const {snapshot} of history){
  const t=snapshotTotals(snapshot);for(const key of ['work','extras','deductions','gross','retention','net'])aggregate[key]=aggregate[key]===null||t[key]===null?null:roundMoney(aggregate[key]+t[key]);
  for(const row of snapshot.rows){const q=reportNumber(row.quantity),p=reportNumber(row.price);add(row.key,q,q===null||p===null?null:roundMoney(q*p));}
 }
 for(const row of allRows())if(m.selected[row.key])add(row.key,row.payQuantity,roundMoney(row.payQuantity*row.price));
 return{byKey,totals:aggregate,numbers:[...history.map(h=>h.period.number),period().number]};
}
const cumulativeValue=value=>value===null?'Veri eksik':money(value);
function cumulativeSummary(state){
 return `<strong>${state.numbers.map(n=>n+'.').join(' + ')} dönemler · Kümülatif toplam</strong><div>${[['work','İmalat'],['extras','İlave iş'],['gross','Brüt'],['deductions','Kesintiler'],['retention','Teminat'],['net','Net']].map(([key,label])=>`<span>${label}: <b>${cumulativeValue(state.totals[key])}${state.totals[key]===null?'':' TL'}</b></span>`).join('')}</div>`;
}
function updateCumulative(){
 if(kind!=='taseron')return;const state=cumulativeState();
 if($('cl-cumulative-summary'))$('cl-cumulative-summary').innerHTML=cumulativeSummary(state);
 $('cl-body')?.querySelectorAll('[data-cumulative-field]').forEach(cell=>{const key=cell.closest('[data-claim-row]').dataset.claimRow;cell.textContent=cumulativeValue((state.byKey.get(key)||{quantity:0,amount:0})[cell.dataset.cumulativeField]);});
}
async function deletePeriod(id,fromCloud=false){
 if(!admin()||readOnly()||saving||deleting)return false;
 const target=model().periods190.find(p=>p.id===id);if(!target||id===period().id)return false;
 const message=fromCloud?`${target.number}. hakediş ve ekleri buluttan silinsin mi? Bu kayıt diğer kullanıcıların raporlarından da kaldırılır.`:`${target.number}. hakediş cihazdaki taslaktan silinsin mi? Bulut kaydı şimdi değişmez; Buluta Kaydet ile bu değişiklik buluta da uygulanır.`;
 if(!confirm(message))return false;
 capturePeriod();const previous=copy(data),previousPending=cloudPending,previousDirty=dirty,sessionOwner=owner,selectedOwner=recordOwner,selectedKind=kind;
 deleting=true;applyReadOnly();
 try{
  let nextRevision=revision;
  if(fromCloud){const r=await api('claims','DELETE',{ownerId:owner,kind,periodId:id,revision});nextRevision=r.revision;}
  if(owner!==sessionOwner||String(currentUser?.id)!==sessionOwner||recordOwner!==selectedOwner||kind!==selectedKind)return false;
  model().periods190=model().periods190.filter(p=>p.id!==id);delete model().periods186;
  revision=nextRevision;cloudPending=fromCloud?previousPending:true;dirty=fromCloud?previousDirty:false;changeVersion++;
  try{persistDraft();}catch(e){if(!fromCloud){data=previous;cloudPending=previousPending;dirty=previousDirty;throw e;}localStorage.removeItem(draftKey());toast('Buluttan silindi. Cihazdaki taslak kaydedilemedi.');}
  $('cl-status').textContent=fromCloud?'Hakediş ve ekleri buluttan silindi.':'Hakediş cihazdaki taslaktan silindi. Buluta yükleme bekliyor.';
  toast(fromCloud?'Hakediş buluttan silindi.':'Hakediş taslaktan silindi.');return true;
 }catch(e){toast('Hakediş silinemedi: '+e.message);return false;}
 finally{deleting=false;if(owner===sessionOwner&&recordOwner===selectedOwner&&kind===selectedKind){render();if(fromCloud)await refreshCatalog();}}
}
function historySummary(history){
 if(!history.length)return'';
 const fields=[['work','İmalat'],['extras','Tutanak / İlave İş'],['gross','Brüt'],['deductions','Kesintiler'],...(kind==='taseron'?[['retention','Teminat']]:[]),['net','Net']];
 const note=kind==='taseron'?'Dönem ayrıntıları Excel’de, seçili döneme kadar toplamlar ana tabloda gösterilir.':'Önceki firma hakedişlerini açabilir, karşılaştırabilir ve kendi kayıtlarınızı silebilirsiniz.';
 return `<section class="cl-history-summary" aria-label="Geçmiş hakedişler"><div class="cl-history-heading"><h3>Geçmiş Hakedişler</h3><p>${note}</p></div><div class="cl-scroll"><table><thead><tr><th>Hakediş</th>${fields.map(([,label])=>`<th>${label}</th>`).join('')}<th>İşlem</th></tr></thead><tbody>${history.map(({period:p,snapshot})=>{const t=snapshotTotals(snapshot);return `<tr data-history-summary="${esc(p.id)}"><th scope="row">${p.number}. Hakediş<small>${esc(p.month)}</small></th>${fields.map(([key])=>`<td>${t[key]==null?'—':money(t[key])+' TL'}</td>`).join('')}<td class="cl-history-actions"><button type="button" data-open-claim="${esc(p.id)}">${p.number}. Hakedişi aç</button>${readOnly()?'':`<button type="button" data-delete-claim="${esc(p.id)}">Sil</button><button type="button" data-delete-cloud-claim="${esc(p.id)}">Buluttan Sil</button>`}</td></tr>`;}).join('')}</tbody></table></div></section>`;
}
function historyTable(currentRows,history){
 const m=model(),current=period(),currentKeys=new Set(currentRows.map(r=>r.key)),meta=new Map(),s=scope(),state=cumulativeState(history);
 for(const {rows} of history)for(const [key,row] of rows)if(!currentKeys.has(key)){
  const r={key,b:row.block,f:row.facade,item:row.item,unit:row.unit,total:row.total,done:row.done};
  if(readOnly()||(accepts(s.block,r.b)&&accepts(s.facade,facadeKey(r))&&accepts(s.item,r.item)))meta.set(key,r);
 }
 const pastCells=key=>{const row=state.byKey.get(key)||{quantity:0,amount:0};return `<td class="cl-history-cell" data-cumulative-field="quantity">${cumulativeValue(row.quantity)}</td><td class="cl-history-cell" data-cumulative-field="amount">${cumulativeValue(row.amount)}</td>`;};
 const baseCells=r=>`<td>${esc(r.b)}</td><td>${esc(r.f)}</td><td>${esc(r.item)}</td><td>${esc(r.unit)}</td><td>${r.weight==null?'—':money(r.weight)}</td><td>${r.total==null?'—':money(r.total)}</td><td>${r.done==null?'—':money(r.done)}</td><td>${r.quantity==null?'—':money(r.quantity)}</td>`;
 const active=currentRows.map((r,i)=>`<tr data-claim-row="${esc(r.key)}"><td><input aria-label="${esc(r.b+' '+r.f+' '+r.item)} seç" type="checkbox" data-select="${i}" ${m.selected[r.key]?'checked':''}></td>${baseCells(r)}${pastCells(r.key)}<td><input type="text" inputmode="decimal" data-certified="${i}" aria-label="${esc(r.b+' '+r.f+' '+r.item)} hakediş yüzde veya metraj" placeholder="%15 veya 45" value="${esc(r.expression)}"></td><td data-certified-percent>${money(r.payPercent)}%</td><td data-certified-quantity>${money(r.payQuantity)}</td><td><span class="cl-price-value">${money(r.price)}</span><small>${r.mode==='manual'?'Revize':'Sözleşme'}</small></td><td data-certified-amount>${money(r.payQuantity*r.price)}</td></tr>`).join('');
 const archived=[...meta.values()].map(r=>`<tr data-claim-row="${esc(r.key)}" class="cl-history-only"><td>—</td>${baseCells(r)}${pastCells(r.key)}<td colspan="5">Bu dönemde imalat satırı yok · geçmiş dönem kaydı</td></tr>`).join('');
 const headers=['Seç','Blok','Cephe','İş Kalemi','Birim','Pursantaj %','Toplam Metraj','Kümülatif Yapılan',current.number+'. Dönem İmalatı'];
 return `<div class="cl-scroll cl-claim-table cl-history-table" tabindex="0" aria-label="Hakediş dönemleri tablosu; yatay kaydırılabilir"><table><thead><tr>${headers.map(t=>`<th rowspan="2" scope="col">${t}</th>`).join('')}<th colspan="2" scope="colgroup" class="cl-history-group">Seçili döneme kadar kümülatif verilen</th><th colspan="5" scope="colgroup" class="cl-current-group">${current.number}. Hakediş · ${esc(current.month)} · Seçili dönem</th></tr><tr><th class="cl-history-column" scope="col">Toplam Verilen Metraj</th><th class="cl-history-column" scope="col">Toplam İmalat Tutarı</th><th scope="col">Hakediş Girişi</th><th scope="col">Hakediş %</th><th scope="col">Hakediş Metrajı</th><th scope="col">Birim Fiyat</th><th scope="col">Tutar</th></tr></thead><tbody>${active+archived||`<tr><td colspan="16">Seçime uygun iş kalemi yok.</td></tr>`}</tbody></table></div>`;
}
function selectClaim(id){
 if(deleting)return;
 const m=model();if(!m.periods190.some(p=>p.id===id))return;
 capturePeriod();m.activePeriod190=id;closePanel();render();
}

function render(){
 if(!$('cl-body'))return;const m=model(),rr=rows(),per=period(),history=pastClaims();
 for(const k of ['firma','taseron']){const b=$('cl-'+k);b.classList.toggle('active',kind===k);b.setAttribute('aria-pressed',String(kind===k));}
 $('cl-pane').dataset.kind=kind;
 $('cl-body').innerHTML=`<section class="cl-claim-workspace">
 <div class="cl-period-toolbar"><label>Hakediş Seç<select id="cl-period-choice">${m.periods190.filter(p=>!readOnly()||p.snapshot191||p.snapshot190).map(p=>`<option value="${esc(p.id)}" ${p.id===per.id?'selected':''}>${p.number}. Hakediş · ${esc(p.month)}</option>`).join('')}</select></label><button type="button" id="cl-new-period">Yeni Hakediş</button><button type="button" id="cl-compare">Hakedişleri Karşılaştır</button></div><div class="cl-filterbar"><label class="cl-month">Hakediş Ayı<input id="cl-month" type="month" value="${esc(m.month)}"></label><div class="v55-pickerbar">${['block','facade','item'].map(pickerMarkup).join('')}</div></div>
 <div class="cl-filter-actions"><button type="button" id="cl-select">Görünenleri seç / kaldır</button><div class="cl-price-actions"><button type="button" id="cl-revise" aria-haspopup="dialog">Fiyatı revize et</button><button type="button" id="cl-contract">Sözleşme fiyatını kullan</button><label class="cl-period-number">Hakediş No<input type="number" id="cl-period-number" min="1" max="999" step="1" value="${per.number}"></label></div></div>
 <p class="cl-note">Arayıp kutucuklarla çoklu seçin. %15 toplam metrajın %15'ini, 45 doğrudan 45 birim hakedişi ifade eder. Boş giriş dönem imalatını kullanır.</p>
 <h3 class="cl-period-title">${per.number}. Hakediş Dönemi · ${esc(m.month)}</h3>
 ${historySummary(history)}
 ${kind==='taseron'?`<section id="cl-cumulative-summary" class="cl-cumulative-summary" aria-live="polite">${cumulativeSummary(cumulativeState(history))}</section>`:''}
 ${kind==='taseron'?historyTable(rr,history):`<div class="cl-scroll cl-claim-table"><table><thead><tr><th>Seç</th><th>Blok</th><th>Cephe</th><th>İş Kalemi</th><th>Birim</th><th>Pursantaj %</th><th>Toplam Metraj</th><th>Kümülatif Yapılan</th><th>Dönem İmalatı</th><th>Hakediş Girişi</th><th>Hakediş %</th><th>Hakediş Metrajı</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>${rr.map((r,i)=>`<tr><td><input aria-label="${esc(r.b+' '+r.f+' '+r.item)} seç" type="checkbox" data-select="${i}" ${m.selected[r.key]?'checked':''}></td><td>${esc(r.b)}</td><td>${esc(r.f)}</td><td>${esc(r.item)}</td><td>${esc(r.unit)}</td><td>${money(r.weight)}</td><td>${money(r.total)}</td><td>${money(r.done)}</td><td>${money(r.quantity)}</td><td><input type="text" inputmode="decimal" data-certified="${i}" aria-label="${esc(r.b+' '+r.f+' '+r.item)} hakediş yüzde veya metraj" placeholder="%15 veya 45" value="${esc(r.expression)}"></td><td data-certified-percent>${money(r.payPercent)}%</td><td data-certified-quantity>${money(r.payQuantity)}</td><td><span class="cl-price-value">${money(r.price)}</span><small>${r.mode==='manual'?'Revize':'Sözleşme'}</small></td><td data-certified-amount>${money(r.payQuantity*r.price)}</td></tr>`).join('')||'<tr><td colspan="14">Seçime uygun iş kalemi yok.</td></tr>'}</tbody></table></div>`}<p class="cl-total" id="cl-net-total"></p></section>
 <dialog id="cl-extras-dialog" class="cl-dialog" aria-labelledby="cl-extras-title"><div class="cl-dialog-head"><h3 id="cl-extras-title">İlave İşler ve Yevmiye</h3><button type="button" data-close-panel>Kapat</button></div><p>${esc(m.month)} dönemi</p><div class="cl-filters"><label>Tür<select id="cl-extra-type"><option>Tutanak</option><option>Ekstra İş</option><option>Yevmiye</option></select></label><label>Tarih<input id="cl-extra-date" type="date" value="${m.month===day().slice(0,7)?day():m.month+'-01'}"></label><label>Tutanak No<input id="cl-extra-report-no" maxlength="100"></label><label>Açıklama<input id="cl-extra-desc"></label><label>Miktar<input id="cl-extra-qty" type="number" min="0" step="any" value="1"></label><label>Birim<input id="cl-extra-unit" value="adet"></label><label>Birim Fiyat<input id="cl-extra-price" type="number" min="0" step="any" value="0"></label><label>Ek dosya (en fazla 500 KB)<input id="cl-extra-file" type="file"></label></div><button type="button" id="cl-add">Ekle</button><div class="cl-scroll"><table><thead><tr><th>Tutanak No</th><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th>Birim Fiyat</th><th>Tutar</th><th>Ek / İşlem</th></tr></thead><tbody>${m.extras.map((e,i)=>String(e.date).slice(0,7)!==m.month?'':`<tr><td>${esc(e.reportNo||'')}</td><td>${esc(e.date)}</td><td>${esc(e.type)}</td><td>${esc(e.desc)}</td><td>${money(e.qty)}</td><td>${esc(e.unit)}</td><td>${money(e.price)}</td><td>${money(e.qty*e.price)}</td><td>${esc(e.file?.name||'')} <button type="button" data-remove="${i}">Kaldır</button></td></tr>`).join('')||'<tr><td colspan="9">Bu dönemde ilave iş yok.</td></tr>'}</tbody></table></div></dialog>
 <dialog id="cl-deductions-dialog" class="cl-dialog" aria-labelledby="cl-deductions-title"><div class="cl-dialog-head"><h3 id="cl-deductions-title">Kesintiler</h3><button type="button" data-close-panel>Kapat</button></div><p>${esc(m.month)} dönemi · Kesintiler net hakedişten düşülür.</p><form id="cl-deduction-form"><div class="cl-filters"><label>Tarih<input id="cl-deduction-date" type="date" required min="${m.month}-01" max="${day(new Date(Number(m.month.slice(0,4)),Number(m.month.slice(5,7)),0,12))}" value="${m.month===day().slice(0,7)?day():m.month+'-01'}"></label><label>Kesinti Türü<select id="cl-deduction-type"><option>İSG Ceza</option><option>Malzeme</option><option>Avans</option><option>Nakit Teminat</option><option>Yemek/Konaklama</option><option>Şantiye Gider Katılımı</option><option>Diğer</option></select></label><label>Açıklama<input id="cl-deduction-desc" required maxlength="500" placeholder="Örn. İSG ceza kesintisi"></label><label>Tutar (TL)<input id="cl-deduction-amount" type="number" min="0.01" step="0.01" required></label></div><button type="submit">Kesinti Ekle</button></form><div class="cl-scroll"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${m.deductions.map((e,i)=>String(e.date).slice(0,7)!==m.month?'':`<tr><td>${esc(e.date)}</td><td>${esc(e.type||'Diğer')}</td><td>${esc(e.desc)}</td><td>${money(e.amount)}</td><td><button type="button" data-remove-deduction="${i}">Kaldır</button></td></tr>`).join('')||'<tr><td colspan="5">Bu dönemde kesinti yok.</td></tr>'}</tbody></table></div><p class="cl-total">Kesinti toplamı: ${money(deductions().reduce((s,e)=>s+number(e.amount),0))} TL</p><p class="cl-total" id="cl-deduction-net"></p></dialog>
 <dialog id="cl-info-dialog" class="cl-dialog" aria-labelledby="cl-info-title"><div class="cl-dialog-head"><h3 id="cl-info-title">Firma ve Sözleşme Bilgileri</h3><button type="button" data-close-panel>Kapat</button></div><div class="cl-info-grid">${companyFields().map(f=>`<label>${f.label}<input data-cl-info="${f.key}" value="${esc(f.value)}" ${['contractDate','contractEnd','claimDate','periodStart','periodEnd'].includes(f.key)?'type="date"':'type="text"'}></label>`).join('')}</div></dialog>`;
 function updateTotals(){const t=totals(),text=kind==='taseron'?`Brüt: ${money(t.gross)} TL · Kesintiler: ${money(t.deductions)} TL · %10 Teminat: ${money(t.retention)} TL · Net: ${money(t.net)} TL`:`Net dönem toplamı: ${money(t.net)} TL`;$('cl-net-total').textContent=text;$('cl-deduction-net').textContent=text;updateCumulative();}updateTotals();
 $('cl-body').querySelectorAll('[data-cl-info]').forEach(input=>input.oninput=()=>{(per.info191||={})[input.dataset.clInfo]=input.value;m[input.dataset.clInfo]=input.value;changed();});
 $('cl-body').querySelectorAll('[data-close-panel]').forEach(b=>b.onclick=closePanel);
 $('cl-body').querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{e.preventDefault();closePanel();}));
 if(panelMode&&panelMode!=='prices')$(panelMode==='info'?'cl-info-dialog':panelMode==='extras'?'cl-extras-dialog':'cl-deductions-dialog').showModal();
 $('cl-month').onchange=e=>{if(e.target.value){per.month=e.target.value;m.month=e.target.value;changed();render();}};
 $('cl-period-choice').onchange=e=>selectClaim(e.target.value);
 $('cl-body').querySelectorAll('[data-open-claim]').forEach(b=>b.onclick=()=>selectClaim(b.dataset.openClaim));
 $('cl-body').querySelectorAll('[data-delete-claim]').forEach(b=>b.onclick=()=>deletePeriod(b.dataset.deleteClaim));
 $('cl-body').querySelectorAll('[data-delete-cloud-claim]').forEach(b=>b.onclick=()=>deletePeriod(b.dataset.deleteCloudClaim,true));
 $('cl-new-period').onclick=newPeriod;$('cl-compare').onclick=comparePanel;
 $('cl-period-number').onchange=e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>999){e.target.value=per.number;return;}if(m.periods190.some(p=>p.id!==per.id&&p.number===n)){toast('Bu hakediş numarası kullanılıyor.');e.target.value=per.number;return;}per.number=n;changed();render();};
 bindPickers($('cl-body'));
 $('cl-select').onclick=()=>{const selected=rr.length&&rr.every(r=>m.selected[r.key]);rr.forEach(r=>m.selected[r.key]=!selected);changed();render();};
 $('cl-revise').onclick=()=>showPanel('prices');$('cl-contract').onclick=contractPrices;
 $('cl-body').querySelectorAll('[data-select]').forEach(input=>input.onchange=()=>{m.selected[rr[input.dataset.select].key]=input.checked;changed();updateTotals();});
 $('cl-body').querySelectorAll('[data-certified]').forEach(input=>{
  input.dataset.committedValue=input.value;
  input.commitClaim197=()=>{
   if(readOnly()||input.disabled)return true;
   if(input.value===input.dataset.committedValue){input.setCustomValidity('');return true;}
   const r=rr[input.dataset.certified],result=setCertified(r.key,input.value);
   if(result.error){input.setCustomValidity(result.error);input.focus();input.reportValidity();return false;}
   input.setCustomValidity('');input.dataset.committedValue=input.value;
   const tr=input.closest('tr');tr.querySelector('[data-certified-percent]').textContent=money(result.payPercent)+'%';tr.querySelector('[data-certified-quantity]').textContent=money(result.payQuantity);tr.querySelector('[data-certified-amount]').textContent=money(result.payQuantity*r.price);m.selected[r.key]=true;tr.querySelector('[data-select]').checked=true;updateTotals();return true;
  };
  input.oninput=()=>input.setCustomValidity('');
  input.onchange=()=>input.commitClaim197();
  // Enter is handled once by the capture listener.
 });
 $('cl-deduction-form').onsubmit=e=>{e.preventDefault();const desc=$('cl-deduction-desc').value.trim(),date=$('cl-deduction-date').value,amount=Number($('cl-deduction-amount').value);if(!desc||!date||date.slice(0,7)!==m.month||!Number.isFinite(amount)||amount<=0)return toast('Geçerli tarih, açıklama ve pozitif tutar girin.');m.deductions.push({type:$('cl-deduction-type').value,date,desc,amount});changed();render();};
 $('cl-body').querySelectorAll('[data-remove-deduction]').forEach(b=>b.onclick=()=>{m.deductions.splice(Number(b.dataset.removeDeduction),1);changed();render();});
 $('cl-body').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{m.extras.splice(Number(b.dataset.remove),1);changed();render();});
 $('cl-add').onclick=async()=>{const desc=$('cl-extra-desc').value.trim(),date=$('cl-extra-date').value,qty=Number($('cl-extra-qty').value),price=Number($('cl-extra-price').value);if(!desc||!date||date.slice(0,7)!==m.month||!Number.isFinite(qty)||!Number.isFinite(price)||qty<0||price<0)return toast('Geçerli tarih, açıklama, miktar ve fiyat girin.');const file=$('cl-extra-file').files[0];if(file?.size>500000)return toast('Ek dosya en fazla 500 KB olabilir.');let attachment=null;if(file)attachment={name:file.name,data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);})};m.extras.push({type:$('cl-extra-type').value,reportNo:$('cl-extra-report-no').value.trim(),date,desc,qty,unit:$('cl-extra-unit').value,price,file:attachment});changed();render();};
 applyReadOnly();
}
async function subcontractWorkbook(){
 await v52EnsureExcelJS();const report=currentReport();
 return window.__claimsReport191.build({ExcelJS,templateUrl:'/assets/taseron-hakedis-template-v191.xlsx',...report});
}

function persistDraft(){localStorage.setItem(draftKey(),JSON.stringify({data,revision,needsUpload:cloudPending,savedAt:new Date().toISOString()}));}
function handleClaimEnter198(e){
 const input=e.target;
 if(e.key!=='Enter'||!input?.matches?.('#cl-body [data-certified]')||e.isComposing||e.keyCode===229)return;
 if(readOnly()||input.disabled||input.readOnly)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.repeat||!input.commitClaim197?.())return;
 const fields=[...$('cl-body').querySelectorAll('[data-certified]')].filter(el=>!el.disabled&&!el.readOnly&&!el.closest('[hidden]'));
 const next=fields[fields.indexOf(input)+(e.shiftKey?-1:1)];
 if(next){next.focus({preventScroll:true});next.select();next.scrollIntoView?.({block:'nearest',inline:'nearest'});}
}
window.addEventListener('keydown',handleClaimEnter198,true);

function flushClaimInputs(){
 for(const input of $('cl-body')?.querySelectorAll('[data-certified]')||[])if(input.commitClaim197&&!input.commitClaim197())return false;
 return true;
}
function claimNotice(message){const status=$('cl-status');if(status)status.textContent=message;}
function saveLocal(silent=false){
 if(!admin()||readOnly()||deleting)return false;
 try{if(!flushClaimInputs())return false;capturePeriod();captureFirmaReport199();cloudPending=true;persistDraft();dirty=false;if(!silent)claimNotice('Bu cihazda kaydedildi. Excel güncel verilerle indirilebilir. Buluta yükleme bekliyor.');return true;}catch(e){claimNotice('Yerel kayıt yapılamadı: '+e.message);return false;}
}
async function save(){
 if(saving||deleting||!admin()||readOnly())return;
 if(!flushClaimInputs())return;
 const sessionOwner=owner;let refresh=false;
 saving=true;applyReadOnly();claimNotice('Buluta kaydediliyor…');
 try{
  capturePeriod();upgradeSavedPeriods();captureFirmaReport199();const sent=copy(data),sentRevision=revision,version=changeVersion;
  cloudPending=true;try{persistDraft();}catch(e){claimNotice('Cihazda taslak için yer yok; buluta kaydetme sürüyor…');}
  const r=await api('claims','PUT',{data:sent,revision:sentRevision,ownerId:owner,share:true});
  if(owner!==sessionOwner||String(currentUser?.id)!==sessionOwner)return;
  revision=r.revision;cloudPending=changeVersion!==version;dirty=cloudPending;
  let localWarning='';try{persistDraft();}catch(e){localWarning=' Cihazdaki taslak yenilenemedi.';}
  claimNotice((cloudPending?'Buluta kaydedildi; yeni değişiklikler bekliyor.':'Buluta kaydedildi. Diğer adminler açıp indirebilir.')+localWarning);refresh=true;
 }catch(e){if(owner===sessionOwner)claimNotice(e.message);}
 finally{saving=false;if(owner===sessionOwner){applyReadOnly();if(refresh)void refreshCatalog();}}
}
async function refreshCatalog(){const sessionOwner=owner;try{const r=await api('claims?list=1');if(owner!==sessionOwner||String(currentUser?.id)!==sessionOwner)return;catalog=r.records||[];renderRecordPicker();}catch(e){if($('cl-record-status'))$('cl-record-status').textContent='Paylaşılan kayıt listesi alınamadı. Yenile ile tekrar deneyin.';}}
function renderRecordPicker(){
 const select=$('cl-record-owner');if(!select)return;
 const list=[{ownerId:owner,ownerName:'Kendi hakedişlerim'},...catalog.filter(r=>String(r.ownerId)!==owner)];
 select.innerHTML=list.map(r=>`<option value="${esc(r.ownerId)}" ${String(r.ownerId)===recordOwner?'selected':''}>${esc(r.ownerName)}</option>`).join('');
 select.disabled=saving||deleting;$('cl-record-status').textContent=readOnly()?'Paylaşılan kayıt · görüntüleme ve indirme':'Buluta kaydettiğiniz hakedişleri diğer adminler görüntüleyip indirebilir.';
}
async function loadRecord(id,{discard=false}={}){
 const request=++loadGeneration,sessionOwner=owner,r=await api('claims?owner='+encodeURIComponent(id));
 if(request!==loadGeneration||String(currentUser?.id)!==sessionOwner)return false;
 data=r.data||{};revision=r.revision;recordOwner=String(r.ownerId||id);dirty=false;cloudPending=false;
 if(!readOnly()){
  if(discard)localStorage.removeItem(draftKey());
  else{try{const draft=JSON.parse(localStorage.getItem(draftKey())||'null');if(draft?.needsUpload&&draft.data){data=draft.data;revision=draft.revision;cloudPending=true;}}catch(e){toast('Cihazdaki taslak okunamadı. Bulut kaydı açıldı.');}}
 }
 if(readOnly()){const saved=p=>p.snapshot191||p.snapshot190;const types=[kind,...['firma','taseron'].filter(k=>k!==kind)];const available=types.find(k=>data[k]?.periods190?.some(saved));if(available){kind=available;const m=model();if(!saved(period()))m.activePeriod190=m.periods190.find(saved).id;}if($('cl-editor-title'))$('cl-editor-title').textContent=kindLabel();}
 loaded=true;renderRecordPicker();return true;
}
async function changeRecord(id){
 if(saving||deleting)return renderRecordPicker();
 if(!readOnly()&&(dirty||cloudPending)&&!confirm('Cihazda kaydettiğiniz taslak korunur. Kaydetmediğiniz değişiklikleri bırakarak başka hakedişi açmak istiyor musunuz?'))return renderRecordPicker();
 try{if(await loadRecord(id)){render();$('cl-status').textContent=readOnly()?'Buluttaki kayıt açıldı.':'Kendi hakedişleriniz açıldı.';}}catch(e){toast(e.message);renderRecordPicker();}
}
function applyReadOnly(){
 if(!$('cl-body'))return;
 for(const id of ['cl-save','cl-local-save']){const b=$(id);b.hidden=readOnly();b.disabled=readOnly()||saving||deleting;}
 if(readOnly()||deleting)$('cl-body').querySelectorAll('input,select,button').forEach(el=>{if(deleting||el.id!=='cl-period-choice'&&el.id!=='cl-compare'&&!el.hasAttribute('data-close-panel')&&!el.hasAttribute('data-open-claim'))el.disabled=true;});
 renderRecordPicker();
}

function closePanel(restoreFocus=true){
 const mode=panelMode;panelMode=null;closePickers();
 [...document.querySelectorAll('#cl-body dialog[open],#cl-price-dialog[open],#cl-compare-dialog[open]')].reverse().forEach(d=>d.close());
 if(mode==='prices')priceDraft=null;
 if(restoreFocus&&mode&&$('cl-editor-dialog')?.open)$(mode==='prices'?'cl-revise':mode==='info'?'cl-info':mode==='extras'?'cl-extras':'cl-deductions')?.focus();
}
function showPanel(mode){closePickers();if(mode==='prices')return startPriceRevision();panelMode=mode;$(mode==='info'?'cl-info-dialog':mode==='extras'?'cl-extras-dialog':'cl-deductions-dialog').showModal();}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
async function refreshExportRecord(){
 if(!readOnly())return;
 const sessionOwner=owner,selectedOwner=recordOwner,selectedKind=kind,selectedId=period().id;
 const r=await api('claims?owner='+encodeURIComponent(selectedOwner));
 if(String(currentUser?.id)!==sessionOwner||owner!==sessionOwner||recordOwner!==selectedOwner||kind!==selectedKind||period().id!==selectedId)throw Error('Seçim değişti. İndirmeyi yeniden başlatın.');
 const remote=r.data?.[selectedKind],selected=remote?.periods190?.find(p=>p.id===selectedId);
 if(!selected?.snapshot191&&!selected?.snapshot190)throw Error('Seçili dönem artık bulutta bulunmuyor. Kayıt listesini yenileyin.');
 data=r.data;revision=r.revision;remote.activePeriod190=selectedId;model();render();
}
async function workbook(){
 if(!flushClaimInputs())throw Error('Geçersiz hakediş girişini düzeltin.');
 const selection={kind,owner:recordOwner,id:period().id};
 await v52EnsureExcelJS();await refreshExportRecord();
 if(kind!==selection.kind||recordOwner!==selection.owner||period().id!==selection.id)throw Error('Seçim değişti. İndirmeyi yeniden başlatın.');
 if(!flushClaimInputs())throw Error('Geçersiz hakediş girişini düzeltin.');
 capturePeriod();if(kind==='taseron')return subcontractWorkbook();return firmaWorkbook199();}

let exporting=false;
async function excel(){
 if(exporting)return;exporting=true;$('cl-excel').disabled=true;
 const job={kind,number:period().number,month:model().month,id:period().id,owner:recordOwner};
 try{
  const {wb,extra}=await workbook(),bytes=await wb.xlsx.writeBuffer(),name=`${job.kind}-${job.number}-hakedis-${job.month}.xlsx`;
  if(kind!==job.kind||recordOwner!==job.owner||period().id!==job.id||period().number!==job.number||model().month!==job.month)throw Error('Seçim değişti. İndirmeyi yeniden başlatın.');
  if(extra.some(e=>e.file)){
   if(!window.JSZip)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/assets/jszip.min.js';s.onload=ok;s.onerror=no;document.head.append(s);});
   const zip=new JSZip();zip.file(name,bytes);
   extra.forEach((e,i)=>{if(e.file)zip.file(`Ekler/${e.periodNumber||job.number}.Hakediş/${i+1}-${String(e.file.name).replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').replace(/^\.+/,'_')}`,e.file.data.split(',')[1],{base64:true});});
   download(await zip.generateAsync({type:'blob'}),`${job.kind}-${job.number}-hakedis-ve-ekler-${job.month}.zip`);
  }else download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
 }catch(e){toast('Excel oluşturulamadı: '+e.message);}
 finally{exporting=false;if($('cl-excel'))$('cl-excel').disabled=false;}
}
async function open(showChoice=true){
 if(!admin())return;
 try{
  if(owner!==String(currentUser.id)){data={};revision=0;loaded=false;dirty=false;cloudPending=false;owner=String(currentUser.id);recordOwner=owner;catalog=[];}
  if(!loaded){if(!await loadRecord(recordOwner||owner))return;try{await window.__v169Financial?.load();}catch(e){if(!readOnly())throw e;}}
   await refreshCatalog();
  document.querySelectorAll('#settingsModal .settings-pane,#settingsModal .settingsTab').forEach(p=>p.classList.remove('active'));$('cl-pane').classList.add('active');$('cl-tab').classList.add('active');
  if(showChoice)closeEditor();else{render();$('cl-editor-dialog').showModal();}
 }catch(e){toast(e.message);}
}

function closeEditor(restoreFocus=true){
 closePanel(false);const editor=$('cl-editor-dialog');if(editor?.open)editor.close();
 if(restoreFocus&&$('cl-pane')?.classList.contains('active')&&getComputedStyle($('settingsModal')).display!=='none')$('cl-'+kind)?.focus();
}
function watchEditorVisibility(){
 const settings=$('settingsModal'),pane=$('cl-pane'),box=settings?.querySelector(':scope > .modal');
 if(!settings||!pane||pane.dataset.lifecycle198)return;pane.dataset.lifecycle198='1';
 const hidden=el=>!el||el.hidden||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden';
 const observer=new MutationObserver(()=>{
  if(!window.document||!pane.isConnected){observer.disconnect();return;}
  if($('cl-editor-dialog')?.open&&(hidden(settings)||hidden(box)||hidden(pane)||!pane.classList.contains('active')))closeEditor(false);
 });
 [settings,pane,box].filter(Boolean).forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class','style','hidden']}));
}
// Once a row enters a claim report, append new keys after it. The registry belongs
// to this claim type/owner and travels with local drafts and cloud records.
function rememberRowOrder195(m,newRows=[]){
 const order=[],seen=new Set(),append=key=>{if(typeof key==='string'&&key&&!seen.has(key)){seen.add(key);order.push(key);}};
 for(const key of m.rowOrder195||[])append(key);
 const periods=[...m.periods190].sort((a,b)=>number(a.number)-number(b.number));
 for(const p of periods){const snap=p.snapshot191||p.snapshot190;for(const key of snap?.rowOrder195||[])append(key);if(snap?.rows)for(const row of snap.rows)append(row.key);else if(p.id!==m.activePeriod190||!newRows.length)for(const key of Object.keys(p.selected||{}))if(p.selected[key])append(key);}
 for(const row of newRows)append(row.key);
 m.rowOrder195=order;return order;
}
function capturePeriod(){
 const per=period();if(readOnly())return per.snapshot191||per.snapshot190;
 if(per.snapshot191&&!per.dirty190){rememberRowOrder195(model());return per.snapshot191;}
 const m=model(),editorRows=allRows(),selected=editorRows.filter(r=>m.selected[r.key]),t=totals();
 const rows=selected.map(r=>({key:r.key,block:r.b,facade:r.f,item:r.item,unit:r.unit,total:r.total,done:r.done,quantity:r.payQuantity,price:r.price,amount:roundMoney(r.payQuantity*r.price)}));
 per.snapshot191={rowOrder195:[...rememberRowOrder195(m,rows)],version:191,savedAt:new Date().toISOString(),number:per.number,month:per.month,info:Object.fromEntries(companyFields().map(f=>[f.key,f.value])),rows,editorRows:copy(editorRows),extraRows:copy(extras()),cutRows:copy(deductions()),...t};
 per.snapshot190={savedAt:per.snapshot191.savedAt,rows:copy(rows),...t};per.dirty190=false;return per.snapshot191;
}
function upgradeSavedPeriods(){
 const previousKind=kind;
 try{for(const type of ['firma','taseron']){if(!data[type])continue;kind=type;const m=model(),active=m.activePeriod190;
  try{for(const per of m.periods190)if((per.snapshot190&&!per.snapshot191)||per.dirty190){m.activePeriod190=per.id;capturePeriod();}}
  finally{m.activePeriod190=active;model();}
 }}finally{kind=previousKind;model();}
}
// Export all persisted period formats, without upgrading or rewriting historical records.
const reportNumber=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
function reportSnapshot193(per,m,labels){
 if(Array.isArray(per.snapshot191?.rows))return copy(per.snapshot191);
 const saved=per.snapshot190,rows=[],notes=[];
 const localMetadata=new Map((per.editorRows||[]).map(r=>[r.key,r]));
 const hasSelection=Object.keys(per.selected||{}).length>0;
 const keys=saved?.rows?.map(r=>r.key)||[...new Set([...Object.keys(per.selected||{}),...Object.keys(per.entries||{})])].filter(key=>hasSelection?per.selected[key]:!!per.entries?.[key]);
 for(const key of keys){
  const original=saved?.rows?.find(r=>r.key===key)||localMetadata.get(key)||{},meta=labels.get(key)||{},entry=per.entries?.[key],price=reportNumber(original.price??per.prices?.[key]?.value);
  let quantity=reportNumber(original.quantity??original.payQuantity);
  if(quantity===null&&entry?.mode==='quantity')quantity=reportNumber(entry.value);
  if(quantity===null&&entry?.mode==='percent'&&reportNumber(original.total)!==null)quantity=number(original.total)*number(entry.value)/100;
  if(price===null||quantity===null)notes.push(`${per.number}. Hakediş / ${original.item||meta.item||key}: eski kayıtta fiyat veya miktar eksik.`);
  rows.push({key,block:original.block??original.b??meta.block??'',facade:original.facade??original.f??meta.facade??'',item:original.item??meta.item??key,unit:original.unit??meta.unit??'',total:reportNumber(original.total),done:reportNumber(original.done),quantity,price,amount:quantity===null||price===null?null:roundMoney(quantity*price)});
 }
 const info={};for(const key of ['projectName','company','contractDate','site','address','employer','contract','contractEnd','tax'])info[key]=per.info191?.[key]??saved?.info?.[key]??m[key]??'';
 const ledger=(snapshotKey,periodKey)=>copy(saved?.[snapshotKey]||per[periodKey]||[]).filter(e=>!e.date||String(e.date).slice(0,7)===per.month);
 if(!saved&&!keys.length&&!per.extras?.length&&!per.deductions?.length)notes.push(`${per.number}. Hakediş: bu döneme ait kayıtlı veri bulunmuyor.`);
 return{version:193,number:per.number,month:per.month,rows,info,extraRows:ledger('extraRows','extras'),cutRows:ledger('cutRows','deductions'),reportNotes:notes};
}
function currentReport(){
 if(!readOnly())capturePeriod();
 const per=period(),m=model(),archived=m.periods190.filter(p=>number(p.number)<=number(per.number)).sort((a,b)=>number(a.number)-number(b.number)),labels=new Map();
 for(const p of archived){const saved=p.snapshot191||p.snapshot190;for(const r of [...(saved?.editorRows||[]),...(saved?.rows||[])])labels.set(r.key,{block:r.block??r.b,facade:r.facade??r.f,item:r.item,unit:r.unit});}
 const periods=archived.map(p=>({id:p.id,number:p.number,month:p.month,snapshot:reportSnapshot193(p,m,labels)}));
 return{selectedPeriodId:per.id,periods,rowOrder:copy(m.rowOrder195||[]),snapshot:periods.find(p=>p.id===per.id)?.snapshot};
}


function firmaContractRows199(){
 const out=[],prices=window.__v169Financial?.data||{};
 for(const[b,faces]of Object.entries(DATA||{}))for(const[f,facade]of Object.entries(faces))for(const raw of facade.items||[]){
  const key=v34ItemKey(b,f,String(raw[0])),financialKey=[b,f,raw[0]].map(v=>encodeURIComponent(String(v||''))).join('|');
  const effective=typeof v25EffectiveItem==='function'?v25EffectiveItem(b,f,raw):raw;
  out.push({key,code:key,block:b,facade:f,item:String(raw[0]),unit:raw[8]||'',contractQuantity:window.CepheProFirma199.numeric(effective[1]),contractPrice:Object.prototype.hasOwnProperty.call(prices,financialKey)?window.CepheProFirma199.numeric(prices[financialKey]):null});
 }
 return out;
}
function captureFirmaReport199(){
 if(kind!=='firma'||readOnly())return;
 const s=period().snapshot191;if(!s)return;
 s.contractRows199=firmaContractRows199();
 s.info=Object.fromEntries(companyFields().map(f=>[f.key,f.value]));
 s.info.claimNo=period().number;
 s.reportVersion199=1;s.reportVersion200=1;
 // Save the report's actual current unit prices; a missing price stays null.
 const contracts=new Map(s.contractRows199.map(r=>[r.key,r]));
 s.firmaRows199=(s.rows||[]).map(r=>{
  const custom=period().prices?.[r.key],price=custom?.mode==='manual'?window.CepheProFirma199.numeric(custom.value):contracts.get(r.key)?.contractPrice??null;
  return {...r,price,amount:price===null?null:roundMoney(number(r.quantity)*price)};
 });
}
function firmaWorkbook199(){
 const api199=window.CepheProFirma199;if(!api199)throw Error('Firma rapor modülü yüklenemedi.');
 const report=currentReport();captureFirmaReport199();
 const snapshot=period().snapshot191||report.snapshot||{},m=model(),currentRows=snapshot.firmaRows199||snapshot.rows||[];
 const contracts=readOnly()?(snapshot.contractRows199||[]):firmaContractRows199();
 const selected=new Map(currentRows.map(r=>[r.key,r])),all=new Map(contracts.map(r=>[r.key,r]));
 const previousPeriods=report.periods.filter(p=>number(p.number)<number(period().number)).map(p=>({
  number:p.number,complete:!(p.snapshot?.reportNotes?.length),rows:p.snapshot?.firmaRows199||p.snapshot?.rows||[],
  extraRows:p.snapshot?.extraRows||[],cutRows:p.snapshot?.cutRows||[]
 }));
 for(const row of [...currentRows,...previousPeriods.flatMap(p=>p.rows)])if(!all.has(row.key))all.set(row.key,{key:row.key,code:row.key,block:row.block,facade:row.facade,item:row.item,unit:row.unit,contractQuantity:row.total??null,contractPrice:null});
 const rows=[...all.values()].map(r=>{
  const current=selected.get(r.key);
  return {...r,currentQuantity:current?current.quantity:0,currentPrice:current?current.price:r.contractPrice};
 });
 const info=readOnly()?{...(snapshot.info||{}),claimNo:period().number}:Object.fromEntries(companyFields().map(f=>[f.key,f.value]));
 info.claimNo=period().number;
 return api199.makeWorkbook(ExcelJS,{info,rows,previousPeriods,readOnly:readOnly(),currentExtras:snapshot.extraRows||[],currentCuts:snapshot.cutRows||[]});
}

function newPeriod(){
 if(readOnly())return toast('Yeni hakediş için kendi kayıtlarınızı seçin.');
 capturePeriod();const m=model(),prev=period(),next={id:'claim-'+crypto.randomUUID(),number:Math.max(...m.periods190.map(p=>number(p.number)))+1,month:m.month,entries:{},prices:copy(prev.prices),selected:copy(prev.selected),extras:[],deductions:[]};
 m.periods190.push(next);m.activePeriod190=next.id;changed();render();
}
function comparison(left,right){
 const a=left?.snapshot190,b=right?.snapshot190;if(!a||!b)return null;
 const am=new Map(a.rows.map(r=>[r.key,r])),bm=new Map(b.rows.map(r=>[r.key,r]));
 return{left:a,right:b,rows:[...new Set([...am.keys(),...bm.keys()])].map(key=>{const l=am.get(key),r=bm.get(key),meta=r||l;return{...meta,leftQuantity:number(l?.quantity),rightQuantity:number(r?.quantity),quantityDiff:number(r?.quantity)-number(l?.quantity),leftAmount:number(l?.amount),rightAmount:number(r?.amount),amountDiff:number(r?.amount)-number(l?.amount)};})};
}
function comparePanel(){
 capturePeriod();const m=model(),dialog=$('cl-compare-dialog'),current=period(),previous=m.periods190.filter(p=>p.id!==current.id).at(-1);
 const options=selected=>m.periods190.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${p.number}. Hakediş · ${esc(p.month)}</option>`).join('');
 dialog.innerHTML=`<div class="cl-dialog-head"><h3 id="cl-compare-title">${kindLabel()} — Dönem Karşılaştırması</h3><button type="button" id="cl-compare-close">Kapat</button></div><div class="cl-compare-selectors"><label>İlk hakediş<select id="cl-compare-left">${options(previous?.id||current.id)}</select></label><label>İkinci hakediş<select id="cl-compare-right">${options(current.id)}</select></label></div><div id="cl-compare-result"></div>`;
 dialog.oncancel=e=>{e.preventDefault();dialog.close();};$('cl-compare-close').onclick=()=>dialog.close();
 function draw(){
  const l=m.periods190.find(p=>p.id===$('cl-compare-left').value),r=m.periods190.find(p=>p.id===$('cl-compare-right').value),result=$('cl-compare-result');
  if(l.id===r.id){result.textContent='Karşılaştırmak için iki farklı hakediş seçin. Yeni Hakediş ile ikinci dönemi oluşturabilirsiniz.';return;}
  const c=comparison(l,r);if(!c){result.textContent='Eski hakediş için kayıt özeti bulunmuyor. O dönemi açıp kontrol ederek Buluta Kaydet ile kaydedin.';return;}
  const fields=[['work','İmalat Tutarı'],['extras','İlave İşler'],['deductions','Kesintiler'],...(kind==='taseron'?[['retention','Teminat']]:[]),['net','Net Hakediş']];
  result.innerHTML=`<div class="cl-scroll"><table><thead><tr><th>Özet (TL)</th><th>${l.number}. Hakediş</th><th>${r.number}. Hakediş</th><th>Fark (ikinci − ilk)</th></tr></thead><tbody>${fields.map(([key,label])=>`<tr><th>${label}</th><td>${money(c.left[key])}</td><td>${money(c.right[key])}</td><td>${money(c.right[key]-c.left[key])}</td></tr>`).join('')}</tbody></table></div><h4>İş Kalemleri</h4><div class="cl-scroll"><table><thead><tr><th>Blok / Cephe</th><th>İş Kalemi</th><th>Birim</th><th>${l.number}. Metraj</th><th>${r.number}. Metraj</th><th>Metraj Farkı</th><th>${l.number}. Tutar</th><th>${r.number}. Tutar</th><th>Tutar Farkı</th></tr></thead><tbody>${c.rows.map(row=>`<tr><td>${esc(row.block+' / '+row.facade)}</td><td>${esc(row.item)}</td><td>${esc(row.unit)}</td><td>${money(row.leftQuantity)}</td><td>${money(row.rightQuantity)}</td><td>${money(row.quantityDiff)}</td><td>${money(row.leftAmount)}</td><td>${money(row.rightAmount)}</td><td>${money(row.amountDiff)}</td></tr>`).join('')||'<tr><td colspan="9">Seçili iş kalemi yok.</td></tr>'}</tbody></table></div><p class="cl-note">Dönemlerin kayıtlı miktar ve fiyatları karşılaştırılır. Değişiklikleri Buluta Kaydet ile saklayın.</p>`;
 }
 $('cl-compare-left').onchange=draw;$('cl-compare-right').onchange=draw;draw();dialog.showModal();
}
let deleteRequest=0;
function closeDeletePanel(){deleteRequest++;$('cl-delete-panel')?.remove();}
async function deletePanel(){
 const request=++deleteRequest,userId=String(typeof currentUser==='undefined'?'':currentUser?.id??'');
 try{
  const result=await api('activity?view=uploads'),manager=!!result.canManageUploads,canMany=manager&&!!result.canDeleteMany;
  if(request!==deleteRequest||userId!==String(typeof currentUser==='undefined'?'':currentUser?.id??''))return;
  $('cl-delete-panel')?.remove();const panel=document.createElement('details');panel.id='cl-delete-panel';panel.className='cl-delete-panel';panel.open=true;panel.dataset.owner=String(result.currentUserId);panel.dataset.manager=String(manager);const el=id=>panel.querySelector('#'+id);
  const uploads=result.uploads||[],selected=new Set(),pending=new Set(),label=u=>`${String(u.work_date).slice(0,10)} · ${u.user_name||'Kullanıcı'} · ${u.count} kayıt`;
  panel.innerHTML=`<summary class="cl-delete-heading">Buluta yüklenen günlük hareketler</summary><button type="button" id="cl-delete-close">Kapat</button><p>${manager?'Kurucu adminin yüklemeleri diğer adminler tarafından silinemez.':'Yalnız kendi yüklemelerinizi silebilirsiniz.'}</p><div class="cl-delete-toolbar">${canMany?`<details class="cl-upload-picker"><summary id="cl-upload-picker-label">Yüklemeleri seç</summary><div class="cl-upload-options">${uploads.map((u,i)=>`<label><input type="checkbox" data-upload="${i}" ${u.canDelete===false?'disabled':''}><span>${esc(label(u))}${u.canDelete===false?` <small>${u.protected?'Kurucu':'Admin'} · korumalı</small>`:''}</span></label>`).join('')||'<span>Silinecek yükleme yok.</span>'}</div></details>`:`<select id="cl-upload-choice" aria-label="Kendi yüklemenizi seçin"><option value="">Yükleme seç</option>${uploads.filter(u=>String(u.user_id)===String(result.currentUserId)&&u.canDelete!==false).map(u=>`<option value="${uploads.indexOf(u)}">${esc(label(u))}</option>`).join('')}</select>`}<button type="button" id="cl-delete-one" disabled>Yüklemeni sil</button>${canMany?'<button type="button" id="cl-delete-selected" disabled>Yüklemeleri sil</button>':''}<button type="button" id="cl-delete-save" disabled>Kaydet</button></div><span id="cl-delete-status" role="status"></span>`;
  $('v113ActivityList').before(panel);
  let busy=false;
  const sync=()=>{
   const count=selected.size,own=count===1&&String(uploads[[...selected][0]]?.user_id)===String(result.currentUserId);
   el('cl-delete-one').disabled=busy||!own;
   if(canMany){el('cl-delete-selected').disabled=busy||!count;el('cl-upload-picker-label').textContent=count?`${count} yükleme seçili`:'Yüklemeleri seç';}
   el('cl-delete-save').disabled=busy||!pending.size;el('cl-delete-close').disabled=busy;
   panel.querySelectorAll('[data-upload]').forEach(input=>input.disabled=busy||uploads[Number(input.dataset.upload)]?.canDelete===false||pending.has(Number(input.dataset.upload)));
   const select=el('cl-upload-choice');if(select){select.disabled=busy;[...select.options].forEach(option=>{if(option.value!=='')option.disabled=pending.has(Number(option.value));});}
  };
  if(canMany)panel.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>{const index=Number(input.dataset.upload);if(busy||pending.has(index)||uploads[index]?.canDelete===false)return;input.checked?selected.add(index):selected.delete(index);sync();});
  else el('cl-upload-choice').onchange=e=>{selected.clear();if(e.target.value!==''&&!pending.has(Number(e.target.value)))selected.add(Number(e.target.value));sync();};
  const stage=many=>{
   if(busy||many&&!canMany)return;
   const choice=[...selected].filter(i=>uploads[i]&&uploads[i].canDelete!==false&&!pending.has(i));
   if(!choice.length||(!many&&(choice.length!==1||String(uploads[choice[0]].user_id)!==String(result.currentUserId))))return;
   if(!canMany)pending.clear();
   choice.forEach(i=>pending.add(i));selected.clear();
   panel.querySelectorAll('[data-upload]').forEach(input=>input.checked=false);
   if(el('cl-upload-choice'))el('cl-upload-choice').value='';
   el('cl-delete-status').textContent=`${pending.size} yükleme silinmek üzere seçildi. Uygulamak için Kaydet'e basın.`;sync();
  };
  el('cl-delete-one').onclick=()=>stage(false);if(canMany)el('cl-delete-selected').onclick=()=>stage(true);
  el('cl-delete-close').onclick=()=>{if(!busy){closeDeletePanel();$('cl-delete')?.focus();}};
  el('cl-delete-save').onclick=async()=>{
   if(busy||!pending.size)return;
   if(!confirm(`${pending.size} yükleme buluttan silinsin mi? Yerel çalışma geçmişi ve kümülatif metraj korunur.`))return;
   busy=true;sync();
   try{
    const targets=[...pending].map(i=>({userId:String(uploads[i].user_id),workDate:String(uploads[i].work_date).slice(0,10)}));
    const onlyOwn=targets.length===1&&targets[0].userId===String(result.currentUserId);
    const body=onlyOwn?{scope:'one',...targets[0]}:{scope:'selected',uploads:targets};
    const r=await api('activity','DELETE',body);
    pending.forEach(i=>{uploads[i].canDelete=false;const input=panel.querySelector(`[data-upload="${i}"]`);if(input)input.closest('label').remove();const option=el('cl-upload-choice')?.querySelector(`option[value="${i}"]`);if(option)option.remove();});
    pending.clear();el('cl-delete-status').textContent=`Kaydedildi. ${r.deleted} yükleme buluttan silindi.`;toast('Kaydedildi.');$('v113ActivityRefresh')?.click();
   }catch(e){el('cl-delete-status').textContent=e.message;}
   finally{busy=false;sync();}
  };
  sync();
 }catch(e){if(request===deleteRequest)toast(e.message);}
}
function setup(){const tabs=document.querySelector('#settingsModal .settings-tabs');if(tabs&&!$('cl-tab')){const b=document.createElement('button');b.id='cl-tab';b.className='settingsTab';b.textContent='Hakediş';tabs.append(b);b.onclick=open;const p=document.createElement('section');p.id='cl-pane';p.className='settings-pane';p.innerHTML='<div class="cl-kinds cl-entry-cards" role="group" aria-label="Hakediş türü"><button id="cl-firma"><strong>Firma Hakedişi</strong><span>Firma hakedişlerini düzenle ve karşılaştır</span></button><button id="cl-taseron"><strong>Taşeron Hakedişi</strong><span>Taşeron hakedişlerini düzenle ve karşılaştır</span></button></div><dialog id="cl-editor-dialog" class="cl-editor-dialog" aria-labelledby="cl-editor-title"><div class="cl-editor-head"><h2 id="cl-editor-title">Hakediş</h2><button type="button" id="cl-editor-close">Kapat</button></div><div class="cl-actions"><button id="cl-local-save">Kaydet</button><button id="cl-save">Buluta Kaydet</button><button id="cl-info" aria-haspopup="dialog">Firma Bilgileri</button><button id="cl-refresh">Yenile</button><button id="cl-excel">Excel ve Ekleri İndir</button><button id="cl-extras" aria-haspopup="dialog">Tutanak ve İlave İşler</button><button id="cl-deductions" aria-haspopup="dialog">Kesintiler</button><span id="cl-status" role="status"></span></div><div class="cl-record-bar"><label>Kayıt Sahibi<select id="cl-record-owner"></select></label><span id="cl-record-status" role="status"></span></div><div id="cl-body"></div><dialog id="cl-price-dialog" class="cl-dialog cl-price-dialog"></dialog><dialog id="cl-compare-dialog" class="cl-dialog cl-compare-dialog" aria-labelledby="cl-compare-title"></dialog></dialog>';$('settingsReport').after(p);for(const k of ['firma','taseron'])$('cl-'+k).onclick=()=>{if(deleting)return;if($('cl-editor-dialog').open&&!readOnly())capturePeriod();kind=k;if(readOnly()){const m=model(),first=m.periods190.find(p=>p.snapshot191||p.snapshot190);if(!first)return toast('Bu türde paylaşılan hakediş yok.');if(!period().snapshot191&&!period().snapshot190)m.activePeriod190=first.id;}render();$('cl-editor-title').textContent=kindLabel();$('cl-editor-dialog').showModal();};$('cl-editor-close').onclick=closeEditor;$('cl-editor-dialog').oncancel=e=>e.preventDefault();$('cl-save').onclick=save;$('cl-local-save').onclick=()=>saveLocal();$('cl-record-owner').onchange=e=>changeRecord(e.target.value);$('cl-info').onclick=()=>showPanel('info');$('cl-refresh').onclick=()=>{if(deleting)return;if(!(dirty||cloudPending)||confirm('Cihazdaki taslak yerine bulut kaydı yüklensin mi?')){loadRecord(recordOwner,{discard:true}).then(ok=>{if(ok){render();refreshCatalog();$('cl-status').textContent='Bulut kaydı yenilendi.';}}).catch(e=>toast(e.message));}};$('cl-excel').onclick=excel;$('cl-extras').onclick=()=>showPanel('extras');$('cl-deductions').onclick=()=>showPanel('deductions');}
if($('cl-tab')){watchEditorVisibility();$('cl-tab').hidden=!admin();if(!admin()){$('cl-pane').classList.remove('active');data={};owner='';recordOwner='';loadGeneration++;loaded=false;priceDraft=null;closeEditor();}}
const upload=$('v140ActivityUpload');if(upload&&!$('cl-delete')){const b=document.createElement('button');b.id='cl-delete';b.className='btn';b.textContent='Buluttan sil';upload.after(b);b.onclick=()=>{if($('cl-delete-panel')){$('cl-delete-panel').open=true;return;}deletePanel();};}
if($('cl-delete'))$('cl-delete').textContent='Buluttan sil';
const dp=$('cl-delete-panel');if(dp&&(typeof currentUser==='undefined'||!currentUser||dp.dataset.owner!==String(currentUser.id)||dp.dataset.manager!==String(admin())))dp.remove();}
const style=document.createElement('style');style.textContent=`#cl-pane .cl-kinds{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px}#cl-pane .cl-kinds button{padding:16px;font-size:15px;font-weight:700;background:#eef7f5;border:1px solid #b8d1cc;border-radius:8px}#cl-pane .cl-kinds button.active{background:#165c59;color:white}#cl-pane .cl-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}#cl-pane label{display:grid;gap:5px}#cl-pane input,#cl-pane select{min-width:0;padding:7px;box-sizing:border-box}#cl-pane input:not([type=checkbox]),#cl-pane select{width:100%}#cl-pane .cl-scroll{overflow:auto}#cl-pane table{width:100%;border-collapse:collapse}#cl-pane td,#cl-pane th{padding:8px;border-bottom:1px solid #c9dcd7;text-align:left}#cl-pane small{display:block;color:#637d77;font-size:10px}#cl-pane .cl-actions,#cl-pane .cl-bulk{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}#cl-pane button,.cl-delete-panel button{padding:9px;cursor:pointer;border:1px solid #bed2cd;border-radius:5px}#cl-pane .cl-picker{position:relative}#cl-pane summary{padding:8px;border:1px solid #bed2cd;border-radius:5px;cursor:pointer}#cl-pane .cl-options{position:absolute;z-index:40;background:white;border:1px solid #bed2cd;padding:10px;box-shadow:0 5px 16px #0002;min-width:230px;max-height:280px;overflow:auto}#cl-pane .cl-options label{display:flex;gap:8px;align-items:center;padding:5px}#cl-pane .cl-options label[hidden]{display:none}#cl-pane .cl-total{font-size:16px;font-weight:bold;color:#165c59}#cl-pane .cl-note{font-size:11px;color:#56706a}.cl-delete-panel{padding:15px;background:#fff6ed;border:1px solid #dfc2a8;border-radius:8px;margin:10px 0}.cl-delete-panel button{margin:5px}#cl-delete{display:block}#cl-pane input[hidden]{display:none}`;document.head.append(style);setInterval(setup,1200);setup();
window.__claims190={closeEditor,model,period,newPeriod,capturePeriod,comparison,comparePanel,open,save};
window.__claims191={saveLocal,changeRecord,readOnly,currentReport,loadRecord,refreshCatalog};
window.__claims194={deletePeriod,cumulativeState};
window.__claims182={rows,allRows,workbook};
window.__activity187={deletePanel,closeDeletePanel,setup};
window.__claims186={period,parseCertified,certified,setCertified,totals,subcontractWorkbook};
window.__claims185={scope,filterOptions,pickerFiltered,updatePickerSelection,revisionTargets,revisionGroups,applyRevision,newPrice,render,open,startPriceRevision};
})();
