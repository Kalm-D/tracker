'use strict';
// Artifact Pages không chứa chương trình Backtest; backend kiểm tra quyền tại route thật.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function prepare(target=path.resolve(root,'work/pages'),policy=JSON.parse(fs.readFileSync(path.join(root,'public/deployment-policy.json'),'utf8'))){
target=path.resolve(target);
if(!target.startsWith(path.join(root,'work')+path.sep)||fs.existsSync(target))throw Error('Đích Pages phải là thư mục mới trong work.');
const privateDnse=policy.marketDataMode==='dnse-owner-private'&&policy.sourceProvider==='DNSE'&&policy.automaticEod===true&&policy.apiBase==='https://tracker-ai-free.onrender.com';
if(policy.publicMarketSnapshots!==false||!privateDnse&&(policy.marketDataMode!=='personal-file-only'||policy.automaticEod!==false))throw Error('Chưa có policy bản web cá nhân.');
fs.cpSync(path.join(root,'public'),target,{recursive:true,filter:src=>!['backtest','data'].includes(path.relative(path.join(root,'public'),src).split(path.sep)[0])});
if(privateDnse){const file=path.join(target,'index.html');fs.writeFileSync(file,require('../server/ai/private-market.cjs').renderIndex(fs.readFileSync(file,'utf8'),{apiBase:policy.apiBase}));}
console.log('Đã chuẩn bị Pages; Backtest chỉ phục vụ tại backend có quyền.');
return target;
}
if(require.main===module)prepare(path.resolve(root,process.argv[2]||'work/pages'));
module.exports={prepare};
