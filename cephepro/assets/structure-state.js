/* Facade order survives JSONB key reordering; plans share one authoritative source. */
(function(root){
 'use strict';
 function dates(facade,row){
  const s=facade?.schedule;
  return s?.plannedStart&&s?.plannedEnd
   ?[s.plannedStart,s.plannedEnd,Number(s.plannedDuration)||0]
   :[row?.[4]||'',row?.[5]||'',row?.[6]||0];
 }
 function sync(data){
  for(const facades of Object.values(data||{}))for(const facade of Object.values(facades||{}))
   for(const row of facade.items||[]){const plan=dates(facade,row);row[4]=plan[0];row[5]=plan[1];row[6]=plan[2];}
  return data;
 }
 function capture(data){
  for(const facades of Object.values(data||{}))Object.keys(facades).forEach((name,index)=>{facades[name].displayOrder=index;});
  return sync(data);
 }
 function restore(data){
  for(const [block,facades] of Object.entries(data||{})){
   const names=Object.keys(facades);names.sort((a,b)=>(Number.isInteger(facades[a]?.displayOrder)?facades[a].displayOrder:Number.MAX_SAFE_INTEGER)-(Number.isInteger(facades[b]?.displayOrder)?facades[b].displayOrder:Number.MAX_SAFE_INTEGER));
   const ordered=Object.fromEntries(names.map(name=>[name,facades[name]]));
   data[block]=ordered;
  }
  return sync(data);
 }
 root.CepheProStructure={dates,sync,capture,restore};
})(typeof window==='undefined'?globalThis:window);
