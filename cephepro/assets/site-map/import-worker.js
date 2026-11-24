import {readDrawing} from './dxf-reader.js';
self.onmessage=async({data})=>{
 try{const map=await readDrawing(data.file,p=>self.postMessage({percent:p}));self.postMessage({map});}
 catch(e){self.postMessage({error:e.message});}
};
