const {test}=require('node:test'),assert=require('node:assert/strict');
const bundle=require('../src/bundle.js'),core=require('../src/core.js');
const fixture=()=>({format:'apple-books-notes',version:1,pageCount:3,warnings:[],pages:[{pageIndex:1,pageLabel:'2',bounds:[612,792],rotation:0,fingerprint:'a'.repeat(64),background:'PRIVATE BOOK PAGE IMAGE',appleArchives:[Buffer.from('raw archive').toString('base64')],strokes:[{color:'#2864ac',points:[[10,20,1],[12,22,1]]}],notes:[{type:'highlight',color:'#ffd400',rects:[[20,30,70,40]],comment:'Keep this',text:'Example'}]}]});
async function unpack(plan){const files=new Map(plan.files.map(f=>[f.name,f]));return bundle.read(plan.manifest,n=>JSON.parse(files.get(n).text),n=>files.get(n).base64);}
test('ZIP manifest round trip preserves all annotation data, archives and matching metadata without book images',async()=>{
 const source=fixture(),plan=bundle.create(source),restored=await unpack(plan);
 assert.ok(!JSON.stringify(plan).includes('PRIVATE BOOK PAGE IMAGE'));
 const {background,...expected}=source.pages[0];assert.deepEqual(restored.pages[0],expected);
});
test('round-tripped data can be regrouped and legacy provenance survives re-export',async()=>{
 const source=fixture();const restored=await unpack(bundle.create(source));
 const settings={vertical:3.7,horizontal:8,order:'vertical-horizontal'};
 assert.deepEqual(core.prepare(restored,settings).pages[0].annotations,core.prepare(source,settings).pages[0].annotations);
 source.legacy=true;source.pages[0].fingerprint='';assert.equal((await unpack(bundle.create(source))).legacy,true);
});
test('invalid coordinates, page identities and missing fingerprints are rejected',()=>{
 for(const mutate of [s=>s.pages.push(s.pages[0]),s=>s.pages[0].pageIndex=4,s=>s.pages[0].bounds[0]=0,s=>s.pages[0].strokes[0].points[0][0]=Infinity,s=>s.pages[0].notes[0].type='image',s=>s.pages[0].fingerprint='',s=>s.pages[0].rotation=NaN]){const s=fixture();mutate(s);assert.throws(()=>bundle.create(s));}
});
test('archive paths, duplicate references and unknown versions are rejected',async()=>{
 for(const value of ['../manifest.json','/manifest.json','foo\\bar','a/../x','a//x','C:/file','a\0b'])assert.equal(bundle.safePath(value),false);
 const plan=bundle.create(fixture());plan.manifest.pages[0].strokesFile='../outside.json';await assert.rejects(()=>unpack(plan));
 const next=bundle.create(fixture());next.manifest.version=999;await assert.rejects(()=>unpack(next));
 const duplicate=bundle.create(fixture());duplicate.manifest.pages[0].notesFile=duplicate.manifest.pages[0].strokesFile;await assert.rejects(()=>unpack(duplicate));
});
test('legacy manifest uses original physical PDF pages and deterministic archive names',()=>{
 const legacy=bundle.legacy([{pdf_page:174,annotation:1,type:'/Square',rectangle:[1,2,3,4]}]);assert.equal(legacy[0].archiveFile,'page-174-annotation-01.apple.plist');
 assert.throws(()=>bundle.legacy([{pdf_page:0,annotation:1,type:'/Square',rectangle:[1,2,3,4]}]));
});
