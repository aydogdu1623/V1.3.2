import DxfParser from './vendor/dxf.js';
import {validateMap,defaultComponents} from './model.js';
const ignored=/dim|dimension|hatch|text|note|anno|axis|grid|ölçü|olcu|taram|eksen|yazı|yazi/i;
export function classifyLayer(layer,closed){
 if(ignored.test(layer))return {kind:null,confidence:1};
 for(const [kind,re] of [['building',/build|villa|blok|bina|outline|footprint|yapi|yapı|duvar|wall/i],['road',/road|yol|street|pave/i],['landscape',/landsc|peyzaj|green|tree|ağaç|agac/i],['water',/water|su\b|pool|havuz|sea/i],['boundary',/bound|sinir|sınır|parsel|site/i]])if(re.test(layer))return {kind,confidence:.92};
 return {kind:closed?'building':'boundary',confidence:.35};
}
export function simplify(points,tolerance=0.03){
 if(points.length<4)return points;
 const out=[points[0]],stack=[[0,points.length-1]],keep=new Set([0,points.length-1]);
 while(stack.length){const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],len=dx*dx+dy*dy;let best=tolerance*tolerance,index=-1;
  for(let i=a+1;i<b;i++){const t=len?Math.max(0,Math.min(1,((points[i][0]-p[0])*dx+(points[i][1]-p[1])*dy)/len)):0;const d=(points[i][0]-p[0]-t*dx)**2+(points[i][1]-p[1]-t*dy)**2;if(d>best){best=d;index=i;}}
  if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
 }return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
export function fromGeoJSON(data,name='GeoJSON'){
 if(data?.schemaVersion===1)return validateMap(data);
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('GeoJSON FeatureCollection gerekli.');
 const features=[];
 for(const [i,f] of data.features.entries()){
  const geometries=f.geometry?.type==='MultiPolygon'?f.geometry.coordinates.map(c=>({type:'Polygon',coordinates:c})):[f.geometry];
  for(const [j,geometry] of geometries.entries()){
   if(!['Polygon','LineString'].includes(geometry?.type))continue;
   const layer=String(f.properties?.layer||''),classification=classifyLayer(layer,geometry.type==='Polygon');
   const kind=f.properties?.kind||classification.kind;if(!kind)continue;
   features.push({id:`geo-${i}-${j}`,kind,name:String(f.properties?.name||f.properties?.label||`Blok ${features.length+1}`),blockType:String(f.properties?.blockType||''),layer:layer||'GeoJSON',confidence:classification.confidence,geometry,height:f.properties?.height||6,components:kind==='building'?defaultComponents():[]});
  }
 }
 // CRS84/WGS84 is not silently interpreted as metres; user must explicitly supply local CAD coordinates.
 if(data.crs||data.features.some(f=>f.properties?.crs))throw Error('Coğrafi koordinatları önce yerel metre koordinatlarına dönüştürün.');
 return validateMap({schemaVersion:1,units:data.units||'unitless',features,source:{format:'geojson',mode:'rules',name,warnings:['Koordinatlar yerel CAD XY olarak yorumlanır. Birimi ve blok eşleştirmelerini kontrol edin.']}});
}
export function fromDXF(text,name='DXF'){
 const doc=new DxfParser().parseSync(text),features=[];let unsupported=0,ignoredCount=0,visited=0;
 const unit={2:'ft',4:'mm',5:'cm',6:'m'}[doc.header?.$INSUNITS]||'unitless';
 const tolerance={mm:30,cm:3,m:.03,ft:.1,unitless:.03}[unit];
 function walk(entities,transform=p=>p,inherit='',depth=0){
  if(depth>12)throw Error('DXF blok iç içe geçme sınırı aşıldı.');
  for(const e of entities||[]){
   if(++visited>100000)throw Error('Çizim çok ayrıntılı. CAD servisinde sadeleştirin.');
   const layer=e.layer==='0'&&inherit?inherit:e.layer||inherit||'0';
   if(ignored.test(layer)||['DIMENSION','HATCH','TEXT','MTEXT','POINT','ATTRIB','ATTDEF'].includes(e.type)){ignoredCount++;continue;}
   if(e.type==='INSERT'){
    const block=doc.blocks?.[e.name];if(!block){unsupported++;continue;}
    const a=(e.rotation||0)*Math.PI/180,sx=e.xScale??1,sy=e.yScale??1,base=block.position||{x:0,y:0},pos=e.position||{x:0,y:0};
    const tr=p=>{const x=(p[0]-base.x)*sx,y=(p[1]-base.y)*sy;return transform([pos.x+x*Math.cos(a)-y*Math.sin(a),pos.y+x*Math.sin(a)+y*Math.cos(a)]);};
    walk(block.entities,tr,layer,depth+1);continue;
   }
   let points=[],closed=false;
   if(['LWPOLYLINE','POLYLINE','LINE'].includes(e.type)){
    const v=e.vertices||[];closed=!!e.shape||!!e.closed;
    for(let i=0;i<v.length;i++){
     const p=v[i],q=v[(i+1)%v.length];points.push([p.x,p.y]);
     if(p.bulge&&q&&(closed||i<v.length-1)){
      const theta=4*Math.atan(p.bulge),dx=q.x-p.x,dy=q.y-p.y,chord=Math.hypot(dx,dy),offset=chord*(1-p.bulge*p.bulge)/(4*p.bulge);
      const cx=(p.x+q.x)/2-dy/chord*offset,cy=(p.y+q.y)/2+dx/chord*offset,r=Math.hypot(p.x-cx,p.y-cy),start=Math.atan2(p.y-cy,p.x-cx),steps=Math.min(80,Math.max(4,Math.ceil(Math.abs(theta)*12)));
      for(let k=1;k<steps;k++)points.push([cx+r*Math.cos(start+theta*k/steps),cy+r*Math.sin(start+theta*k/steps)]);
     }
    }
   }else if(['CIRCLE','ARC'].includes(e.type)){
    closed=e.type==='CIRCLE';const start=closed?0:e.startAngle,end=closed?Math.PI*2:e.endAngle;let sweep=end-start;while(sweep<=0)sweep+=Math.PI*2;
    const n=Math.max(8,Math.ceil(sweep*12));for(let k=0;k<=n;k++){const a=start+sweep*k/n;points.push([e.center.x+e.radius*Math.cos(a),e.center.y+e.radius*Math.sin(a)]);}
   }else{unsupported++;continue;}
   if(points.length<2)continue;
   points=points.map(transform);if(closed){points.push(points[0]);const reduced=simplify(points,tolerance);if(reduced.length>=4)points=reduced;}else points=simplify(points,tolerance);
   const c=classifyLayer(layer,closed);if(!c.kind)continue;
   if(c.kind==='building'&&!closed){unsupported++;continue;}
   features.push({id:'cad-'+features.length,kind:c.kind,name:closed?`Blok ${features.filter(f=>f.kind==='building').length+1}`:layer,layer,confidence:c.confidence,geometry:{type:closed?'Polygon':'LineString',coordinates:closed?[points]:points},components:c.kind==='building'?defaultComponents():[]});
  }
 }
 walk(doc.entities);
 return validateMap({schemaVersion:1,units:unit,features,source:{format:'dxf',mode:'rules',name,warnings:[`${ignoredCount} ölçü/yazı/tarama atlandı. ${unsupported} desteklenmeyen veya açık bina hattı atlandı.`,...(unsupported?['Eksik veya eğrisel geometri için CAD servisini kullanın.']:[]),'Düşük güvenli katmanları yayınlamadan önce kontrol edin.']}});
}
