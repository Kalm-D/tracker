'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{monitorEventLoopDelay}=require('node:perf_hooks');
const VERSION='operations-1.0.0';
function acquire(dir){
 dir=path.resolve(dir);const publicDir=path.resolve(__dirname,'../../public'),relative=path.relative(publicDir,dir);if(relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw new Error('Không đặt trạng thái AI trong public.');
 let parent=dir;while(true){if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw new Error('Không dùng liên kết cho trạng thái AI.');const next=path.dirname(parent);if(next===parent)break;parent=next;}
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'.runtime.lock'),id=crypto.randomUUID();let fd;
 try{fd=fs.openSync(file,'wx',0o600);}catch{throw new Error('Thư mục AI đang có khóa tiến trình. Không mở hai máy chủ cùng ghi dữ liệu; kiểm tra hoặc khôi phục khóa khi tiến trình cũ đã dừng.');}
 fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,pid:process.pid,id,startedAt:new Date().toISOString()}));fs.closeSync(fd);
 return {release(){try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.id===id)fs.unlinkSync(file);}catch{}}};
}
function diskUsage(dir){let bytes=0,files=0;const visit=(p,depth)=>{if(depth>3)throw new Error('Thư mục AI vượt độ sâu quét tài nguyên.');for(const entry of fs.readdirSync(p,{withFileTypes:true})){if(++files>2000)throw new Error('Thư mục AI vượt 2.000 mục.');const next=path.join(p,entry.name);if(entry.isSymbolicLink())throw new Error('Không quét liên kết trong thư mục AI.');if(entry.isDirectory())visit(next,depth+1);else if(entry.isFile())bytes+=fs.statSync(next).size;}};visit(dir,0);return {bytes,entries:files};}
const safeFields=new Set(['status','attempt','estimatedTokens','actualTokens','waitMs']);
function sanitize(data){const fields={};for(const [k,v]of Object.entries(data)){if(safeFields.has(k)&&(v===null||Number.isFinite(v)&&v>=0&&v<=100000000))fields[k]=v;else if(k==='route'&&['login','logout','session','jobs','monitors','operations','unknown'].includes(v))fields[k]=v;else if(k==='provider'&&['gemini','groq'].includes(v))fields[k]=v;else if(k==='role'&&['manager','technical','fundamental','news','strategy','risk','backtest','critic'].includes(v))fields[k]=v;else if(k==='jobId'&&typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v))fields[k]=v;}return fields;}
class Operations{
 constructor({dir,env={},clock=Date.now}){
  this.dir=dir;this.clock=clock;this.logFile=path.join(dir,'operations.jsonl');this.started=clock();this.logHealthy=true;this.closed=false;
  this.maxRssMiB=Number(env.AI_MAX_RSS_MIB||1024);this.maxStateMiB=Number(env.AI_MAX_STATE_MIB||256);this.configError=(!Number.isFinite(this.maxRssMiB)||this.maxRssMiB<128||this.maxRssMiB>16384||!Number.isFinite(this.maxStateMiB)||this.maxStateMiB<1||this.maxStateMiB>4096)?'Giới hạn tài nguyên không hợp lệ.':null;
  this.delay=monitorEventLoopDelay({resolution:20});this.delay.enable();this.disk=null;this.diskAt=0;this.events=[];
  try{if(fs.existsSync(this.logFile)&&fs.statSync(this.logFile).size<=1048576)this.events=fs.readFileSync(this.logFile,'utf8').trim().split('\n').filter(Boolean).slice(-100).map(line=>JSON.parse(line)).filter(e=>typeof e.event==='string'&&/^[a-z_]{3,40}$/.test(e.event)&&typeof e.at==='string'&&!Number.isNaN(Date.parse(e.at))).map(e=>({at:new Date(e.at).toISOString(),event:e.event,...sanitize(e)}));}catch{this.logHealthy=false;}
 }
 record(event,data={}){
  if(!/^[a-z_]{3,40}$/.test(event))return;const fields=sanitize(data);
  const entry={at:new Date(this.clock()).toISOString(),event,...fields};this.events.push(entry);if(this.events.length>100)this.events.shift();
  try{if(fs.existsSync(this.logFile)&&fs.statSync(this.logFile).size>1048576){const old=this.logFile+'.1';if(fs.existsSync(old))fs.unlinkSync(old);fs.renameSync(this.logFile,old);}fs.appendFileSync(this.logFile,JSON.stringify(entry)+'\n',{mode:0o600});this.logHealthy=true;}catch{this.logHealthy=false;}
 }
 sample(force=false){
  const now=this.clock();if(force||!this.disk||now-this.diskAt>=30000){try{this.disk=diskUsage(this.dir);this.disk.problem=null;}catch(e){this.disk={bytes:null,entries:null,problem:e.message};}this.diskAt=now;}
  const m=process.memoryUsage();return {version:VERSION,uptimeSeconds:Math.floor(process.uptime()),rssMiB:Math.round(m.rss/1048576),heapUsedMiB:Math.round(m.heapUsed/1048576),maxRssMiB:this.maxRssMiB,stateBytes:this.disk.bytes,stateEntries:this.disk.entries,maxStateMiB:this.maxStateMiB,diskProblem:this.disk.problem,eventLoopP99Ms:this.delay.count&&Number.isFinite(this.delay.percentile(99))?Math.round(this.delay.percentile(99)/1e6):null,logHealthy:this.logHealthy,configurationProblem:this.configError,scope:'single_node_process_and_worker_threads; excludes_other_processes',sampledAt:new Date(now).toISOString()};
 }
 assertCanStart(){const s=this.sample();if(this.configError||s.diskProblem||s.rssMiB>=this.maxRssMiB||s.stateBytes>=this.maxStateMiB*1048576)throw new Error('Chưa tạo tác vụ: tài nguyên máy chủ hoặc bộ lưu đang vượt giới hạn. Mở Vận hành để kiểm tra.');}
 async report({research,gateway,monitoring,env,snapshot}){
  const g=gateway.status();let data;try{const s=await snapshot(research.dataFile);data={status:'available',date:s.date,sha256:s.sha256,engineVersion:s.engineVersion,audit:s.audit,freshness:require('./data.cjs').freshness(s.date)};}catch{data={status:'blocked',reason:'Không đọc được snapshot thật. Kiểm tra cấu hình/nguồn dữ liệu.'};}
  const checks=[{id:'free_mode',status:g.policyProblems?.length?'blocked':'configured',message:g.policyProblems?.[0]||'Gateway chỉ nhận provider đã xác nhận Free Tier.'},{id:'token_ledger',status:g.usage?.healthy===false?'blocked':'available',message:g.usage?.problem||'Bộ đếm nội bộ; không phải quota thực còn lại của provider.'},{id:'owner_password',status:/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(env.TRACKER_AI_PASSWORD_HASH||'')?'configured':'blocked',message:'Xác thực owner bằng scrypt; một owner, chưa đa tài khoản.'},{id:'models',status:g.providers?.length?'configured':'blocked',message:'Cấu hình model chưa tương đương nghiệm thu bằng API thật.'},{id:'market_data',status:data.status,message:'Giữ ngày/hash nguồn; chưa phải giá trực tiếp.'},{id:'financial_statements',status:'not_accepted',message:'BCTC có kỳ/đơn vị/ngày công bố và kiểm chứng doanh nghiệp chưa nghiệm thu thật.'},{id:'model_acceptance',status:'not_accepted',message:'Cần chạy các ca nghiên cứu thật bằng tài khoản/provider đã cấu hình; code và fixture chưa đủ.'},{id:'cloud_hosting',status:'not_accepted',message:'Chưa có backend cloud miễn phí được nghiệm thu. Phiên bản Node hiện tại không chạy trong Workers Free.'},{id:'iphone_https',status:'not_accepted',message:'Cần iPhone/Safari thật và HTTPS/cookie trên hạ tầng đích.'}];
  return {version:VERSION,release:'1.0.0-rc.1',releaseDecision:'blocked_pending_acceptance',checks,gateway:g,resources:this.sample(),jobs:{total:research.jobs.size,active:research.active?.id||null,counts:[...research.jobs.values()].reduce((a,j)=>(a[j.status]=(a[j.status]||0)+1,a),{}),restoreIssues:research.restoreIssues?.length||0,storageProblem:research.storageError||null,accepting:!research.stopped},monitoring:{...monitoring.status(),total:monitoring.records.size,enabled:monitoring.list().filter(r=>r.enabled).length},data,events:this.events.slice(-20),privacy:'Nhật ký chỉ chứa loại sự kiện và bộ đếm; không chứa câu hỏi, nguồn tài liệu, mật khẩu, cookie hay API key.'};
 }
 shutdown(){this.closed=true;this.delay.disable();}
}
module.exports={VERSION,acquire,diskUsage,Operations};
