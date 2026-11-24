import {fromDXF,fromGeoJSON} from './importer.js';
self.onmessage=({data})=>{try{const map=/\.dxf$/i.test(data.name)?fromDXF(data.text,data.name):fromGeoJSON(JSON.parse(data.text),data.name);self.postMessage({map});}catch(e){self.postMessage({error:e.message});}};
