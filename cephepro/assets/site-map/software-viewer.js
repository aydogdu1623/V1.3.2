// Software projection for devices without WebGL. Uses the same measured outline and height bands.
import {footprint,slabProgress} from './footprint.js';
export function softwareViewer(host,feature,units,onPick){
 const ns='http://www.w3.org/2000/svg',el=tag=>document.createElementNS(ns,tag),svg=el('svg'),body=el('g');
 const geom=footprint(feature,units);let angle=-.66,tilt=.52,zoom=1,raf=0,stopped=false;
 svg.setAttribute('viewBox','-120 -90 240 180');svg.setAttribute('role','img');svg.setAttribute('aria-label',feature.name);svg.setAttribute('tabindex','0');svg.style.cssText='display:block;width:100%;height:100%;touch-action:none;background:#eaf1ef;cursor:grab';
 svg.append(body);host.replaceChildren(svg);
 function draw(){
  raf=0;if(stopped)return;const ca=Math.cos(angle),sa=Math.sin(angle),st=Math.sin(tilt),ct=Math.cos(tilt),k=116*zoom/geom.span,faces=[];
  const projected=geom.rings.map(r=>r.map(([x,y])=>[(x*ca-y*sa)*k,(x*sa+y*ca)*k]));
  const project=(p,z)=>[p[0],p[1]*st-(z-geom.height/2)*k*ct];
  const path=(p,z)=>p.map((v,i)=>(i?'L':'M')+project(v,z).map(x=>x.toFixed(2)).join(' ')).join('')+'Z';
  body.replaceChildren();
  for(const slab of geom.slabs){
   const progress=slabProgress(feature,slab.part),color=progress===null?'#b5c6c5':progress===0?'#90a3a5':progress<100?'#e8ae47':slab.color;
   const group=el('g');group.dataset.part=slab.part;
   function paint(d,opacity){const node=el('path');node.setAttribute('d',d);node.setAttribute('fill',color);node.setAttribute('fill-rule','evenodd');node.setAttribute('stroke','#456368');node.setAttribute('stroke-width','.27');node.setAttribute('fill-opacity',progress===0?'.14':String(opacity));group.append(node);}
   // Paint back to front, including courtyard walls; one path per depth bin to bound DOM growth.
   const bins=Array.from({length:24},()=>[]);
   for(const ring of projected)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],depth=(a[1]+b[1])/(k*geom.span*2);
    const idx=Math.min(23,Math.max(0,Math.floor((depth+.72)*16)));const quad=[project(a,slab.base),project(b,slab.base),project(b,slab.top),project(a,slab.top)];
    bins[idx].push(quad.map((v,i)=>(i?'L':'M')+v.map(x=>x.toFixed(2)).join(' ')).join('')+'Z');}
   bins.forEach((b,i)=>{if(b.length)paint(b.join(''),.62+.34*i/23);});paint(projected.map(r=>path(r,slab.top)).join(''),.94);body.append(group);
  }
 }
 function schedule(){if(!stopped&&!raf)raf=requestAnimationFrame(draw);}
 let down=null;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 svg.onpointerdown=e=>{down=[e.clientX,e.clientY,angle,tilt];svg.setPointerCapture(e.pointerId);};
 svg.onpointermove=e=>{if(!down)return;angle=down[2]+(e.clientX-down[0])*.01;tilt=clamp(down[3]+(e.clientY-down[1])*.009,.12,1.4);schedule();};
 svg.onpointerup=e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5){const p=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-part]')?.dataset.part;const id=feature.components.find(c=>c.part===p)?.id;if(id)onPick(id);}down=null;};
 svg.onpointercancel=()=>{down=null;};svg.onwheel=e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.3,4);schedule();};
 svg.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;e.preventDefault();
  if(e.key==='Home'){zoom=1;tilt=.52;angle=-.66;}else if(e.key==='ArrowLeft'||e.key==='ArrowRight')angle+=e.key==='ArrowLeft'?-.15:.15;
  else if(e.key==='ArrowUp'||e.key==='ArrowDown')tilt=clamp(tilt+(e.key==='ArrowUp'?.1:-.1),.12,1.4);else zoom=clamp(zoom*(e.key==='-'?.8:1.25),.3,4);schedule();};
 draw();return {software:true,nodes:[],update(next){feature=next;schedule();},dispose(){stopped=true;cancelAnimationFrame(raf);svg.remove();}};
}
