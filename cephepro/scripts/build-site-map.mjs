import {build} from 'esbuild';import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'assets/site-map/vendor');await fs.mkdir(out,{recursive:true});
await build({stdin:{contents:"export * from 'three';export {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';export {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';",resolveDir:root},bundle:true,minify:true,format:'esm',outfile:path.join(out,'three.js')});
await build({stdin:{contents:"export {default} from 'dxf-parser';",resolveDir:root},bundle:true,minify:true,format:'esm',outfile:path.join(out,'dxf.js')});
for(const [pkg,name]of [['three','THREE'],['dxf-parser','DXF']])await fs.copyFile(path.join(root,'node_modules',pkg,'LICENSE'),path.join(out,name+'-LICENSE.txt'));
