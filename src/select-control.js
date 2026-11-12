/* Keep data in <select>, but never open a platform/native popup. */
window.BooksSelects = (() => {
 const controls=[];let active=null;
 function close(restore=false){if(!active)return;const c=active;active=null;c.menu.hidden=true;c.button.setAttribute('aria-expanded','false');if(restore)c.button.focus();}
 function mount(select){
  const host=document.createElement('span');host.className='choice-host';host.dataset.control=select.id;
  select.before(host);host.append(select);select.classList.add('choice-data');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.type='button';button.className='choice-button';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='choice-menu';menu.id=select.id+'-choices';menu.role='listbox';menu.hidden=true;button.setAttribute('aria-controls',menu.id);
  host.append(button);document.body.append(menu);let index=0;
  const c={select,host,button,menu,sync,open};controls.push(c);
  function sync(){host.hidden=select.hidden;button.disabled=select.disabled;button.textContent=select.selectedOptions[0]?.textContent||window.BooksTranslate('choosePage');button.setAttribute('aria-label',(select.getAttribute('aria-label')||window.BooksTranslate('choose'))+': '+button.textContent);if(select.disabled||select.hidden)if(active===c)close();}
  function position(){const r=button.getBoundingClientRect();menu.style.width=Math.min(Math.max(r.width,180),window.innerWidth-16)+'px';menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.maxHeight=Math.max(80,Math.min(320,window.innerHeight-r.bottom-16))+'px';menu.style.top=(r.bottom+4)+'px';}
  function highlight(){Array.from(menu.children).forEach((row,i)=>row.classList.toggle('focused',i===index));menu.children[index]?.scrollIntoView({block:'nearest'});}
  function choose(i){if(!select.options[i]||select.options[i].disabled)return;select.selectedIndex=i;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true);}
  function open(){if(button.disabled)return;if(active===c){close();return;}close();menu.replaceChildren();index=Math.max(0,select.selectedIndex);
   Array.from(select.options).forEach((option,i)=>{const row=document.createElement('button');row.type='button';row.role='option';row.tabIndex=-1;row.textContent=option.textContent;row.disabled=option.disabled;row.setAttribute('aria-selected',String(i===select.selectedIndex));row.addEventListener('click',()=>choose(i));menu.append(row);});
   if(!menu.children.length)return;active=c;menu.hidden=false;button.setAttribute('aria-expanded','true');position();highlight();
  }
  button.addEventListener('click',open);
  button.addEventListener('keydown',e=>{if(e.key==='Escape'){close(true);return;}if(e.key==='Tab'){close();return;}if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)){e.preventDefault();if(active!==c){open();return;}if(e.key==='Enter'||e.key===' '){choose(index);return;}index=e.key==='Home'?0:e.key==='End'?select.options.length-1:Math.max(0,Math.min(select.options.length-1,index+(e.key==='ArrowDown'?1:-1)));highlight();}});
  select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{attributes:true,childList:true,subtree:true,characterData:true});sync();return c;
 }
 document.addEventListener('pointerdown',e=>{if(active&&!active.host.contains(e.target)&&!active.menu.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close(true);});window.addEventListener('resize',()=>close());
 return {init:()=>document.querySelectorAll('select').forEach(mount),sync:()=>controls.forEach(c=>c.sync()),close};
})();
