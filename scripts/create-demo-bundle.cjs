const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const archive=require('../src/archive.js');
const root=path.join(__dirname,'..'),build=path.join(root,'.build'),directory=path.join(build,'demo-bundle');
(async()=>{
 fs.rmSync(directory,{recursive:true,force:true});fs.mkdirSync(directory,{recursive:true});
 const result=await archive.create(fs.readFileSync(path.join(root,'demo/annotated.pdf')),{sourceName:'annotated.pdf',hash:async b=>crypto.createHash('sha256').update(b).digest('hex'),inspect:async indices=>{
  const out=path.join(build,'demo-original-inspect.json');execFileSync(path.join(root,'src/native/books-parser'),['inspect',path.join(root,'demo/annotated.pdf'),out,indices.join(',')]);return JSON.parse(fs.readFileSync(out));
 }});
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(result.manifest,null,2));fs.writeFileSync(path.join(directory,'annotations.pdf'),result.payload);fs.writeFileSync(path.join(directory,'README.txt'),archive.readme);
 const output=path.join(root,'demo/annotations.zip');fs.rmSync(output,{force:true});execFileSync('/usr/bin/zip',['-q','-r',output,'.'],{cwd:directory});console.log('Created raw demo archive');
})().catch(e=>{console.error(e);process.exit(1)});
