
async function testSite201(api,Writer,evaluator,source){
 const checks=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const contract={key:'sample-main',code:'POZ-01',block:'BLOK-TEST',facade:'CEPHE-TEST',item:'ÖRNEK İMALAT',unit:'m²',contractPrice:100,contractQuantity:100};
 const makePeriod=(id,number,month,quantity,advance,extra)=>({id,number,month,snapshot:{info:{projectName:'ÖRNEK PROJE',company:'ÖRNEK FİRMA '+number,claimNo:number,advanceAmount:advance,vatRate:20,retentionRate:5},rows:[{...contract,quantity,price:100,total:100}],contractRows199:[{...contract}],extraRows:extra,cutRows:[]}});
 const periods=[makePeriod('first',1,'2026-08',10,40,[{desc:'İLK DÖNEM EKİ',reportNo:'T-01',qty:1,price:50,file:{name:'ilk.txt',data:'data:text/plain;base64,QQ=='}}]),makePeriod('second',2,'2026-09',20,80,[{desc:'İKİNCİ DÖNEM EKİ',reportNo:'T-02',qty:1,price:70,file:{name:'ikinci.txt',data:'data:text/plain;base64,Qg=='}}])];
 const secondInfo=api.periodInfo({period:{...periods[1],snapshot191:periods[1].snapshot},model:{company:'YANLIŞ FİRMA',advanceAmount:999,periodStart:'2020-01-01'},project:{projectName:'YANLIŞ PROJE'}});
 assert(secondInfo.company==='ÖRNEK FİRMA 2'&&secondInfo.advanceAmount===80,'Period keeps its saved company and advance');
 assert(secondInfo.periodStart==='2026-09-01'&&secondInfo.periodEnd==='2026-09-30','Period dates come from selected month');
 const fresh=api.periodInfo({period:{id:'new',number:3,month:'2026-02'},model:{advanceAmount:999,priceDifference:500,periodEnd:'2020-01-01'}});
 assert(fresh.advanceAmount===0&&fresh.priceDifference===0&&fresh.periodEnd==='2026-02-28','New period does not inherit another period amounts');
 const leap=api.periodInfo({period:{number:1,month:'2024-02'}});assert(leap.periodEnd==='2024-02-29','Leap-year month boundary');
 const shared=api.periodInfo({readOnly:true,period:{number:2,month:'2026-09',snapshot191:{info:{company:'PAYLAŞILAN'}}},model:{company:'KENDİ FİRMAM',vatRate:20}});
 assert(shared.company==='PAYLAŞILAN'&&shared.vatRate==='','Shared archive does not use viewer company or rate');
 const payload=api.periodPayload({selectedPeriodId:'second',periods,contractRows:[contract],info:secondInfo});
 const book=api.makeWorkbook({Workbook:Writer.Workbook},payload).wb,ev=evaluator(book);
 assert(book.worksheets.length===5&&book.worksheets[0].getCell('J12').value==='2','Selected claim number appears in five-sheet report');
 assert(ev.cell('Hakediş Cetveli','G5')===10&&ev.cell('Hakediş Cetveli','H5')===20&&ev.cell('Hakediş Cetveli','I5')===30,'Previous and current claim quantities are separated');
 assert(payload.currentExtras.length===1&&payload.currentExtras[0].reportNo==='T-02'&&payload.currentCuts.length===0,'Only selected-period site reports and attachments');
 assert(ev.cell('Hakediş İcmali (Kapak)','J38')===2300.5,'Selected period total includes its own work, extra, retention and advance');
 const readonly=api.periodPayload({selectedPeriodId:'first',periods,contractRows:[{...contract,contractPrice:999}],info:{company:'YANLIŞ'},readOnly:true});
 assert(readonly.info.company==='ÖRNEK FİRMA 1'&&readonly.rows[0].contractPrice===100&&readonly.previousPeriods.length===0,'Shared export uses archived contract and selected owner');
 const sameMonth=periods.map(p=>({...p,month:'2026-09'}));
 const same=api.periodPayload({selectedPeriodId:'first',periods:sameMonth,contractRows:[contract],info:periods[0].snapshot.info});
 assert(same.rows[0].currentQuantity===10&&same.currentExtras[0].reportNo==='T-01','Claim ID distinguishes two claims in the same month');
 periods[1].snapshot.extraRows[0].desc='SONRADAN DEĞİŞTİ';
 assert(payload.currentExtras[0].desc==='İKİNCİ DÖNEM EKİ','Export payload is an independent snapshot');
 // Exercise the actual button handler, with only browser IO replaced.
 const start=source.indexOf('async function excel(){'),end=source.indexOf('\nasync function open(',start),handler=source.slice(start,end);
 const factory=new Function('environment',`
  const {button,writer,extras,onGenerate,onWrite,validInput,failZip}=environment;
  let exporting=false,deleting=false,kind='firma',recordOwner='owner-1',owner='owner-1',changeVersion=0;
  const selected={id:'second',number:2},m={month:'2026-09'},downloads=[],messages=[],entries=[];
  const $=()=>button,period=()=>selected,model=()=>m,flushClaimInputs=()=>validInput!==false;
  const claimNotice=m=>messages.push(m),toast=m=>messages.push(m),download=(blob,name)=>downloads.push({blob,name});
  const wb={worksheets:[{name:'Hakediş İcmali (Kapak)'},{},{},{},{}],xlsx:{writeBuffer:async()=>{if(onWrite)onWrite(selected);return [80,75];}}};
  const workbook=async()=>({wb,extra:extras||[]});
  class Zip{file(name,data,options){entries.push({name,data,options});}async generateAsync(){if(onGenerate)onGenerate(selected);if(failZip)throw Error('ZIP hatası');return {zip:true};}}
  const window={JSZip:Zip};
  class Blob{constructor(parts,options){this.parts=parts;this.type=options.type;}}
  `+handler+`
  return {run:excel,downloads,messages,entries,state:()=>({exporting,disabled:button.disabled,busy:button.busy})};
 `);
 const button=()=>({textContent:'Excel ve Ekleri İndir',disabled:false,setAttribute(k,v){this.busy=v;},removeAttribute(){delete this.busy;}});
 const bare=factory({button:button()});await bare.run();
 assert(bare.downloads.length===1&&bare.downloads[0].name==='Firma_Hakedis_02_2026-09.xlsx'&&bare.downloads[0].blob.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Button downloads xlsx when there are no attachments');
 const bundle=factory({button:button(),extras:payload.currentExtras});await bundle.run();
 assert(bundle.downloads[0]?.name==='Firma_Hakedis_02_2026-09_ve_Ekler.zip'&&bundle.entries.length===2&&bundle.entries[1].name.includes('2.Hakediş/1-ikinci.txt'),'Button bundles selected Excel and its attachment in ZIP');
 const changing=factory({button:button(),extras:payload.currentExtras,onGenerate:p=>p.id='first'});await changing.run();
 assert(changing.downloads.length===0&&changing.messages.some(m=>m.includes('seçimi veya veriler değişti')),'Selection change during ZIP generation prevents wrong download');
 const bad=factory({button:button(),extras:[{file:{name:'bozuk.txt',data:'invalid'}}]});await bad.run();
 assert(bad.downloads.length===0&&bad.messages.some(m=>m.includes('bozuk.txt okunamadı')),'Invalid attachment is reported instead of silently dropped');
 assert(!bad.state().exporting&&!bad.state().disabled&&!bad.state().busy,'Button becomes usable after an export error');
 const parallel=factory({button:button()});await Promise.all([parallel.run(),parallel.run()]);
 assert(parallel.downloads.length===1,'Repeated clicks produce only one export');
 return {passed:checks.length,checks};
}

export {testSite201};
