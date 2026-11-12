/* Display/report denomination only: never converts stored prices or quantities. */
(function(root){
 'use strict';
 const key='cephepro_currency',symbols={TRY:'₺',USD:'$',EUR:'€'};
 let current='TRY';try{const saved=localStorage.getItem(key);if(symbols[saved])current=saved;}catch{}
 const code=()=>current,label=()=>current==='TRY'?'TL':current;
 function text(value){
  if(typeof value!=='string')return value;
  return value.replace(/₺/g,()=>symbols[current]).replace(/(?<![\p{L}\p{N}_])(?:TL|TRY)(?![\p{L}\p{N}_])/gu,()=>label());
 }
 function format(value){
  return value.replace(/\[\$(?:₺|TL|TRY)(?:-[^\]]*)?\]/g,()=> '"'+symbols[current]+'"').replace(/"([^"]*)"/g,(_,s)=>'"'+text(s)+'"').replace(/₺/g,()=>symbols[current]);
 }
 function mount(){
  const language=document.getElementById('cpLanguageSelect');if(!language)return;
  let box=document.getElementById('cpCurrencySettings');
  if(!box){box=document.createElement('span');box.id='cpCurrencySettings';box.className='cp-currency-settings';box.innerHTML='<label for="cpCurrencySelect">Para birimi</label><select id="cpCurrencySelect" translate="no"><option value="TRY">TL (₺)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select>';language.after(box);box.querySelector('select').onchange=e=>set(e.target.value);}
  box.querySelector('select').value=current;
 }
 function set(value){
  if(!Object.hasOwn(symbols,value))return false;
  current=value;try{localStorage.setItem(key,value);}catch{}
  mount();root.CepheProI18n?.refresh();
  document.dispatchEvent(new CustomEvent('cephepro:currency-changed',{detail:{currency:current}}));return true;
 }
 root.CepheProCurrency={code,label,text,format,set,mount};
 root.addEventListener('storage',e=>{if(e.key===key)set(e.newValue||'TRY');});
})(window);
