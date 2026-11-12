const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.js');
const defaults={vertical:3.7,horizontal:8,order:'vertical-horizontal'};
const stroke=(x,y,color='#2864ac')=>({color,points:[[x,y,1],[x+1,y+1,1]]});
const source=strokes=>({pageCount:1,pages:[{pageIndex:0,pageLabel:'1',bounds:[612,792],rotation:0,notes:[],strokes}]});
test('white-space thresholds preserve all paths while changing groups',()=>{
 const input=source([stroke(0,0),stroke(50,0),stroke(0,50)]);
 const split=core.prepare(input,defaults),merged=core.prepare(input,{...defaults,vertical:100,horizontal:100});
 assert.equal(split.count,3);assert.equal(merged.count,1);assert.equal(merged.pages[0].annotations[0].position.paths.length,3);
});
test('axis order changes bridging strokes; colors stay independent',()=>{
 const input=source([{color:'#2864ac',points:[[0,0,1],[20,1,1]]},stroke(0,10),stroke(10,10)]);
 assert.equal(core.prepare(input,{...defaults,vertical:2,horizontal:2}).count,3);
 assert.equal(core.prepare(input,{...defaults,vertical:2,horizontal:2,order:'horizontal-vertical'}).count,2);
 assert.equal(core.prepare(source([stroke(0,0),stroke(0,0,'#ff0000')]),defaults).count,2);
});
test('invalid inputs and rotated pages are rejected',()=>{
 assert.throws(()=>core.prepare(source([]),{...defaults,vertical:NaN}));
 assert.throws(()=>core.prepare(source([]),{...defaults,horizontal:-1}));
 const rotated=source([]);rotated.pages[0].rotation=90;assert.throws(()=>core.prepare(rotated,defaults));
 assert.throws(()=>core.prepare(source([{color:'#000000',points:[[NaN,0,1]]}]),defaults));
});
test('highlight comments and PDF physical page indices survive conversion',()=>{
 const input=source([]);input.pages[0].pageIndex=4;input.pages[0].pageLabel='iv';
 input.pages[0].notes=[{type:'highlight',color:'#ffd400',rects:[[10,20,30,40]],text:'Remainder',comment:'Example'}];
 const a=core.prepare(input,defaults).pages[0].annotations[0];assert.equal(a.position.pageIndex,4);assert.equal(a.pageLabel,'iv');assert.equal(a.comment,'Example');assert.equal(a.text,'Remainder');
});
