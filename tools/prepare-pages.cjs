'use strict';
// Artifact Pages không chứa chương trình Backtest; backend kiểm tra quyền tại route thật.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),target=path.resolve(root,process.argv[2]||'work/pages');
if(!target.startsWith(path.join(root,'work')+path.sep)||fs.existsSync(target))throw Error('Đích Pages phải là thư mục mới trong work.');
fs.cpSync(path.join(root,'public'),target,{recursive:true,filter:src=>path.relative(path.join(root,'public'),src).split(path.sep)[0]!=='backtest'});
console.log('Đã chuẩn bị Pages; Backtest chỉ phục vụ tại backend có quyền.');
