// Build-time smoke check: synthetic public sample only. Never prints credentials or user records.
import {translateBatch} from '../lib/translation.js';
const samples=['Kuzey cephesinde yağmur nedeniyle ankraj montajına 2 saat ara verildi.','W1 - Ankraj çakımı'];
try{
 for(const language of ['en','de']){
  const values=await translateBatch(samples,language);
  if(values.some((s,i)=>s===samples[i])||!values[0].includes('2')||!values[1].includes('W1'))throw Error('TRANSLATION_SMOKE_FAILED');
  console.log(JSON.stringify({language,translations:values,verified:true}));
 }
 console.log('Translation service verified for English and German.');
}catch(e){console.error('Translation service verification failed:',e.message);process.exitCode=1;}
