const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const A=require('../src/archive.js'),P=require('../src/vendor/pdf-lib.min.js');
const hash=async b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(){
 const d=await P.PDFDocument.create({updateMetadata:false}),p=d.addPage([612,792]),q=d.addPage([612,792]),c=d.context,n=P.PDFName.of;
 p.node.set(n('MediaBox'),c.obj([20,30,632,822]));p.setRotation(P.degrees(90));
 p.node.set(n('Contents'),c.register(c.flateStream('PRIVATE BOOK CONTENT')));
 p.node.set(n('Resources'),c.obj({PrivateBookResource:P.PDFString.of('PRIVATE BOOK RESOURCE')}));
 const image=c.register(c.flateStream(new Uint8Array([1,2,3,4]),{Type:'XObject',Subtype:'Image',Width:1,Height:1,BitsPerComponent:8,ColorSpace:'DeviceRGB',SMask:c.register(c.flateStream(new Uint8Array([255]),{Type:'XObject',Subtype:'Image',Width:1,Height:1,BitsPerComponent:8,ColorSpace:'DeviceGray'}))}));
 const ap=c.register(c.flateStream('/Image Do',{Type:'XObject',Subtype:'Form',BBox:[0,0,100,100],Resources:{XObject:{Image:image}}}));
 const a=c.obj({Type:'Annot',Subtype:'UnsupportedFutureType',Rect:[10,20,50,60],P:p.ref,AP:{N:ap},Contents:P.PDFHexString.of('00ff80'),NM:P.PDFString.of('stable-original-id'),Private:{OpaqueAppleArchive:P.PDFString.of('not a decodable PKDrawing'),Unknown:[1,2,3]}}),r=c.register(a);
 const popup=c.obj({Type:'Annot',Subtype:'Popup',Parent:r,P:p.ref,Rect:[10,20,50,60]}),pr=c.register(popup);a.set(n('Popup'),pr);a.set(n('IRT'),r);
 p.node.set(n('Annots'),c.obj([r,pr]));q.node.set(n('Annots'),c.obj([{Type:'Annot',Subtype:'Highlight',Rect:[1,2,3,4],QuadPoints:[1,4,3,4,1,2,3,2],C:[1,1,0],Contents:P.PDFString.of('comment')} ]));
 d.catalog.set(n('PageLabels'),c.obj({Nums:[0,{S:'r'}]}));d.setTitle('Archive test');
 return d.save({useObjectStreams:false});
}
async function make(bytes){return A.create(bytes,{hash,sourceName:'fixture.pdf',inspect:async indices=>({pageCount:2,pages:indices.map(pageIndex=>({pageIndex,fingerprint:'a'.repeat(64)}))})});}
test('raw archive retains unknown fields, opaque archives, cycles, compressed appearance/image streams, page geometry and metadata',async()=>{
 const bytes=await fixture(),out=await make(bytes);assert.equal(out.manifest.annotationCount,3);
 await A.verify(out.manifest,out.payload,hash);
 const source=await P.PDFDocument.load(bytes,{updateMetadata:false}),restored=await P.PDFDocument.load(out.payload,{updateMetadata:false});
 assert.deepEqual(await A.snapshot(restored,hash),await A.snapshot(source,hash));
 for(const page of restored.getPages()){assert.equal(page.node.get(P.PDFName.of('Contents')),undefined);assert.equal(page.node.Resources()?.get(P.PDFName.of('PrivateBookResource')),undefined);}
 assert.ok(!Buffer.from(out.payload).includes(Buffer.from('PRIVATE BOOK RESOURCE')));
});
test('payload tampering, earlier formats, invalid manifests and unsafe paths are rejected',async()=>{
 const out=await make(await fixture()),bad=out.payload.slice();bad[20]^=1;await assert.rejects(()=>A.verify(out.manifest,bad,hash));
 for(const manifest of [[],{format:'ibooks2zotero-bundle',version:1},{...out.manifest,version:2},{...out.manifest,annotationCount:999}])assert.throws(()=>A.validate(manifest));
 for(const name of ['../x','/x','a\\b','a//b','C:/x','a\0b'])assert.equal(A.safePath(name),false);
});
