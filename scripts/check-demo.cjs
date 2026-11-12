const fs=require('node:fs'),assert=require('node:assert/strict');
const core=require('../src/core.js');
const source=JSON.parse(fs.readFileSync(process.argv[2])),target=JSON.parse(fs.readFileSync(process.argv[3]));
assert.equal(source.pageCount,3);assert.equal(source.pages.length,2);assert.deepEqual(source.warnings,[]);
for(const p of source.pages){const clean=target.pages.find(q=>q.pageIndex===p.pageIndex);assert.equal(p.fingerprint,clean.fingerprint);assert.deepEqual(p.bounds,clean.bounds);assert.ok(p.strokes.length>0);assert.ok(p.appleArchives.length>0);}
const r=core.prepare(source,{vertical:3.7,horizontal:8,order:'vertical-horizontal'});
assert.equal(r.strokes,13);assert.equal(r.pages.flatMap(p=>p.annotations).filter(a=>a.type==='highlight').length,2);
assert.equal(r.pages.flatMap(p=>p.annotations).filter(a=>a.type==='note').length,1);
assert.equal(r.pages.flatMap(p=>p.annotations).filter(a=>a.type==='ink').flatMap(a=>a.position.paths).length,13);
console.log(`PASS: clean/source page match; ${r.strokes} strokes; ${r.count} annotations across two pages; no parser warnings.`);
