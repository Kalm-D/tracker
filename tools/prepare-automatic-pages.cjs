'use strict';
// Diễn tập artifact độc lập; không tự thay policy hoặc deploy production.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const P=require('./publish-snapshot.cjs'),A=require('./audit-data.cjs'),Q=require('../public/shared/data-quality.js');
const root=path.resolve(__dirname,'..');
function gate(config){
  if(config?.enabled!==true||config.provider!=='KBS'||config.rights?.status!=='verified'||typeof config.rights.reference!=='string'||!config.rights.reference.trim())throw Error('PUBLIC_EOD_NOT_CLEARED: chưa xác minh phạm vi phát hành nguồn công khai.');
}
function prepare({dataDir,target,config=JSON.parse(fs.readFileSync(path.join(root,'config/public-eod.json'),'utf8')),now=new Date()}={}){
  gate(config);
  dataDir=path.resolve(dataDir);target=path.resolve(target);
  if(!target.startsWith(path.join(root,'work')+path.sep)||fs.existsSync(target))throw Error('Đích phải là thư mục mới trong work.');
  const audit=A.auditDirectory(dataDir);if(!audit.ok)throw Error('Snapshot audit thất bại: '+audit.errors.map(e=>e.code).join(', '));
  const payload=P.parse(path.join(dataDir,'market.json.gz'));
  P.validate(payload,null,{now});
  const q=Q.assess(payload.meta,now);if(q.status!=='FRESH')throw Error('Không phát hành EOD thiếu phiên hoặc lịch chưa kiểm chứng: '+q.status);
  const manifest=P.parse(path.join(dataDir,'active.json'));
  if(manifest.version!==1||!manifest.active||!Array.isArray(manifest.history)||manifest.history.length>3)throw Error('Manifest công bố không hợp lệ.');
  const active=manifest.active,id=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if(active.id!==id||active.kind!=='EOD'||active.tradingDate!==payload.meta.asOf)throw Error('Snapshot active khác dữ liệu công bố.');
  const entries=[active,...manifest.history],archives=[];
  for(const entry of entries){
    if(!/^[a-f0-9]{64}$/.test(entry.id)||entry.file!=='snapshots/'+entry.id+'.json.gz')throw Error('Đường dẫn archive không hợp lệ.');
    const file=path.join(dataDir,entry.file),p=P.parse(file);
    if(crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex')!==entry.id)throw Error('Hash archive không khớp.');
    P.validate(p,null,{now});archives.push([entry.file,file]);
  }
  // Chỉ copy danh sách file đã kiểm định, không phát hành CSV/log/candidate lẫn trong thư mục.
  cp.execFileSync(process.execPath,[path.join(root,'tools/prepare-pages.cjs'),target]);
  fs.mkdirSync(path.join(target,'data/snapshots'),{recursive:true});
  for(const name of ['market.json.gz','market.json','active.json'])fs.copyFileSync(path.join(dataDir,name),path.join(target,'data',name));
  for(const [name,file] of archives)fs.copyFileSync(file,path.join(target,'data',name));
  const htmlFile=path.join(target,'index.html');let html=fs.readFileSync(htmlFile,'utf8');
  const mode='window.TRACKER_PERSONAL_WEB = true;',ui='<script src="./shared/personal-ui.js" defer></script>';
  if(!html.includes(mode)||!html.includes(ui))throw Error('Không tìm được điểm nối UI, không tự đoán bản HTML.');
  html=html.replace(mode,'window.TRACKER_PERSONAL_WEB = false;')
    .replace(ui,'<script src="./shared/automatic-data.js" defer></script>')
    .replace('if(window.TRACKER_PERSONAL_WEB){toast(', 'if(window.refreshTrackerSharedMarketData){await window.refreshTrackerSharedMarketData();return;}\n      if(window.TRACKER_PERSONAL_WEB){toast(');
  fs.writeFileSync(htmlFile,html);
  fs.writeFileSync(path.join(target,'deployment-policy.json'),JSON.stringify({version:'automatic-eod-web-1',marketDataMode:'public-eod',publicMarketSnapshots:true,automaticEod:true,sourceProvider:'KBS',snapshotId:id}));
  return {artifact:target,asOf:payload.meta.asOf,snapshotId:id,quality:q.status,rollbackSnapshots:manifest.history.length};
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--data'||args[2]!=='--target')throw Error('Dùng --data <snapshot-đã-publish> --target <thư-mục-mới-trong-work>.');console.log(JSON.stringify(prepare({dataDir:args[1],target:args[3]})));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={gate,prepare};
