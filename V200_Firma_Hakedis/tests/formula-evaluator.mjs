
function makeEvaluator(workbook){
 const sheets=new Map(workbook.worksheets.map(s=>[s.name,s])),visiting=new Set(),cache=new Map();
 const flatten=xs=>xs.flat(Infinity),n=x=>typeof x==='number'?x:x==null||x===''?0:Number(x);
 function parse(text){
  let pos=0;
  const peek=()=>text.slice(pos),space=()=>{while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;};
  function primary(){
   space();let match;
   if(text[pos]==='"'){pos++;let value='';while(pos<text.length){if(text[pos]==='"'){pos++;if(text[pos]==='"'){value+='"';pos++;}else return {type:'value',value};}else value+=text[pos++];}throw Error('Unclosed string');}
   if(text[pos]==='('){pos++;const node=expr(0);space();if(text[pos++]!==')')throw Error('Missing )');return node;}
   if(text[pos]==='-'){pos++;return {type:'neg',node:primary()};}
   if(text[pos]==="'"){const m=peek().match(/^'((?:[^']|'')*)'!/);if(!m)throw Error('Sheet name');pos+=m[0].length;return ref(m[1].replace(/''/g,"'"));}
   if((match=peek().match(/^\$?[A-Z]+\$?\d+(?=[:+\-*/<>=,)\s]|$)/)))return ref(null);
   if((match=peek().match(/^\d+(?:\.\d+)?/))){pos+=match[0].length;return {type:'value',value:Number(match[0])};}
   if((match=peek().match(/^[A-Z][A-Z0-9.]*/))){pos+=match[0].length;space();if(text[pos++]!=='(')throw Error('Function expected');const args=[];space();if(text[pos]!==')'){while(true){args.push(expr(0));space();if(text[pos]===','){pos++;continue;}break;}}if(text[pos++]!==')')throw Error('Bad function '+match[0]);return {type:'call',name:match[0],args};}
   throw Error('Unexpected formula token '+peek().slice(0,25));
  }
  function ref(sheet){const m=peek().match(/^\$?([A-Z]+)\$?(\d+)/);if(!m)throw Error('Invalid ref');pos+=m[0].length;const first=m[1]+m[2];if(text[pos]!==':')return {type:'ref',sheet,first};pos++;const e=peek().match(/^\$?([A-Z]+)\$?(\d+)/);if(!e)throw Error('Invalid range');pos+=e[0].length;return {type:'range',sheet,first,last:e[1]+e[2]};}
  const priority={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'+':2,'-':2,'*':3,'/':3};
  function expr(min){let left=primary();while(true){space();const m=peek().match(/^(<>|<=|>=|[=<>+\-*/])/);if(!m||priority[m[0]]<min)break;pos+=m[0].length;const right=expr(priority[m[0]]+1);left={type:'binary',op:m[0],left,right};}return left;}
  const node=expr(0);space();if(pos!==text.length)throw Error('Unparsed formula '+peek());return node;
 }
 function evalNode(node,defaultSheet){
  if(node.type==='value')return node.value;
  if(node.type==='ref')return cell(node.sheet||defaultSheet,node.first);
  if(node.type==='range'){
   const decode=a=>{const m=a.match(/^([A-Z]+)(\d+)$/);return [Number(m[2]),[...m[1]].reduce((s,c)=>s*26+c.charCodeAt(0)-64,0)];};
   const label=n=>{let o='';for(;n;n=Math.floor((n-1)/26))o=String.fromCharCode(65+(n-1)%26)+o;return o;};
   const[a,b]=decode(node.first),[c,d]=decode(node.last),out=[];
   for(let r=a;r<=c;r++)for(let col=b;col<=d;col++)out.push(cell(node.sheet||defaultSheet,label(col)+r));return out;
  }
  if(node.type==='neg')return -n(evalNode(node.node,defaultSheet));
  if(node.type==='binary'){
   const a=evalNode(node.left,defaultSheet),b=evalNode(node.right,defaultSheet);
   const aa=a??'',bb=b??'';
   if(node.op==='=')return aa===bb;if(node.op==='<>')return aa!==bb;
   if(node.op==='<')return aa<bb;if(node.op==='>')return aa>bb;if(node.op==='<=')return aa<=bb;if(node.op==='>=')return aa>=bb;
   if(node.op==='+')return n(a)+n(b);if(node.op==='-')return n(a)-n(b);if(node.op==='*')return n(a)*n(b);
   if(n(b)===0)throw Error('Division by zero');return n(a)/n(b);
  }
  if(node.type==='call'){
   const get=i=>evalNode(node.args[i],defaultSheet);
   if(node.name==='IF')return get(0)?get(1):get(2);
   const values=()=>flatten(node.args.map(a=>evalNode(a,defaultSheet)));
   switch(node.name){
    case 'AND':return node.args.every(a=>!!evalNode(a,defaultSheet));
    case 'ISNUMBER':return typeof get(0)==='number'&&Number.isFinite(get(0));
    case 'COUNT':return values().filter(v=>typeof v==='number'&&Number.isFinite(v)).length;
    case 'COUNTIF':{const criterion=get(1);return flatten([get(0)]).filter(v=>criterion==='<>'?v!==null&&v!==''&&v!==undefined:v===criterion).length;}
    case 'SUM':return values().filter(v=>typeof v==='number').reduce((a,b)=>a+b,0);
    case 'PRODUCT':return values().filter(v=>typeof v==='number').reduce((a,b)=>a*b,1);
    case 'ROUND':{const a=n(get(0)),k=10**n(get(1));return Math.sign(a)*Math.round((Math.abs(a)+Number.EPSILON)*k)/k;}
    default:throw Error('Unsupported function '+node.name);
   }
  }
 }
 function cell(sheet,addr){
  const key=sheet+'!'+addr;if(cache.has(key))return cache.get(key);if(visiting.has(key))throw Error('Circular reference '+key);
  if(!sheets.has(sheet))throw Error('Missing sheet '+sheet);const value=sheets.get(sheet).getCell(addr).value;
  if(value&&typeof value==='object'&&value.formula){visiting.add(key);const out=evalNode(parse(value.formula),sheet);visiting.delete(key);if(typeof out==='number'&&!Number.isFinite(out))throw Error('Invalid number');cache.set(key,out);return out;}
  return value;
 }
 return {cell,all(){let count=0;for(const s of workbook.worksheets)for(const c of [...s.cells.values()])if(c.value?.formula){c.value.result=cell(s.name,c.address);count++;}return count;},clear(){cache.clear();}};
}
function test200(api,Writer){
 const pass=[],assert=(b,name)=>{if(!b)throw Error(name);pass.push(name);};
 const names=['Hakediş İcmali (Kapak)','Sözleşme Metrajı','Hakediş Cetveli','Saha Tutanakları','Kesintiler ve Cezalar'];
 const p={info:{claimNo:2,company:'ÖRNEK FİRMA',projectName:'ÖRNEK PROJE',employer:'ÖRNEK İŞVEREN',claimDate:'2026-09-14',periodStart:'2026-09-01',periodEnd:'2026-09-14',advanceAmount:100,priceDifference:0,withholdingRate:0,vatWithholdingRate:0},rows:[
 {key:'test-main',code:'TEST-01',block:'TEST',facade:'TEST CEPHE',item:'TEST İMALAT',unit:'m²',contractPrice:100,contractQuantity:100,currentQuantity:10,currentPrice:100},
 {key:'test-copy',code:'TEST-02',block:'TEST',facade:'A1 GC2_Kopya',item:'TEST İMALAT',unit:'m²',contractPrice:50,contractQuantity:200,currentQuantity:20,currentPrice:50}],
 previousPeriods:[{number:1,rows:[{key:'test-main',quantity:5,price:80},{key:'test-copy',quantity:1,price:45}],extraRows:[],cutRows:[]}],
 currentExtras:[{reportNo:'TEST-T01',desc:'TEST EK İŞ',date:'2026-09-14',qty:2,price:50,unit:'adet'}],
 currentCuts:[{type:'İSG Uyarı Cezası',date:'2026-09-14',desc:'TEST KESİNTİ',amount:50}]};
 const book=api.makeWorkbook({Workbook:Writer.Workbook},p).wb,e=makeEvaluator(book),cap=names[0];
 assert(JSON.stringify(book.worksheets.map(s=>s.name))===JSON.stringify(names),'Exactly 5 named sheets');
 assert(book.worksheets[0].getCell('E21').value===.2&&book.worksheets[0].getCell('L21').value===.05,'Requested editable 20% VAT / 5% retention');
 assert(e.cell(cap,'A5')===20000,'Contract KPI');
 assert(e.cell(cap,'J30')===2000&&e.cell(cap,'J31')===100&&e.cell(cap,'J32')===2100,'Work and site report bridges');
 assert(e.cell(cap,'J34')===255&&e.cell(cap,'J35')===1845&&e.cell(cap,'J36')===420&&e.cell(cap,'J38')===2265,'Retention, advance, penalty and VAT arithmetic');
 assert(e.cell(names[2],'I5')===15&&e.cell(names[2],'I6')===21,'Previous quantities and copy facade preserved');
 assert(e.cell(names[2],'K5')===.15,'Completion ratio');
 book.worksheets[1].getCell('F5').value=120;e.clear();
 assert(e.cell(cap,'J30')===2200&&e.cell(cap,'J38')===2495,'Changing contract price updates report and cover');
 const missing=api.makeWorkbook({Workbook:Writer.Workbook},{...p,rows:[p.rows[0],{...p.rows[1],contractPrice:null}]}).wb;
 assert(makeEvaluator(missing).cell(cap,'J38')==='','Missing price blocks payment amount');
 const zero=api.makeWorkbook({Workbook:Writer.Workbook},{...p,rows:[p.rows[0],{...p.rows[1],contractPrice:0}]}).wb;
 assert(makeEvaluator(zero).cell(cap,'J30')===1000,'Explicit zero price remains valid');
 const av=api.makeWorkbook({Workbook:Writer.Workbook},{...p,currentCuts:[...p.currentCuts,{type:'Avans',amount:75,date:'2026-09-14'}]}).wb;
 assert(makeEvaluator(av).cell(cap,'J34')===230,'Stored advance does not get counted twice');
 const gaps=api.makeWorkbook({Workbook:Writer.Workbook},{...p,info:{...p.info,claimNo:3}}).wb;
 assert(makeEvaluator(gaps).cell(names[2],'I5')==='','Missing prior claim keeps cumulative quantity blank');
 const readOnly=api.makeWorkbook({Workbook:Writer.Workbook},{...p,readOnly:true}).wb;
 assert(readOnly.worksheets[0].getCell('E21').value===null,'Shared archive does not invent a tax rate');
 const later=api.makeWorkbook({Workbook:Writer.Workbook},p).wb,le=makeEvaluator(later);
 later.worksheets[0].getCell('E24').value=.03;
 later.worksheets[0].getCell('L24').value=.4;
 assert(le.cell(cap,'J34')===486&&le.cell(cap,'J38')===2034,'Optional withholding rates update existing formulas');
 later.worksheets[0].getCell('L25').value=200;le.clear();
 assert(le.cell(cap,'J31')===300&&le.cell(cap,'J32')===2300,'Price difference parameter updates site reports');
 const formulas=e.all();assert(formulas>200,'All formula references evaluated without cycles or division errors');
 const blank=api.makeWorkbook({Workbook:Writer.Workbook},{info:{},rows:[],currentExtras:[],currentCuts:[],previousPeriods:[]}).wb,be=makeEvaluator(blank);
 assert(be.cell(cap,'J38')==='','Blank template does not show a false payable amount');
 assert(blank.worksheets[2].views[0].xSplit===5&&blank.worksheets[2].views[0].ySplit===4,'Freeze panes');
 be.all();const file=Writer.write(blank);
 assert(Object.keys(file.parts).length===12&&file.parts['xl/workbook.xml'].includes('fullCalcOnLoad="1"'),'OOXML parts and automatic recalculation');
 assert(file.parts['xl/styles.xml'].includes('FF1B365D')&&file.parts['xl/styles.xml'].includes('FF2C4D75')&&file.parts['xl/styles.xml'].includes('FFF8FAFC'),'Requested theme colors');
 return {passed:pass.length,formulaChecks:formulas,checks:pass,blankFile:file};
}

export {makeEvaluator,test200};
