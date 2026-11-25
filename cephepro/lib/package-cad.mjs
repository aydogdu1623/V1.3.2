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
const out=new URL('lib/cad-assets/',root);await mkdir(out,{recursive:true});await writeFile(new URL('runtime.gz',out),gzipSync(JSON.stringify(entries),{level:9}));
