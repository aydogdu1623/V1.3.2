(function(root){
'use strict';
const months=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const codes=['X','HT','RT','PM','BM','Yİ','R','Üİ','-'];
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const num=x=>Number(x)||0;
const iso=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function holidays(year){
 const fixed=[['Yılbaşı',1,1],['23 Nisan',4,23],['1 Mayıs',5,1],['19 Mayıs',5,19],['15 Temmuz',7,15],['30 Ağustos',8,30],['29 Ekim',10,29]];
 // Dates are transcribed from the supplied workbook, not a live holiday service.
 const dates={2026:[[3,19],[5,26]],2027:[[3,9],[5,16]],2028:[[2,26],[5,4]]}[year];
 const list=fixed.map(([name,m,d])=>({name,date:iso(year,m,d)}));
 if(dates)for(let k=0;k<2;k++)for(let day=0;day<(k?5:4);day++){
  const dt=new Date(Date.UTC(year,dates[k][0]-1,dates[k][1]+day));
  list.push({name:(k?'Kurban':'Ramazan')+' Bayramı '+(day?day+'. Gün':'Arifesi'),date:dt.toISOString().slice(0,10)});
 }
 return list.sort((a,b)=>a.date.localeCompare(b.date));
}
function blank(year=new Date().getFullYear()) {return {version:1,year,employees:[],entries:{},holidays:holidays(year)};}
function active(p,year,month,day){const d=iso(year,month,day);return !!p.name&&day<=new Date(Date.UTC(year,month,0)).getUTCDate()&&(!p.start||d>=p.start)&&(!p.end||d<=p.end);}
function entry(data,p,month){return data.entries?.[`${month}:${p.id}`]||{codes:{},hours:{},advance:0};}
function dayCode(data,p,month,day){
 if(!active(p,data.year,month,day))return '-';
 const saved=entry(data,p,month).codes?.[day];if(saved!==undefined)return saved;
 if(data.holidays.some(h=>h.date===iso(data.year,month,day)))return 'RT';
 return new Date(Date.UTC(data.year,month-1,day)).getUTCDay()===0?'HT':'X';
}
function salary(p,month){if(p.raise2Month&&month>=p.raise2Month&&p.raise2>0)return p.raise2;if(p.raise1Month&&month>=p.raise1Month&&p.raise1>0)return p.raise1;return num(p.base);}
function calc(data,p,month){
 const counts=Object.fromEntries(codes.map(c=>[c,0]));const e=entry(data,p,month);let hours=0;
 for(let d=1;d<=31;d++){counts[dayCode(data,p,month,d)]++;if(active(p,data.year,month,d))hours+=num(e.hours?.[d]);}
 const base=salary(p,month),paid=counts.X+counts.HT+counts.RT+counts['Yİ']+counts.R+counts.PM+counts.BM;
 const prorated=paid===0?0:paid>=28?base:money(base/30*paid),overtime=hours*base/225*1.5,premium=(counts.PM+counts.BM)*base/30*1.5,unpaid=base/30*counts['Üİ'],advance=num(e.advance);
 return {counts,base,paid,hours,prorated,overtime,premium,unpaid,advance,gross:prorated<=0?0:(prorated+overtime+premium-unpaid)/0.7149,net:prorated<=0?0:prorated+overtime+premium-unpaid-advance};
}
function validate(data){
 if(!data||data.version!==1||!Number.isInteger(data.year)||data.year<2025||data.year>2100)throw Error('Çalışma yılı 2025–2100 arasında olmalı.');
 if(!Array.isArray(data.employees)||data.employees.length>20)throw Error('Bu Excel şablonu en fazla 20 personel içerir.');
 const ids=new Set(),serials=new Set();
 const date=s=>s===''||(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s);
 for(const p of data.employees){
  if(!p||typeof p.id!=='string'||!/^[\w-]{1,80}$/.test(p.id)||ids.has(p.id))throw Error('Personel kimliği geçersiz.');ids.add(p.id);
  for(const k of ['serial','name','title','tc','iban','start','end'])if(typeof p[k]!=='string'||p[k].length>200)throw Error('Personel alanı geçersiz: '+k);
  if(!p.name.trim()||!p.serial.trim()||serials.has(p.serial.trim().toLocaleLowerCase('tr')))throw Error('Ad soyad ve benzersiz sicil numarası girin.');serials.add(p.serial.trim().toLocaleLowerCase('tr'));
  for(const k of ['base','raise1','raise2'])if(!Number.isFinite(p[k])||p[k]<0||p[k]>1e9)throw Error('Maaşlar sıfır veya pozitif olmalı.');
  for(const k of ['raise1Month','raise2Month'])if(!Number.isInteger(p[k])||p[k]<0||p[k]>12)throw Error('Zam ayı geçersiz.');
  if((p.raise1>0)!==(p.raise1Month>0)||(p.raise2>0)!==(p.raise2Month>0))throw Error('Her zam için tutar ve ayı birlikte girin.');
  if(p.raise1Month&&p.raise2Month&&p.raise2Month<=p.raise1Month)throw Error('İkinci zam ayı birinci zamdan sonra olmalı.');
  if(!date(p.start)||!date(p.end)||(p.start&&p.end&&p.end<p.start))throw Error('İşe giriş / çıkış tarihlerini kontrol edin.');
  if(p.tc&&!/^\d{11}$/.test(p.tc))throw Error('TC kimlik numarası 11 rakam olmalı.');
  if(p.iban&&!/^TR\d{24}$/.test(p.iban.replace(/\s/g,'').toUpperCase()))throw Error('IBAN TR ile başlayan 26 karakter olmalı.');
 }
 if(!Array.isArray(data.holidays)||data.holidays.length>16)throw Error('Şablonda en fazla 16 tatil satırı bulunur.');
 const holidayDates=new Set();for(const h of data.holidays){if(!h||typeof h.name!=='string'||!h.name.trim()||h.name.length>150||!h.date||!date(h.date)||!h.date.startsWith(data.year+'-')||holidayDates.has(h.date))throw Error('Tatil adı ve yıl içindeki benzersiz tarihini girin.');holidayDates.add(h.date);}
 if(!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries)||Object.keys(data.entries).length>240)throw Error('Puantaj kayıtları geçersiz.');
 for(const [key,e] of Object.entries(data.entries)){
  const [m,id]=key.split(':');if(!/^(?:[1-9]|1[0-2])$/.test(m)||!ids.has(id)||!e)throw Error('Puantaj personeli veya ayı geçersiz.');
  if(!Number.isFinite(e.advance)||e.advance<0||e.advance>1e9)throw Error('Avans tutarı geçersiz.');
  for(const [kind,values] of Object.entries({codes:e.codes,hours:e.hours})){
   if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Günlük kayıt geçersiz.');
   for(const [d,v] of Object.entries(values))if(!/^(?:[1-9]|[12][0-9]|3[01])$/.test(d)||(kind==='codes'?!codes.includes(v):(!Number.isFinite(v)||v<0||v>24)))throw Error('Puantaj kodu veya mesai saati geçersiz.');
  }
 }
 return data;
}
const financeFields=['base','raise1','raise2','raise1Month','raise2Month','iban'];
function protectFinance(input,stored=null){
 if(!input)return input;const out=JSON.parse(JSON.stringify(input)),old=new Map((stored?.employees||[]).map(p=>[p.id,p]));
 for(const p of out.employees||[])for(const key of financeFields)p[key]=old.get(p.id)?.[key]??(key==='iban'?'':0);
 for(const [key,e] of Object.entries(out.entries||{}))e.advance=stored?.entries?.[key]?.advance||0;
 return out;
}
root.PuantajModel={financeFields,protectFinance,months,codes,blank,holidays,iso,active,entry,dayCode,salary,calc,validate};
})(typeof window==='undefined'?globalThis:window);
