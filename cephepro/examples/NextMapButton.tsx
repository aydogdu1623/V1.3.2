'use client';
import {useRef} from 'react';
// Copy assets/site-map into public/assets/site-map; include its CSS in your layout.
// Provide the same authenticated /api/site-map contract and CepheProProjects adapter.
// demo=true runs without the existing CephePro session adapter.
export default function MapButton({demo=true}:{demo?:boolean}){
 const loading=useRef(false);
 async function open(){
  if(loading.current)return;loading.current=true;
  try{
   // Native ESM import: keep the public module outside Next's bundle.
   // @ts-expect-error Static public module is loaded by the browser.
   const module=await import(/* webpackIgnore: true */ '/assets/site-map/app.js');
   await module.openSiteMap({demo});
  }finally{loading.current=false;}
 }
 return <button type="button" onClick={open} aria-label="Saha haritasını aç">⌖ Harita</button>;
}
