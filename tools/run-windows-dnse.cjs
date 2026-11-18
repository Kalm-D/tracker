'use strict';
// Máy cá nhân đọc DNSE; chỉ snapshot qua kiểm định mới thay active trong kho private.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const M=require('../server/ai/private-market.cjs'),P=require('./publish-snapshot.cjs'),E=require('./run-private-dnse-eod.cjs'),Q=require('../public/shared/data-quality.js'),S=require('./prepare-dnse-production.cjs'),C=require('./dnse-coverage.cjs'),zlib=require('node:zlib'),Cache=require('./windows-dnse-cache.cjs');
const root=path.resolve(__dirname,'..'),project='https://ckuoasopcyansrydvnam.supabase.co';
function atomic(file,value){const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function lock(dir){
 const file=path.join(dir,'worker.lock');
 for(let attempt=0;attempt<2;attempt++)try{const fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);return ()=>{try{if(JSON.parse(fs.readFileSync(file)).pid===process.pid)fs.unlinkSync(file);}catch{}};}
 catch(e){if(e.code!=='EEXIST')throw e;let pid;try{pid=JSON.parse(fs.readFileSync(file)).pid;}catch{throw Error('WINDOWS_LOCK_INVALID');}if(!Number.isInteger(pid)||pid<1)throw Error('WINDOWS_LOCK_INVALID');try{process.kill(pid,0);return null;}catch(e){if(e.code!=='ESRCH')return null;fs.unlinkSync(file);}}
 throw Error('WINDOWS_LOCK_BUSY');
}
async function baseline(store){
 await store.assertPrivate();
 // Chỉ danh sách đã xác thực mới chứng minh được kho chưa có active, không suy từ HTTP lỗi.
 const files=JSON.parse(await store.request('/object/list/'+store.bucket,{method:'POST',body:Buffer.from(JSON.stringify({prefix:'',search:'active.json',limit:100,offset:0})),max:65536}));
 if(!Array.isArray(files))throw Error('PRIVATE_LIST_INVALID');
 return files.some(f=>f.name==='active.json'&&f.id)?M.manifest(await store.get('active.json')):null;
}
function collect({env,csv,quality,errors,dir,report}){
 return new Promise((resolve,reject)=>{
  // DNSE công bố 50.000 OHLC/giờ; nhịp tuần tự tối đa 4/giây còn thấp hơn hạn mức.
  const args=['-u',path.join(root,'tracker-tools/tracker_data_exporter.py'),'--source','DNSE','--sessions','320','--exchange','ALL','--sleep','0.25','--retries','3','--save-every','20','--resume','--resume-known-results','--output',csv,'--quality-output',quality,'--errors-output',errors];
  const child=cp.spawn(env.TRACKER_PYTHON||'python',args,{cwd:root,env:{...env,TRACKER_NODE_BINARY:process.execPath,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let pending='',stderr='',completed=0,total=null;
  child.stdout.on('data',bytes=>{pending+=bytes.toString('utf8');let newline;while((newline=pending.indexOf('\n'))!==-1){const line=pending.slice(0,newline);pending=pending.slice(newline+1);const m=/^\[(\d+)\/(\d+)\] (?:OK|ERR|SKIP)/.exec(line);if(m){completed=Number(m[1]);total=Number(m[2]);if(completed%20===0||completed===total)atomic(path.join(dir,'status.json'),{...report,phase:'collecting',completed,total,updatedAt:new Date().toISOString()});}}if(pending.length>65536)pending='';});
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-262144);});
  child.once('error',()=>reject(Error('WINDOWS_EXPORT_START_FAILED')));
  child.once('close',(status,signal)=>resolve({status,signal,stderr,completed,total}));
 });
}
function csvRows(file,python){if(!fs.existsSync(file))return [];return JSON.parse(cp.execFileSync(python,['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding="utf-8-sig")))))',file],{encoding:'utf8',windowsHide:true,maxBuffer:8*1048576}));}
async function run({env=process.env,store=null,dir=path.join(root,'work/dnse-windows'),now=()=>new Date(),exporter=collect}={}){
 dir=path.resolve(dir);const work=fs.realpathSync(path.join(root,'work'));if(!dir.startsWith(work+path.sep))throw Error('WINDOWS_PRIVATE_DIR_INVALID');fs.mkdirSync(dir,{recursive:true});if(!fs.realpathSync(dir).startsWith(work+path.sep))throw Error('WINDOWS_PRIVATE_DIR_INVALID');
 const unlock=lock(dir);if(!unlock)return {skipped:'ALREADY_RUNNING'};
 const report={source:'DNSE',private:true,startedAt:now().toISOString(),published:false};
 try{
  if(S.missing(env).length)throw Error('WINDOWS_KEYS_MISSING');
  store=store||new M.PrivateStore({...env,SUPABASE_URL:project});
  const clock=Q.clock(now()),q=Q.assess({asOf:clock.expectedSession,isDemo:false,snapshotKind:'EOD'},now());if(q.status!=='FRESH')throw Error('WINDOWS_CALENDAR_UNVERIFIED');
  const before=await baseline(store);report.targetSession=clock.expectedSession;
  if(before&&before.active.tradingDate>=clock.expectedSession){M.decode(await store.get(before.active.file),before.active,null,now());const result={...report,phase:'up_to_date',asOf:before.active.tradingDate};atomic(path.join(dir,'status.json'),result);return result;}
  const job=path.join(dir,clock.expectedSession),isNew=!fs.existsSync(job);fs.mkdirSync(job,{recursive:true});if(isNew)Cache.mark(job,clock.expectedSession);const data=path.join(job,'data');let previous=null;
  if(before){await E.restore(store,data,now());previous=P.parse(path.join(data,'market.json.gz'));}
  const python=env.TRACKER_PYTHON||'python',csv=path.join(job,'market.csv'),quality=path.join(job,'quality.csv'),errors=path.join(job,'errors.csv'),candidate=path.join(job,'candidate.json.gz');
  atomic(path.join(dir,'status.json'),{...report,phase:'collecting',completed:0,total:null});
  const result=await exporter({env,csv,quality,errors,dir,report});
  const rows=csvRows(quality,python),{candidateOnly,productionPublished,...counts}=S.summary(null,rows,result.status);Object.assign(report,counts,{diagnostics:S.diagnostics(result),expectedTotal:result.total,completedSourceCount:result.completed});
  // Lưu candidate để điều tra cả khi có mã thiếu; không đồng nghĩa được phép phát hành.
  if(fs.existsSync(csv))cp.execFileSync(python,[path.join(root,'tracker-tools/pack_market_data.py'),'--input',csv,'--output',candidate,'--source','DNSE Lightspeed cá nhân','--export-quality',quality],{cwd:root,windowsHide:true,stdio:'pipe'});
  if(![0,1].includes(result.status)||result.completed!==result.total||!result.total||result.status===1&&!rows.some(r=>['empty','too_few_rows'].includes(r.status)))throw Error('WINDOWS_EXPORT_QUALITY_FAILED');
  report.stage='coverage';const payload=C.make(P.parse(candidate),rows,result.total,previous);report.asOf=payload.meta.asOf;report.rows=payload.meta.rowCount;
  fs.writeFileSync(candidate,zlib.gzipSync(JSON.stringify(payload)));
  report.stage='validation';P.validate(payload,previous,{now:now(),sourceProvider:'DNSE'});
  if(Q.assess(payload.meta,now()).status!=='FRESH')throw Error('WINDOWS_SESSION_CHANGED_OR_DELAYED');
  const current=await baseline(store);if((current?.active.id||null)!==(before?.active.id||null))throw Error('WINDOWS_REMOTE_CHANGED');
  P.publish(candidate,data,{now:now(),sourceProvider:'DNSE'});
  report.stage='upload';const published=await E.upload(store,data,{now:now(),previous});
  const confirmed=M.manifest(await store.get('active.json'));if(confirmed.active.id!==published.snapshotId)throw Error('WINDOWS_PUBLICATION_NOT_CONFIRMED');
  const retained=new Set([confirmed.active,...confirmed.history].map(e=>e.file));let cleanupWarning=false;
  for(const old of before?[before.active,...before.history]:[])if(!retained.has(old.file))try{
   M.decode(await store.get(old.file),old,null,now());
   await store.request('/object/'+store.bucket,{method:'DELETE',body:Buffer.from(JSON.stringify({prefixes:[old.file]})),max:65536});
  }catch{cleanupWarning=true;}
  let localCache;try{localCache=Cache.prune(dir);}catch{cleanupWarning=true;}
  const final={...report,...published,published:true,privateSnapshotPublished:true,phase:'published',cleanupWarning,localCache,completedAt:now().toISOString()};atomic(path.join(dir,'status.json'),final);return final;
 }catch(error){atomic(path.join(dir,'status.json'),{...report,phase:'error',published:false,errorCode:/^(WINDOWS_|DNSE_COVERAGE_)[A-Z_]+$/.test(error.message)?error.message:error.message?.startsWith('Thiếu VNINDEX')?'BENCHMARK_DELAYED_OR_MISSING':'WINDOWS_VALIDATION_OR_STORAGE_FAILED',completedAt:now().toISOString()});throw Error('WINDOWS_JOB_STOPPED');}
 finally{unlock();}
}
async function check(env=process.env){
 if(S.missing(env).length)throw Error('WINDOWS_KEYS_MISSING');const folder=path.join(root,'work/dnse-windows');fs.mkdirSync(folder,{recursive:true});atomic(path.join(folder,'setup-check.json'),{stage:'storage'});const store=new M.PrivateStore({...env,SUPABASE_URL:project});await baseline(store);
 atomic(path.join(folder,'setup-check.json'),{stage:'dnse'});
 const script='import contextlib,io\nwith contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):\n import tracker_data_exporter as e\n u=e.fetch_universe_from_vnstock("ALL","DNSE")\nprint(len(u))';
 const value=cp.execFileSync(env.TRACKER_PYTHON||'python',['-c',script],{cwd:path.join(root,'tracker-tools'),env,windowsHide:true,encoding:'utf8',maxBuffer:1048576});
 if(!/^\d+\s*$/.test(value)||Number(value)<1)throw Error('WINDOWS_DNSE_LISTING_FAILED');const verified={stage:'verified',verified:true,universeCount:Number(value),bucketPrivate:true};atomic(path.join(folder,'setup-check.json'),verified);return verified;
}
if(require.main===module){const action=process.argv[2];(action==='--run'?run():action==='--check'?check():Promise.reject(Error('WINDOWS_USAGE'))).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Windows DNSE: dừng an toàn; xem trạng thái cục bộ, không ghi khóa vào log.');process.exitCode=1;});}
module.exports={run,baseline,lock,check};
