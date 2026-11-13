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
  Services.scriptloader.loadSubScript(rootURI+'vendor/pdf-lib.min.js',globalThis);
  Services.scriptloader.loadSubScript(rootURI+'archive.js',globalThis);
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
  const buffer=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET',pluginRoot+'native/books-parser');xhr.responseType='arraybuffer';xhr.onload=()=>resolve(xhr.response);xhr.onerror=()=>reject(Error(t('error.parserRead')));xhr.send();});
  // Immutable content-addressed helpers avoid stale macOS code-signature caches.
  const digest=await Zotero.getMainWindow().crypto.subtle.digest('SHA-256',buffer);
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const executable=PathUtils.join(cache,'books-parser-'+hash);
  if(!await IOUtils.exists(executable)){await IOUtils.write(executable,new Uint8Array(buffer));await IOUtils.setPermissions(executable,0o700);}
  const temp=PathUtils.join(Zotero.getTempDirectory().path,'books-notes-'+Zotero.Utilities.randomString(10));await IOUtils.makeDirectory(temp);
  const output=PathUtils.join(temp,'result.json');
  try {
    try{await Zotero.Utilities.Internal.exec(executable,[mode,path,output,...(indices?[Array.isArray(indices)?indices.join(','):indices]:[])]);}catch(e){if(await IOUtils.exists(output)){const data=JSON.parse(await IOUtils.readUTF8(output));if(data.error)throw Error(data.errorCode?t('parser.'+data.errorCode):data.error);}throw e;}
    const data=JSON.parse(await IOUtils.readUTF8(output));if(data.error)throw Error(data.errorCode?t('parser.'+data.errorCode):data.error);
    if(data.warnings)data.warnings=data.warnings.map(w=>typeof w==='string'?w:t(w.code,w));return data;
  }finally{await IOUtils.remove(temp,{recursive:true,ignoreAbsent:true});}
}
async function pick(win,save=false) {
  const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
  const fp=new FilePicker();fp.init(win,save?t('export'):t('pickSource'),save?fp.modeSave:fp.modeOpen);
  fp.appendFilter(save?t('bundle'):t('sourceFormats'),save?'*.zip':'*.pdf;*.zip');
  if(!save){fp.appendFilter('PDF','*.pdf');fp.appendFilter(t('bundle'),'*.zip');}
  if(save){fp.defaultString='iBooks2Zotero-notes.zip';fp.defaultExtension='zip';}
  if(await fp.show()===fp.returnCancel)return null;return fp.file;
}
function bundleError(key='error.archiveInvalid'){const error=new Error(t(key));error.code=key;throw error;}
function binaryToBytes(text){return Uint8Array.from(text,c=>c.charCodeAt(0));}
async function sha256(bytes){const digest=await Zotero.getMainWindow().crypto.subtle.digest('SHA-256',new Uint8Array(bytes));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}
async function readBundle(path){
  const reader=Cc['@mozilla.org/libjar/zip-reader;1'].createInstance(Ci.nsIZipReader);
  try{
    reader.open(Zotero.File.pathToFile(path));const entries=new Map();let total=0;
    const enumeration=reader.findEntries(null);
    while(enumeration.hasMore()){
      const name=enumeration.getNext(),entry=reader.getEntry(name);
      if(!BooksArchive.safePath(entry.isDirectory?name.replace(/\/$/,''):name)||entries.has(name))bundleError('error.archiveInvalid');
      if(entry.realSize<0||entry.realSize>BooksArchive.limits.fileBytes)bundleError('error.archiveLarge');
      total+=entry.realSize;entries.set(name,entry);
      if(entries.size>BooksArchive.limits.entries||total>BooksArchive.limits.totalBytes)bundleError('error.archiveLarge');
    }
    reader.test(null);
    function read(name){
      if(!entries.has(name)||entries.get(name).isDirectory)bundleError('error.archiveInvalid');
      const stream=Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);stream.setInputStream(reader.getInputStream(name));
      try{return binaryToBytes(stream.readBytes(entries.get(name).realSize));}finally{stream.close();}
    }
    const manifest=JSON.parse(new (Zotero.getMainWindow().TextDecoder)('utf-8',{fatal:true}).decode(read('manifest.json')));
    BooksArchive.validate(manifest);return await BooksArchive.verify(manifest,read(manifest.payload),sha256);
  }finally{try{reader.close();}catch{}}
}
async function selectSource(path){
  return /\.zip$/i.test(path)?readBundle(path):BooksArchive.create(await IOUtils.read(path),{hash:sha256,sourceName:PathUtils.filename(path),inspect:indices=>helper('inspect',path,indices)});
}
async function parseArchive(archive,id){
  const originals={pageCount:archive.manifest.pageCount,pages:archive.manifest.pages.filter(p=>p.annotationCount>0)};
  await validateTarget(id,originals);
  const target=await Zotero.Items.get(id).getFilePathAsync();
  const temp=PathUtils.join(Zotero.getTempDirectory().path,'ibooks-raw-'+Zotero.Utilities.randomString(10));await IOUtils.makeDirectory(temp);
  try{
    const path=PathUtils.join(temp,'annotations.pdf');await IOUtils.write(path,archive.payload);
    const source=await helper('extract-raw',path,target);
    source.originalPages=originals.pages;
    for(const page of source.pages)page.fingerprint=originals.pages.find(p=>p.pageIndex===page.pageIndex).fingerprint;
    return source;
  }finally{await IOUtils.remove(temp,{recursive:true,ignoreAbsent:true});}
}
async function exportBundle(win,archive){
  if(!archive)bundleError('error.archiveInvalid');
  const destination=await pick(win,true);if(!destination)return null;
  const temp=PathUtils.join(Zotero.getTempDirectory().path,'ibooks-export-'+Zotero.Utilities.randomString(10));await IOUtils.makeDirectory(temp);
  const directory=PathUtils.join(temp,'bundle');await IOUtils.makeDirectory(directory);
  try{
    await IOUtils.writeUTF8(PathUtils.join(directory,'manifest.json'),JSON.stringify(archive.manifest,null,2));
    await IOUtils.write(PathUtils.join(directory,'annotations.pdf'),archive.payload);
    await IOUtils.writeUTF8(PathUtils.join(directory,'README.txt'),BooksArchive.readme);
    const zip=PathUtils.join(temp,'notes.zip');await Zotero.File.zipDirectory(directory,zip);
    await IOUtils.write(destination,await IOUtils.read(zip));return destination;
  }finally{await IOUtils.remove(temp,{recursive:true,ignoreAbsent:true});}
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
  const check=await helper('inspect',path,(source.originalPages||source.pages).map(p=>p.pageIndex));
  if(check.pageCount!==source.pageCount)throw Error(t('error.pageCount',{source:source.pageCount,target:check.pageCount}));
  for(const page of (source.originalPages||source.pages)){const p=check.pages.find(p=>p.pageIndex===page.pageIndex);if(!p||!p.fingerprint||p.fingerprint!==page.fingerprint||p.rotation!==page.rotation||p.bounds.some((n,i)=>Math.abs(n-page.bounds[i])>0.01))throw Error(t('error.pageMatch',{page:page.pageIndex+1}));}
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
  const incomplete=source.warnings;
  if(incomplete.length&&replace&&!Services.prompt.confirm(win,t('confirm.warningTitle'),t('confirm.warning')))return null;
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
  let selectedArchive=null;
  const args={locale:language().locale,targets:targets.map(a=>({id:a.id,title:(a.parentID?Zotero.Items.get(a.parentID).getField('title')+' — ':'')+a.getField('title')})),
    getPref:(key,fallback)=>Zotero.Prefs.get(PREFIX+key,true)??fallback,setPref:(key,value)=>Zotero.Prefs.set(PREFIX+key,value,true),
    range:checkedRange,pageCount:targetPageCount,
    pick:(w)=>pick(w),select:async path=>{selectedArchive=null;selectedArchive=await selectSource(path);},hasArchive:()=>!!selectedArchive,parse:id=>parseArchive(selectedArchive,id),validate:validateTarget,import:importNotes,clear:clearNotes,
    export:w=>exportBundle(w,selectedArchive),
    count:(id,range)=>range?rangeAnnotations(Zotero.Items.get(id),range).length:Zotero.Items.get(id).getAnnotations().length,
    show:async(id,page)=>{const reader=await Zotero.Reader.open(id);reader.navigate({pageIndex:page});}
  };
  const dialog=win.openDialog('chrome://books-notes/content/dialog.xhtml','','chrome,centerscreen,resizable,width=1120,height=820',args);dialogs.add(dialog);dialog.addEventListener('unload',()=>dialogs.delete(dialog));
}
