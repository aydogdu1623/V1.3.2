(function(root){'use strict';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml=s=>new DOMParser().parseFromString(s,'application/xml');
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS(NS,name));
const serialize=doc=>new XMLSerializer().serializeToString(doc);
async function build(data,{month=1,personId=data.employees[0]?.id,templateBytes}={}){
 const M=root.PuantajModel,F=root.PuantajFormula;M.validate(data);
 if(!root.JSZip)throw Error('Excel indirme bileşeni yüklenemedi. Sayfayı yenileyin.');
 const bytes=templateBytes||await fetch('/assets/puantaj-template.bin').then(r=>{if(!r.ok)throw Error('Puantaj şablonu alınamadı.');return r.arrayBuffer();});
 const zip=await root.JSZip.loadAsync(bytes),workbook=xml(await zip.file('xl/workbook.xml').async('string')),rels=xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
 const paths=Object.fromEntries(Array.from(rels.documentElement.children).map(e=>[e.getAttribute('Id'),e.getAttribute('Target').replace(/^\//,'')]));
 const sheets={},docs={},cellNodes={};
 for(const s of elements(workbook,'sheet')){
  const name=s.getAttribute('name'),target=paths[s.getAttribute('r:id')],path=target.startsWith('xl/')?target:'xl/'+target;
  const doc=xml(await zip.file(path).async('string'));docs[name]={doc,path};sheets[name]={};cellNodes[name]={};
  for(const c of elements(doc,'c')){const ref=c.getAttribute('r'),formula=elements(c,'f')[0]?.textContent,v=elements(c,'v')[0]?.textContent;cellNodes[name][ref]=c;sheets[name][ref]=formula?{formula}:{value:c.getAttribute('t')==='inlineStr'?elements(c,'t').map(t=>t.textContent).join(''):v===undefined?'':c.getAttribute('t')==='str'?v:Number(v)};}
 }
 function node(sheet,ref){if(cellNodes[sheet][ref])return cellNodes[sheet][ref];const doc=docs[sheet].doc,rnum=ref.match(/\d+/)[0];let row=elements(doc,'row').find(e=>e.getAttribute('r')===rnum);if(!row){row=doc.createElementNS(NS,'row');row.setAttribute('r',rnum);elements(doc,'sheetData')[0].appendChild(row);}const c=doc.createElementNS(NS,'c');c.setAttribute('r',ref);const col=F.colName;const toN=s=>[...s.replace(/\d/g,'')].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0);const next=Array.from(row.children).find(x=>toN(x.getAttribute('r'))>toN(ref));row.insertBefore(c,next||null);cellNodes[sheet][ref]=c;return c;}
 function put(sheet,ref,value){sheets[sheet][ref]=typeof value==='object'&&value!==null?value:{value};const c=node(sheet,ref);for(const x of Array.from(c.children))if(['f','v','is'].includes(x.localName))x.remove();c.removeAttribute('t');if(sheets[sheet][ref].formula){const f=c.ownerDocument.createElementNS(NS,'f');f.textContent=sheets[sheet][ref].formula;c.appendChild(f);}}
 const date=s=>s?Date.parse(s+'T00:00:00Z')/86400000+25569:'';
 const master='Personel Listesi (Sicil)';put(master,'C2',data.year);
 const cols={serial:'B',tc:'C',name:'D',title:'E',iban:'F',base:'G',raise1:'H',raise1Month:'I',raise2:'K',raise2Month:'L',start:'N',end:'O'};
 for(let i=0;i<20;i++){
  const p=data.employees[i],r=i+5;
  for(const [key,col] of Object.entries(cols))put(master,col+r,p?(key==='start'||key==='end'?date(p[key]):['raise1','raise2','raise1Month','raise2Month'].includes(key)?p[key]||'':p[key]):'');
  const serial=p?.serial||'';put('Yönetici Paneli','C'+(i+9),serial);put('Banka Maaş Transfer Listesi','C'+(i+8),serial);put('Çoklu Puantaj Özeti','C'+(i+7),serial);put('Çoklu Puantaj Özeti','C'+(i+31),serial);
  for(let m=1;m<=12;m++){
   const sh=M.months[m-1],rr=6+2*i,e=p?M.entry(data,p,m):{codes:{},hours:{},advance:0};put(sh,'B'+rr,serial);
   put(sh,'E'+rr,{formula:`IF(C${rr}="","",IF(AND('${master}'!L${r}>0,${m}>='${master}'!L${r},'${master}'!K${r}>0),'${master}'!K${r},IF(AND('${master}'!I${r}>0,${m}>='${master}'!I${r},'${master}'!H${r}>0),'${master}'!H${r},'${master}'!G${r})))`});
   put(sh,'AW'+rr,p?e.advance:0);
   for(let d=1;d<=31;d++){
    const col=F.colName(d+5),a=col+rr;
    const auto=`IF(OR(C${rr}="",${d}>DAY(DATE('${master}'!$C$2,${m+1},0))),"-",IF(AND('${master}'!N${r}<>"",DATE('${master}'!$C$2,${m},${d})<'${master}'!N${r}),"-",IF(AND('${master}'!O${r}<>"",DATE('${master}'!$C$2,${m},${d})>'${master}'!O${r}),"-",IF(COUNTIF('Resmi Tatiller'!$B$6:$B$21,DATE('${master}'!$C$2,${m},${d}))>0,"RT",IF(WEEKDAY(DATE('${master}'!$C$2,${m},${d}),2)=7,"HT","X")))))`;
    put(sh,a,p&&M.active(p,data.year,m,d)&&e.codes[d]!==undefined?e.codes[d]:{formula:auto});
    put(sh,col+(rr+1),p&&M.active(p,data.year,m,d)?e.hours[d]||0:0);
   }
  }
 }
 for(let i=0;i<16;i++){const h=data.holidays[i],r=i+6;put('Resmi Tatiller','A'+r,h?.name||'');put('Resmi Tatiller','B'+r,date(h?.date));put('Resmi Tatiller','C'+r,h?Number(h.date.slice(5,7)):'');put('Resmi Tatiller','D'+r,h?Number(h.date.slice(8,10)):'');}
 put('Yönetici Paneli','C5',M.months[month-1]);put('Banka Maaş Transfer Listesi','C5',M.months[month-1]);put('Ücret Hesap Pusulası (Makbuz)','E5',M.months[month-1]);put('Ücret Hesap Pusulası (Makbuz)','C5',data.employees.find(p=>p.id===personId)?.serial||data.employees[0]?.serial||'');
 // Empty rosters should not emit #DIV/0 in the hourly-rate average.
 for(const m of M.months)put(m,'AR46',{formula:'IFERROR(AVERAGE(AR6:AR45),0)'});
 const engine=F.engine(sheets);
 for(const [name,cells] of Object.entries(sheets))for(const [ref,c] of Object.entries(cells)){
  const element=node(name,ref),value=engine.cell(name,ref);
  for(const child of Array.from(element.children))if(['v','is'].includes(child.localName))child.remove();
  element.removeAttribute('t');
  if(c.formula){if(typeof value==='string')element.setAttribute('t','str');else if(typeof value==='boolean')element.setAttribute('t','b');const v=element.ownerDocument.createElementNS(NS,'v');v.textContent=typeof value==='boolean'?+value:String(value);element.appendChild(v);}
  else if(typeof value==='string'){element.setAttribute('t','inlineStr');const is=element.ownerDocument.createElementNS(NS,'is'),t=element.ownerDocument.createElementNS(NS,'t');t.textContent=value;is.appendChild(t);element.appendChild(is);}
  else {const v=element.ownerDocument.createElementNS(NS,'v');v.textContent=String(value);element.appendChild(v);}
 }
 let calc=elements(workbook,'calcPr')[0];if(!calc){calc=workbook.createElementNS(NS,'calcPr');workbook.documentElement.appendChild(calc);}calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
 zip.file('xl/workbook.xml',serialize(workbook));for(const {doc,path} of Object.values(docs))zip.file(path,serialize(doc));
 return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),sheets,engine};
}
root.PuantajExport={build};
})(typeof window==='undefined'?globalThis:window);
