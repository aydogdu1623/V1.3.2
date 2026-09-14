import {readFileSync} from 'node:fs';
import '../report-engine.js';
import '../tools/xlsx-writer.js';
import {test200} from './formula-evaluator.mjs';
import {verifyXlsx} from './verify-xlsx.mjs';
const result=test200(globalThis.CepheProFirma199,globalThis.CepheProXlsx200);
const structure=verifyXlsx(result.blankFile.bytes,result.blankFile.parts);
delete result.blankFile;
const source=readFileSync(new URL('../assets/claims-v182.js',import.meta.url),'utf8');
new Function(source);
for(const anchor of ["readOnly:readOnly(),currentExtras:","reportNo:$('cl-extra-report-no').value.trim()","handleClaimEnter198","s.reportVersion200=1"]){
 if(!source.includes(anchor))throw Error('Entegrasyon eksik: '+anchor);
}
console.log(JSON.stringify({...result,structure,integrationSyntax:'passed'},null,2));
