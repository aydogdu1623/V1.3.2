/* Restricted formula interpreter for the functions used by the supplied workbook.
   No eval/Function; only cell references, arithmetic and the listed Excel functions. */
(function(root){'use strict';
const colNumber=s=>[...s.replace(/\$/g,'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const colName=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const numeric=v=>v===''||v==null?0:typeof v==='boolean'?+v:Number(v);
const flat=v=>Array.isArray(v)?v.flat(Infinity):[v];
const scalar=v=>Array.isArray(v)?v[0]?.[0]??'':v;
const dateSerial=(y,m,d)=>Date.UTC(y<1900?y+1900:y,m-1,d)/86400000+25569;
function tokens(s){
 const out=[];let i=0;
 while(i<s.length){if(/\s/.test(s[i])){i++;continue;}let m;
  if(s[i]==='"'){let str='';i++;while(i<s.length){if(s[i]==='"'){i++;if(s[i]==='"'){str+='"';i++;continue;}break;}str+=s[i++];}out.push({t:'literal',v:str});continue;}
  if((m=s.slice(i).match(/^(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\p{N}_ .]*))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/u))){out.push({t:'ref',sheet:(m[1]||m[2]).replace(/''/g,"'"),start:m[3].replace(/\$/g,''),end:m[4]?.replace(/\$/g,'')});i+=m[0].length;continue;}
  if((m=s.slice(i).match(/^\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/))){const [start,end]=m[0].replace(/\$/g,'').split(':');out.push({t:'ref',start,end});i+=m[0].length;continue;}
  if((m=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/))){out.push({t:'literal',v:Number(m[0])});i+=m[0].length;continue;}
  if((m=s.slice(i).match(/^[A-Z_][A-Z_0-9.]*/))){out.push({t:'name',v:m[0]});i+=m[0].length;continue;}
  if((m=s.slice(i).match(/^(<>|<=|>=|[+\-*/^&=<>(),%])/))){out.push({t:m[0]});i+=m[0].length;continue;}
  throw Error('Formula token: '+s.slice(i,i+30));
 }return out;
}
function parse(s){const ts=tokens(s.replace(/^=/,''));let i=0;
 const ranks={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
 function expr(min=0){let a=ts[i++];if(!a)throw Error('Missing expression');let node;
  if(a.t==='literal'||a.t==='ref')node=a;
  else if(a.t==='-'||a.t==='+')node={t:'unary',op:a.t,a:expr(6)};
  else if(a.t==='('){node=expr();if(ts[i++]?.t!==')')throw Error('Missing )');}
  else if(a.t==='name'){
   if(a.v==='TRUE'||a.v==='FALSE')node={t:'literal',v:a.v==='TRUE'};
   else {if(ts[i++]?.t!=='(')throw Error('Unknown name '+a.v);const args=[];if(ts[i]?.t!==')')do{args.push(expr());if(ts[i]?.t!==',')break;i++;}while(true);if(ts[i++]?.t!==')')throw Error('Function )');node={t:'call',name:a.v,args};}
  }else throw Error('Unexpected token '+a.t);
  if(ts[i]?.t==='%'){i++;node={t:'binary',op:'/',a:node,b:{t:'literal',v:100}};}
  while(ts[i]&&ranks[ts[i].t]>=min){const op=ts[i++].t;node={t:'binary',op,a:node,b:expr(ranks[op]+1)};}return node;
 }
 const result=expr();if(i!==ts.length)throw Error('Trailing formula tokens');return result;
}
function engine(sheets){const cache=new Map(),asts=new Map(),active=new Set();
 const equal=(a,b)=>typeof a==='string'&&typeof b==='string'?a.toLocaleLowerCase('tr')===b.toLocaleLowerCase('tr'):a===b;
 function cell(sheet,ref){const key=sheet+'!'+ref;if(cache.has(key))return cache.get(key);if(active.has(key))throw Error('Circular '+key);const c=sheets[sheet]?.[ref];if(!c)return '';active.add(key);try{let v;if(c.formula){let a=asts.get(c.formula);if(!a){a=parse(c.formula);asts.set(c.formula,a);}v=run(a,sheet);}else v=c.value??'';if(typeof v==='number'&&!Number.isFinite(v))throw Error('Invalid result '+key);cache.set(key,v);return v;}finally{active.delete(key);}}
 function ref(a,sheet){const sh=a.sheet||sheet;if(!sheets[sh])throw Error('Unknown sheet '+sh);if(!a.end)return cell(sh,a.start);const start=a.start.match(/([A-Z]+)(\d+)/),end=a.end.match(/([A-Z]+)(\d+)/);const rows=[];for(let r=+start[2];r<=+end[2];r++){const vals=[];for(let c=colNumber(start[1]);c<=colNumber(end[1]);c++)vals.push(cell(sh,colName(c)+r));rows.push(vals);}return rows;}
 function run(a,sheet){
  if(a.t==='literal')return a.v;if(a.t==='ref')return ref(a,sheet);if(a.t==='unary')return(a.op==='-'?-1:1)*numeric(run(a.a,sheet));
  if(a.t==='binary'){const l=scalar(run(a.a,sheet)),r=scalar(run(a.b,sheet));switch(a.op){case '&':return String(l)+String(r);case '=':return equal(l,r);case '<>':return !equal(l,r);case '>':return l>r;case '<':return l<r;case '>=':return l>=r;case '<=':return l<=r;case '+':return numeric(l)+numeric(r);case '-':return numeric(l)-numeric(r);case '*':return numeric(l)*numeric(r);case '/':if(!numeric(r))throw Error('Division by zero');return numeric(l)/numeric(r);case '^':return numeric(l)**numeric(r);}}
  const get=i=>run(a.args[i],sheet), vals=()=>a.args.map(x=>run(x,sheet));
  switch(a.name){
   case 'IF':return get(0)?get(1):(a.args[2]?get(2):false);
   case 'IFERROR':try{return get(0);}catch{return get(1);}
   case 'AND':return a.args.every(x=>!!run(x,sheet));case 'OR':return a.args.some(x=>!!run(x,sheet));
   case 'SUM':return vals().flat(Infinity).reduce((s,x)=>s+(typeof x==='number'?x:0),0);
   case 'AVERAGE':{const v=vals().flat(Infinity).filter(x=>typeof x==='number');if(!v.length)throw Error('Empty average');return v.reduce((s,x)=>s+x,0)/v.length;}
   case 'ROUND':{const n=numeric(get(0)),f=10**numeric(get(1));return Math.sign(n)*Math.round(Math.abs(n)*f+1e-9)/f;}
   case 'DATE':return dateSerial(numeric(get(0)),numeric(get(1)),numeric(get(2)));
   case 'DAY':return new Date((numeric(get(0))-25569)*86400000).getUTCDate();
   case 'MONTH':return new Date((numeric(get(0))-25569)*86400000).getUTCMonth()+1;
   case 'WEEKDAY':{const d=new Date((numeric(get(0))-25569)*86400000).getUTCDay();return a.args[1]&&get(1)===2?(d||7):d+1;}
   case 'CHOOSE':return get(numeric(get(0)));
   case 'INDIRECT':{const parsed=tokens(String(get(0)));if(parsed.length!==1||parsed[0].t!=='ref')throw Error('Indirect reference');return ref(parsed[0],sheet);}
   case 'VLOOKUP':{const key=get(0),rows=get(1),index=numeric(get(2))-1,row=rows.find(r=>equal(r[0],key));if(!row)throw Error('Lookup not found');return row[index]??'';}
   case 'MATCH':{const key=get(0),i=flat(get(1)).findIndex(v=>equal(v,key));if(i<0)throw Error('Match not found');return i+1;}
   case 'COUNTIF':{const range=flat(get(0)),raw=get(1),condition=String(raw),m=condition.match(/^(>=|<=|<>|>|<|=)(.*)$/);return range.filter(v=>{if(!m)return equal(v,raw);const r=Number(m[2]);if(m[1]==='>')return numeric(v)>r;if(m[1]==='<')return numeric(v)<r;if(m[1]==='>=')return numeric(v)>=r;if(m[1]==='<=')return numeric(v)<=r;if(m[1]==='<>')return numeric(v)!==r;return numeric(v)===r;}).length;}
   case 'TEXT':{const v=get(0);if(v===''||v===0)return '';const d=new Date((numeric(v)-25569)*86400000);return String(d.getUTCDate()).padStart(2,'0')+'.'+String(d.getUTCMonth()+1).padStart(2,'0')+'.'+d.getUTCFullYear();}
   default:throw Error('Unsupported function '+a.name);
  }
 }
 return{cell,cache};
}
root.PuantajFormula={engine,colName,dateSerial,parse};
})(typeof window==='undefined'?globalThis:window);
