/* Raw annotation archives: copy PDF objects, never decode or resample handwriting. */
var BooksArchive = (() => {
 const limits={entries:10000,fileBytes:128*1024*1024,totalBytes:256*1024*1024,objects:100000};
 const catalogKeys=['Metadata','AcroForm','OCProperties','PageLabels','Dests'];
 function library(){return typeof PDFLib!=='undefined'?PDFLib:require('./vendor/pdf-lib.min.js');}
 function fail(code='error.archiveInvalid'){const e=new Error(code);e.code=code;throw e;}
 function safePath(name){return typeof name==='string'&&name.length>0&&name.length<1024&&!/[\\\x00-\x1f]/.test(name)&&!name.startsWith('/')&&!name.includes(':')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');}
 function pageMarkers(doc){
  const P=library(),markers=new Map();
  doc.getPages().forEach((page,index)=>{markers.set(page.ref,'page:'+index);markers.set(page.node,'page:'+index);});
  for(const [ref,obj] of doc.context.enumerateIndirectObjects())if(obj instanceof P.PDFDict&&obj.get(P.PDFName.of('Type'))?.toString()==='/Pages'){markers.set(ref,'page-tree');markers.set(obj,'page-tree');}
  markers.set(doc.catalog,'catalog');markers.set(doc.context.trailerInfo.Root,'catalog');return markers;
 }
 function copier(source,destination){
  const P=library(),map=new Map(),destinationPages=destination.getPages();
  source.getPages().forEach((page,i)=>{map.set(page.ref,destinationPages[i].ref);map.set(page.node,destinationPages[i].node);});
  const pageTree=destination.catalog.get(P.PDFName.of('Pages')),tree=destination.context.lookup(pageTree);
  for(const [ref,obj] of source.context.enumerateIndirectObjects())if(obj instanceof P.PDFDict&&obj.get(P.PDFName.of('Type'))?.toString()==='/Pages'){map.set(ref,pageTree);map.set(obj,tree);}
  map.set(source.context.trailerInfo.Root,destination.context.trailerInfo.Root);map.set(source.catalog,destination.catalog);
  function copy(object,depth=0){
   if(depth>200||map.size>limits.objects)fail('error.archiveLarge');
   if(map.has(object))return map.get(object);
   if(object instanceof P.PDFRef){const original=source.context.lookup(object);const ref=destination.context.nextRef();map.set(object,ref);if(original)destination.context.assign(ref,copy(original,depth+1));return ref;}
   if(object instanceof P.PDFStream){if(!(object instanceof P.PDFRawStream))fail();const clone=object.clone(destination.context);map.set(object,clone);for(const [key,value] of object.dict.entries())clone.dict.set(key,copy(value,depth+1));return clone;}
   if(object instanceof P.PDFDict){const clone=object.clone(destination.context);map.set(object,clone);for(const [key,value] of object.entries())clone.set(key,copy(value,depth+1));return clone;}
   if(object instanceof P.PDFArray){const clone=object.clone(destination.context);map.set(object,clone);for(let i=0;i<object.size();i++)clone.set(i,copy(object.get(i),depth+1));return clone;}
   return object.clone(destination.context);
  }
  return copy;
 }
 async function snapshot(doc,hash){
  const P=library(),markers=pageMarkers(doc),seen=new Map();
  async function value(object,depth=0){
   if(depth>200||seen.size>limits.objects)fail('error.archiveLarge');
   if(markers.has(object))return {target:markers.get(object)};
   if(object instanceof P.PDFRef){const resolved=doc.context.lookup(object);if(!resolved)return {unresolved:true};return value(resolved,depth+1);}
   if(object instanceof P.PDFDict||object instanceof P.PDFArray||object instanceof P.PDFStream){
    if(seen.has(object))return {reference:seen.get(object)};
    const id=seen.size;seen.set(object,id);
    if(object instanceof P.PDFStream){if(!(object instanceof P.PDFRawStream))fail();const data=object.getContents();return {id,stream:await hash(data),length:data.length,dictionary:await dictionary(object.dict,depth+1)};}
    if(object instanceof P.PDFDict)return {id,dictionary:await dictionary(object,depth+1)};
    const array=[];for(let i=0;i<object.size();i++)array.push(await value(object.get(i),depth+1));return {id,array};
   }
   if(object instanceof P.PDFString||object instanceof P.PDFHexString){const bytes=object.asBytes();return {string:await hash(bytes),length:bytes.length};}
   return {token:object.toString()};
  }
  async function dictionary(dict,depth){const result=[];for(const [key,item] of dict.entries().sort((a,b)=>a[0].toString().localeCompare(b[0].toString(),'en')))result.push([key.toString(),await value(item,depth+1)]);return result;}
  const pages=[];
  for(const page of doc.getPages()){
   const boxes={};for(const key of ['MediaBox','CropBox','BleedBox','TrimBox','ArtBox','Rotate']){const box=page.node.getInheritableAttribute(P.PDFName.of(key));if(box)boxes[key]=await value(box);}
   const annotations=page.node.get(P.PDFName.of('Annots'));
   pages.push({boxes,annotations:annotations?await value(annotations):null});
  }
  const catalog={};for(const key of catalogKeys){const object=doc.catalog.get(P.PDFName.of(key));if(object)catalog[key]=await value(object);}
  const names=doc.catalog.lookupMaybe(P.PDFName.of('Names'),P.PDFDict),destinations=names?.get(P.PDFName.of('Dests'));if(destinations)catalog.namedDestinations=await value(destinations);
  return {pages,catalog,info:doc.context.trailerInfo.Info?await value(doc.context.trailerInfo.Info):null};
 }
 function validate(manifest){
  if(!manifest||manifest.format!=='ibooks2zotero-raw-annotations'||manifest.version!==1||manifest.payload!=='annotations.pdf'||!Number.isInteger(manifest.pageCount)||manifest.pageCount<1||!Array.isArray(manifest.pages)||manifest.pages.length!==manifest.pageCount||!/^[a-f0-9]{64}$/.test(manifest.payloadSHA256||'')||!/^[a-f0-9]{64}$/.test(manifest.sourceSHA256||''))fail();
  let count=0;
  manifest.pages.forEach((p,i)=>{if(p.pageIndex!==i||!Number.isInteger(p.annotationCount)||p.annotationCount<0||!Array.isArray(p.bounds)||p.bounds.length!==2||!p.bounds.every(n=>Number.isFinite(n)&&n>0)||!Number.isInteger(p.rotation)||(p.annotationCount>0&&!/^[a-f0-9]{64}$/.test(p.fingerprint||'')))fail();count+=p.annotationCount;});
  if(count!==manifest.annotationCount)fail();return manifest;
 }
 async function create(input,{hash,inspect,sourceName=''}){
  const P=library(),bytes=new Uint8Array(input),source=await P.PDFDocument.load(bytes,{updateMetadata:false,parseSpeed:100});
  const destination=await P.PDFDocument.create({updateMetadata:false});destination.context.header=source.context.header;
  const pages=source.getPages(),inventory=[];
  for(const page of pages){const box=page.getMediaBox();destination.addPage([box.width,box.height]);const annots=page.node.lookupMaybe(P.PDFName.of('Annots'),P.PDFArray);inventory.push({pageIndex:inventory.length,annotationCount:annots?.size()||0,bounds:[box.width,box.height],rotation:page.getRotation().angle});}
  const copy=copier(source,destination);
  pages.forEach((page,i)=>{
   const target=destination.getPage(i);
   for(const key of ['MediaBox','CropBox','BleedBox','TrimBox','ArtBox','Rotate']){const object=page.node.getInheritableAttribute(P.PDFName.of(key));if(object)target.node.set(P.PDFName.of(key),copy(object));}
   const annots=page.node.get(P.PDFName.of('Annots'));if(annots)target.node.set(P.PDFName.of('Annots'),copy(annots));
  });
  for(const key of catalogKeys){const object=source.catalog.get(P.PDFName.of(key));if(object)destination.catalog.set(P.PDFName.of(key),copy(object));}
  const names=source.catalog.lookupMaybe(P.PDFName.of('Names'),P.PDFDict),dests=names?.get(P.PDFName.of('Dests'));
  if(dests)destination.catalog.set(P.PDFName.of('Names'),destination.context.obj({Dests:copy(dests)}));
  if(source.context.trailerInfo.Info)destination.context.trailerInfo.Info=copy(source.context.trailerInfo.Info);
  const payload=await destination.save({useObjectStreams:false,updateFieldAppearances:false,addDefaultPage:false,objectsPerTick:50});
  if(payload.length>limits.fileBytes)fail('error.archiveLarge');
  const restored=await P.PDFDocument.load(payload,{updateMetadata:false,parseSpeed:100});
  if(JSON.stringify(await snapshot(source,hash))!==JSON.stringify(await snapshot(restored,hash)))fail('error.archiveVerification');
  const indices=inventory.filter(p=>p.annotationCount>0).map(p=>p.pageIndex),original=await inspect(indices);
  if(original.pageCount!==pages.length)fail('error.archiveVerification');
  for(const p of inventory)if(p.annotationCount>0){const match=original.pages.find(q=>q.pageIndex===p.pageIndex);if(!match?.fingerprint)fail('error.archiveVerification');p.fingerprint=match.fingerprint;}
  const manifest={format:'ibooks2zotero-raw-annotations',version:1,payload:'annotations.pdf',payloadSHA256:await hash(payload),sourceSHA256:await hash(bytes),sourceName,pageCount:pages.length,annotationCount:inventory.reduce((n,p)=>n+p.annotationCount,0),pages:inventory};
  return {manifest:validate(manifest),payload};
 }
 async function verify(manifest,payload,hash){
  validate(manifest);if(payload.length>limits.fileBytes)fail('error.archiveLarge');if(await hash(payload)!==manifest.payloadSHA256)fail('error.archiveVerification');
  const P=library(),doc=await P.PDFDocument.load(new Uint8Array(payload),{updateMetadata:false,parseSpeed:100});
  if(doc.getPageCount()!==manifest.pageCount)fail();
  doc.getPages().forEach((p,i)=>{const m=manifest.pages[i],box=p.getMediaBox(),annots=p.node.lookupMaybe(P.PDFName.of('Annots'),P.PDFArray);if((annots?.size()||0)!==m.annotationCount||box.width!==m.bounds[0]||box.height!==m.bounds[1]||p.getRotation().angle!==m.rotation||p.node.get(P.PDFName.of('Contents')))fail();});
  return {manifest,payload};
 }
 const readme='iBooks2Zotero raw annotation archive\n\nannotations.pdf contains the original PDF annotation objects and their referenced appearance/resource streams on blank pages. The book page content is intentionally excluded. Unknown annotation types and opaque Apple drawing archives are retained without handwriting decoding, resampling, grouping, flattening, or appearance regeneration.\n\nmanifest.json records original page positions, document fingerprints, source-file SHA-256 and payload SHA-256. Select this ZIP as the source and a matching target PDF in Zotero; conversion happens only when importing/previewing.\n\nPDF object numbers, cross-reference tables and container serialization are regenerated. This is not a byte-for-byte copy of the full source PDF and does not retain valid signatures over that source file. Keep the original PDF when that is required.\n';
 return {limits,safePath,validate,create,verify,snapshot,readme};
})();
if(typeof module!=='undefined')module.exports=BooksArchive;
