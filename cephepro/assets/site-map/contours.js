// Reconstruct unambiguous cycles only. Open or branched chains remain visible as linework.
export function assembleContours(paths,tol){
 const cells=new Map(),vertices=[],edges=[],seen=new Set(),closed=[],lines=[];
 function vertex(p){const gx=Math.floor(p[0]/tol),gy=Math.floor(p[1]/tol);
  for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++)for(const n of cells.get(x+','+y)||[])
   if(Math.hypot(vertices[n].p[0]-p[0],vertices[n].p[1]-p[1])<=tol)return n;
  const id=vertices.length;vertices.push({p,edges:[]});const k=gx+','+gy;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);return id;}
 for(const pts of paths){const a=vertex(pts[0]),b=vertex(pts.at(-1));
  if(a===b){if(pts.length>=4)closed.push([...pts.slice(0,-1),pts[0]]);continue;}
  if(pts.length===2){const key=Math.min(a,b)+':'+Math.max(a,b);if(seen.has(key))continue;seen.add(key);}
  const e=edges.length;edges.push({a,b,pts});vertices[a].edges.push(e);vertices[b].edges.push(e);}
 const visited=new Set();
 for(let i=0;i<edges.length;i++){if(visited.has(i))continue;const group=[],stack=[i],nodes=new Set();visited.add(i);
  while(stack.length){const j=stack.pop(),e=edges[j];group.push(j);for(const n of [e.a,e.b])if(!nodes.has(n)){nodes.add(n);for(const k of vertices[n].edges)if(!visited.has(k)){visited.add(k);stack.push(k);}}}
  if([...nodes].some(n=>vertices[n].edges.length!==2)){for(const j of group)lines.push(edges[j].pts);continue;}
  let j=i,n=edges[i].a;const ring=[];
  for(let s=0;s<group.length;s++){const e=edges[j],forward=e.a===n,p=forward?e.pts:[...e.pts].reverse();for(let t=0;t<p.length-1;t++)ring.push(p[t]);n=forward?e.b:e.a;j=vertices[n].edges.find(k=>k!==j);}
  if(ring.length>=3){ring.push(ring[0]);closed.push(ring);}else for(const k of group)lines.push(edges[k].pts);
 }return {closed,lines};
}
export function area2(ring){const [cx,cy]=ring[0];let a=0;for(let i=1;i<ring.length;i++)a+=(ring[i-1][0]-cx)*(ring[i][1]-cy)-(ring[i][0]-cx)*(ring[i-1][1]-cy);return a;}

export function simpleOutline(pts){
 if(pts.length<3||pts.length>128||new Set(pts.map(p=>p.join(','))).size!==pts.length)return false;
 const n=pts.length,cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a,b,p)=>cross(a,b,p)===0&&p.every((x,k)=>x>=Math.min(a[k],b[k])&&x<=Math.max(a[k],b[k]));
 if(!area2([...pts,pts[0]]))return false;
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;
  const c=pts[j],d=pts[(j+1)%n];if(on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)||cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return false;
 }}return true;
}
