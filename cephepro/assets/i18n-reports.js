/* Localize generated Office packages after calculations, without editing application data. */
(function(root){
 'use strict';
 const I=root.CepheProI18n;
 const parse=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Rapor XML verisi okunamadı.');return d;};
 const all=(d,name)=>[...d.getElementsByTagNameNS('*',name)];
 const serial=d=>new XMLSerializer().serializeToString(d);
 const quote=s=>"'"+s.replace(/'/g,"''")+"'";
 function formulaText(formula,sheets,columns,translate){
  // Tokenize quoted strings separately; never translate Excel function names, numbers or operators.
  let result='',last=0;const pattern=/"(?:[^"]|"")*"|'(?:[^']|'')*'!/g;
  const ordinary=chunk=>{
   let value=chunk;
   for(const [from,to] of sheets)value=value.replace(new RegExp('(^|[^\\p{L}\\p{N}_.])'+from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'!','gu'),(_,prefix)=>prefix+quote(to)+'!');
   for(const [from,to] of columns)value=value.split('['+from+']').join('['+to+']');
   return value;
  };
  for(const match of formula.matchAll(pattern)){
   result+=ordinary(formula.slice(last,match.index));const raw=match[0];
   if(raw[0]==="'"){const name=raw.slice(1,-2).replace(/''/g,"'");result+=(sheets.has(name)?quote(sheets.get(name))+'!':raw);}
   else{const text=raw.slice(1,-1).replace(/""/g,'"');let value=translate(text);for(const [from,to] of sheets){value=value.split(quote(from)+'!').join(quote(to)+'!');if(value===from)value=to;}result+='"'+value.replace(/"/g,'""')+'"';}
   last=match.index+raw.length;
  }
  return result+ordinary(formula.slice(last));
 }
 async function office(bytes,kind='xlsx'){
  if(I.language()==='tr')return bytes;
  const language=I.language(),ctx=I.context();
  if(!root.JSZip)throw Error('Rapor çeviri bileşeni yüklenemedi.');
  const zip=await root.JSZip.loadAsync(bytes),docs=new Map(),texts=new Set(),entries=[],formulaNodes=[],formulaAttrs=[],formatAttrs=[],headers=[];
  const add=(node,attr=null)=>{const text=attr?node.getAttribute(attr):node.textContent;if(!text)return;entries.push({node,attr,text});texts.add(text);};
  for(const [path,file] of Object.entries(zip.files)){
   if(file.dir||!path.endsWith('.xml')||!/^((xl|word)\/|docProps\/)/.test(path))continue;
   const doc=parse(await file.async('string'));docs.set(path,doc);
   for(const node of all(doc,'t'))add(node);
   if(path.startsWith('xl/')){
    for(const cell of all(doc,'c'))if(cell.getAttribute('t')==='str')for(const n of [...cell.children].filter(n=>n.localName==='v'))add(n);
    for(const node of all(doc,'pt'))if(node.parentElement?.localName==='strCache'||node.parentElement?.localName==='strLit')for(const n of [...node.children].filter(n=>n.localName==='v'))add(n);
    for(const name of ['f','formula','formula1','formula2','definedName','calculatedColumnFormula','totalsRowFormula'])for(const node of all(doc,name)){formulaNodes.push(node);for(const m of node.textContent.matchAll(/"((?:[^"]|"")*)"/g)){const text=m[1].replace(/""/g,'"');if(!/[!$]/.test(text))texts.add(text);}}
    for(const node of all(doc,'hyperlink'))if(node.hasAttribute('location'))formulaAttrs.push({node,attr:'location'});
    for(const name of ['oddHeader','evenHeader','firstHeader','oddFooter','evenFooter','firstFooter'])for(const node of all(doc,name)){
     const parts=node.textContent.split(/(&(?:"[^"]*"|\d+|K[\dA-Fa-f]{6}|[A-Za-z&+\-]))/g);headers.push({node,parts});parts.forEach((part,i)=>{if(i%2===0)texts.add(part);});
    }
    for(const node of all(doc,'dataValidation'))for(const attr of ['promptTitle','prompt','errorTitle','error'])if(node.hasAttribute(attr))add(node,attr);
    for(const node of all(doc,'tx'))for(const n of [...node.children].filter(n=>n.localName==='v'))add(n);
    for(const node of all(doc,'tableColumn'))add(node,'name');
    for(const node of all(doc,'sheet'))add(node,'name');
    for(const node of all(doc,'numFmt')){const format=node.getAttribute('formatCode');if(format){formatAttrs.push({node,format});for(const m of format.matchAll(/"([^"]*)"/g))texts.add(m[1]);}}
   }
   if(path.startsWith('docProps/'))for(const name of ['title','subject','description'])for(const node of all(doc,name))add(node);
   if(path.startsWith('word/'))for(const node of all(doc,'lang'))node.setAttributeNS(node.namespaceURI,'w:val',language==='de'?'de-DE':'en-GB');
  }
  await I.ensure([...texts]);
  if(I.language()!==language||I.context()!==ctx)throw Error('Dil veya proje değişti. Raporu yeniden oluşturun.');
  const sheets=new Map(),columns=new Map(),used=new Set();
  for(const entry of entries){
   if(entry.node.localName==='sheet'&&entry.attr==='name'){
    const base=I.t(entry.text).replace(/[\\/*?:\[\]]/g,' ').replace(/^'+|'+$/g,'').slice(0,31)||'Sheet';let name=base,n=1;
    while(used.has(name.toLocaleLowerCase())){const suffix=' '+(++n);name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLocaleLowerCase());sheets.set(entry.text,name);
   }
   if(entry.node.localName==='tableColumn'&&entry.attr==='name')columns.set(entry.text,I.t(entry.text));
  }
  for(const {node,attr,text} of entries){const translated=node.localName==='sheet'&&attr==='name'?sheets.get(text):I.t(text);if(attr)node.setAttribute(attr,translated);else node.textContent=translated;}
  for(const node of formulaNodes)node.textContent=formulaText(node.textContent,sheets,columns,I.t);
  for(const {node,attr} of formulaAttrs)node.setAttribute(attr,formulaText(node.getAttribute(attr),sheets,columns,I.t));
  for(const {node,format} of formatAttrs)node.setAttribute('formatCode',format.replace(/"([^"]*)"/g,(_,text)=>'"'+I.t(text).replace(/"/g,"'")+'"'));
  for(const {node,parts} of headers)node.textContent=parts.map((part,i)=>i%2?part:I.t(part)).join('');
  for(const [path,doc] of docs)zip.file(path,serial(doc));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 // Prepare work-item labels before report charts are rasterized; source keys remain Turkish.
 async function prepareCharts(){
  if(I.language()==='tr')return;
  const texts=['Genel ve Blok İlerleme - Toplam Metraj','İş Kalemi İlerleme Durumu - Tüm Metraja Göre','Cephe İlerleme Durumu','İş Kalemleri','Toplam','Kümülatif','İlerleme %','GENEL'];
  if(typeof DATA!=='undefined')for(const [b,fs] of Object.entries(DATA||{})){texts.push(b,typeof v33BlockLabel==='function'?v33BlockLabel(b):b);for(const [f,d] of Object.entries(fs||{})){texts.push(f,`${typeof v33BlockLabel==='function'?v33BlockLabel(b):b} / ${f}`,`${typeof v33BlockLabel==='function'?v33BlockLabel(b):b} / ${f} - İş Kalemleri`);for(const r of d.items||[])texts.push(r[0]);}}
  await I.ensure(texts);
 }
 // Only report drawing is localized. UI editors retain their original editable text.
 const proto=root.CanvasRenderingContext2D?.prototype;
 if(proto)for(const method of ['fillText','strokeText','measureText']){const native=proto[method];if(native)proto[method]=function(text,...args){return native.call(this,I.t(String(text)),...args);};}
 I.office=office;I.prepareCharts=prepareCharts;I.formulaText=formulaText;
})(window);
