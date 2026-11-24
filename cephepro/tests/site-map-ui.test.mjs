import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import fs from 'node:fs';
import {applyProgress} from '../assets/site-map/viewer.js';import {MeshStandardMaterial} from '../assets/site-map/vendor/three.js';
test('Three.js materials distinguish not-started, partial and completed work',()=>{
 const m=new MeshStandardMaterial();applyProgress(m,0,'#559977');assert.equal(m.wireframe,true);assert.equal(m.opacity,.3);assert.equal(m.depthWrite,false);
 applyProgress(m,47,'#559977');assert.equal(m.wireframe,false);assert.equal(m.color.getHexString(),'e6aa36');assert.equal(m.opacity,.8);
 applyProgress(m,100,'#559977');assert.equal(m.transparent,false);assert.equal(m.opacity,1);assert.equal(m.depthWrite,true);assert.equal(m.color.getHexString(),'559977');m.dispose();
});
test('actual demo UI selects blocks, filters, updates work progress, closes cleanly and supports six languages',async()=>{
 const dom=new JSDOM('<!doctype html><html lang="tr"><body><button id="before">before</button></body></html>',{url:'https://map.test'}),w=dom.window;
 const keys=['window','document','localStorage','DOMPoint','Worker'];const before=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:w,document:w.document,localStorage:w.localStorage});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const {openSiteMap}=await import('../assets/site-map/app.js');const {t}=await import('../assets/site-map/i18n.js');
 try{
  const app=await openSiteMap({demo:true});assert.equal(w.document.querySelectorAll('[role=button][data-id]').length,6);
  assert.equal(w.document.querySelector('.sm-card h2').textContent,'Villa 412');
  const field=w.document.querySelector('[data-component="part-0"] .sm-number');field.value='47';field.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,5));
  assert.equal(app.getSnapshot().map.features.find(f=>f.id==='villa-412').components[0].progress,47);
  const search=w.document.getElementById('smSearch');search.value='413';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('[role=button][data-id]').length,1);
  w.document.querySelector('[data-id="villa-413"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(r=>setTimeout(r,5));assert.equal(w.document.querySelector('.sm-card h2').textContent,'Villa 413');
  const localized=[];for(const lang of ['tr','en','de','fr','ru','ar']){w.document.documentElement.lang=lang;localized.push(t('view3d'));}assert.equal(new Set(localized).size,6);
  app.close();assert.equal(w.document.getElementById('cpSiteMap'),null);
 }finally{for(const k of keys)if(before[k]===undefined)delete globalThis[k];else globalThis[k]=before[k];w.close();}
});
test('map launcher appears immediately to the left of Project Information without duplicating on rerender',async()=>{
 const dom=new JSDOM('<body><header><button id="settingsBtn">Settings</button></header><aside><button id="v34ProjectInfoBtn">Project Information</button></aside></body>',{url:'https://map.test',runScripts:'outside-only'}),w=dom.window;
 try{w.eval(fs.readFileSync(new URL('../assets/site-map/bootstrap.js',import.meta.url),'utf8'));await new Promise(r=>setTimeout(r,10));
  const info=w.document.getElementById('v34ProjectInfoBtn');assert.equal(info.previousElementSibling.id,'cpMapByInfo');assert.equal(w.document.querySelectorAll('#cpMapHeader').length,1);
  info.parentElement.parentElement.innerHTML='<button id="v34ProjectInfoBtn">Project Information</button>';await new Promise(r=>setTimeout(r,10));assert.equal(w.document.getElementById('v34ProjectInfoBtn').previousElementSibling.id,'cpMapByInfo');assert.equal(w.document.querySelectorAll('#cpMapByInfo').length,1);
 }finally{w.close();}
});
