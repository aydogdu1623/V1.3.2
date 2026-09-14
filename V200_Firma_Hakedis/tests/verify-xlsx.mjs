function verifyXlsx(bytes,parts){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
 const must=(b,m)=>{if(!b)throw Error(m);};
 must(dv.getUint32(end,true)===0x06054b50,'Missing ZIP directory');
 const entries=dv.getUint16(end+10,true),centralSize=dv.getUint32(end+12,true),centralStart=dv.getUint32(end+16,true);
 must(centralStart+centralSize===end,'ZIP central directory length');
 const crcTable=Array.from({length:256},(_,n)=>{let k=n;for(let i=0;i<8;i++)k=(k&1)?0xedb88320^(k>>>1):k>>>1;return k>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 let p=centralStart;
 for(let i=0;i<entries;i++){
  must(dv.getUint32(p,true)===0x02014b50,'Invalid directory entry');
  const size=dv.getUint32(p+24,true),expected=dv.getUint32(p+16,true),local=dv.getUint32(p+42,true),nameSize=dv.getUint16(p+28,true);
  must(dv.getUint32(local,true)===0x04034b50&&dv.getUint16(local+8,true)===0,'Invalid uncompressed entry');
  const dataStart=local+30+dv.getUint16(local+26,true)+dv.getUint16(local+28,true);
  must(crc(bytes.subarray(dataStart,dataStart+size))===expected,'ZIP CRC mismatch');
  p+=46+nameSize+dv.getUint16(p+30,true)+dv.getUint16(p+32,true);
 }
 must(p===end,'ZIP directory end');
 for(const[path,xml]of Object.entries(parts)){
  const stack=[];for(const tag of xml.match(/<[^>]*>/g)||[]){
   if(tag.startsWith('<?')||tag.startsWith('<!'))continue;
   if(tag.startsWith('</'))must(stack.pop()===tag.slice(2,-1).trim(),'Unbalanced XML '+path);
   else if(!tag.endsWith('/>'))stack.push(tag.slice(1).match(/^[^\s>]+/)[0]);
  }
  must(stack.length===0,'Unclosed XML '+path);
 }
 must(entries===Object.keys(parts).length,'Part count');
 must(Object.keys(parts).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).length===5,'Sheet part count');
 return {zipEntries:entries,crcChecks:entries,xmlParts:Object.keys(parts).length};
}
export {verifyXlsx};
