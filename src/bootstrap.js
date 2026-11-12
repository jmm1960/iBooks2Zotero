var chromeHandle, pluginRoot;
var menus = new Set(), dialogs = new Set();
const PREFIX='extensions.appleBooksNotes.';
function language(){return BooksI18n.create(Zotero.locale,Services.locale.appLocaleAsBCP47,Services.locale.systemLocale,Zotero.getMainWindow()?.navigator.language);}
function t(key,params){return language().t(key,params);}
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  pluginRoot=rootURI;
  Services.scriptloader.loadSubScript(rootURI+'i18n.js',globalThis);
  chromeHandle=Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI(rootURI+'manifest.json'),[['content','books-notes','']]);
  for(const win of Zotero.getMainWindows())onMainWindowLoad({window:win});
}
function shutdown() {
  for(const menu of menus)menu.remove();menus.clear();
  for(const win of dialogs)if(!win.closed)win.close();dialogs.clear();
  chromeHandle?.destruct();chromeHandle=null;
}
function onMainWindowLoad({window:win}) {
  for(const id of ['menu_ToolsPopup','zotero-itemmenu']) {
    const parent=win.document.getElementById(id);if(!parent)continue;
    const menu=win.document.createXULElement('menuitem');menu.id='books-notes-'+id;menu.setAttribute('label',t('menu'));
    menu.addEventListener('command',()=>openNotes(win).catch(e=>Services.prompt.alert(win,'iBooks2Zotero',e.message)));parent.appendChild(menu);menus.add(menu);
  }
}
function onMainWindowUnload({window:win}) {for(const menu of menus)if(menu.ownerDocument===win.document)menus.delete(menu);}
function candidates(win) {
  const current=Zotero.Reader._readers.find(r=>r.tabID===win.Zotero_Tabs?.selectedID);
  if(current){
    const attachment=Zotero.Items.get(current.itemID);
    const parent=attachment?.parentID&&Zotero.Items.get(attachment.parentID);
    const siblings=parent?.getAttachments?.().map(id=>Zotero.Items.get(id)).filter(x=>x?.isAttachment()&&x.attachmentContentType==='application/pdf')||[];
    return [attachment,...siblings.filter(x=>x.id!==attachment.id)];
  }
  const found=[];
  for(const item of win.ZoteroPane.getSelectedItems()) {
    const children=item.isRegularItem()?item.getAttachments().map(id=>Zotero.Items.get(id)):[item];
    for(const child of children)if(child.isAttachment()&&child.attachmentContentType==='application/pdf'&&!found.some(x=>x.id===child.id))found.push(child);
  }
  return found;
}
async function helper(mode,path,indices) {
  if(!Zotero.isMac)throw Error(t('error.macOnly'));
  const cache=PathUtils.join(Zotero.Profile.dir,'apple-books-notes');await IOUtils.makeDirectory(cache,{ignoreExisting:true});
  const executable=PathUtils.join(cache,'books-parser-0.1.0');
  const buffer=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET',pluginRoot+'native/books-parser');xhr.responseType='arraybuffer';xhr.onload=()=>resolve(xhr.response);xhr.onerror=()=>reject(Error(t('error.parserRead')));xhr.send();});
  await IOUtils.write(executable,new Uint8Array(buffer));await IOUtils.setPermissions(executable,0o700);
  const temp=PathUtils.join(Zotero.getTempDirectory().path,'books-notes-'+Zotero.Utilities.randomString(10));await IOUtils.makeDirectory(temp);
  const output=PathUtils.join(temp,'result.json');
  try {
    try{await Zotero.Utilities.Internal.exec(executable,[mode,path,output,...(indices?[indices.join(',')]:[])]);}catch(e){if(await IOUtils.exists(output)){const data=JSON.parse(await IOUtils.readUTF8(output));if(data.error)throw Error(data.errorCode?t('parser.'+data.errorCode):data.error);}throw e;}
    const data=JSON.parse(await IOUtils.readUTF8(output));if(data.error)throw Error(data.errorCode?t('parser.'+data.errorCode):data.error);
    if(data.warnings)data.warnings=data.warnings.map(w=>typeof w==='string'?w:t(w.code,w));return data;
  }finally{await IOUtils.remove(temp,{recursive:true,ignoreAbsent:true});}
}
async function pick(win,save=false,json=false) {
  const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
  const fp=new FilePicker();fp.init(win,save?t('export'):t('pickSource'),save?fp.modeSave:fp.modeOpen);
  fp.appendFilter(json?t('bundle'):'PDF',json?'*.json':'*.pdf');
  if(save){fp.defaultString='apple-books-notes.json';fp.defaultExtension='json';}
  if(await fp.show()===fp.returnCancel)return null;return fp.file;
}
function checkedRange(range,total) {
  const start=range?.start??1,end=range?.end??total;
  if(!Number.isInteger(total)||total<1||!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>total)throw Error(t('error.range',{total}));
  return {start,end};
}
function inRange(pageIndex,range) {return Number.isInteger(pageIndex)&&pageIndex>=range.start-1&&pageIndex<=range.end-1;}
function rangeAnnotations(target,range) {
  return target.getAnnotations().filter(a=>inRange(JSON.parse(a.annotationPosition).pageIndex,range));
}
async function targetPageCount(id) {
  const target=Zotero.Items.get(id);if(!target||!target.isAttachment()||target.attachmentContentType!=='application/pdf')throw Error(t('error.target'));
  const path=await target.getFilePathAsync();if(!path)throw Error(t('error.download'));
  return (await helper('inspect',path,[])).pageCount;
}
async function validateTarget(id,source) {
  const target=Zotero.Items.get(id);
  if(!target||!target.isAttachment()||target.attachmentContentType!=='application/pdf')throw Error(t('error.target'));
  if(!Zotero.Libraries.get(target.libraryID).editable)throw Error(t('error.editable'));
  const path=await target.getFilePathAsync();if(!path)throw Error(t('error.download'));
  const check=await helper('inspect',path,source.pages.map(p=>p.pageIndex));
  if(check.pageCount!==source.pageCount)throw Error(t('error.pageCount',{source:source.pageCount,target:check.pageCount}));
  for(const page of source.pages){const p=check.pages.find(p=>p.pageIndex===page.pageIndex);if(!p||!p.fingerprint||p.fingerprint!==page.fingerprint||p.rotation!==page.rotation||p.bounds.some((n,i)=>Math.abs(n-page.bounds[i])>0.01))throw Error(t('error.pageMatch',{page:page.pageIndex+1}));}
  return target;
}
async function syncReader(target) {
  const reader=Zotero.Reader._readers.find(r=>r.itemID===target.id);if(!reader)return;
  const current=target.getAnnotations(),keys=new Set(current.map(a=>a.key));
  const displayed=JSON.parse(JSON.stringify(reader._internalReader._annotationManager._annotations));
  const stale=displayed.filter(a=>!a.isExternal&&!keys.has(a.id)).map(a=>a.id);
  if(stale.length)await reader.unsetAnnotations(stale);
  reader.annotationItemIDs=current.map(a=>a.id);
  await reader.setAnnotations(current);
}
async function saveNative(target,json) {
  Zotero.DB.requireTransaction();
  const item=new Zotero.Item('annotation');item.libraryID=target.libraryID;item.key=json.key;await item.loadPrimaryData();item.parentID=target.id;
  item.annotationType=json.type;item.annotationAuthorName=json.authorName||'';item.annotationIsExternal=false;
  if(['highlight','underline'].includes(json.type))item.annotationText=json.text||'';
  item.annotationComment=json.comment||'';item.annotationColor=json.color;item.annotationPageLabel=json.pageLabel;item.annotationSortIndex=json.sortIndex;
  item.annotationPosition=JSON.stringify(json.position);item.setTags((json.tags||[]).map(t=>({tag:t.name})));
  await item.save({skipSelect:true});return item;
}
async function importNotes(win,id,source,prepared,replace,range) {
  range=checkedRange(range,source.pageCount);
  const selected={...source,pages:source.pages.filter(p=>inRange(p.pageIndex,range))};
  const target=await validateTarget(id,selected);
  if(source.warnings.length&&replace&&!Services.prompt.confirm(win,t('confirm.warningTitle'),t('confirm.warning')))return null;
  const old=rangeAnnotations(target,range);
  if(replace&&old.length&&!Services.prompt.confirm(win,t('replace'),t('confirm.replace',{...range,count:old.length})))return null;
  const ready=[];
  for(const entry of prepared.pages.filter(p=>inRange(p.page.pageIndex,range)))for(const a of entry.annotations){
    if(!inRange(a.position.pageIndex,range))throw Error(t('error.outOfRange'));
    const obj={...a,key:Zotero.DataObjectUtilities.generateKey()};
    ready.push(...(JSON.stringify(obj.position).length>Zotero.Annotations.ANNOTATION_POSITION_MAX_SIZE?Zotero.Annotations.splitAnnotationJSON(obj):[obj]));
  }
  if(!ready.length)throw Error(t('error.noReady'));
  // All mutations share a DB transaction: failures roll back the clear and import.
  await Zotero.DB.executeTransaction(async()=>{
    if(replace)for(const a of old)await a.erase();
    for(const a of ready)await saveNative(target,a);
  });
  await syncReader(target);return ready.length;
}
async function clearNotes(win,id,range) {
  range=checkedRange(range,await targetPageCount(id));
  const target=Zotero.Items.get(id);if(!target||!target.isAttachment())throw Error(t('error.selectTarget'));
  if(!Zotero.Libraries.get(target.libraryID).editable)throw Error(t('error.editable'));
  const anns=rangeAnnotations(target,range);if(!anns.length)return 0;
  if(!Services.prompt.confirm(win,t('clear'),t('confirm.clear',{...range,count:anns.length})))return null;
  await Zotero.DB.executeTransaction(async()=>{for(const a of anns)await a.erase();});await syncReader(target);return anns.length;
}
async function openNotes(win) {
  const targets=candidates(win);if(!targets.length)throw Error(t('error.openFirst'));
  const args={locale:language().locale,targets:targets.map(a=>({id:a.id,title:(a.parentID?Zotero.Items.get(a.parentID).getField('title')+' — ':'')+a.getField('title')})),
    getPref:(key,fallback)=>Zotero.Prefs.get(PREFIX+key,true)??fallback,setPref:(key,value)=>Zotero.Prefs.set(PREFIX+key,value,true),
    range:checkedRange,pageCount:targetPageCount,
    pick:(w)=>pick(w),parse:path=>helper('extract',path),validate:validateTarget,import:importNotes,clear:clearNotes,
    export:async(w,data)=>{const path=await pick(w,true,true);if(path){const standalone={...data,pages:data.pages.map(({background,...page})=>page)};await IOUtils.writeUTF8(path,JSON.stringify(standalone));}return path;},
    count:(id,range)=>range?rangeAnnotations(Zotero.Items.get(id),range).length:Zotero.Items.get(id).getAnnotations().length,
    show:async(id,page)=>{const reader=await Zotero.Reader.open(id);reader.navigate({pageIndex:page});}
  };
  const dialog=win.openDialog('chrome://books-notes/content/dialog.xhtml','','chrome,centerscreen,resizable,width=1120,height=820',args);dialogs.add(dialog);dialog.addEventListener('unload',()=>dialogs.delete(dialog));
}
