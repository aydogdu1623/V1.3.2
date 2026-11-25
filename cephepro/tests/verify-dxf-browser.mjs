// Exercises actual file input, ESM Worker, parser, dialog, save and 3D in headless Chrome.
import http from 'node:http';
import {dwgExample} from '../lib/dwg-service.js';
import {readFile,mkdtemp,rm,open as openFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+u.pathname);
 if(u.pathname==='/api/site-map'&&u.searchParams.get('sample')==='dwg'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({map:await dwgExample()}));}
 if(!file.startsWith(root))throw Error();const b=await readFile(file);res.setHeader('content-type',({'js':'text/javascript','html':'text/html','css':'text/css','dxf':'text/plain'})[file.split('.').at(-1)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const temp=await mkdtemp(path.join(os.tmpdir(),'cp-cad-')),delay=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--disable-dev-shm-usage','--disable-webgl','--user-data-dir='+temp,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
let diag='';proc.stderr.on('data',s=>{diag=(diag+s).slice(-5000);});let ws;
try{
 let port;for(let i=0;i<150&&!port;i++){try{port=(await readFile(path.join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{if(proc.exitCode!==null)throw Error(diag);await delay(100);}}
 if(!port)throw Error(diag);const pages=await(await fetch('http://localhost:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data),cb=pending.get(m.id);if(cb){pending.delete(m.id);cb(m);}};
 const cmd=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(m.error.message)):r(m.result));ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const v=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.exception?.description||v.exceptionDetails.text);return v.result.value;};
 const waitFor=async exp=>{for(let i=0;i<800;i++){if(await evaluate(exp))return;await delay(100);}throw Error('UI timeout: '+exp+' / '+await evaluate('document.body.innerText.slice(-650)'));};
 await cmd('Page.navigate',{url:base+'/map-demo.html'});await waitFor("!!document.querySelector('#smUpload')");
 await evaluate("document.querySelector('#smUpload').click()");
 const dom=await cmd('DOM.getDocument');const target=await cmd('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[type=file]'});
 // Real 250 MB ASCII DXF. Non-plan comments are discarded by the streaming reader.
 const fixture=await readFile(path.join(root,'examples/v252-outline.dxf'),'utf8'),marker=fixture.lastIndexOf('0\nEOF'),before=fixture.slice(0,marker),after=fixture.slice(marker);
 const large=path.join(temp,'large.dxf'),fp=await openFile(large,'w');
 try{
  const pad='999\r\n'+'x'.repeat(220)+'\r\n',page=pad.repeat(4096);
  await fp.writeFile(before);let left=250_000_000-Buffer.byteLength(before+after);
  while(left>=page.length){await fp.writeFile(page);left-=page.length;}
  // Last valid DXF comment accounts for the exact remainder, even when under 7 bytes.
  const n=Math.max(0,Math.floor((left-7)/pad.length));await fp.writeFile(pad.repeat(n));left-=n*pad.length;
  await fp.writeFile('999\r\n'+'y'.repeat(left-7)+'\r\n'+after);assert.equal((await fp.stat()).size,250_000_000);
 }finally{await fp.close();}
 await cmd('DOM.setFileInputFiles',{nodeId:target.nodeId,files:[large]});
 await waitFor("!!document.querySelector('#smPublish3D')");assert.match(await evaluate("document.querySelector('.sm-review').textContent"),/Yerel yapay zekâ/);
 await evaluate("document.querySelector('#smPublish3D').click()");
 await waitFor("!!document.querySelector('.sm-viewer svg g[data-part=roof] path') && !document.querySelector('.sm-viewer').hidden");
 assert.equal(await evaluate("document.querySelector('.sm-canvas').hasAttribute('hidden')"),true);
 const previous=await evaluate("document.querySelector('.sm-viewer svg path').getAttribute('d')");
 await evaluate("document.querySelector('.sm-viewer svg').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))");await waitFor("document.querySelector('.sm-viewer svg path').getAttribute('d')!=="+JSON.stringify(previous));
 await evaluate("const row=document.querySelector('[data-component=part-2] .sm-number');row.value=47;row.dispatchEvent(new Event('change',{bubbles:true}))");
 await waitFor("document.querySelector('[data-part=roof] path').getAttribute('fill')==='#e8ae47'");
 await evaluate("document.querySelector('#smBack').click()");await waitFor("!document.querySelector('.sm-canvas').hasAttribute('hidden')");
 assert.equal(await evaluate("document.querySelectorAll('.sm-canvas [data-id]').length"),1);
 console.log('PASS: upload 250 MB DXF, review mixed geometry, save, render and rotate L footprint without WebGL, update roof at 47%, return to plan.');
 await cmd('Page.navigate',{url:base+'/map-demo.html?dwg=1'});
 await waitFor("document.querySelectorAll('.sm-canvas [data-id]').length===1 && !!document.querySelector('#sm3D')");
 await evaluate("document.querySelector('#sm3D').click()");
 await waitFor("!!document.querySelector('.sm-viewer svg g[data-part=roof] path') && !document.querySelector('.sm-viewer').hidden");
 console.log('PASS: real DWG decoder → selected building → 3D roof in browser.');
}finally{ws?.close();const exited=once(proc,'exit').catch(()=>{});proc.kill();if(proc.exitCode===null)await Promise.race([exited,delay(2500)]);await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:120});server.closeAllConnections();server.close();}
