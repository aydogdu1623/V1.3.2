import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {error} from './site-map.js';
// Extract trusted release files once per function instance. User drawings never
// enter this directory; every job still receives its own temporary directory.
let ready;
export function cadRuntime(){
 if(!ready)ready=(async()=>{
  const candidates=[path.resolve('lib/cad-assets/runtime.gz'),fileURLToPath(new URL('./cad-assets/runtime.gz',import.meta.url)),path.resolve('cephepro/lib/cad-assets/runtime.gz')];
  let raw;for(const candidate of new Set(candidates)){try{raw=await readFile(candidate);break;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!raw){console.error('[cad-runtime] missing-release-asset');throw error(503,'Sunucuda DWG dönüştürücü paketi eksik.');}
  const files=JSON.parse(gunzipSync(raw,{maxOutputLength:20_000_000})),dir=await mkdtemp(path.join(os.tmpdir(),'cp-cad-runtime-'));
  try{for(const [name,bytes] of Object.entries(files)){if(!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(?:js|mjs|json|dwg|wasm)$/.test(name))throw Error('bad runtime');const target=path.join(dir,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,Buffer.from(bytes,'base64'),{mode:0o600});}return dir;}
  catch(e){await rm(dir,{force:true,recursive:true});throw e;}
 })().catch(e=>{ready=null;throw e;});return ready;
}
