/* One-user durable runner. Run behind HTTPS for remote use. Never host secrets in public/. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {Worker}=require('node:worker_threads');
const B=require('../public/backtest/engine.js'),E=require('../public/shared/tracker-engine.js');
const root=path.resolve(__dirname,'..'),dir=path.resolve(process.env.TRACKER_JOBS_DIR||path.join(root,'.backtest-jobs'));
const dataset=path.resolve(process.env.TRACKER_DATA_FILE||path.join(root,'public/data/market.json.gz'));
const host=process.env.TRACKER_HOST||'127.0.0.1',port=Number(process.env.PORT||8787),token=process.env.TRACKER_RUNNER_TOKEN;
if(!token||token.length<32)throw new Error('Set TRACKER_RUNNER_TOKEN (>=32 random characters) in the server secret manager.');
const origin=process.env.TRACKER_ALLOWED_ORIGIN||`http://127.0.0.1:${port}`;
const ttl=Number(process.env.TRACKER_MAX_RUN_MS||1800000);
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const jobs=new Map();let active;
const atomic=(file,value)=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file);};
const persist=j=>atomic(path.join(dir,j.id+'.json'),j);
for(const file of fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){try{const j=JSON.parse(fs.readFileSync(path.join(dir,file)));if(j.status==='running'){j.status='queued';j.progress=null;persist(j);}jobs.set(j.id,j);}catch{process.stderr.write('Ignored invalid job metadata file.\n');}}
function next(){
  if(active)return;const j=[...jobs.values()].find(j=>j.status==='queued');if(!j)return;
  j.status='running';j.startedAt=new Date().toISOString();persist(j);
  const w=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{...j,snapshot:path.join(dir,j.id+'.snapshot.gz')}});
  active={id:j.id,worker:w};
  const finish=(status,error)=>{if(active?.id!==j.id)return;clearTimeout(timer);j.status=status;j.finishedAt=new Date().toISOString();if(error)j.error=error;persist(j);active=null;w.terminate();setImmediate(next);};
  const timer=setTimeout(()=>finish('failed','Vượt giới hạn thời gian máy chủ.'),ttl);
  w.on('message',m=>{if(active?.id!==j.id||j.status!=='running')return;if(m.type==='progress'){j.progress=m.progress;persist(j);}if(m.type==='result'){atomic(path.join(dir,j.id+'.result.json'),m.result);finish('completed');}if(m.type==='error')finish('failed',m.error);});
  w.on('error',()=>finish('failed','Worker lỗi. Kiểm tra phiên bản dữ liệu/engine.'));
  w.on('exit',code=>{if(active?.id===j.id)finish('failed','Worker kết thúc không có kết quả ('+code+').');});
  active.cancel=()=>finish('cancelled');
}
function authorized(req){const a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let raw='';for await(const b of req){raw+=b;if(raw.length>32768)throw new Error('Yêu cầu quá lớn.');}return JSON.parse(raw);}
const app=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  const requestOrigin=req.headers.origin;
  if(requestOrigin&&requestOrigin!==origin)return json(res,403,{error:'Origin không được phép.'});
  if(requestOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  const u=new URL(req.url,'http://localhost'),parts=u.pathname.split('/').filter(Boolean);
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});return res.end();}
  if(parts[0]!=='api')return json(res,404,{error:'Đây là API runner. Mở giao diện Tracker trên Pages hoặc máy chủ preview.'});
  if(!authorized(req))return json(res,401,{error:'Thiếu token máy chủ hợp lệ.'});
  try {
    if(parts[1]==='health'&&req.method==='GET')return json(res,200,{ok:true,engine:B.VERSION,queued:[...jobs.values()].filter(j=>j.status==='queued').length});
    if(parts[1]!=='jobs')return json(res,404,{error:'Không có endpoint.'});
    if(parts.length===2&&req.method==='GET')return json(res,200,[...jobs.values()].map(({id,status,createdAt,progress})=>({id,status,createdAt,progress})));
    if(parts.length===2&&req.method==='POST'){
      if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=3)return json(res,429,{error:'Hàng đợi tối đa 3 tác vụ.'});
      if(jobs.size>=100)return json(res,429,{error:'Đã lưu 100 tác vụ. Quản trị viên cần sao lưu và dọn dữ liệu máy chủ.'});
      const data=await body(req),c=B.config(data.config);if(!c.acknowledge)throw new Error('Chưa xác nhận giả định.');
      let raw=fs.readFileSync(dataset);if(raw[0]===31&&raw[1]===139)raw=zlib.gunzipSync(raw);
      const p=JSON.parse(raw),dataHash=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
      if(data.expectedDataHash!==dataHash)return json(res,409,{error:'Snapshot trên máy chủ khác trình duyệt. Đồng bộ cùng snapshot rồi chạy lại.'});
      B.prepare(p);
      const id=crypto.randomUUID(),j={id,status:'queued',createdAt:new Date().toISOString(),config:c,settings:{...E.DEFAULTS,...data.settings},dataHash};
      fs.writeFileSync(path.join(dir,id+'.snapshot.gz'),zlib.gzipSync(raw),{mode:0o600});persist(j);jobs.set(id,j);json(res,202,{id,status:j.status});setImmediate(next);return;
    }
    const id=parts[2];if(!/^[a-f0-9-]{36}$/.test(id||'')||!jobs.has(id))return json(res,404,{error:'Không tìm thấy tác vụ.'});
    const j=jobs.get(id);
    if(parts.length===3&&req.method==='GET')return json(res,200,j);
    if(parts.length===3&&req.method==='DELETE'){
      if(active?.id===id)active.cancel();else if(j.status==='queued'){j.status='cancelled';j.finishedAt=new Date().toISOString();persist(j);}
      return json(res,200,{id,status:j.status});
    }
    if(parts.length===4&&parts[3]==='result'&&req.method==='GET'){
      if(j.status!=='completed')return json(res,409,{error:'Chưa có kết quả.'});
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return fs.createReadStream(path.join(dir,id+'.result.json')).pipe(res);
    }
    return json(res,404,{error:'Không có endpoint.'});
  }catch(e){return json(res,400,{error:e.message});}
});
app.listen(port,host,()=>{process.stdout.write(`Tracker runner listening on ${host}:${port}\n`);next();});
function shutdown(){app.close();if(active){const j=jobs.get(active.id);j.status='queued';j.progress=null;persist(j);active.worker.terminate();active=null;}process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
