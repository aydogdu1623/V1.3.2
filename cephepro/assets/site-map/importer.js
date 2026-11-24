import DxfParser from './vendor/dxf.js';
import {validateMap,defaultComponents} from './model.js';
import {predictLayer} from './layer-model.js';
import {assembleContours,area2} from './contours.js';
const ignored=/(?:^|[^\p{L}])(?:dim(?:ensions?)?|hatch(?:ing)?|text|notes?|anno(?:tations?)?|axis|axes|grid|ölçü|olcu|tarama|eksen|yazı|yazi)(?:$|[^\p{L}])/iu;
export function classifyLayer(layer,closed){
 const hit=predictLayer(layer);if(hit && (hit.kind!=='omit'||hit.confidence>=.84))return {...hit,kind:hit.kind==='omit'?null:hit.kind};
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
 text=String(text).replace(/^\uFEFF/,'');
 if(/^AutoCAD Binary DXF/.test(text))throw Error('Bu dosya ikili DXF. AutoCAD’de ASCII DXF olarak kaydedip yükleyin.');
 const doc=new DxfParser().parseSync(text),features=[],byLayer=new Map();let unsupported=0,ignoredCount=0,visited=0,built=0,joined=0,open=0,pointCount=0;
 if(!doc?.entities)throw Error('DXF içinde okunabilir ENTITIES bölümü bulunamadı.');
 const unit={2:'ft',4:'mm',5:'cm',6:'m'}[doc.header?.$INSUNITS]||'unitless';
 const tolerance={mm:30,cm:3,m:.03,ft:.1,unitless:.03}[unit];
 function add(layer,pts,closed){
  if(closed){if(pts.length<4||Math.abs(area2(pts))<tolerance*tolerance*1e-4){unsupported++;return;}}
  const c=classifyLayer(layer,closed);if(!c.kind){ignoredCount++;return;}
  const kind=c.kind==='building'&&!closed?'boundary':c.kind;
  if(!closed&&c.kind==='building')open++;
  if(features.length>=2000||(pointCount+=pts.length)>100000)throw Error('Çizim çok ayrıntılı: yalnız vaziyet planı katmanlarını DXF olarak dışa aktarın (2000 şekil / 100000 nokta).');
  features.push({id:'cad-'+features.length,kind,name:kind==='building'?'Blok '+(++built):layer,layer,confidence:kind===c.kind?c.confidence:.30,geometry:{type:closed?'Polygon':'LineString',coordinates:closed?[pts]:pts},components:kind==='building'?defaultComponents():[]});
 }
 function walk(entities,transform=p=>p,inherit='',depth=0){
  if(depth>12)throw Error('DXF blok iç içe geçme sınırı aşıldı.');
  for(const e of entities||[]){
   if(++visited>100000)throw Error('Çizim çok ayrıntılı. CAD servisinde sadeleştirin.');
   const layer=e.layer==='0'&&inherit?inherit:e.layer||inherit||'0';
   if(e.inPaperSpace||e.visible===false||!classifyLayer(layer,false).kind||['DIMENSION','HATCH','TEXT','MTEXT','POINT','ATTRIB','ATTDEF'].includes(e.type)){ignoredCount++;continue;}
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
     if(p.bulge&&q&&(p.x!==q.x||p.y!==q.y)&&(closed||i<v.length-1)){
      const theta=4*Math.atan(p.bulge),dx=q.x-p.x,dy=q.y-p.y,chord=Math.hypot(dx,dy),offset=chord*(1-p.bulge*p.bulge)/(4*p.bulge);
      const cx=(p.x+q.x)/2-dy/chord*offset,cy=(p.y+q.y)/2+dx/chord*offset,r=Math.hypot(p.x-cx,p.y-cy),start=Math.atan2(p.y-cy,p.x-cx),steps=Math.min(80,Math.max(4,Math.ceil(Math.abs(theta)*12)));
      for(let k=1;k<steps;k++)points.push([cx+r*Math.cos(start+theta*k/steps),cy+r*Math.sin(start+theta*k/steps)]);
     }
    }
   }else if(['CIRCLE','ARC'].includes(e.type)){
    closed=e.type==='CIRCLE';const start=closed?0:e.startAngle,end=closed?Math.PI*2:e.endAngle;let sweep=end-start;while(sweep<=0)sweep+=Math.PI*2;
    const n=Math.max(8,Math.ceil(sweep*12));for(let k=0;k<=n;k++){const a=start+sweep*k/n;points.push([e.center.x+e.radius*Math.cos(a),e.center.y+e.radius*Math.sin(a)]);}
   }else if(e.type==='ELLIPSE'&&e.center&&e.majorAxisEndPoint){
    const v=e.majorAxisEndPoint,r=e.axisRatio,from=e.startAngle??0;let span=(e.endAngle??2*Math.PI)-from;if(span<=0)span+=2*Math.PI;closed=Math.abs(span-2*Math.PI)<1e-5;
    const steps=Math.max(8,Math.ceil(Math.abs(span)*12));for(let i=0;i<=steps;i++){const a=from+span*i/steps;points.push([e.center.x+v.x*Math.cos(a)-v.y*r*Math.sin(a),e.center.y+v.y*Math.cos(a)+v.x*r*Math.sin(a)]);}
   }else if(e.type==='SPLINE'&&!e.rational){
    const v=e.controlPoints||[],k=e.knotValues||[],d=e.degreeOfSplineCurve;
    if(!Number.isInteger(d)||d<1||d>8||v.length<=d||k.length!==v.length+d+1||v.length>4000){unsupported++;continue;}
    // Sample each non-empty knot span via de Boor (control polygon is not the curve).
    function at(j,t){const a=v.slice(j-d,j+1).map(p=>[p.x,p.y]);for(let r=1;r<=d;r++)for(let i=d;i>=r;i--){
     const l=j-d+i,den=k[l+d+1-r]-k[l],u=den?(t-k[l])/den:0;a[i]=[(1-u)*a[i-1][0]+u*a[i][0],(1-u)*a[i-1][1]+u*a[i][1]];}return a[d];}
    for(let j=d;j<v.length;j++)if(k[j+1]>k[j]){for(let n=0;n<8;n++)points.push(at(j,k[j]+(k[j+1]-k[j])*n/8));points.push(at(j,k[j+1]));}
    closed=!!(e.closed||e.periodic);
   }else if(e.type==='3DFACE'||e.type==='SOLID'){const v=e.vertices||e.points||[];points=(e.type==='SOLID'&&v.length===4?[v[0],v[1],v[3],v[2]]:v).map(p=>[p.x,p.y]);closed=points.length>=3;}
   else{unsupported++;continue;}
   if(points.length<2)continue;
   points=points.map(transform);if(!points.every(p=>p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))){unsupported++;continue;}
   points=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);if(points.length<2)continue;
   const eps=tolerance/8,near=Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<=eps;
   if(closed||points.length>=4&&near){
    if(near)points[points.length-1]=points[0];else points.push(points[0]);const r=simplify(points,tolerance);add(layer,r.length>=4?r:points,true);
   }else{if(!byLayer.has(layer))byLayer.set(layer,[]);byLayer.get(layer).push(simplify(points,tolerance));}
  }
 }
 walk(doc.entities);
 for(const [layer,paths] of byLayer){const {closed,lines}=assembleContours(paths,tolerance/8);
  for(const ring of closed){const simple=simplify(ring,tolerance);add(layer,simple.length>=4?simple:ring,true);joined++;}
  for(const pts of lines)add(layer,pts,false);
 }
 if(!features.length)throw Error('DXF içinde kullanılabilir plan çizgisi bulunamadı. Model alanında çizgi veya polyline bulunduğunu kontrol edin; blok dış referanslarını Bind ile dosyaya ekleyin. Atlanan: '+(unsupported+ignoredCount));
 const warnings=[built+' bina adayı · '+joined+' birleştirilen dış hat · '+ignoredCount+' ayıklanan öğe · '+unsupported+' desteklenmeyen öğe.'];
 if(!built)warnings.push('Kapalı bina dış hattı bulunamadı. Çizgiler 2B plana aktarılabilir; 3B tahmin için üst görünüşte kapalı bir bina sınırı gerekir.');
 if(open)warnings.push(open+' açık bina çizgisi 2B planda korundu.');
 return validateMap({schemaVersion:1,units:unit,features,source:{format:'dxf',mode:'local-classifier',name,warnings}});
}
