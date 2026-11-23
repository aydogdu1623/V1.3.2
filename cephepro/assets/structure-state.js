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
 const nameCollator=new Intl.Collator('tr',{numeric:true,sensitivity:'base'});
 const nameKey=name=>String(name).normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const compareNames=(a,b)=>nameCollator.compare(nameKey(a),nameKey(b));
 const group=facade=>String(facade?.groupName||'');
 function reorder(data,block,names){
  const facades=data[block];
  data[block]=Object.fromEntries(names.map(name=>[name,facades[name]]));
  names.forEach((name,index)=>{facades[name].displayOrder=index;});
 }
 // Insert only the new facade; existing manual arrangements remain intact.
 function placeNewFacade(data,block,name){
  const facades=data?.[block];if(!facades||!Object.hasOwn(facades,name))return false;
  const names=Object.keys(facades).filter(f=>f!==name),peers=names.filter(f=>group(facades[f])===group(facades[name]));
  const next=peers.find(f=>compareNames(name,f)<0);
  const at=next!==undefined?names.indexOf(next):peers.length?names.indexOf(peers.at(-1))+1:names.length;
  names.splice(at,0,name);reorder(data,block,names);return true;
 }
 // Compare visible siblings, not adjacent entries belonging to another group.
 function moveFacade(data,block,name,direction){
  const facades=data?.[block];if(!facades||!Object.hasOwn(facades,name)||![-1,1].includes(direction))return false;
  const names=Object.keys(facades),peers=names.filter(f=>group(facades[f])===group(facades[name]));
  const index=peers.indexOf(name),target=index+direction;if(target<0||target>=peers.length)return false;
  const from=names.indexOf(name),to=names.indexOf(peers[target]);
  [names[from],names[to]]=[names[to],names[from]];reorder(data,block,names);return true;
 }
 root.CepheProStructure={dates,sync,capture,restore,compareNames,placeNewFacade,moveFacade};
})(typeof window==='undefined'?globalThis:window);
