(()=>{
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)),num=v=>Number.isFinite(Number(v))?Number(v):0,round=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
const column=n=>{let value='';for(;n;n=Math.floor((n-1)/26))value=String.fromCharCode(65+(n-1)%26)+value;return value;};
const date=v=>{if(!v)return null;const s=String(v).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())?d:null;};
const numeric=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
const rowAmount=r=>numeric(r.price)===null&&numeric(r.quantity)===null?'':numeric(r.price)===null||numeric(r.quantity)===null?'Eksik giriş':round(r.price*r.quantity);
const workTotal=snapshot=>(snapshot?.rows||[]).some(r=>rowAmount(r)==='Eksik giriş')?'Eksik giriş':round((snapshot?.rows||[]).reduce((sum,r)=>sum+num(rowAmount(r)),0));
let templateBytes;
async function build({ExcelJS,templateUrl,periods,selectedPeriodId,rowOrder=[]}){
 if(!periods?.length)throw Error('İndirilecek kayıtlı hakediş bulunamadı.');
 const active=periods.find(p=>p.id===selectedPeriodId);if(!active?.snapshot?.rows)throw Error('Seçili dönem raporu eksik.');
 periods=[...periods].filter(p=>num(p.number)<=num(active.number)).sort((a,b)=>num(a.number)-num(b.number));
 if(!templateBytes){const r=await fetch(templateUrl,{cache:'no-cache'});if(!r.ok)throw Error('Excel şablonu yüklenemedi.');templateBytes=await r.arrayBuffer();}
 const template=new ExcelJS.Workbook();await template.xlsx.load(templateBytes.slice(0));
 const wb=new ExcelJS.Workbook();wb.creator='CephePro';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
 const s=wb.addWorksheet('Özet'),h=wb.addWorksheet('Hakediş'),t=wb.addWorksheet('Tutanak ve Ekler'),k=wb.addWorksheet('Kesintiler'),g=wb.addWorksheet('Kullanım Kılavuzu');
 const ts=template.getWorksheet('Özet'),th=template.getWorksheet('Hakediş'),tt=template.getWorksheet('Tutanak ve Ekler'),tk=template.getWorksheet('Kesintiler');
 const slots=periods.map(p=>({...p}));while(slots.length<3)slots.push({number:Math.max(0,...slots.map(p=>num(p.number)))+1,snapshot:null});
 const n=slots.length,bound=8+3*n,controlCol=bound+3,endCol=bound+4,summaryBound=n+2,summaryTotal=n+3;
 const last=column(bound),sumLast=column(summaryBound),totalCol=column(summaryTotal);
 const metadata=new Map(),discovered=[];for(const per of periods)for(const r of per.snapshot.rows){if(!metadata.has(r.key))discovered.push(r.key);metadata.set(r.key,r);}
 const remembered=rowOrder.length?rowOrder:[...periods].reverse().find(p=>p.snapshot.rowOrder195?.length)?.snapshot.rowOrder195||[];
 const keys=[...new Set([...remembered,...discovered])].filter(key=>metadata.has(key));
 for(const r of active.snapshot.editorRows||[]){if(metadata.has(r.key))metadata.set(r.key,{...metadata.get(r.key),block:r.b,facade:r.f,item:r.item,unit:r.unit,total:r.total,done:r.done});}
 for(const r of active.snapshot.rows)metadata.set(r.key,r);
 const count=Math.max(100,keys.length),end=7+count,extra=[];
 const style=(sheet,target,source,address)=>{sheet.getCell(target).style=clone(source.getCell(address).style||{});};
 const value=(sheet,address,v)=>{sheet.getCell(address).value=v==null?null:v;};
 const formula=(sheet,address,f,result)=>{sheet.getCell(address).value={formula:f.replace(/^=/,''),result};};
 const money=ts.getCell('B15').numFmt||'#,##0.00';
 const header=(sh,row,a,b)=>{for(let c=a;c<=b;c++){sh.getCell(row,c).style=clone(th.getCell('G7').style);sh.getCell(row,c).alignment={vertical:'middle',horizontal:'center',wrapText:true};}sh.getRow(row).height=32;};
 wb.eachSheet(sh=>{sh.views=[{showGridLines:false}];sh.properties.defaultRowHeight=24;sh.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};});
 for(let c=1;c<=summaryTotal;c++){s.getColumn(c).width=ts.getColumn(c===1?1:c===summaryBound?5:c===summaryTotal?6:2).width;for(let r=1;r<=29;r++)style(s,`${column(c)}${r}`,ts,`${c===1?'A':c===summaryBound?'E':c===summaryTotal?'F':'B'}${r}`);}
 for(const r of [2,4,5,6,7,9,10,11,12,13,15,16,17,18,19,20,23,24,25,26,28,29])value(s,`A${r}`,ts.getCell(`A${r}`).value);
 s.getRow(2).height=32;s.getRow(10).height=38;s.getRow(20).height=32;
 const info=active.snapshot.info||{};
 value(s,'B4',info.projectName||'');value(s,'B5',info.company||'');value(s,'B6',date(info.contractDate));value(s,'B7',info.site||info.address||'');
 value(s,'B9',`Seçili: ${active.number}. Hakediş · ${active.month}`);
 value(s,`${sumLast}10`,'Dönem sonu');value(s,`${totalCol}10`,'GENEL TOPLAM');
 value(s,'B28','Tutarlar TL. Seçili dönem ve önceki kayıtlı dönemler gösterilir.');value(s,'B29','Sonraki dönemler ve kayıt dışı ekran filtreleri rapora alınmaz.');
 for(let c=1;c<=endCol;c++){
  const source=c===3?2:c===endCol?9:c<=7?(c<3?c:c-1):c===bound?16:c>bound?17+c-bound-1:7+(c-8)%3;
  h.getColumn(c).width=th.getColumn(source).width;
  for(let r=1;r<=end;r++)style(h,`${column(c)}${r}`,th,`${column(source)}${r<=7?r:8}`);
 }
 value(h,'A2',th.getCell('A2').value);value(h,'A3','Toplam ve kümülatif metraj kayıtlı dönem verisidir. Verilecek Miktar yalnız ilgili hakedişin ödeme miktarıdır.');value(h,'A4','Dönem no');
 h.getColumn(3).width=14;
 const headers=['Blok','Cephe','Poz No','İş Kalemi','Toplam Metraj','Kümülatif Metraj','Birim'];
 for(const per of slots)headers.push(`Birim Fiyat ${per.number}`,`Verilecek Miktar ${per.number}`,`Tutar ${per.number}`);
 headers.push('Dönem sonu','Toplam Verilen','Verilebilir Bakiye','Kontrol','Kümülatif Tutar');
 const maps=slots.map(p=>new Map((p.snapshot?.rows||[]).map(r=>[r.key,r])));
 const workRows=[];let workWarnings=0;
 for(let i=0;i<count;i++){
  const r=8+i,key=keys[i],meta=metadata.get(key),line=meta?[meta.block,meta.facade,String(meta.pozNo??''),meta.item,meta.total??null,meta.done??null,meta.unit]:[null,null,null,null,null,null,null];
  let paid=0;
  slots.forEach((per,j)=>{const row=maps[j].get(key),p=column(8+j*3),q=column(9+j*3);if(row)paid+=num(row.quantity);line.push(row?numeric(row.price):null,row?numeric(row.quantity):null,{formula:`IF(AND(${p}${r}="",${q}${r}=""),"",IF(COUNT(${p}${r}:${q}${r})<2,"Eksik giriş",ROUND(${p}${r}*${q}${r},2)))`,result:row?rowAmount(row):''});});
  const given=column(bound+1),balance=column(bound+2),status=!meta?'':!meta.block||!meta.facade||!meta.item||!meta.unit?'Tanım eksik':meta.total==null||meta.done==null?'Metraj eksik':maps.some(m=>m.has(key)&&rowAmount(m.get(key))==='Eksik giriş')?'Fiyat / miktar eksik':num(meta.done)>num(meta.total)?'Kümülatif > toplam':paid>num(meta.done)+1e-7?'Verilen > kümülatif':'Uygun';if(status&&status!=='Uygun')workWarnings++;
  line.push(null,{formula:`IF(AND(COUNTA($A${r}:$G${r})=0,COUNT($H${r}:$${last}${r})=0),"",SUMIFS($H${r}:$${last}${r},$H$4:$${last}$4,"Miktar"))`,result:meta?paid:''},{formula:`IF($F${r}="","",$F${r}-${given}${r})`,result:meta&&meta.done!=null?num(meta.done)-paid:''},{formula:`IF(AND(COUNTA($A${r}:$G${r})=0,COUNT($H${r}:$${last}${r})=0),"",IF(OR($A${r}="",$B${r}="",$D${r}="",$G${r}=""),"Tanım eksik",IF(COUNT($E${r}:$F${r})<2,"Metraj eksik",IF(COUNTIFS($H${r}:$${last}${r},"Eksik giriş")>0,"Fiyat / miktar eksik",IF(MIN($E${r}:$${last}${r})<0,"Negatif giriş",IF($F${r}>$E${r},"Kümülatif > toplam",IF(${given}${r}>$F${r},"Verilen > kümülatif","Uygun")))))))`,result:status});
  const amounts=maps.map(m=>m.get(key)).filter(Boolean).map(rowAmount),totalAmount=amounts.includes('Eksik giriş')?'Eksik giriş':round(amounts.reduce((sum,value)=>sum+num(value),0));
  line.push({formula:`IF(AND(COUNTA($A${r}:$G${r})=0,COUNT($H${r}:$${last}${r})=0),"",IF(COUNTIF($H${r}:$${last}${r},"Eksik giriş")>0,"Eksik giriş",SUM(${slots.map((_,j)=>column(10+j*3)+r).join(',')})))`,result:meta?totalAmount:''});
  workRows.push(line);
 }
 h.addTable({name:'tblHakedis',ref:'A7',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:false},columns:headers.map(name=>({name,filterButton:true})),rows:workRows});header(h,7,1,endCol);
 slots.forEach((per,j)=>{const p=column(8+j*3),q=column(9+j*3),a=column(10+j*3);value(h,`${q}4`,'Miktar');value(h,`${a}4`,per.number);h.mergeCells(`${p}5:${a}5`);style(h,`${p}5`,th,'G5');formula(h,`${p}5`,`${a}4&". Hakediş Dönemi"`,`${per.number}. Hakediş Dönemi`);formula(h,`${a}6`,`IF(COUNTIFS(tblHakedis[Tutar ${per.number}],"Eksik giriş")>0,"Eksik giriş",SUM(tblHakedis[Tutar ${per.number}]))`,workTotal(per.snapshot));h.getCell(`${a}6`).numFmt=money;});
 const amountTotals=slots.map(p=>workTotal(p.snapshot)),cumulativeAmount=amountTotals.some(v=>typeof v!=='number')?'Eksik giriş':round(amountTotals.reduce((sum,v)=>sum+v,0));
 formula(h,`${column(endCol)}6`,'IF(COUNTIFS(tblHakedis[Kümülatif Tutar],"Eksik giriş")>0,"Eksik giriş",SUM(tblHakedis[Kümülatif Tutar]))',cumulativeAmount);h.getCell(`${column(endCol)}6`).numFmt=money;
 h.views=[{state:'frozen',xSplit:7,ySplit:7,showGridLines:false}];
 const ledger=(sheet,src,tableName,field)=>{
  const records=[];for(const per of periods)for(const entry of per.snapshot[field]||[])records.push({entry,per});
  const len=Math.max(100,records.length),rows=[];
  for(let c=1;c<=9;c++){sheet.getColumn(c).width=src.getColumn(c).width;for(let r=1;r<=len+7;r++)style(sheet,`${column(c)}${r}`,src,`${column(c)}${r<=7?r:8}`);}
  value(sheet,'A2',src.getCell('A2').value);value(sheet,'A3','Her kayıt Hakediş Dönemi numarasıyla özet sayfasına bağlanır.');
  value(sheet,'A4',`Seçili dönem: ${active.number}. Hakediş · ${active.month}`);
  for(let i=0;i<len;i++){
   const rec=records[i],r=i+8,e=rec?.entry,qty=e?(field==='cutRows'?1:num(e.qty)):null,price=e?(field==='cutRows'?num(e.amount):num(e.price)):null;
   rows.push([e?date(e.date):null,rec?.per.number??null,e?.type??null,e?.desc??null,qty,e?(field==='cutRows'?'adet':e.unit):null,price,{formula:`IF(COUNTA(A${r}:G${r})=0,"",IF(COUNT(E${r},G${r})<2,"Eksik giriş",ROUND(E${r}*G${r},2)))`,result:e?round(qty*price):''},{formula:`IF(COUNTA(A${r}:G${r})=0,"",IF(OR(COUNT(A${r},B${r},E${r},G${r})<4,C${r}="",D${r}="",F${r}=""),"Eksik giriş",IF(COUNTIFS('Özet'!$B$10:$${sumLast}$10,B${r})<>1,"Dönem yok / tekrar",IF(OR(E${r}<0,G${r}<0),"Negatif giriş","Uygun"))))`,result:e?'Uygun':''}]);
   if(e?.file)extra.push({...e,periodNumber:rec.per.number});
  }
  sheet.addTable({name:tableName,ref:'A7',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:false},columns:['Tarih','Hakediş Dönemi','Tür','Açıklama','Miktar','Birim','Birim Fiyat','Tutar','Kontrol'].map(name=>({name,filterButton:true})),rows});header(sheet,7,1,9);sheet.views=[{state:'frozen',ySplit:7,showGridLines:false}];
  sheet.getColumn('A').numFmt='dd/mm/yyyy';sheet.getColumn('G').numFmt=money;sheet.getColumn('H').numFmt=money;
  for(let r=8;r<=len+7;r++){sheet.getCell(`B${r}`).dataValidation={type:'whole',operator:'between',formulae:[1,9999],allowBlank:true};sheet.getCell(`C${r}`).dataValidation={type:'list',allowBlank:true,formulae:[field==='cutRows'?'"İSG Ceza,Malzeme,Avans,Diğer"':'"Tutanak,Ekstra İş,Yevmiye"']};}
  sheet.addConditionalFormatting({ref:`I8:I${len+7}`,rules:[{type:'expression',formulae:['AND(I8<>"",I8<>"Uygun")'],style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFCE8E6'}},font:{color:{argb:'FF9C2525'}}}}]});
 };
 ledger(t,tt,'tblTutanak','extraRows');ledger(k,tk,'tblKesinti','cutRows');
 const values=[];
 slots.forEach((per,i)=>{
  const c=column(i+2),snap=per.snapshot,work=workTotal(snap),extras=round((snap?.extraRows||[]).reduce((sum,r)=>sum+round(r.qty*r.price),0)),cuts=round((snap?.cutRows||[]).reduce((sum,r)=>sum+round(r.amount),0)),gross=typeof work==='number'?round(work+extras):'Eksik giriş',retention=typeof gross==='number'?round(gross*0.1):'Eksik giriş',net=typeof gross==='number'?round(gross-cuts-retention):'Eksik giriş';values.push([work,extras,gross,cuts,retention,net]);
  value(s,`${c}10`,per.number);s.getCell(`${c}10`).numFmt='0". Hakediş Dönemi"';value(s,`${c}13`,0.1);
  if(per.month){value(s,`${c}11`,date(per.month+'-01'));const d=new Date(per.month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);value(s,`${c}12`,d);}
  formula(s,`${c}15`,`INDEX('Hakediş'!$H$6:$${last}$6,1,MATCH(${c}$10,'Hakediş'!$H$4:$${last}$4,0))`,work);
  formula(s,`${c}16`,`IF(COUNTIFS(tblTutanak[Hakediş Dönemi],${c}$10,tblTutanak[Tutar],"Eksik giriş")>0,"Eksik giriş",SUMIFS(tblTutanak[Tutar],tblTutanak[Hakediş Dönemi],${c}$10))`,extras);
  formula(s,`${c}17`,`IF(COUNT(${c}15:${c}16)=2,SUM(${c}15:${c}16),"Eksik giriş")`,gross);
  formula(s,`${c}18`,`IF(COUNTIFS(tblKesinti[Hakediş Dönemi],${c}$10,tblKesinti[Tutar],"Eksik giriş")>0,"Eksik giriş",SUMIFS(tblKesinti[Tutar],tblKesinti[Hakediş Dönemi],${c}$10))`,cuts);
  formula(s,`${c}19`,`IF(AND(ISNUMBER(${c}17),ISNUMBER(${c}13)),ROUND(${c}17*${c}13,2),"Eksik giriş")`,retention);
  formula(s,`${c}20`,`IF(COUNT(${c}17:${c}19)=3,${c}17-${c}18-${c}19,"Eksik giriş")`,net);
 });
 for(let r=15;r<=20;r++)formula(s,`${totalCol}${r}`,`IF(COUNT(B${r}:${sumLast}${r})=COUNT($B$10:$${sumLast}$10),SUM(B${r}:${sumLast}${r}),"Eksik giriş")`,values.some(v=>typeof v[r-15]!=='number')?'Eksik giriş':round(values.reduce((sum,v)=>sum+v[r-15],0)));
 ['tblHakedis','tblTutanak','tblKesinti'].forEach((name,i)=>formula(s,`B${24+i}`,`ROWS(${name}[Kontrol])-COUNTBLANK(${name}[Kontrol])-COUNTIFS(${name}[Kontrol],"Uygun")`,i?0:workWarnings));
 s.getCell('B6').numFmt='dd/mm/yyyy';s.getCell('B9').alignment={wrapText:false};
 g.getColumn(1).width=30;g.getColumn(2).width=115;
 g.addRows([['Hakediş Raporu','Kullanım'],['Seçili dönem',`${active.number}. Hakediş · ${active.month}`],['Kayıt esası','Rapor kayıtlı fiyat, metraj, firma bilgileri, tutanak ve kesintilerden hazırlanır. Sonraki dönemler dışarıda bırakılır.'],['Geçmiş dönemler','Önceki iş kalemleri satır sırasını korur; yeni cephe ve iş kalemleri listenin sonuna eklenir. Dönemler kendi miktar ve fiyatlarıyla yan yana gösterilir.'],['Toplam ve kümülatif','Toplam Verilen ve Kümülatif Tutar, seçili döneme kadar kayıtlı hakedişlerin toplamıdır. Eski bir kayıtta metraj bilgisi bulunmuyorsa boş bırakılır.'],['Tutar','Her dönemin fiyatı × o dönemde verilecek miktar. Satır tutarı iki ondalığa yuvarlanır.'],['Brüt ve net','Brüt = İmalat + Tutanak. Teminat = Brüt × %10. Net = Brüt − Kesintiler − Teminat.'],['Ekler','Ek dosyaları varsa Excel ile aynı ZIP içinde, hakediş numarası altında bulunur.'],['Yeni dönem',`Hakediş sayfasında ${last} Dönem sonu sütununun soluna 3 tam sütun ekleyin. Son dönem grubunu kopyalayın; başlıkları ve dönem numarasını güncelleyin. Yeni fiyat/miktar girişlerini temizleyin; tutar formüllerini koruyun.`],['Yeni dönem toplamı','Yeni tutar sütununun 6. satırında tblHakedis[Tutar N] başvurularını yeni dönem numarasına göre değiştirin.'],['Özete ekleme',`Özet sayfasında ${sumLast} Dönem sonu sütununun soluna bir sütun ekleyin. Önceki dönemin 10:20 satırlarını Ctrl+C / Ctrl+V ile kopyalayın; 10. satıra yeni numarayı yazın.`],['Kontrol','Tablo aralıklarının ve toplam verilen metraj hesabının yeni sütunları kapsadığını kontrol edin. Önceki dönemlerin girişlerini değiştirmeyin.'],['Yeni kayıt satırı','Tabloya satır ekleyin. Formüller otomatik taşınmazsa önceki satırdaki formül hücrelerini aşağı kopyalayın.'],['Kapsam','Tutarlar TL. KDV, vergi ve teminat iadesi ayrıca hesaplanmaz.']]);
 for(const per of periods)for(const note of per.snapshot.reportNotes||[])g.addRow(['Eski dönem kaydı',note]);
 g.eachRow((row,i)=>{row.height=i===1?30:42;row.eachCell(cell=>{cell.font={name:'Arial',size:10};cell.alignment={vertical:'middle',wrapText:true};});});header(g,1,1,2);
 s.addConditionalFormatting({ref:`B24:B26`,rules:[{type:'cellIs',operator:'greaterThan',formulae:[0],style:{font:{color:{argb:'FF9C2525'},bold:true}}}]});
 h.addConditionalFormatting({ref:`${column(controlCol)}8:${column(controlCol)}${end}`,rules:[{type:'expression',formulae:[`AND(${column(controlCol)}8<>"",${column(controlCol)}8<>"Uygun")`],style:{font:{color:{argb:'FF9C2525'},bold:true}}}]});
 return{wb,extra};
}
window.__claimsReport191={build};
})();
