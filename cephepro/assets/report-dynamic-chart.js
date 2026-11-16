/* Package the general report with the chart-only VBA source built in scripts/chart-vba. */
(function(root){
 'use strict';
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const MIME='application/vnd.ms-excel.sheet.macroEnabled.12';
 const parse=text=>{const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Excel XML');return d;};
 const all=(doc,name)=>[...doc.getElementsByTagNameNS('*',name)];
 const xml=doc=>new XMLSerializer().serializeToString(doc);
 function wrap(text){
  let rest=String(text??''),result='';
  while(rest.length>22){let cut=rest.slice(0,23).lastIndexOf(' ')+1;if(cut<9)cut=22;result+=rest.slice(0,cut).trimEnd()+'\n';rest=rest.slice(cut).trimStart();}
  return result+rest;
 }
 const label=text=>String(text??'').split('\n').map(wrap).join('\n');
 const layout=count=>({widthPx:Math.min(720,120+48*Math.max(1,count)),heightPx:440,categoryRotation:-2700000,gapWidth:160});
 async function pack(bytes){
  const data=root.CepheProChartVba;
  if(!data?.base64)throw Error('Excel grafik bileşeni yüklenemedi. Sayfayı yenileyin.');
  const zip=await root.JSZip.loadAsync(bytes),book=parse(await zip.file('xl/workbook.xml').async('string'));
  const sheets=all(book,'sheet');
  if(sheets.length!==data.sheetCount)throw Error('Excel sayfa yapısı grafik şablonuyla uyumsuz.');
  let props=all(book,'workbookPr')[0];
  if(!props){props=book.createElementNS(NS,'workbookPr');book.documentElement.insertBefore(props,all(book,'bookViews')[0]||all(book,'sheets')[0]);}
  props.setAttribute('codeName','ThisWorkbook');
  let calc=all(book,'calcPr')[0];
  if(!calc){calc=book.createElementNS(NS,'calcPr');book.documentElement.appendChild(calc);}
  calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
  const rels=parse(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const relationships=all(rels,'Relationship');
  for(let i=0;i<sheets.length;i++){
   const id=sheets[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
   const target=relationships.find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');
   if(!target)throw Error('Excel sayfa bağlantısı bulunamadı.');
   const path=target.startsWith('/')?target.slice(1):'xl/'+target;
   const sheet=parse(await zip.file(path).async('string'));let pr=all(sheet,'sheetPr')[0];
   if(!pr){pr=sheet.createElementNS(NS,'sheetPr');sheet.documentElement.insertBefore(pr,sheet.documentElement.firstChild);}
   pr.setAttribute('codeName','Sheet'+(i+1));
   zip.file(path,xml(sheet));
  }
  const names=all(book,'definedNames')[0],dataSheet="'"+sheets[10].getAttribute('name').replace(/'/g,"''")+"'";
  ['CP_ChartLabels','CP_ChartTotals','CP_ChartDone','CP_ChartProgress'].forEach((name,i)=>{
   const node=book.createElementNS(NS,'definedName');node.setAttribute('name',name);
   node.textContent=`OFFSET(${dataSheet}!$${['R','S','T','U'][i]}$2,0,0,MAX(1,${dataSheet}!$V$1),1)`;names.appendChild(node);
  });
  const rel=rels.createElementNS(rels.documentElement.namespaceURI,'Relationship');
  rel.setAttribute('Id','rIdCepheProChartVba');rel.setAttribute('Type','http://schemas.microsoft.com/office/2006/relationships/vbaProject');rel.setAttribute('Target','vbaProject.bin');rels.documentElement.appendChild(rel);
  const types=parse(await zip.file('[Content_Types].xml').async('string'));
  all(types,'Override').find(n=>n.getAttribute('PartName')==='/xl/workbook.xml').setAttribute('ContentType','application/vnd.ms-excel.sheet.macroEnabled.main+xml');
  const type=types.createElementNS(types.documentElement.namespaceURI,'Override');type.setAttribute('PartName','/xl/vbaProject.bin');type.setAttribute('ContentType','application/vnd.ms-office.vbaProject');types.documentElement.appendChild(type);
  zip.file('xl/vbaProject.bin',data.base64,{base64:true});zip.file('xl/workbook.xml',xml(book));zip.file('xl/_rels/workbook.xml.rels',xml(rels));zip.file('[Content_Types].xml',xml(types));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 root.CepheProDynamicChart={pack,layout,label,mime:MIME};
})(window);
