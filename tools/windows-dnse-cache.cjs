'use strict';
// Dọn riêng cache do chương trình tạo; không xóa thư mục có tệp lạ hoặc liên kết.
const fs=require('node:fs'),path=require('node:path'),Q=require('../public/shared/data-quality.js');
const KIND='tracker-dnse-window-cache-v1';
function mark(dir,date){fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify({kind:KIND,date}));}
function prune(base,keep=4){
 base=fs.realpathSync(base);if(!Number.isInteger(keep)||keep<4)throw Error('WINDOWS_CACHE_RETENTION_INVALID');
 const owned=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&Q.dateValid(e.name)).filter(e=>{try{const m=JSON.parse(fs.readFileSync(path.join(base,e.name,'job.json')));return m.kind===KIND&&m.date===e.name;}catch{return false;}}).map(e=>e.name).sort().reverse();
 let removed=0,protectedFolders=0;
 for(const date of owned.slice(keep)){
  const dir=fs.realpathSync(path.join(base,date));if(!dir.startsWith(base+path.sep)){protectedFolders++;continue;}
  const files=[],folders=[];let safe=true;
  function walk(current,prefix=''){
   for(const e of fs.readdirSync(current,{withFileTypes:true})){const relative=prefix+e.name,file=path.resolve(current,e.name);
    if(e.isSymbolicLink()||!file.startsWith(dir+path.sep)){safe=false;return;}
    if(e.isDirectory()){if(!['data','data/snapshots'].includes(relative)){safe=false;return;}walk(file,relative+'/');folders.push(file);}
    else if(e.isFile()&&(/^(job\.json|market\.csv|quality\.csv|errors\.csv|candidate\.json\.gz|data\/(market\.json|market\.json\.gz|active\.json)|data\/snapshots\/[a-f0-9]{64}\.json\.gz)$/.test(relative)))files.push(file);
    else {safe=false;return;}
   }
  }
  walk(dir);if(!safe){protectedFolders++;continue;}
  // Tất cả đường dẫn tuyệt đối đã kiểm tra trước khi xóa, không dùng recursive delete.
  for(const file of files)fs.unlinkSync(file);for(const folder of folders)fs.rmdirSync(folder);fs.rmdirSync(dir);removed++;
 }
 return {removed,protectedFolders,retained:Math.min(keep,owned.length)};
}
module.exports={mark,prune,KIND};
