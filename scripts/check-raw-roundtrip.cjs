// Verify raw archive fidelity and native conversion against a matching clean PDF.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const archive=require('../src/archive.js'),core=require('../src/core.js');
(async()=>{
 const source=path.resolve(process.argv[2]||'demo/annotated.pdf'),target=path.resolve(process.argv[3]||'demo/clean.pdf'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ibooks-raw-check-'));
 const native=(mode,file,extra)=>{const out=path.join(temp,'result.json');execFileSync(path.resolve('src/native/books-parser'),[mode,file,out,...(extra?[extra]:[])]);return JSON.parse(fs.readFileSync(out));};
 try{
  const raw=await archive.create(fs.readFileSync(source),{sourceName:path.basename(source),hash:async bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),inspect:async indices=>native('inspect',source,indices.join(','))});
  const file=path.join(temp,'annotations.pdf');fs.writeFileSync(file,raw.payload);
  const direct=native('extract',source),restored=native('extract-raw',file,target);
  for(const data of [direct,restored])for(const page of data.pages){delete page.background;delete page.fingerprint;}
  assert.deepEqual(restored,direct);
  console.log(JSON.stringify({rawAnnotations:raw.manifest.annotationCount,payloadBytes:raw.payload.length,strokes:restored.pages.reduce((n,p)=>n+p.strokes.length,0),groups:core.prepare(restored,{vertical:3.7,horizontal:8,order:'vertical-horizontal'}).count,nativeDecodeMatches:true}));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
