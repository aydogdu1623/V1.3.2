import * as T from './vendor/three.js';
import {footprint} from './footprint.js';
import {softwareViewer} from './software-viewer.js';
import {status} from './model.js';
export function applyProgress(material,progress,baseColor){
 const s=status(progress);material.wireframe=s==='not_started';material.transparent=s!=='completed';material.opacity=s==='not_started'?.3:s==='in_progress'?.8:1;
 material.color.set(s==='completed'?baseColor:s==='in_progress'?'#e6aa36':'#819496');material.depthWrite=s==='completed';material.needsUpdate=true;
}
export async function createViewer(host,feature,{units='m',loadModel,onPick=()=>{}}={}){
 const scene=new T.Scene();scene.background=new T.Color('#eaf1ef');
 let renderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:false});}catch(e){if(!feature.modelId)return softwareViewer(host,feature,units,onPick);throw e;}
 const camera=new T.PerspectiveCamera(40,1,.05,10000);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;
 host.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','Döndürülebilir üç boyutlu blok');
 const controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=2;
 scene.add(new T.HemisphereLight(0xffffff,0x687a70,2.6));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(15,30,20);scene.add(sun);
 const object=new T.Group();scene.add(object);let stopped=false,ready=false,observer;const meshList=[],materials=new Map();
 function remember(mesh,key){
  mesh.userData.mapNode=key;const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const copies=originals.map(m=>{const copy=m.clone();materials.set(copy,{color:m.color?.clone()||new T.Color('#d5d7ce'),source:m});return copy;});
  mesh.material=Array.isArray(mesh.material)?copies:copies[0];meshList.push(mesh);
 }
 try{
  if(feature.modelId){
   const bytes=await loadModel(feature.modelId);if(stopped)return;
   const gltf=await new T.GLTFLoader().parseAsync(bytes,'');object.add(gltf.scene);
   const visit=(node,path)=>{const key=path+'/'+String(node.name||node.type);if(node.isMesh)remember(node,key);node.children.forEach((c,i)=>visit(c,key+'/'+i));};visit(gltf.scene,'0');
   const box=new T.Box3().setFromObject(object),center=box.getCenter(new T.Vector3());object.position.sub(new T.Vector3(center.x,box.min.y,center.z));
  }else{
   const {rings,slabs}=footprint(feature,units);
   const vectors=r=>r.map(([x,y])=>new T.Vector2(x,y));
   const shape=new T.Shape(vectors(rings[0]));shape.holes=rings.slice(1).map(r=>new T.Path(vectors(r)));
   for(const slab of slabs){
    const geometry=new T.ExtrudeGeometry(shape,{depth:slab.top-slab.base,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
    const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:slab.color,roughness:.8}));mesh.position.y=slab.base;
    mesh.userData.part=slab.part;remember(mesh,'estimate/'+slab.part);object.add(mesh);
   }
  }
  const box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());const span=Math.max(size.x,size.y,size.z,10);
  camera.position.copy(center).add(new T.Vector3(span*1.15,span*.95,span*1.25));controls.target.copy(center);controls.maxDistance=span*10;camera.far=span*50;camera.updateProjectionMatrix();controls.saveState();
  const ground=new T.Mesh(new T.PlaneGeometry(span*4,span*4),new T.MeshStandardMaterial({color:'#d9e3dc',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.08;scene.add(ground);
  const grid=new T.GridHelper(span*3,24,0xb9c9c0,0xd0dcd4);grid.position.y=-.05;scene.add(grid);
  ready=true;
 }catch(e){dispose();throw e;}
 function update(next){
  feature=next;
  for(const mesh of meshList){const matches=feature.components.filter(c=>(mesh.userData.part&&mesh.userData.part===c.part)||c.meshNodes.includes(mesh.userData.mapNode));
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const base=materials.get(material).color;if(!matches.length){material.wireframe=false;material.transparent=true;material.opacity=.18;material.color.set('#829494');material.depthWrite=false;continue;}
    applyProgress(material,Math.min(...matches.map(c=>c.progress)),base);
   }
  }
 }
 const resize=()=>{if(stopped)return;const {width,height}=host.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=Math.max(1,width)/Math.max(1,height);camera.updateProjectionMatrix();};
 observer=new ResizeObserver(resize);observer.observe(host);resize();update(feature);
 let down;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(meshList,false)[0]?.object;if(hit)onPick(feature.components.find(c=>c.part===hit.userData.part)?.id||feature.components.find(c=>c.meshNodes.includes(hit.userData.mapNode))?.id);});
 renderer.setAnimationLoop(()=>{if(!stopped&&ready&&!document.hidden){controls.update();renderer.render(scene,camera);}});
 function dispose(){if(stopped)return;stopped=true;renderer.setAnimationLoop(null);controls.dispose();observer?.disconnect();scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){for(const value of Object.values(m))if(value?.isTexture){value.source?.data?.close?.();value.dispose();}m.dispose();}});for(const {source} of materials.values())source.dispose();renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}
 return {update,dispose,nodes:meshList.map(m=>({key:m.userData.mapNode,name:m.name||m.userData.mapNode})),reset:()=>{controls.reset();},renderer};
}
