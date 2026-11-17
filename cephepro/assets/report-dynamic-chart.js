/* Macro-free general-report chart. Keep category slots fixed while formulas compact the selection. */
(function(root){
 'use strict';
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const parse=text=>{const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Excel XML');return d;};
 const all=(doc,name)=>[...doc.getElementsByTagNameNS('*',name)];
 const xml=doc=>new XMLSerializer().serializeToString(doc);
 function wrap(text){
  let rest=String(text??''),result='';
  while(rest.length>22){let cut=rest.slice(0,23).lastIndexOf(' ')+1;if(cut<9)cut=22;result+=rest.slice(0,cut).trimEnd()+'\n';rest=rest.slice(cut).trimStart();}
  return result+rest;
 }
 const label=text=>String(text??'').split('\n').map(wrap).join('\n');
 // Fixed category pitch, gap and overlap keep bar widths stable under filtering.
 const layout=count=>({widthPx:120+66*Math.max(1,count),heightPx:480,plotWidthPx:66*Math.max(1,count),categoryRotation:-5400000,gapWidth:100,seriesOverlap:-100});
 function configure(wb,ws,gd,rows,labels,values,chart){
  // Keep the horizontal canvas scrollable without exposing legacy chart helper cells.
  ws.eachRow(row=>row.eachCell((cell,col)=>{if(col>=22&&col<=67){cell.numFmt=';;;';cell.font={...cell.font,color:{argb:'FFFFFFFF'}};cell.border={};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};}}));
  const allBlocks='Tüm Adalar',allFacades='Tüm Cepheler',last=rows.length+1,end=rows.length+7;
  const blocks=[allBlocks,...new Set(rows.map(row=>row[0]))];
  const multiMode='Seçili Cepheler';
  const pairs=[...new Map(rows.map(row=>[JSON.stringify([row[0],row[1]]),[row[0],row[1]]])).values()];
  const facades=[allFacades,multiMode,...pairs.map(([b,f])=>b+' / '+f)];
  blocks.forEach((value,i)=>gd.getCell(i+1,27).value=value);
  facades.forEach((value,i)=>gd.getCell(i+1,17).value=value);
  wb.definedNames.add(`'Grafik Verileri'!$AA$1:$AA$${blocks.length}`,'CP_BlockChoices');
  wb.definedNames.add(`'Grafik Verileri'!$Q$1:$Q$${facades.length}`,'CP_FacadeChoices');
  wb.definedNames.add("'Grafik Verileri'!$AA$1",'CP_AllBlocks');
  wb.definedNames.add("'Grafik Verileri'!$Q$1",'CP_AllFacades');
  wb.definedNames.add("'Grafik Verileri'!$Q$2",'CP_MultiMode');
  gd.getCell('AB1').value='Evet';gd.getCell('AB2').value='Hayır';
  wb.definedNames.add("'Grafik Verileri'!$AB$1",'CP_Include');
  wb.definedNames.add("'Grafik Verileri'!$AB$1:$AB$2",'CP_SelectionChoices');
  const selection=wb.addWorksheet('Grafik Seçimi');selection.views=[{state:'frozen',ySplit:4,showGridLines:false}];
  selection.columns=[{width:28},{width:22},{width:18}];
  selection.mergeCells('A1:C1');selection.getCell('A1').value='Grafik Seçimi';selection.getCell('A1').font={size:14,bold:true};
  selection.mergeCells('A2:C3');selection.getCell('A2').value='İstediğiniz cephelerde Evet seçin. Rapor sayfasındaki Cephe alanını Seçili Cepheler olarak değiştirin.';
  selection.getCell('A2').alignment={wrapText:true,vertical:'middle'};selection.getRow(2).height=24;selection.getRow(3).height=24;
  ['Ada / Blok','Cephe','Grafiğe Dahil'].forEach((value,i)=>{const cell=selection.getCell(4,i+1);cell.value=value;cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2F7477'}};});
  pairs.forEach(([b,f],i)=>{
   const r=i+5;selection.getCell(r,1).value=b;selection.getCell(r,2).value=f;selection.getCell(r,3).value='Hayır';
   selection.getCell(r,3).dataValidation={type:'list',allowBlank:false,formulae:['CP_SelectionChoices'],showErrorMessage:true};
   selection.getCell(r,3).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF2CC'}};selection.getRow(r).height=23;
  });
  selection.eachRow(row=>row.eachCell(cell=>{cell.font={size:11,...cell.font};cell.alignment={wrapText:true,vertical:'middle',...cell.alignment};}));
  selection.autoFilter=`A4:C${pairs.length+4}`;
  for(const [name,col] of [['CP_MultiBlocks','A'],['CP_MultiFacades','B'],['CP_MultiFlags','C']])wb.definedNames.add(`'Grafik Seçimi'!$${col}$5:$${col}$${pairs.length+4}`,name);
  wb.definedNames.add("'Grafik Seçimi'!$A$1",'CP_MultiSelection');
  for(const [range,address,value] of [['L1:O1','L1','Ada / Blok'],['L2:O2','L2',allBlocks],['P1:S1','P1','Cephe'],['P2:S2','P2',allFacades]]){
   ws.mergeCells(range);const cell=ws.getCell(address);cell.value=value;
   cell.font={size:10,bold:true};cell.alignment={horizontal:'left',vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE4F0F2'}};
  }
  ws.getRow(2).height=Math.max(ws.getRow(2).height||0,30);
  ws.getCell('L2').dataValidation={type:'list',allowBlank:false,formulae:['CP_BlockChoices'],showErrorMessage:true};
  ws.getCell('P2').dataValidation={type:'list',allowBlank:false,formulae:['CP_FacadeChoices'],showErrorMessage:true};
  ws.mergeCells('T2:U2');ws.getCell('T2').value={text:'Çoklu Cephe Seçimi',hyperlink:'#CP_MultiSelection'};
  ws.getCell('T2').font={size:10,bold:true,color:{argb:'FF245B60'},underline:true};ws.getCell('T2').alignment={wrapText:true,vertical:'middle'};
  wb.definedNames.add('Rapor!$L$2','CP_ChartBlock');
  wb.definedNames.add('Rapor!$P$2','CP_ChartSelected');
  wb.definedNames.add(`Rapor!$A$8:$K$${end}`,'CP_ReportData');
  wb.definedNames.add(`'Grafik Verileri'!$R$2:$U$${last}`,'CP_ChartBuffer');
  wb.definedNames.add("'Grafik Verileri'!$V$1",'CP_ChartCount');
  // Formula-driven selection works without VBA. SUBTOTAL also tracks the table's AutoFilter.
  rows.forEach((row,i)=>{
   const r=i+2,source=i+8;
   gd.getCell(r,23).value={formula:`IF(AND(OR(CP_ChartBlock=CP_AllBlocks,Rapor!A${source}=CP_ChartBlock),IF(CP_ChartSelected=CP_MultiMode,SUMPRODUCT((CP_MultiBlocks=Rapor!A${source})*(CP_MultiFacades=Rapor!B${source})*(CP_MultiFlags=CP_Include))>0,OR(CP_ChartSelected=CP_AllFacades,Rapor!A${source}&" / "&Rapor!B${source}=CP_ChartSelected)),SUBTOTAL(103,Rapor!A${source})>0),1,0)`,result:1};
   gd.getCell(r,24).value={formula:r===2?'W2':`X${r-1}+W${r}`,result:i+1};
   gd.getCell(r,25).value={formula:`IF(W${r}=1,X${r},"")`,result:i+1};
   gd.getCell(r,26).value={formula:`IFERROR(MATCH(${i+1},$Y$2:$Y$${last},0),0)`,result:i+1};
   // Include both island and facade so identical facade names remain distinguishable.
   gd.getCell(r,12).value={formula:`Rapor!C${source}&CHAR(10)&Rapor!A${source}&" / "&Rapor!B${source}&" / "&Rapor!E${source}`,result:labels[i]+'\n'+row[0]};
   gd.getCell(r,18).value={formula:`IF(Z${r}=0,"",INDEX($L$2:$L$${last},Z${r}))`,result:labels[i]+'\n'+row[0]};
   // #N/A suppresses both the bar and its value label in unused category slots.
   ['G','H','I'].forEach((col,c)=>gd.getCell(r,19+c).value={formula:`IF(Z${r}=0,NA(),INDEX(Rapor!$${col}$8:$${col}$${end},Z${r}))`,result:[values[i].total,values[i].done,values[i].progress][c]});
  });
  gd.getCell('V1').value={formula:`SUM(W2:W${last})`,result:rows.length};
  ws.mergeCells('L3:S3');ws.getCell('L3').value={formula:'IF(CP_ChartCount=0,"Seçime uygun veri yok",CP_ChartBlock&" / "&CP_ChartSelected)',result:allBlocks+' / '+allFacades};
  ws.getCell('L3').alignment={wrapText:true,vertical:'middle'};ws.getCell('L3').font={size:9};
  ws.mergeCells('L4:U4');ws.getCell('L4').value='Sütun genişliği ve aralıkları sabittir. Seçilen iş kalemleri solda gösterilir. Makro gerekmez.';
  ws.getRow(4).height=Math.max(ws.getRow(4).height||0,27);
  ws.getCell('L4').font={size:9,color:{argb:'FF245B60'}};ws.getCell('L4').alignment={wrapText:true,vertical:'middle'};
  for(const [range,address,value,color] of [['L5:N5','L5','Toplam','4F81BD'],['O5:Q5','O5','Kümülatif','C0504D'],['R5:U5','R5','İlerleme %','749337']]){
   ws.mergeCells(range);const cell=ws.getCell(address);cell.value=value;
   cell.font={size:10,bold:true,color:{argb:'FF'+color}};cell.alignment={horizontal:'left',vertical:'middle',wrapText:true};
  }
  Object.assign(chart,layout(rows.length));chart.fromRow=5;
  chart.cacheLabels=labels.map((label,i)=>label+'\n'+rows[i][0]);
  chart.catFormula="'Grafik Verileri'!CP_ChartLabels";
  chart.series.forEach((series,i)=>{series.valFormula="'Grafik Verileri'!"+['CP_ChartTotals','CP_ChartDone','CP_ChartProgress'][i];series.cacheValues=values.map(v=>[v.total,v.done,v.progress][i]);series.showLabels=i===2;});
  const info=wb.getWorksheet('Bilgi');
  info.mergeCells('B30:H32');info.getCell('B30').value='Ada ve cephe seçimi ile tablo filtreleri grafiği günceller. Sütun genişliği ve aralıkları değişmez; seçilen iş kalemleri solda toplanır. Boş kısım çizilmez. Tümünü görmek için seçimleri ve tablo filtrelerini sıfırlayın. Makro gerekmez.';
  info.getCell('B30').alignment={horizontal:'center',vertical:'middle',wrapText:true};info.getCell('B30').font={size:10,color:{argb:'FF245B60'}};info.pageSetup.printArea='B2:H32';
 }
 async function pack(bytes){
  const zip=await root.JSZip.loadAsync(bytes),book=parse(await zip.file('xl/workbook.xml').async('string'));
  const sheets=all(book,'sheet');
  let calc=all(book,'calcPr')[0];
  if(!calc){calc=book.createElementNS(NS,'calcPr');book.documentElement.appendChild(calc);}
  calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
  const rels=parse(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const relationships=all(rels,'Relationship');
  let chartCount=1;
  for(let i=0;i<sheets.length;i++){
   const id=sheets[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
   const target=relationships.find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');
   if(!target)throw Error('Excel sayfa bağlantısı bulunamadı.');
   const path=target.startsWith('/')?target.slice(1):'xl/'+target;
   const sheet=parse(await zip.file(path).async('string'));
   if(i===10){const cell=all(sheet,'c').find(n=>n.getAttribute('r')==='V1');chartCount=Number(cell&&all(cell,'v')[0]?.textContent)||1;}
  }
  const names=all(book,'definedNames')[0],dataSheet="'"+sheets[10].getAttribute('name').replace(/'/g,"''")+"'";
  ['CP_ChartLabels','CP_ChartTotals','CP_ChartDone','CP_ChartProgress'].forEach((name,i)=>{
   const node=book.createElementNS(NS,'definedName');node.setAttribute('name',name);node.setAttribute('localSheetId','10');
   // Never shorten these references when filtering: Excel would stretch the remaining bars.
   const col=['R','S','T','U'][i];
   node.textContent=`${dataSheet}!$${col}$2:$${col}$${chartCount+1}`;names.appendChild(node);
  });
  // The formula buffer is on a hidden sheet; visibility has already been applied by SUBTOTAL.
  for(const path of Object.keys(zip.files).filter(path=>/^xl\/charts\/chart\d+\.xml$/.test(path))){
   const chart=parse(await zip.file(path).async('string'));
   all(chart,'plotVisOnly').forEach(node=>node.setAttribute('val','0'));
   const area=all(chart,'plotArea')[0],ns=area.namespaceURI,geometry=layout(chartCount);
   const old=all(area,'layout')[0],box=chart.createElementNS(ns,'c:layout'),manual=chart.createElementNS(ns,'c:manualLayout');
   for(const [tag,value] of [['layoutTarget','inner'],['xMode','edge'],['yMode','edge'],['wMode','factor'],['hMode','factor'],['x',60/geometry.widthPx],['y',40/geometry.heightPx],['w',geometry.plotWidthPx/geometry.widthPx],['h',280/geometry.heightPx]]){
    const node=chart.createElementNS(ns,'c:'+tag);node.setAttribute('val',String(value));manual.appendChild(node);
   }
   box.appendChild(manual);if(old)area.replaceChild(box,old);else area.insertBefore(box,area.firstChild);
   // Only occupied slots should be visible. The native chart's transparent selection
   // rectangle retains its capacity, but no frame, grid or background fills the empty tail.
   all(chart,'majorGridlines').forEach(node=>node.remove());
   all(chart,'title').forEach(node=>node.remove());
   all(chart,'autoTitleDeleted').forEach(node=>node.setAttribute('val','1'));
   for(const parent of [chart.documentElement,area,...all(chart,'catAx')]){
    let shape=[...parent.children].find(node=>node.localName==='spPr');
    if(!shape){shape=chart.createElementNS(ns,'c:spPr');parent.appendChild(shape);}
    while(shape.firstChild)shape.removeChild(shape.firstChild);
    const ans='http://schemas.openxmlformats.org/drawingml/2006/main';
    shape.appendChild(chart.createElementNS(ans,'a:noFill'));
    const line=chart.createElementNS(ans,'a:ln');line.appendChild(chart.createElementNS(ans,'a:noFill'));shape.appendChild(line);
   }
   // Category labels stay within their fixed slot instead of overlapping after selection.
   all(chart,'catAx').forEach(axis=>all(axis,'noMultiLvlLbl').forEach(node=>node.setAttribute('val','1')));
   zip.file(path,xml(chart));
  }
  zip.file('xl/workbook.xml',xml(book));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 root.CepheProDynamicChart={pack,configure,layout,label,mime:MIME};
})(window);
