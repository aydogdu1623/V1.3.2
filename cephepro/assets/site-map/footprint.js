// All vertices use metres in a local frame so survey coordinate offsets do not affect the model.
export function footprint(feature,units){
 const source=feature.geometry?.type==='Polygon'&&feature.geometry.coordinates;
 if(!source?.length)throw Error('3B tahmin için kapalı bir dış hat gerekir.');
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [x,y] of source[0]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const k={mm:.001,cm:.01,ft:.3048,m:1,unitless:1}[units]||1,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const rings=source.map(r=>r.slice(0,-1).map(([x,y])=>[(x-cx)*k,(y-cy)*k]));
 const height=feature.height||6;
 const groups=[['foundation',.08,'#a1a9a7'],['walls',.68,'#cfbc9f'],['facade',.18,'#dedacb'],['roof',.06,'#537476']];
 let y=0;const slabs=groups.map(([part,share,color])=>{const base=y;y=part==='roof'?height:y+share*height;return {part,base,top:y,color};});
 return {rings,slabs,height,span:Math.max((maxX-minX)*k,(maxY-minY)*k,height)};
}
export function slabProgress(feature,part){const list=feature.components.filter(c=>c.part===part);return list.length?Math.min(...list.map(c=>c.progress)):null;}
