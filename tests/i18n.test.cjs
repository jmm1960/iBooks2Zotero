const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const i18n=require('../src/i18n.js');
const root=path.join(__dirname,'..');
test('Zotero locale wins; system is only a fallback; unsupported languages use English',()=>{
 for(const [inputs,wanted] of [
  [['en-US','zh-CN'],'en'],[['zh-TW','en-US'],'zh'],[['zh_Hans_CN'],'zh'],
  [[undefined,'zh-CN'],'zh'],[[undefined,undefined,'zh-HK'],'zh'],[['de-DE','zh-CN'],'en'],[[],'en'],[['','not a locale','en-GB'],'en']
 ])assert.equal(i18n.resolveLocale(...inputs),wanted);
 const context=vm.createContext({BooksI18n:i18n,Zotero:{locale:'en-US',getMainWindow:()=>({navigator:{language:'zh-CN'}})},Services:{locale:{appLocaleAsBCP47:'en-US',systemLocale:'zh-CN'}}});
 vm.runInContext(fs.readFileSync(path.join(root,'src/bootstrap.js'),'utf8'),context);
 assert.equal(context.language().locale,'en');context.Zotero.locale='zh-CN';assert.equal(context.language().locale,'zh');
 context.Zotero.locale=undefined;context.Services.locale.appLocaleAsBCP47=undefined;assert.equal(context.language().locale,'zh');
});
test('both catalogs have identical keys and interpolation parameters',()=>{
 const {en,zh}=i18n.catalogs;assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
 const params=s=>[...s.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
 for(const key of Object.keys(en)){assert.ok(en[key]);assert.ok(zh[key]);assert.deepEqual(params(en[key]),params(zh[key]),key);}
 const english=i18n.create('en-US'),chinese=i18n.create('zh-CN');
 assert.equal(english.t('pageOption',{page:174,count:9}),'PDF page 174 · 9 groups');
 assert.notEqual(chinese.t('confirm.clear',{count:9,start:174,end:174}),english.t('confirm.clear',{count:9,start:174,end:174}));
 assert.equal(english.error({code:'error.rotation',params:{page:2}}),'Page 2 is rotated and cannot be imported yet.');
});
test('all referenced translation keys exist, including markup and native warnings',()=>{
 for(const name of ['bootstrap.js','dialog.js','dialog.xhtml','select-control.js','archive.js','native/BooksParser.swift']){
  const source=fs.readFileSync(path.join(root,'src',name),'utf8');
  const matches=[...source.matchAll(/\bt\('([^']+)'/g),...source.matchAll(/data-i18n(?:-title|-aria-label)?="([^"]+)"/g),...source.matchAll(/"code":"([^"]+)"/g)];
  for(const match of matches.filter(m=>!m[1].endsWith('.')))assert.ok(i18n.catalogs.en[match[1]],name+': '+match[1]);
 }
});
test('Chinese source strings are confined to the translation catalog',()=>{
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);
  else if(/\.(js|cjs|swift|xhtml|css|json|py|sh)$/.test(entry.name)&&entry.name!=='i18n.js')assert.ok(!/\p{Script=Han}/u.test(fs.readFileSync(full,'utf8')),full);
 }}
 for(const dir of ['src','scripts','tests'])walk(path.join(root,dir));
});
