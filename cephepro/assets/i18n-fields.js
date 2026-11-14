/* Translate the visible field surface without ever changing its value or form data. */
(function(root){
 'use strict';
 const I=root.CepheProI18n,selector='.v34WiName,#cl-extra-desc,#cl-deduction-desc,#cl-extra-unit,[data-holiday-name],[data-cp-translate-value],textarea:not([autocomplete]):not([data-cp-no-translate])';
 const fields=new Map();let scheduled=false;
 const maskProperties=['color','-webkit-text-fill-color','text-shadow'];
 function mask(input,state,visible){
  if(visible&&!state.maskStyle){
   state.textColor=getComputedStyle(input).color;
   state.maskStyle=maskProperties.map(key=>[key,input.style.getPropertyValue(key),input.style.getPropertyPriority(key)]);
  }
  // Inline !important wins over legacy modal/theme selectors with ID specificity.
  // Restore the exact original styles when editing or returning to Turkish.
  if(visible){for(const key of maskProperties)input.style.setProperty(key,key==='text-shadow'?'none':'transparent','important');}
  else if(state.maskStyle){for(const [key,value,priority] of state.maskStyle){if(value)input.style.setProperty(key,value,priority);else input.style.removeProperty(key);}state.maskStyle=null;}
  input.classList.toggle('cp-i18n-masked',visible);
 }

 function place(input,state){
  const visible=I.language()!=='tr'&&document.activeElement!==input&&!!input.value&&I.t(input.value)!==input.value;
  mask(input,state,visible);state.overlay.hidden=!visible;
  if(!visible)return;
  const style=getComputedStyle(input),box=input.getBoundingClientRect(),parent=state.overlay.offsetParent||input.parentElement,p=parent.getBoundingClientRect();
  Object.assign(state.overlay.style,{left:(box.left-p.left+parent.scrollLeft-parent.clientLeft)+'px',top:(box.top-p.top+parent.scrollTop-parent.clientTop)+'px',width:box.width+'px',height:box.height+'px',padding:style.padding,borderWidth:style.borderWidth,font:style.font,textAlign:style.textAlign,lineHeight:input.tagName==='TEXTAREA'?style.lineHeight:Math.max(0,box.height-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-(parseFloat(style.borderTopWidth)||0)-(parseFloat(style.borderBottomWidth)||0))+'px',letterSpacing:style.letterSpacing,whiteSpace:input.tagName==='TEXTAREA'?'pre-wrap':'nowrap'});
  state.overlay.style.setProperty('color',state.textColor,'important');
  state.overlay.style.setProperty('-webkit-text-fill-color',state.textColor,'important');
  state.overlay.style.setProperty('text-shadow','none','important');
  state.overlay.textContent=I.t(input.value);state.overlay.lang=I.language();
 }
 function update(){scheduled=false;for(const [input,state] of fields){if(!input.isConnected){state.overlay.remove();state.observer?.disconnect();fields.delete(input);continue;}place(input,state);}}
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(update);}
 function renderValue(input){
  if(!input.matches?.(selector)||input.closest('[translate="no"],[data-cp-no-translate]')||['password','hidden','email','tel','number'].includes(input.type))return;
  let state=fields.get(input);
  if(!state){
   const parent=input.parentElement;if(!parent)return;
   if(getComputedStyle(parent).position==='static')parent.style.position='relative';
   const overlay=document.createElement('span');overlay.className='cp-i18n-value';overlay.setAttribute('aria-hidden','true');overlay.hidden=true;parent.appendChild(overlay);
   state={overlay};fields.set(input,state);
   if(root.ResizeObserver){state.observer=new ResizeObserver(schedule);state.observer.observe(input);state.observer.observe(parent);}
   for(const event of ['input','change','focus','blur'])input.addEventListener(event,()=>{I.enqueue(input.value);place(input,state);});
  }
  I.enqueue(input.value);place(input,state);
 }
 I.renderValue=renderValue;I.refreshValues=update;
 document.addEventListener('cephepro:language-changed',()=>{for(const input of fields.keys())renderValue(input);schedule();});
 document.addEventListener('cephepro:locked',()=>{for(const [input,state]of fields){mask(input,state,false);state.overlay.remove();state.observer?.disconnect();}fields.clear();});
 root.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
 I.scan(document.body);
})(window);
