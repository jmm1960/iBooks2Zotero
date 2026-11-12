/* Geometry only. PDF coordinates; no file or Zotero database access. */
var BooksCore = (() => {
  function fail(code,params={}){const error=new Error(code);error.code=code;error.params=params;throw error;}
  const median = a => { const b=[...a].sort((x,y)=>x-y), i=Math.floor(b.length/2); return b.length%2?b[i]:(b[i-1]+b[i])/2; };
  function simplify(ps, eps=0.07) {
    if(ps.length<3)return ps;
    const [x,y]=ps[0],end=ps[ps.length-1],dx=end[0]-x,dy=end[1]-y,den=Math.hypot(dx,dy);
    let max=0,index=0;
    for(let i=1;i<ps.length-1;i++){const p=ps[i],d=den?Math.abs(dy*(p[0]-x)-dx*(p[1]-y))/den:Math.hypot(p[0]-x,p[1]-y);if(d>max){max=d;index=i;}}
    return max>eps?[...simplify(ps.slice(0,index+1),eps).slice(0,-1),...simplify(ps.slice(index),eps)]:[ps[0],end];
  }
  function split(strokes,axis,gap) {
    const index=axis==='vertical'?1:0;
    const spans=strokes.map(s=>{const values=s.points.map(p=>p[index]),half=s.width/2;return {s,min:Math.min(...values)-half,max:Math.max(...values)+half};}).sort((a,b)=>a.min-b.min);
    const groups=[];
    for(const span of spans){let g=groups[groups.length-1];if(g&&span.min-g.max<=gap){g.max=Math.max(g.max,span.max);g.strokes.push(span.s);}else groups.push({max:span.max,strokes:[span.s]});}
    return groups.map(g=>g.strokes);
  }
  function prepare(source,settings) {
    const v=Number(settings.vertical),h=Number(settings.horizontal),order=settings.order;
    if(!Number.isFinite(v)||v<0||v>100||!Number.isFinite(h)||h<0||h>100)fail('error.invalidGaps');
    if(!['vertical-horizontal','horizontal-vertical','vertical','horizontal'].includes(order))fail('error.invalidOrder');
    const result=[];let strokes=0;
    for(const page of source.pages){
      if(page.rotation!==0)fail('error.rotation',{page:page.pageIndex+1});
      const buckets=new Map();
      for(const input of page.strokes){
        if(!input.points.length)continue;
        const width=median(input.points.map(p=>p[2]));
        if(!Number.isFinite(width)||width<=0||input.points.some(p=>p.some(n=>!Number.isFinite(n))))fail('error.coordinates');
        const s={points:simplify(input.points.map(p=>[p[0],p[1]])),width,color:input.color};
        if(!buckets.has(s.color))buckets.set(s.color,[]);buckets.get(s.color).push(s);strokes++;
      }
      let ink=[];
      for(const [color,ss] of buckets){
        let groups=[ss];
        for(const axis of order.split('-'))groups=groups.flatMap(g=>split(g,axis,axis==='vertical'?v:h));
        for(const g of groups){const paths=g.map(s=>s.points.flatMap(p=>p.map(n=>Math.round(n*1000)/1000)));ink.push({type:'ink',color,position:{pageIndex:page.pageIndex,width:Math.round(median(g.map(s=>s.width))*1000)/1000,paths}});}
      }
      ink.sort((a,b)=>top(b)-top(a)||left(a)-left(b));
      let anns=[...ink,...page.notes.map(n=>({type:n.type,color:n.color,text:n.text||'',comment:n.comment||'',position:{pageIndex:page.pageIndex,rects:n.rects}}))];
      anns=anns.map((a,i)=>({...a,isExternal:false,authorName:'Apple Books',comment:a.comment||'',pageLabel:page.pageLabel,sortIndex:`${String(page.pageIndex).padStart(5,'0')}|000000|${String(Math.max(0,Math.round(page.bounds[1]-top(a)))).padStart(5,'0')}`,tags:[{name:'apple-books-import'}]}));
      result.push({page,annotations:anns});
    }
    return {pages:result,strokes,count:result.reduce((n,p)=>n+p.annotations.length,0),settings:{vertical:v,horizontal:h,order}};
  }
  function top(a){return a.position.paths?Math.max(...a.position.paths.flatMap(p=>p.filter((_,i)=>i%2))):Math.max(...a.position.rects.map(r=>r[3]));}
  function left(a){return a.position.paths?Math.min(...a.position.paths.flatMap(p=>p.filter((_,i)=>!(i%2)))):Math.min(...a.position.rects.map(r=>r[0]));}
  return {prepare,split,simplify};
})();
if(typeof module!=='undefined')module.exports=BooksCore;
