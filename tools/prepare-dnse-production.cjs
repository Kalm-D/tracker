'use strict';
// Thu thập candidate riêng trước rollout; không tự publish active hoặc deploy web.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib');
const {PrivateStore}=require('../server/ai/private-market.cjs');
const root=path.resolve(__dirname,'..'),project='https://ckuoasopcyansrydvnam.supabase.co';
function missing(env){return ['DNSE_API_KEY','DNSE_API_SECRET','SUPABASE_SERVICE_ROLE_KEY'].filter(k=>!env[k]?.trim());}
async function bucket(store){
 // Xác thực bằng danh sách bucket: API cũ có thể trả 400 khi bucket chưa tồn tại.
 // Không suy diễn 400/401/403/5xx là được phép tạo hoặc ghi dữ liệu.
 const r=await store.fetcher(store.base+'/bucket',{redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:store.key,Authorization:'Bearer '+store.key}});
 if(!r.ok)throw Object.assign(Error('PRIVATE_BUCKET_LIST_FAILED'),{code:'PRIVATE_BUCKET_HTTP_'+r.status});
 const buckets=await r.json();if(!Array.isArray(buckets)||buckets.some(b=>typeof b.id!=='string'))throw Object.assign(Error('PRIVATE_BUCKET_LIST_INVALID'),{code:'PRIVATE_BUCKET_LIST_INVALID'});
 if(!buckets.some(b=>b.id===store.bucket)){
  try{await store.request('/bucket',{method:'POST',body:Buffer.from(JSON.stringify({id:store.bucket,name:store.bucket,public:false,file_size_limit:16*1048576,allowed_mime_types:['application/gzip','application/json']})),max:65536});}
  catch{throw Object.assign(Error('PRIVATE_BUCKET_CREATE_FAILED'),{code:'PRIVATE_BUCKET_CREATE_FAILED'});}
 }
 try{await store.assertPrivate();}catch{throw Object.assign(Error('PRIVATE_BUCKET_VERIFY_FAILED'),{code:'PRIVATE_BUCKET_VERIFY_FAILED'});}
}
function summary(payload,quality,exitCode){
 const count=status=>quality.filter(r=>r.status===status).length;
 return {candidateOnly:true,productionPublished:false,exportSucceeded:exitCode===0,attempted:quality.length,withRows:quality.filter(r=>Number(r.rows)>0).length,missing:quality.filter(r=>!Number(r.rows)).length,shortHistory:count('too_few_rows'),fetchErrors:count('fetch_error'),asOf:payload?.meta?.asOf||null,rows:payload?.meta?.rowCount||0};
}
async function run(env=process.env){
 const absent=missing(env);if(absent.length){console.error('MISSING_REPOSITORY_SECRETS: '+absent.join(', '));return 2;}
 const store=new PrivateStore({...env,SUPABASE_URL:project});await bucket(store);
 fs.mkdirSync(path.join(root,'work'),{recursive:true});const dir=fs.mkdtempSync(path.join(root,'work/dnse-production-candidate-'));
 const csv=path.join(dir,'market.csv'),quality=path.join(dir,'quality.csv'),errors=path.join(dir,'errors.csv'),candidate=path.join(dir,'candidate.json.gz'),python=env.TRACKER_PYTHON||'python';
 const result=cp.spawnSync(python,[path.join(root,'tracker-tools/tracker_data_exporter.py'),'--source','DNSE','--sessions','320','--exchange','ALL','--sleep','3.6','--retries','3','--save-every','0','--output',csv,'--quality-output',quality,'--errors-output',errors],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1048576,env:{...env,TRACKER_NODE_BINARY:process.execPath}});
 const readCsv=file=>{if(!fs.existsSync(file))return [];const s=cp.execFileSync(python,['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding="utf-8-sig")))))',file],{encoding:'utf8',maxBuffer:8*1048576});return JSON.parse(s);};
 const qualityRows=readCsv(quality),errorRows=readCsv(errors);let payload=null;
 if(fs.existsSync(csv))try{cp.execFileSync(python,[path.join(root,'tracker-tools/pack_market_data.py'),'--input',csv,'--output',candidate,'--source','DNSE Lightspeed cá nhân','--export-quality',quality],{cwd:root,stdio:'pipe'});payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(candidate),{maxOutputLength:64*1048576}));}catch{}
 const report=summary(payload,qualityRows,result.status),envelope=zlib.gzipSync(JSON.stringify({version:1,payload,qualityRows,errorRows,report}));
 if(envelope.length>16*1048576)throw Error('PRIVATE_CANDIDATE_TOO_LARGE');
 const id=String(env.GITHUB_RUN_ID||Date.now());if(!/^\d{1,20}$/.test(id))throw Error('INVALID_RUN_ID');
 const name='candidates/eod-'+id+'.json.gz';
 await store.request('/object/'+store.bucket+'/'+name,{method:'POST',body:envelope,max:65536});
 const anonymous=await store.fetcher(store.base+'/object/public/'+store.bucket+'/'+name,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(anonymous.ok)throw Error('PRIVATE_CANDIDATE_ACCESS_CONTROL_FAILED');
 console.log(JSON.stringify({...report,storedInPrivateBucket:true,anonymousDownloadDenied:true}));
 // Candidate có lỗi được giữ riêng để điều tra, không biến job thành release thành công.
 return result.status===0&&payload?0:1;
}
if(require.main===module)run().then(code=>{process.exitCode=code;}).catch(e=>{const code=/^PRIVATE_BUCKET_(HTTP_\d{3}|LIST_INVALID|CREATE_FAILED|VERIFY_FAILED)$/.test(e.code||'')?e.code:'DNSE_SETUP_STOPPED';console.error(code+': chưa phát hành production; không in khóa hoặc nội dung phản hồi riêng.');process.exitCode=1;});
module.exports={missing,bucket,summary,run};
