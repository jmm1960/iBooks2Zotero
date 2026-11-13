/* Portable annotation-bundle format. Geometry is in PDF coordinates. */
var BooksBundle = (() => {
 const limits={entries:10000,fileBytes:64*1024*1024,totalBytes:256*1024*1024,points:2000000};
 function fail(key='error.bundleInvalid'){const e=new Error(key);e.code=key;throw e;}
 function safePath(name){return typeof name==='string'&&name.length>0&&name.length<1024&&!/[\\\x00-\x1f]/.test(name)&&!name.startsWith('/')&&!name.includes(':')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');}
 function validate(source){
  if(!source||source.format!=='apple-books-notes'||source.version!==1||!Number.isInteger(source.pageCount)||source.pageCount<1||!Array.isArray(source.pages)||!Array.isArray(source.warnings))fail();
  if(!source.warnings.every(w=>typeof w==='string'))fail();
  const seen=new Set();let points=0;
  const finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
  const color=c=>typeof c==='string'&&/^#[a-f0-9]{6}$/i.test(c);
  for(const p of source.pages){
   if(!p||!Number.isInteger(p.pageIndex)||p.pageIndex<0||p.pageIndex>=source.pageCount||seen.has(p.pageIndex)||!finite(p.bounds,2)||p.bounds.some(n=>n<=0||n>100000)||!Number.isInteger(p.rotation)||!Array.isArray(p.strokes)||!Array.isArray(p.notes)||!Array.isArray(p.appleArchives))fail();
   seen.add(p.pageIndex);if(p.pageLabel!==undefined&&(typeof p.pageLabel!=='string'||p.pageLabel.length>1024))fail();
   if(!source.legacy&&!/^[a-f0-9]{64}$/i.test(p.fingerprint||''))fail();
   if(!p.appleArchives.every(a=>typeof a==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(a)))fail();
   for(const s of p.strokes){if(!color(s.color)||!Array.isArray(s.points)||!s.points.length)fail();points+=s.points.length;if(points>limits.points)fail('error.bundleLarge');for(const q of s.points)if(!finite(q,3)||q[2]<=0)fail();}
   for(const n of p.notes)if(!['highlight','note'].includes(n.type)||!color(n.color)||!Array.isArray(n.rects)||!n.rects.length||n.rects.some(r=>!finite(r,4)||r[2]<r[0]||r[3]<r[1])||(n.text!==undefined&&typeof n.text!=='string')||(n.comment!==undefined&&typeof n.comment!=='string'))fail();
  }
  return source;
 }
 function create(source){
  validate(source);const files=[];
  const pages=source.pages.map(p=>{
   const stem='page-'+String(p.pageIndex+1).padStart(4,'0');
   const strokesFile=stem+'.strokes.json',notesFile=stem+'.notes.json';
   files.push({name:strokesFile,text:JSON.stringify(p.strokes)},{name:notesFile,text:JSON.stringify(p.notes)});
   const archives=p.appleArchives.map((data,i)=>{const name=stem+'-annotation-'+String(i+1).padStart(2,'0')+'.apple.plist';files.push({name,base64:data});return name;});
   return {pageIndex:p.pageIndex,pageLabel:p.pageLabel||String(p.pageIndex+1),bounds:p.bounds,rotation:p.rotation,fingerprint:p.fingerprint||'',strokesFile,notesFile,archives};
  });
  const manifest={format:'ibooks2zotero-bundle',version:1,pageCount:source.pageCount,legacy:!!source.legacy,warnings:source.warnings,sourceName:source.sourceName||'',pages};
  files.push({name:'manifest.json',text:JSON.stringify(manifest,null,2)},{name:'README.txt',text:'iBooks2Zotero annotation bundle\n\nSelect this ZIP as the source in iBooks2Zotero. A matching target PDF is still required.\nPage indices are zero-based; filenames use one-based PDF pages.\n*.strokes.json uses PDF coordinates; *.notes.json contains highlights and notes.\n*.apple.plist preserves original Apple drawing archives. *.drawing is decoded PencilKit data. *.png is an approximate stroke preview; *.preview.json gives its drawing-space bounds.\nNo book pages, PDF content, or grouping settings are included.\nLegacy bundles have no source fingerprints and require manual edition confirmation.\n'});
  return {manifest,files};
 }
 async function read(manifest,readJSON,readBase64){
  if(!manifest||manifest.format!=='ibooks2zotero-bundle'||manifest.version!==1||!Array.isArray(manifest.pages))fail();
  const references=new Set();
  function ref(name){if(!safePath(name)||references.has(name))fail();references.add(name);return name;}
  const pages=[];
  for(const p of manifest.pages){
   if(!p||!Array.isArray(p.archives))fail();
   const strokes=await readJSON(ref(p.strokesFile)),notes=await readJSON(ref(p.notesFile)),appleArchives=[];
   for(const name of p.archives)appleArchives.push(await readBase64(ref(name)));
   pages.push({pageIndex:p.pageIndex,pageLabel:p.pageLabel,bounds:p.bounds,rotation:p.rotation,fingerprint:p.fingerprint,strokes,notes,appleArchives});
  }
  return validate({format:'apple-books-notes',version:1,pageCount:manifest.pageCount,legacy:manifest.legacy===true,warnings:manifest.warnings,sourceName:manifest.sourceName,pages});
 }
 function legacy(manifest){
  if(!Array.isArray(manifest)||!manifest.length||manifest.length>limits.entries)fail();
  return manifest.map(a=>{
   if(!a||!Number.isInteger(a.pdf_page)||a.pdf_page<1||!Number.isInteger(a.annotation)||a.annotation<1||!Array.isArray(a.rectangle)||a.rectangle.length!==4||!a.rectangle.every(Number.isFinite)||a.rectangle[2]<a.rectangle[0]||a.rectangle[3]<a.rectangle[1]||!['/Square','/Highlight','/Text'].includes(a.type))fail();
   return {...a,archiveFile:'page-'+a.pdf_page+'-annotation-'+String(a.annotation).padStart(2,'0')+'.apple.plist'};
  });
 }
 return {limits,safePath,validate,create,read,legacy};
})();
if(typeof module!=='undefined')module.exports=BooksBundle;
