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

const periodFieldKeys=new Set(['claimNo','claimDate','periodStart','periodEnd','advanceAmount','priceDifference','vatBase','withholdingBase','retentionBase']);
function periodInfo({period={},model={},project={},readOnly=false}={}){
 const snapshot=period.snapshot191?.info||period.snapshot190?.info||{},overrides=period.info191||{};
 const result={};
 const month=String(period.month||'');
 const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const range=validMonth?{periodStart:month+'-01',periodEnd:month+'-'+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()}: {};
 for(const[key]of [...fields,['site','Şantiye bilgileri']]){
  if(readOnly)result[key]=snapshot[key]??'';
  else if(own(overrides,key))result[key]=overrides[key]??'';
  else {
   const options=[snapshot[key],...(periodFieldKeys.has(key)?[]:[model[key],project[key]])];
   result[key]=options.find(v=>v!=null&&String(v).trim()!=='')??'';
  }
 }
 for(const key of ['periodStart','periodEnd'])if(!String(result[key]??'').trim()&&!own(overrides,key))result[key]=range[key]||'';
 result.claimNo=period.number??'';
 if(!readOnly){
  for(const[key,value]of [['vatRate',20],['retentionRate',5],['advanceAmount',0],['priceDifference',0],['withholdingRate',0],['vatWithholdingRate',0]])
   if(!String(result[key]??'').trim()&&!own(overrides,key))result[key]=value;
 }
 return result;
}
function periodPayload({selectedPeriodId,periods=[],contractRows=[],info={},readOnly=false}={}){
 const selected=periods.find(p=>p.id===selectedPeriodId);
 if(!selected)throw Error('Seçili hakediş bulunamadı.');
 if(!Number.isInteger(numeric(selected.number))||numeric(selected.number)<1)throw Error('Geçerli hakediş numarası gerekli.');
 const snapshot=selected.snapshot||selected.snapshot191||selected.snapshot190;
 if(!snapshot)throw Error('Seçili hakedişin dönem verisi bulunamadı.');
 const copy=value=>JSON.parse(JSON.stringify(value));
 const currentRows=snapshot.firmaRows199||snapshot.rows||[];
 const contracts=readOnly?(snapshot.contractRows199||[]):contractRows;
 const previousPeriods=periods.filter(p=>numeric(p.number)!==null&&numeric(p.number)<numeric(selected.number)).sort((a,b)=>numeric(a.number)-numeric(b.number)).map(p=>{
  const s=p.snapshot||p.snapshot191||p.snapshot190;
  return {number:p.number,complete:!!s&&!(s.reportNotes?.length),rows:s?.firmaRows199||s?.rows||[],extraRows:s?.extraRows||[],cutRows:s?.cutRows||[]};
 });
 const all=new Map(contracts.map(r=>[r.key,r])),current=new Map(currentRows.map(r=>[r.key,r]));
 for(const row of [...currentRows,...previousPeriods.flatMap(p=>p.rows)])if(!all.has(row.key))all.set(row.key,{key:row.key,code:row.code||row.key,block:row.block??row.b,facade:row.facade??row.f,item:row.item,unit:row.unit,contractQuantity:row.total??null,contractPrice:null});
 const rows=[...all.values()].map(r=>({...r,currentQuantity:current.has(r.key)?current.get(r.key).quantity:0,currentPrice:current.has(r.key)?current.get(r.key).price:r.contractPrice}));
 const reportInfo={...(readOnly?(snapshot.info||{}):info),claimNo:selected.number};
 if(!reportInfo.periodStart||!reportInfo.periodEnd){
  const inferred=periodInfo({period:{...selected,snapshot191:{info:reportInfo}},readOnly:true});
  reportInfo.periodStart ||= inferred.periodStart;reportInfo.periodEnd ||= inferred.periodEnd;
 }
 return copy({info:reportInfo,rows,previousPeriods,readOnly,currentExtras:snapshot.extraRows||[],currentCuts:snapshot.cutRows||[]});
}

root.CepheProFirma199={numeric,rate,resolveInfo,periodInfo,periodPayload,periodFieldKeys,prepare,makeWorkbook,fields,version:201};
})(typeof window==='undefined'?globalThis:window);
