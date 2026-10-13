'use strict';
const loaded=new Set();
function include(name){if(!loaded.has(name)){importScripts('/assets/'+name+'?v=228.0');loaded.add(name);}}
self.onmessage=async({data:{id,task,payload}})=>{
 try{
  let result;
  if(task==='serialize')result=JSON.stringify(payload);
  else if(task==='firma-excel'){
   include('jszip.min.js');include('firma-template-v208.js');result=await self.CepheProFirmaTemplate208.build(payload);
  }else if(task==='taseron-excel'){
   include('exceljs.min.js');include('claims-report-v191.js');const out=await self.__claimsReport191.build({ExcelJS:self.ExcelJS,...payload});
   result={bytes:new Uint8Array(await out.wb.xlsx.writeBuffer()),extra:out.extra};
  }else throw Error('Desteklenmeyen arka plan işlemi.');
  const transfer=result?.bytes?.buffer instanceof ArrayBuffer?[result.bytes.buffer]:[];
  self.postMessage({id,result},transfer);
 }catch(error){self.postMessage({id,error:error.message||'Arka plan işlemi tamamlanamadı.'});}
};
