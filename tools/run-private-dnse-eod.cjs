'use strict';
// Job chỉ đọc DNSE và ghi bucket private; không commit giá hoặc deploy Pages.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const M=require('../server/ai/private-market.cjs'),P=require('./publish-snapshot.cjs'),Q=require('../public/shared/data-quality.js'),Audit=require('./audit-data.cjs');
const root=path.resolve(__dirname,'..');
function plan(env,now=new Date()){
 if(env.TRACKER_DNSE_EOD_ENABLED!=='true')return {run:false,reason:'DNSE_PRIVATE_DISABLED'};
 const c=Q.clock(now),q=Q.assess({asOf:c.expectedSession,isDemo:false,snapshotKind:'EOD'},now);
 if(q.reasonCodes.includes('CALENDAR_UNVERIFIED'))throw Error('Lịch giao dịch chưa được kiểm chứng.');
 return {run:Q.trading(c.today)&&c.expectedSession===c.today,session:c.expectedSession};
}
async function restore(store,dir,now){
 await store.assertPrivate();const manifest=M.manifest(await store.get('active.json')),archives=[];
 for(const e of [manifest.active,...manifest.history]){const bytes=await store.get(e.file),p=M.decode(bytes,e,null,now);archives.push({e,bytes,p});}
 fs.mkdirSync(path.join(dir,'snapshots'),{recursive:true});
 for(const {e,bytes}of archives)fs.writeFileSync(path.join(dir,e.file),bytes);
 fs.writeFileSync(path.join(dir,'market.json'),JSON.stringify(archives[0].p));fs.writeFileSync(path.join(dir,'market.json.gz'),archives[0].bytes);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(manifest));return manifest;
}
async function upload(store,dir,{now=new Date(),previous=null}={}){
 await store.assertPrivate();const audit=Audit.auditDirectory(dir);if(!audit.ok)throw Error('Snapshot DNSE không đạt audit.');
 const m=M.manifest(fs.readFileSync(path.join(dir,'active.json'))),archives=[];
 for(const e of [m.active,...m.history]){const b=fs.readFileSync(path.join(dir,e.file));const p=M.decode(b,e,e===m.active?previous:null,now);if(e===m.active&&Q.assess(p.meta,now).status!=='FRESH')throw Error('DNSE chưa đủ phiên hoàn tất hoặc lịch chưa kiểm chứng.');archives.push({e,b});}
 // Chỉ ghi archive mới; manifest active được thay cuối cùng sau khi đọc kiểm chứng lại.
 const prior=previous?M.hash(previous):null;
 for(const {e,b}of archives){
  if(e===m.active&&e.id!==prior)await store.put(e.file,b);
  const remote=await store.get(e.file);M.decode(remote,e,null,now);
 }
 await store.put('active.json',Buffer.from(JSON.stringify(m)));return {asOf:m.active.tradingDate,snapshotId:m.active.id,source:'DNSE',private:true};
}
async function run(args,env=process.env){
 const now=new Date();if(args.length===1&&args[0]==='--plan'){const p=plan(env,now);console.log(JSON.stringify(p));if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,'run='+p.run+'\n');return;}
 if(args.length!==1||args[0]!=='--publish')throw Error('Dùng --plan hoặc --publish; bootstrap thực hiện sau kiểm định candidate riêng.');
 if(!plan(env,now).run)throw Error('EOD DNSE chưa bật hoặc chưa đến phiên đã đóng.');
 if(!env.DNSE_API_KEY||!env.DNSE_API_SECRET)throw Error('Thiếu khóa DNSE trong Secrets; không gọi nguồn.');
 const store=new M.PrivateStore(env);await store.assertPrivate();fs.mkdirSync(path.join(root,'work'),{recursive:true});const temp=fs.mkdtempSync(path.join(root,'work/dnse-eod-')),dir=path.join(temp,'data');
 // Không tự bootstrap khi kho chưa có baseline DNSE đã kiểm định.
 await restore(store,dir,now);const previous=P.parse(path.join(dir,'market.json.gz'));
 const python=env.TRACKER_PYTHON||'python',csv=path.join(temp,'market.csv'),quality=path.join(temp,'quality.csv'),candidate=path.join(temp,'candidate.json');
 cp.execFileSync(python,[path.join(root,'tracker-tools/tracker_data_exporter.py'),'--source','DNSE','--sessions','320','--exchange','ALL','--sleep','3.6','--retries','3','--save-every','0','--output',csv,'--quality-output',quality,'--errors-output',path.join(temp,'errors.csv')],{cwd:root,stdio:'inherit',env:{...env,TRACKER_NODE_BINARY:process.execPath}});
 cp.execFileSync(python,[path.join(root,'tracker-tools/pack_market_data.py'),'--input',csv,'--output',candidate,'--source','DNSE Lightspeed cá nhân','--export-quality',quality],{cwd:root,stdio:'inherit',env});
 P.publish(candidate,dir,{sourceProvider:'DNSE'});console.log(JSON.stringify(await upload(store,dir,{previous})));
}
if(require.main===module)run(process.argv.slice(2)).catch(()=>{console.error('Job DNSE dừng an toàn: kiểm tra khóa, hạn mức, kho private và báo cáo chất lượng trong tiến trình. Không công bố dữ liệu.');process.exitCode=1;});
module.exports={plan,restore,upload,run};
