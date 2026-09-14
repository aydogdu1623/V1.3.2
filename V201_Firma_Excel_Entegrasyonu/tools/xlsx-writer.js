
/* Small OOXML writer for generating the blank report template without a local runtime. */
(function(root){
'use strict';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function colName(n){let s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26);}return s;}
function address(a){const m=String(a).match(/^([A-Z]+)([1-9]\d*)$/);if(!m)throw Error('Invalid address '+a);return [Number(m[2]),[...m[1]].reduce((n,c)=>26*n+c.charCodeAt(0)-64,0)];}
class Cell{constructor(r,c){this.row=r;this.col=c;this.value=null;this.font=null;this.fill=null;this.border=null;}get address(){return colName(this.col)+this.row;}}
class Row{
 constructor(sheet,n){this.sheet=sheet;this.number=n;this.height=22;}
 getCell(n){return this.sheet.cell(this.number,n);}
 set values(values){values.forEach((v,i)=>this.getCell(i+1).value=v);}
 get values(){return Array.from({length:this.sheet.maxCol},(_,i)=>this.getCell(i+1).value);}
 eachCell(options,callback){if(typeof options==='function'){callback=options;options={};}const cells=[...this.sheet.cells.values()].filter(c=>c.row===this.number).sort((a,b)=>a.col-b.col);for(const c of cells)if(options?.includeEmpty||c.value!==null)callback(c,c.col);}
}
class Sheet{
 constructor(name){this.name=name;this.cells=new Map();this.rows=new Map();this.cols=new Map();this.merges=[];this.properties={};this.views=[];this.maxRow=1;this.maxCol=1;}
 cell(r,c){const key=r+':'+c;if(!this.cells.has(key))this.cells.set(key,new Cell(r,c));this.maxRow=Math.max(this.maxRow,r);this.maxCol=Math.max(this.maxCol,c);return this.cells.get(key);}
 getCell(a){return this.cell(...address(a));}
 getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row(this,n));return this.rows.get(n);}
 getColumn(n){if(!this.cols.has(n))this.cols.set(n,{width:12,eachCell:(opts,cb)=>{for(const c of this.cells.values())if(c.col===n&&(opts?.includeEmpty||c.value!==null))cb(c,c.row);}});return this.cols.get(n);}
 get columns(){return Array.from({length:this.maxCol},(_,i)=>this.getColumn(i+1));}
 mergeCells(r1,c1,r2,c2){for(const m of this.merges)if(!(r2<m[0]||r1>m[2]||c2<m[1]||c1>m[3]))throw Error('Overlapping merge in '+this.name);this.merges.push([r1,c1,r2,c2]);for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)this.cell(r,c);}
 eachRow(cb){const nums=[...new Set([...this.cells.values()].map(c=>c.row))].sort((a,b)=>a-b);for(const n of nums)cb(this.getRow(n),n);}
}
class Workbook{constructor(){this.worksheets=[];this.calcProperties={};}addWorksheet(n){if(n.length>31||/[\[\]:*?\/\\]/.test(n)||this.worksheets.some(s=>s.name===n))throw Error('Invalid sheet name');const s=new Sheet(n);this.worksheets.push(s);return s;}eachSheet(cb){this.worksheets.forEach(cb);}}
function utf8(s){const out=[];for(const ch of s){const cp=ch.codePointAt(0);if(cp<128)out.push(cp);else if(cp<2048)out.push(192|(cp>>6),128|(cp&63));else if(cp<65536)out.push(224|(cp>>12),128|((cp>>6)&63),128|(cp&63));else out.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));}return new Uint8Array(out);}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function base64(bytes){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);out+=chars[n>>>18]+chars[(n>>>12)&63]+(i+1<bytes.length?chars[(n>>>6)&63]:'=')+(i+2<bytes.length?chars[n&63]:'=');}return out;}
function zip(parts){
 const chunks=[],central=[];let offset=0;
 const u16=(a,n)=>a.push(n&255,(n>>>8)&255),u32=(a,n)=>a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);
 for(const[name,text]of Object.entries(parts)){const n=utf8(name),data=utf8(text),crc=crc32(data),h=[];u32(h,0x04034b50);u16(h,20);u16(h,2048);u16(h,0);u16(h,0);u16(h,23854);u32(h,crc);u32(h,data.length);u32(h,data.length);u16(h,n.length);u16(h,0);const local=new Uint8Array(h.length+n.length+data.length);local.set(h);local.set(n,h.length);local.set(data,h.length+n.length);chunks.push(local);
  const d=[];u32(d,0x02014b50);u16(d,20);u16(d,20);u16(d,2048);u16(d,0);u16(d,0);u16(d,23854);u32(d,crc);u32(d,data.length);u32(d,data.length);u16(d,n.length);u16(d,0);u16(d,0);u16(d,0);u16(d,0);u32(d,0);u32(d,offset);const cd=new Uint8Array(d.length+n.length);cd.set(d);cd.set(n,d.length);central.push(cd);offset+=local.length;
 }
 const centralSize=central.reduce((s,b)=>s+b.length,0),end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,central.length);u16(end,central.length);u32(end,centralSize);u32(end,offset);u16(end,0);
 const out=new Uint8Array(offset+centralSize+end.length);let pos=0;for(const b of [...chunks,...central,new Uint8Array(end)]){out.set(b,pos);pos+=b.length;}return out;
}
function write(workbook){
 const fonts=[],fills=[{patternType:'none'},{patternType:'gray125'}],borders=[{}],formats=[],xfs=[{fontId:0,fillId:0,borderId:0,numFmtId:0,alignment:{}}];
 const find=(list,value)=>{const k=JSON.stringify(value);let i=list.findIndex(v=>JSON.stringify(v)===k);if(i<0){i=list.length;list.push(value);}return i;};
 const defaultFont={name:'Calibri',size:11,color:{argb:'FF1B365D'}};find(fonts,defaultFont);
 const style=(cell,sheet)=>{
  const fontId=find(fonts,cell.font||defaultFont),fillId=cell.fill?find(fills,cell.fill):0,borderId=cell.border?find(borders,cell.border):0;
  const fmt=cell.numFmt||sheet.getColumn(cell.col).numFmt;const numFmtId=!fmt||fmt==='General'?0:164+find(formats,fmt);
  return find(xfs,{fontId,fillId,borderId,numFmtId,alignment:cell.alignment||{}});
 };
 const parts={},sheetXML=[];
 const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 workbook.worksheets.forEach((s,index)=>{
  // Spread merged title/card formatting to every physical cell in the merge.
  for(const[r1,c1,r2,c2]of s.merges){const a=s.cell(r1,c1);for(let rr=r1;rr<=r2;rr++)for(let cc=c1;cc<=c2;cc++){const c=s.cell(rr,cc);if(a.fill)c.fill=a.fill;if(a.font)c.font=a.font;}}
  const view=s.views[0]||{},x=view.xSplit||0,y=view.ySplit||0;
  let body=XML+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:'+colName(s.maxCol)+s.maxRow+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">';
  if(x||y)body+='<pane xSplit="'+x+'" ySplit="'+y+'" topLeftCell="'+colName(x+1)+(y+1)+'" activePane="'+(x&&y?'bottomRight':x?'topRight':'bottomLeft')+'" state="frozen"/>';
  body+='</sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>';
  for(let c=1;c<=s.maxCol;c++)body+='<col min="'+c+'" max="'+c+'" width="'+s.getColumn(c).width+'" customWidth="1"/>';
  body+='</cols><sheetData>';
  s.eachRow(row=>{
   body+='<row r="'+row.number+'" ht="'+row.height+'" customHeight="1">';
   row.eachCell({includeEmpty:true},cell=>{
    const sid=style(cell,s),v=cell.value,attrs=' r="'+cell.address+'" s="'+sid+'"';
    if(v&&typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,'formula')){const isNumber=typeof v.result==='number'&&Number.isFinite(v.result);body+='<c'+attrs+(isNumber?'':' t="str"')+'><f>'+esc(v.formula)+'</f><v>'+(isNumber?v.result:esc(v.result??''))+'</v></c>';}
    else if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Non-finite number');body+='<c'+attrs+'><v>'+v+'</v></c>';}
    else if(v!=null&&v!=='')body+='<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
    else body+='<c'+attrs+'/>';
   });body+='</row>';
  });body+='</sheetData>';
  if(s.autoFilter){const a=s.autoFilter;body+='<autoFilter ref="'+colName(a.from.column)+a.from.row+':'+colName(a.to.column)+a.to.row+'"/>';}
  if(s.merges.length)body+='<mergeCells count="'+s.merges.length+'">'+s.merges.map(m=>'<mergeCell ref="'+colName(m[1])+m[0]+':'+colName(m[3])+m[2]+'"/>').join('')+'</mergeCells>';
  const validations=[...s.cells.values()].filter(c=>c.dataValidation);
  if(validations.length)body+='<dataValidations count="'+validations.length+'">'+validations.map(c=>'<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" error="'+esc(c.dataValidation.error||'Geçersiz değer')+'" sqref="'+c.address+'"><formula1>'+c.dataValidation.formulae[0]+'</formula1><formula2>'+c.dataValidation.formulae[1]+'</formula2></dataValidation>').join('')+'</dataValidations>';
  const ps=s.pageSetup||{},mg=ps.margins||{left:.25,right:.25,top:.35,bottom:.35,header:.15,footer:.15};
  body+='<pageMargins '+Object.entries(mg).map(([k,v])=>k+'="'+v+'"').join(' ')+'/><pageSetup paperSize="'+(ps.paperSize||9)+'" orientation="'+(ps.orientation||'landscape')+'" fitToWidth="1" fitToHeight="'+(ps.fitToHeight||0)+'"/><headerFooter><oddFooter>'+esc(s.headerFooter?.oddFooter||'Sayfa &P / &N')+'</oddFooter></headerFooter></worksheet>';
  parts['xl/worksheets/sheet'+(index+1)+'.xml']=body;sheetXML.push(body);
 });
 const color=c=>c?.argb?'<color rgb="'+c.argb+'"/>':'';
 const fontXML=fonts.map(f=>'<font>'+(f.bold?'<b/>':'')+'<sz val="'+(f.size||11)+'"/>'+color(f.color)+'<name val="'+esc(f.name||'Calibri')+'"/><family val="2"/></font>').join('');
 const fillXML=fills.map(f=>f.patternType?'<fill><patternFill patternType="'+f.patternType+'"/></fill>':'<fill><patternFill patternType="'+(f.pattern||'solid')+'"><fgColor rgb="'+(f.fgColor?.argb||'FFFFFFFF')+'"/><bgColor indexed="64"/></patternFill></fill>').join('');
 const borderXML=borders.map(b=>'<border>'+['left','right','top','bottom','diagonal'].map(k=>b[k]?'<'+k+' style="'+b[k].style+'">'+color(b[k].color)+'</'+k+'>':'<'+k+'/>').join('')+'</border>').join('');
 const xfXML=xfs.map(x=>'<xf numFmtId="'+x.numFmtId+'" fontId="'+x.fontId+'" fillId="'+x.fillId+'" borderId="'+x.borderId+'" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="'+(x.alignment.vertical==='middle'?'center':x.alignment.vertical||'bottom')+'" wrapText="'+(x.alignment.wrapText?'1':'0')+'"/></xf>').join('');
 parts['xl/styles.xml']=XML+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="'+formats.length+'">'+formats.map((f,i)=>'<numFmt numFmtId="'+(164+i)+'" formatCode="'+esc(f)+'"/>').join('')+'</numFmts><fonts count="'+fonts.length+'">'+fontXML+'</fonts><fills count="'+fills.length+'">'+fillXML+'</fills><borders count="'+borders.length+'">'+borderXML+'</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+xfs.length+'">'+xfXML+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 const sn=workbook.worksheets;
 parts['xl/workbook.xml']=XML+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+sn.map((s,i)=>'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><definedNames>'+sn.map((s,i)=>'<definedName name="_xlnm.Print_Titles" localSheetId="'+i+'">'+esc("'"+s.name.replace(/'/g,"''")+"'!$1:$"+(i===0?2:4))+'</definedName>').join('')+'</definedNames><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>';
 parts['xl/_rels/workbook.xml.rels']=XML+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sn.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sn.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 parts['_rels/.rels']=XML+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
 parts['docProps/core.xml']=XML+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>CephePro 5 Sayfalı Firma Hakediş Şablonu</dc:title><dc:creator>CephePro</dc:creator><dc:description>Formüllü boş şablon; gerçek proje bilgisi içermez.</dc:description></cp:coreProperties>';
 parts['docProps/app.xml']=XML+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CephePro</Application></Properties>';
 parts['[Content_Types].xml']=XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'+sn.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
 const bytes=zip(parts);return {bytes,base64:base64(bytes),parts};
}
root.CepheProXlsx200={Workbook,write,utf8,crc32,base64};
})(globalThis);
