// Assemble an opaque runtime asset at install time so the serverless JS bundler
// cannot rewrite ESM imports (including DXF's versioned import) or omit the WASM.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url),pkg='node_modules/@mlightcad/libredwg-web/';
const entries={'package.json':Buffer.from('{"type":"module"}').toString('base64')};
async function put(name,src){entries[name]=(await readFile(new URL(src,root))).toString('base64');}
for(const file of ['dist/libredwg-web.js','wasm/libredwg-web.js','wasm/libredwg-web.wasm'])await put(file,pkg+file);
for(const file of ['dxf-reader.js','cad-limits.js','importer.js','model.js','layer-model.js','contours.js','vendor/dxf.js'])await put('plan/'+file,'assets/site-map/'+file);
await put('decoder.mjs','lib/dwg-decode.mjs');await put('example.dwg','examples/verification-polygon.dwg');
// Version these modules: a static ES import is traced even when a host overrides installCommand.
const data=gzipSync(JSON.stringify(entries),{level:9}).toString('base64'),out=new URL('lib/cad-bundle/',root);
await mkdir(out,{recursive:true});
const size=800000,count=Math.ceil(data.length/size);
for(let i=0;i<count;i++)await writeFile(new URL('part'+i+'.js',out),"export default '"+data.slice(i*size,(i+1)*size)+"';\n");
await writeFile(new URL('index.js',out),Array.from({length:count},(_,i)=>"import p"+i+" from './part"+i+".js';").join('\n')+"\nexport const runtimeArchive=()=>Buffer.from(["+Array.from({length:count},(_,i)=>'p'+i).join(',')+"].join(''),'base64');\n");
