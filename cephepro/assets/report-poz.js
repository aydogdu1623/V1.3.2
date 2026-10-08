/* Shared Poz No column for report tables. Item keys remain unchanged for formulas. */
(function(){
  'use strict';
  const norm=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
  function position(name,block='',facade=''){
    const source=typeof DATA==='object'&&DATA||{},matches=[];
    for(const [key,facades] of Object.entries(source)){
      const label=typeof v33BlockLabel==='function'?v33BlockLabel(key):key;
      if(block&&norm(block)!==norm(key)&&norm(block)!==norm(label))continue;
      for(const [side,details] of Object.entries(facades||{})){
        if(facade&&norm(side)!==norm(facade))continue;
        for(const raw of details?.items||[]){
          if(norm(raw?.[0])===norm(name))matches.push(String(raw?.[10]??'').trim());
        }
      }
    }
    // Never infer a code from hyphens in a legacy item description.
    const unique=[...new Set(matches)];
    return unique.length===1?unique[0]:'';
  }
  function table(headers,rows,widths=[]){
    const item=headers.findIndex(h=>norm(h)==='iş kalemi');
    if(item<0||headers.some(h=>norm(h)==='poz no'))return {headers,rows,widths};
    const block=headers.findIndex(h=>['blok','blok adı'].includes(norm(h)));
    const facade=headers.findIndex(h=>['cephe','cephe adı'].includes(norm(h)));
    return {
      headers:[...headers.slice(0,item+1),'Poz No',...headers.slice(item+1)],
      rows:rows.map(row=>[...row.slice(0,item+1),position(row[item],block<0?'':row[block],facade<0?'':row[facade]),...row.slice(item+1)]),
      widths:widths.length?[...widths.slice(0,item+1),8,...widths.slice(item+1)]:[]
    };
  }
  window.CepheProReportPoz={position,table};
})();
