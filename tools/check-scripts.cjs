const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
let count=0;const combined=[];
for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/type=["'](?!text\/javascript|application\/javascript|module)[^"']+/i.test(m[1]))continue;
  const src=m[1].match(/src=["']([^"']+)/)?.[1];let code=m[2];
  if(src){if(/^https?:/.test(src))continue;code=fs.readFileSync(path.join(root,'public',src.split(/[?#]/)[0]),'utf8');}
  new vm.Script(code,{filename:src||'inline-'+count});combined.push(code);count++;
}
new vm.Script(combined.join('\n;\n'),{filename:'combined-scripts'});
console.log(count+' scripts parse; shared globals have no duplicate declarations.');
