// Standalone child process: one drawing, no network access needed or project credentials passed.
import {readFile,writeFile} from 'node:fs/promises';
import {workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {LibreDwg} from './dist/libredwg-web.js';
import {readDrawing} from './plan/dxf-reader.js';

async function run(){
 const {input,output}=workerData;
 const src=await readFile(input);
 if(!/^AC\d{4}$/.test(src.toString('ascii',0,6)))throw Error('DWG başlığı geçersiz.');
 const engine=await LibreDwg.create(fileURLToPath(new URL('./wasm',import.meta.url)));
 const bytes=engine.dwg_write_dxf(src);
 if(!bytes?.length)throw Error('DWG sürümü veya dosya içeriği okunamadı.');
 if(bytes.length>384_000_000)throw Error('Plan çok ayrıntılı: ara çizim 384 MB sınırını aşıyor.');
 const file=new File([bytes],'converted.dxf');
 const map=await readDrawing(file,undefined,384_000_000);
 map.source={...map.source,format:'dwg',name:'DWG'};
 const data=JSON.stringify(map);
 if(Buffer.byteLength(data)>3_000_000)throw Error('Plan çok ayrıntılı. Kullanacağınız katmanları ayrı bir çizim olarak yükleyin.');
 await writeFile(output,data);
}
run().catch(async e=>{
 // Return only controlled errors (never raw drawing content from the decoder).
 const allowed=/^(DWG başlığı|DWG sürümü|Plan çok ayrıntılı|Vaziyet geometrisi|DXF içinde|Çizim çok ayrıntılı|Dosya boyutu)/;
 const message=allowed.test(e.message)?e.message.slice(0,240):'DWG okunamadı. Dosya bozuk, desteklenmiyor veya işlem belleğini aşıyor olabilir.';
 try{await writeFile(workerData.output,JSON.stringify({error:message}));}catch{}process.exitCode=1;
});
