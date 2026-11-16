'use strict';
// Tái sử dụng exporter/publisher đã kiểm định; không tải nguồn khi gate đang tắt.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib'),crypto=require('node:crypto');
const Q=require('../public/shared/data-quality.js'),P=require('./publish-snapshot.cjs'),A=require('./prepare-automatic-pages.cjs');
const root=path.resolve(__dirname,'..'),base='https://kalm-d.github.io/tracker/';
function readConfig(){return JSON.parse(fs.readFileSync(path.join(root,'config/public-eod.json'),'utf8'));}
function plan(config,now=new Date()){
  if(config.enabled!==true)return {run:false,reason:'PUBLIC_EOD_DISABLED'};
  A.gate(config);
  const c=Q.clock(now),q=Q.assess({asOf:c.expectedSession,isDemo:false,snapshotKind:'EOD'},now);
  if(q.reasonCodes.includes('CALENDAR_UNVERIFIED'))throw Error('Lịch giao dịch chưa được kiểm chứng.');
  return {run:Q.trading(c.today)&&c.today===c.expectedSession,session:c.expectedSession,reason:Q.trading(c.today)&&c.today===c.expectedSession?'EOD_DUE':'NO_CLOSED_SESSION_TODAY'};
}
async function bytes(url,max,fetcher=fetch){
  const r=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Không lấy được snapshot trước (HTTP '+r.status+'); giữ nguyên production.');
  const chunks=[];let n=0;for await(const part of r.body){n+=part.length;if(n>max)throw Error('Tệp trước vượt giới hạn.');chunks.push(part);}return Buffer.concat(chunks);
}
async function restore(dataDir,{now=new Date(),fetcher=fetch}={}){
  const manifest=JSON.parse((await bytes(base+'data/active.json',65536,fetcher)).toString('utf8'));
  if(manifest.version!==1||!manifest.active||!Array.isArray(manifest.history)||manifest.history.length>3)throw Error('Manifest trước không hợp lệ.');
  const entries=[manifest.active,...manifest.history],verified=[];
  for(const entry of entries){
    if(!/^[a-f0-9]{64}$/.test(entry.id)||entry.file!=='snapshots/'+entry.id+'.json.gz'||entry.kind!=='EOD')throw Error('Archive trước không hợp lệ.');
    const compressed=await bytes(base+'data/'+entry.file,16*1024*1024,fetcher),raw=zlib.gunzipSync(compressed,{maxOutputLength:64*1024*1024}),p=JSON.parse(raw);
    const canonical=Buffer.from(JSON.stringify(p));if(crypto.createHash('sha256').update(canonical).digest('hex')!==entry.id||p.meta.asOf!==entry.tradingDate)throw Error('Hash/ngày archive trước không khớp.');
    P.validate(p,null,{now});verified.push({entry,compressed,raw:canonical});
  }
  // Xác minh mọi archive trước khi tạo bản làm việc; không đọc CSV giá trong Git.
  fs.mkdirSync(path.join(dataDir,'snapshots'),{recursive:true});
  for(const {entry,compressed}of verified)fs.writeFileSync(path.join(dataDir,entry.file),compressed);
  fs.writeFileSync(path.join(dataDir,'market.json'),verified[0].raw);fs.writeFileSync(path.join(dataDir,'market.json.gz'),verified[0].compressed);fs.writeFileSync(path.join(dataDir,'active.json'),JSON.stringify(manifest));
  return manifest;
}
async function run({uiOnly=false,config=readConfig(),now=new Date(),python=process.env.TRACKER_PYTHON||'python',bootstrap=null}={}){
  const target=path.join(root,'work/pages');
  if(uiOnly&&config.enabled!==true){cp.execFileSync(process.execPath,[path.join(root,'tools/prepare-pages.cjs'),target],{stdio:'inherit'});return {mode:'personal-file-only'};}
  A.gate(config);
  if(!uiOnly&&!plan(config,now).run)throw Error('Không có phiên đã đóng cần xuất hôm nay.');
  fs.mkdirSync(path.join(root,'work'),{recursive:true});const staging=fs.mkdtempSync(path.join(root,'work/automatic-eod-')),data=path.join(staging,'data');
  if(bootstrap){
    // Lần đầu phải cấp candidate đã kiểm định tường minh; không coi HTTP lỗi là lần đầu.
    if(uiOnly)throw Error('Không bootstrap trong UI deploy.');
    const p=P.parse(path.resolve(bootstrap)),review=config.bootstrapReview,id=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
    if(review?.status!=='verified'||review.candidateId!==id||!Number.isSafeInteger(review.symbolCount)||review.symbolCount!==p.meta.symbolCount||review.symbolCount!==p.meta.coverage?.attempted||!review.reference?.trim())throw Error('BOOTSTRAP_NOT_REVIEWED: chưa đối chiếu candidate toàn danh mục.');
    P.publish(path.resolve(bootstrap),data,{now});
  }else await restore(data,{now});
  if(!uiOnly&&!bootstrap){
    const csv=path.join(staging,'market.csv'),quality=path.join(staging,'quality.csv'),errors=path.join(staging,'errors.csv'),candidate=path.join(staging,'candidate.json');
    cp.execFileSync(python,[path.join(root,'tracker-tools/tracker_data_exporter.py'),'--source','KBS','--sessions','320','--exchange','ALL','--sleep','0','--retries','3','--save-every','0','--output',csv,'--quality-output',quality,'--errors-output',errors],{cwd:root,stdio:'inherit',env:{...process.env,TRACKER_NODE_BINARY:process.execPath}});
    cp.execFileSync(python,[path.join(root,'tracker-tools/pack_market_data.py'),'--input',csv,'--output',candidate,'--source','KBS trực tiếp','--export-quality',quality],{cwd:root,stdio:'inherit'});
    // Không allowlist thiếu mã, không quarantine bar sai hoặc nới gate lùi phiên.
    P.publish(candidate,data,{now});
  }
  const result=A.prepare({dataDir:data,target,config,now:new Date()});console.log(JSON.stringify(result));return result;
}
if(require.main===module){const args=process.argv.slice(2);Promise.resolve().then(()=>{
  if(args.length===1&&args[0]==='--plan'){const result=plan(readConfig());console.log(JSON.stringify(result));if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'run='+result.run+'\n');return;}
  if(args.length===2&&args[0]==='--bootstrap')return run({bootstrap:args[1]});
  if(args.length===1&&['--publish','--ui-only'].includes(args[0]))return run({uiOnly:args[0]==='--ui-only'});
  throw Error('Dùng --plan, --publish, --ui-only hoặc --bootstrap <candidate-đã-kiểm-định>.');
}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={plan,restore,run};
