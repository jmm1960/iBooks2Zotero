'use strict';
const api=window.arguments[0];
const tr=BooksI18n.create(api.locale);
const t=tr.t;
const $=id=>document.getElementById(id);
let source=null,prepared=null,matchedID=null,busy=false,drawToken=0,totalPages=null;
function target(){return Number($('target').value);}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function settings(){return {vertical:Number($('vertical').value),horizontal:Number($('horizontal').value),order:$('order').value};}
function selectedRange(){return api.range({start:Number($('start').value),end:Number($('end').value)},totalPages);}
function selectedSource(){const r=selectedRange();return {...source,pages:source.pages.filter(p=>p.pageIndex>=r.start-1&&p.pageIndex<=r.end-1)};}
function updateExisting(){
 const total=api.count(target());let count=0,valid=false;
 try{count=api.count(target(),selectedRange());valid=true;}catch{}
 $('existing').textContent=valid?t('existingRange',{count,total}):t('existingTotal',{total});
 $('clear').disabled=busy||!valid||!count;
}
async function loadTargetRange(){totalPages=null;const total=await api.pageCount(target());totalPages=total;$('start').value='1';$('end').value=String(total);for(const id of ['start','end'])$(id).max=String(total);$('total').textContent=t('pageTotal',{total});updateExisting();}
async function checkSelection(){matchedID=null;selectedRange();recalculate();if(!source)return;if(!prepared)throw Error(t('error.settings'));await api.validate(target(),selectedSource());matchedID=target();availability();}
function availability(){BooksSelects.sync();for(const id of ['import','replace'])$(id).disabled=busy||!prepared?.count||matchedID!==target();for(const id of ['start','end'])$(id).disabled=busy||!totalPages;$('export').disabled=busy||!source?.pages.length;updateExisting();BooksSelects.sync();}
async function run(task){if(busy)return;busy=true;for(const e of document.querySelectorAll('button,select,input'))if(e.id!=='close')e.disabled=true;try{await task();}catch(e){status(tr.error(e),true);}finally{busy=false;for(const e of document.querySelectorAll('button,select,input'))e.disabled=false;$('page').disabled=!prepared?.pages.length;availability();}}
function recalculate(){
 try{
  const range=selectedRange();
  const next=BooksCore.prepare(source?selectedSource():{pages:[]},settings());
  for(const [key,value] of Object.entries(next.settings))api.setPref(key,String(value));
  if(!source){availability();return;}
  prepared=next;
  const selected=$('page').value;$('page').replaceChildren();
  for(const entry of prepared.pages){const option=document.createElement('option');option.value=entry.page.pageIndex;option.textContent=t('pageOption',{page:entry.page.pageIndex+1,count:entry.annotations.length});$('page').appendChild(option);}
  if(prepared.pages.some(p=>String(p.page.pageIndex)===selected))$('page').value=selected;
  $('summary').textContent=t('summary',{...range,pages:prepared.pages.length,strokes:prepared.strokes,count:prepared.count});
  if(prepared.pages.length)draw();else{drawToken++;$('canvas').hidden=true;$('empty').hidden=false;$('empty').textContent=t('emptyRange');}
  availability();
 }catch(e){prepared=null;status(tr.error(e),true);availability();}
}
async function draw(){
 const token=++drawToken,entry=prepared?.pages.find(p=>p.page.pageIndex===Number($('page').value));if(!entry)return;
 const c=$('canvas');c.hidden=false;$('empty').hidden=true;c.width=700;c.height=Math.round(700*entry.page.bounds[1]/entry.page.bounds[0]);
 const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
 if(entry.page.background){const image=new Image();image.src=entry.page.background;await image.decode();if(token!==drawToken)return;ctx.drawImage(image,0,0,c.width,c.height);}
 const sx=c.width/entry.page.bounds[0],sy=c.height/entry.page.bounds[1];
 const x=v=>v*sx,y=v=>c.height-v*sy;
 let i=0;
 for(const a of entry.annotations){let xs=[],ys=[];ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.lineWidth=(a.position.width||1)*sx;ctx.lineCap='round';ctx.lineJoin='round';
  if(a.position.paths){for(const path of a.position.paths){ctx.beginPath();for(let j=0;j<path.length;j+=2){const xx=x(path[j]),yy=y(path[j+1]);xs.push(xx);ys.push(yy);if(j)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);}if(path.length===2){ctx.arc(x(path[0]),y(path[1]),ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}}
  else{ctx.globalAlpha=.3;for(const r of a.position.rects){const xx=x(r[0]),yy=y(r[3]),w=x(r[2]-r[0]),h=(r[3]-r[1])*sy;ctx.fillRect(xx,yy,w,h);xs.push(xx,xx+w);ys.push(yy,yy+h);}ctx.globalAlpha=1;}
  if($('boxes').checked&&xs.length){const colors=['#c04b36','#286dc0','#18906e','#9863bb'];ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=1.2;ctx.setLineDash([5,3]);const xx=Math.min(...xs)-4,yy=Math.min(...ys)-4;ctx.strokeRect(xx,yy,Math.max(...xs)-xx+4,Math.max(...ys)-yy+4);ctx.setLineDash([]);ctx.font='12px sans-serif';ctx.fillStyle=ctx.strokeStyle;ctx.fillText(String(i+1),Math.max(1,xx),Math.max(12,yy-3));}i++;
 }
}
window.addEventListener('DOMContentLoaded',()=>{
 tr.apply(document);window.BooksTranslate=t;
 for(const t of api.targets){const option=document.createElement('option');option.value=t.id;option.textContent=t.title;$('target').appendChild(option);}
 if(api.targets.length===1){$('target').hidden=true;$('target-static').hidden=false;$('target-static').textContent=api.targets[0].title;$('target-static').title=api.targets[0].title;}
 for(const [key,value]of Object.entries({vertical:'3.7',horizontal:'8',order:'vertical-horizontal'}))$(key).value=api.getPref(key,value);
 run(async()=>{await loadTargetRange();status(t('chooseHint'));});
 $('parse').onclick=()=>run(async()=>{
  const path=await api.pick(window);if(!path)return;status(t('parsing'));source=null;prepared=null;matchedID=null;availability();
  const parsed=JSON.parse(JSON.stringify(await api.parse(path)));if(!parsed.pages.length)throw Error(t('error.noAnnotations'));source=parsed;source.sourceName=path.split('/').pop();$('source').textContent=source.sourceName;$('source').title=source.sourceName;$('parse').textContent=t('changeSource');
  recalculate();if(!prepared)throw Error(t('error.grouping'));status(t('checking'));
  await api.validate(target(),selectedSource());matchedID=target();status(source.warnings.length?t('matchedWarnings',{warnings:source.warnings.join('; ')}):t('matched'));
 });
 $('target').onchange=()=>run(async()=>{matchedID=null;await loadTargetRange();await checkSelection();status(source?t('targetMatched'):t('targetChanged'));});
 for(const id of ['start','end'])$(id).addEventListener('change',()=>run(async()=>{await checkSelection();status(t('rangeChanged'));}));
 for(const id of ['vertical','horizontal','order'])$(id).addEventListener('change',()=>{recalculate();if(prepared)status(t('groupsChanged'));});
 $('defaults').onclick=()=>{$('vertical').value='3.7';$('horizontal').value='8';$('order').value='vertical-horizontal';recalculate();status(t('defaultsRestored'));};
 $('page').onchange=draw;$('boxes').onchange=draw;$('zoom').onchange=()=>{$('canvas-wrap').dataset.zoom=$('zoom').value;};
 for(const [id,replace]of [['import',false],['replace',true]])$(id).onclick=()=>run(async()=>{
  if(!source||!prepared||matchedID!==target())throw Error(t('error.checkFirst'));status(t('importing'));
  const n=await api.import(window,target(),source,prepared,replace,selectedRange());if(n===null){status(t('cancelled'));return;}
  status(t(replace?'importedReplace':'importedAppend',{count:n,extra:n!==prepared.count?t('oversize'):''}));updateExisting();
 });
 $('clear').onclick=()=>run(async()=>{const n=await api.clear(window,target(),selectedRange());status(n===null?t('cancelled'):t('cleared',{...selectedRange(),count:n}));});
 $('export').onclick=()=>run(async()=>{if(await api.export(window,source))status(t('exported'));});
 $('close').onclick=()=>window.close();BooksSelects.init();availability();
});
